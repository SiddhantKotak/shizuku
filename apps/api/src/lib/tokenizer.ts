import { encoding_for_model, type TiktokenModel, type Tiktoken } from 'tiktoken';

/**
 * Lazy-initialised tiktoken encoder for the OpenAI embedding model.
 *
 * `text-embedding-3-small` uses the `cl100k_base` BPE; we just ask tiktoken
 * for the encoder by model name and it picks the right one. The encoder
 * holds native memory, so we cache one instance per process and free it on
 * shutdown via `disposeTokenizer()` if the caller wants tidy teardown.
 */
const ENCODER_MODEL: TiktokenModel = 'text-embedding-3-small';
let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!encoder) encoder = encoding_for_model(ENCODER_MODEL);
  return encoder;
}

/** Count tokens in a string. Used by the chunker to size 500-token windows. */
export function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}

/**
 * Encode + decode round-trip — used to truncate a string to N tokens
 * cleanly (e.g. for the 50-token overlap carry between chunks).
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return '';
  const enc = getEncoder();
  const tokens = enc.encode(text);
  if (tokens.length <= maxTokens) return text;
  const sliced = tokens.slice(0, maxTokens);
  return new TextDecoder().decode(enc.decode(sliced));
}

/** Take the LAST `n` tokens of a string. Used for chunk overlap. */
export function tailTokens(text: string, n: number): string {
  if (n <= 0) return '';
  const enc = getEncoder();
  const tokens = enc.encode(text);
  if (tokens.length <= n) return text;
  const sliced = tokens.slice(tokens.length - n);
  return new TextDecoder().decode(enc.decode(sliced));
}

/**
 * Free the native encoder. Optional — Node will reclaim on process exit —
 * but useful for long-running test suites that build/tear-down many
 * Fastify instances.
 */
export function disposeTokenizer(): void {
  if (encoder) {
    encoder.free();
    encoder = null;
  }
}
