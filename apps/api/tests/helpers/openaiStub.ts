import type { JudgeReport } from '@shizuku/types';
import { __setOpenAIClientForTests } from '../../src/services/ai/openai.js';

/**
 * Minimal stand-in for the OpenAI client surface that our chat / search /
 * judge / embed code actually touches. Built per-test, installed via
 * `__setOpenAIClientForTests`.
 *
 * `chat.completions.create` switches on `args.stream`:
 *   - true  → returns an async-iterable yielding ChatCompletionChunk-shaped
 *             objects with `delta.content` set to each token in `streamTokens`.
 *   - false → returns a non-streaming completion whose `message.content` is
 *             the JSON-stringified `judgeReport` (default: approved/8/no issues).
 *
 * `embeddings.create` always returns an array of fixed-size vectors. By default
 * each is a 1536-dim vector of zeros. Pass `embeddings: number[][]` to override.
 */
export interface OpenAIStubOptions {
  /** Tokens to stream on the chat call. Defaults to `["Hello, ", "world ", "[p.1]"]`. */
  streamTokens?: string[];
  /** Judge response. Defaults to a passing report. */
  judgeReport?: JudgeReport;
  /** Embeddings to return for `embeddings.create` calls (one per input). */
  embeddings?: number[][];
}

export interface OpenAIStubHandle {
  install: () => void;
  uninstall: () => void;
  /** Number of times each method was called. */
  calls: {
    embeddings: number;
    streamingChat: number;
    judge: number;
  };
}

const DEFAULT_TOKENS = ['Hello, ', 'world ', '[p.1]'];
const DEFAULT_EMBEDDING = (() => new Array<number>(1536).fill(0.001))();

const DEFAULT_JUDGE: JudgeReport = {
  scores: { citesPages: 2, inCharacter: 2, grounded: 2, helpful: 2 },
  total: 8,
  issues: [],
  verdict: 'approved',
};

export function makeOpenAIStub(opts: OpenAIStubOptions = {}): OpenAIStubHandle {
  const tokens = opts.streamTokens ?? DEFAULT_TOKENS;
  const judge = opts.judgeReport ?? DEFAULT_JUDGE;
  const embeddingsList = opts.embeddings;

  const calls = { embeddings: 0, streamingChat: 0, judge: 0 };

  let embedIdx = 0;
  const stub = {
    embeddings: {
      create: async () => {
        calls.embeddings += 1;
        const vec = embeddingsList?.[embedIdx] ?? DEFAULT_EMBEDDING;
        embedIdx = Math.min(embedIdx + 1, (embeddingsList?.length ?? 1) - 1);
        return { data: [{ embedding: vec, index: 0, object: 'embedding' }] };
      },
    },
    chat: {
      completions: {
        create: async (args: { stream?: boolean }) => {
          if (args?.stream) {
            calls.streamingChat += 1;
            return {
              [Symbol.asyncIterator]: async function* () {
                for (const t of tokens) {
                  yield { choices: [{ delta: { content: t }, index: 0 }] };
                }
              },
            };
          }
          calls.judge += 1;
          return {
            choices: [
              {
                message: { role: 'assistant', content: JSON.stringify(judge) },
                index: 0,
                finish_reason: 'stop',
              },
            ],
          };
        },
      },
    },
  };

  return {
    install: () => {
      // Stub shape is intentionally narrower than OpenAI's full API surface;
      // cast through `unknown` keeps both eslint and tsc happy.
      __setOpenAIClientForTests(stub as unknown as Parameters<typeof __setOpenAIClientForTests>[0]);
    },
    uninstall: () => {
      __setOpenAIClientForTests(null);
    },
    calls,
  };
}
