import OpenAI from 'openai';
import { env } from '@shizuku/config';

/**
 * OpenAI embedding batcher with exponential-backoff retry.
 *
 * - Batch size 100 — roughly the largest batch that doesn't exceed
 *   OpenAI's per-request token cap for `text-embedding-3-small` on
 *   typical chunk lengths.
 * - Retry policy: 5 attempts with delays 1s → 2s → 4s → 8s → 16s on
 *   429 (rate limit) and 5xx. After 5 failures we throw `EmbedFailure`
 *   so the caller (ingest orchestrator) marks the document
 *   `index_status='failed'` and emits an SSE error.
 * - We always retry transient errors but NEVER retry 4xx other than 429
 *   (a 400 means the request is malformed; retrying would just rack up
 *   failed calls).
 */

const BATCH_SIZE = 100;
const MAX_RETRIES = 5;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  if (!env.OPENAI_API_KEY) {
    throw new EmbedFailure('OpenAI API key not configured', { permanent: true });
  }
  cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cachedClient;
}

export class EmbedFailure extends Error {
  /** Permanent = don't retry the document at all. Transient = exhausted retries. */
  readonly permanent: boolean;
  constructor(message: string, opts: { permanent?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = 'EmbedFailure';
    this.permanent = opts.permanent ?? false;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

/**
 * Embed an array of texts in batches. Returns vectors in the same order as
 * the input. Caller handles batch-by-batch progress reporting (SSE
 * `embedding` events) by passing an `onBatch` callback.
 */
export async function embedBatched(
  inputs: ReadonlyArray<string>,
  opts: {
    onBatch?: (batchIndex: number, totalBatches: number) => void;
  } = {},
): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const client = getClient();
  const results: number[][] = new Array(inputs.length);
  const batches: ReadonlyArray<string>[] = [];
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    batches.push(inputs.slice(i, i + BATCH_SIZE));
  }

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const batch = batches[bIdx];
    if (!batch) continue;
    const vectors = await embedOneBatchWithRetry(client, batch);
    for (let i = 0; i < vectors.length; i++) {
      const targetIdx = bIdx * BATCH_SIZE + i;
      const v = vectors[i];
      if (v) results[targetIdx] = v;
    }
    opts.onBatch?.(bIdx + 1, batches.length);
  }
  return results;
}

async function embedOneBatchWithRetry(
  client: OpenAI,
  batch: ReadonlyArray<string>,
): Promise<number[][]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await client.embeddings.create({
        model: env.OPENAI_EMBEDDING_MODEL,
        input: batch as string[],
      });
      return res.data.map((d) => d.embedding);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES - 1) break;
      await sleep(BACKOFF_MS[attempt] ?? 16000);
    }
  }
  throw new EmbedFailure(
    `Embedding batch failed after ${MAX_RETRIES} attempts`,
    { cause: lastErr },
  );
}

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; code?: string };
  if (e.status === 429) return true;
  if (typeof e.status === 'number' && e.status >= 500 && e.status < 600) return true;
  // Network-level errors (ECONNRESET, ETIMEDOUT, etc.) usually don't have a status.
  if (e.code && ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(e.code)) {
    return true;
  }
  return false;
}

const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));
