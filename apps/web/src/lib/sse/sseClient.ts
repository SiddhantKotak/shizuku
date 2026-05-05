/**
 * SSE consumer using `fetch` + ReadableStream.
 *
 * EventSource (the native browser SSE API) cannot:
 *   - Send a POST body
 *   - Send Authorization headers
 *   - Be aborted with an AbortController
 *
 * The chat + upload routes need all three, so we hand-roll the parser. The
 * Fastify backend writes frames in the canonical SSE format:
 *
 *   event: <name>
 *   data: <json>
 *   \n\n
 *
 * Which we parse here per RFC. See the Fastify side at
 * `apps/api/src/routes/documents/{chat,upload,refine}.ts`.
 */

export interface SseEvent<T = unknown> {
  /** Event name (e.g. 'token' | 'done' | 'error' | 'refinable'). */
  event: string;
  /** Parsed JSON payload, or `null` if the data line wasn't valid JSON. */
  data: T;
}

export interface StreamSseOptions {
  url: string;
  method?: 'POST' | 'GET';
  body?: BodyInit | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onEvent: (event: SseEvent) => void;
}

/**
 * Stream SSE frames from `url`. Resolves when the stream closes naturally,
 * rejects on network/HTTP errors. The caller passes `signal` to abort
 * mid-flight (chat input "stop generating" button).
 *
 * The HTTP status is checked before reading the body — non-2xx responses
 * read the JSON error envelope and reject so the caller can switch on
 * `error.code` (e.g. `cost_limit_exceeded` → toast + disable chat).
 */
export async function streamSSE(opts: StreamSseOptions): Promise<void> {
  const init: RequestInit = {
    method: opts.method ?? 'POST',
    headers: {
      ...(opts.body && opts.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      Accept: 'text/event-stream',
      ...opts.headers,
    },
    body: opts.body ?? null,
    // Tell the browser this is a streaming response so it doesn't buffer.
    cache: 'no-store',
  };
  if (opts.signal) init.signal = opts.signal;
  const res = await fetch(opts.url, init);

  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    let code = 'internal';
    try {
      const json = (await res.json()) as { error?: { code?: string; message?: string } };
      if (json.error?.code) code = json.error.code;
      if (json.error?.message) message = json.error.message;
    } catch {
      /* keep default */
    }
    const err = new Error(message) as Error & { status: number; code: string };
    err.status = res.status;
    err.code = code;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Frames are separated by a blank line. Split, keep the trailing
    // partial frame in `buffer` for the next chunk.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const parsed = parseFrame(frame);
      if (parsed) opts.onEvent(parsed);
    }
  }
  // Flush any final frame (some servers don't emit a trailing blank line).
  const tail = buffer.trim();
  if (tail.length > 0) {
    const parsed = parseFrame(tail);
    if (parsed) opts.onEvent(parsed);
  }
}

function parseFrame(frame: string): SseEvent | null {
  let event = 'message';
  let dataRaw = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      // Multi-line data is concatenated with newlines per RFC.
      dataRaw += (dataRaw ? '\n' : '') + line.slice(5).trim();
    }
    // Ignore `id:` and `retry:` for now.
  }
  let data: unknown = null;
  if (dataRaw.length > 0) {
    try {
      data = JSON.parse(dataRaw);
    } catch {
      data = dataRaw; // leave as string for non-JSON events
    }
  }
  return { event, data };
}
