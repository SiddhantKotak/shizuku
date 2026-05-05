import OpenAI from 'openai';
import { env } from '@shizuku/config';

/**
 * Single shared OpenAI client. Memoized so we don't churn TLS handshakes
 * across embed / chat / judge call sites.
 *
 * Throws on first use if `OPENAI_API_KEY` isn't configured. Routes that don't
 * need OpenAI never trigger this — the cache stays cold until a real call.
 */
let cached: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (cached) return cached;
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  cached = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cached;
}

/** Test seam — let unit tests inject a stub client. */
export function __setOpenAIClientForTests(client: OpenAI | null): void {
  cached = client;
}
