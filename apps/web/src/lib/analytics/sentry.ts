import * as Sentry from '@sentry/react';
import { env } from '../../env';

/**
 * Sentry wiring (browser).
 *
 * No-op when `VITE_SENTRY_DSN` is unset — the SDK is imported but never
 * initialized, so capture helpers become no-ops. Dev runs with no DSN
 * stay quiet; production picks up errors the moment Vercel adds the env.
 *
 * Call once at the very top of `main.tsx`, before `createRoot`.
 *
 * What's instrumented:
 *   - Uncaught render errors (caught by `Sentry.ErrorBoundary` / global
 *     handler). The route-level `__root.tsx` ErrorBoundary already handles
 *     UI fallback; Sentry just captures the error.
 *   - Unhandled promise rejections.
 *   - Console errors (only in production — dev console.error is noise).
 *
 * NOT instrumented:
 *   - Replay / session recording. Privacy-sensitive; opt in later if needed.
 *   - PII scrubbing beyond defaults — we don't put PII in props/state.
 */

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  if (!env.VITE_SENTRY_DSN) {
    // No DSN → no-op. Don't even call Sentry.init.
    return;
  }
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
    // Don't try to capture network failures from the user's flaky wifi —
    // those are noise.
    ignoreErrors: [
      'NetworkError',
      'Failed to fetch',
      'Load failed',
      'AbortError',
      // SSE aborts when the user navigates away mid-stream
      'BodyStreamBuffer was aborted',
    ],
    beforeSend(event) {
      // Strip Authorization headers from any request data Sentry collected.
      if (event.request?.headers) {
        delete event.request.headers['Authorization'];
        delete event.request.headers['authorization'];
        delete event.request.headers['Cookie'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });
  initialized = true;
}

/** Re-export the React `ErrorBoundary` so callers don't need to import @sentry/react directly. */
export const SentryErrorBoundary = Sentry.ErrorBoundary;
