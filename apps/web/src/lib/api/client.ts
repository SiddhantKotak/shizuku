import { env } from '../../env';
import { useAuthStore } from '../../stores/authStore';
import { ApiError } from './errors';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal | undefined;
  /** Don't attempt token refresh on 401 (used by /auth/refresh itself). */
  skipRefresh?: boolean;
}

let refreshInflight: Promise<string | null> | null = null;

/**
 * Fetch wrapper that:
 *  - prepends the API base URL,
 *  - attaches Authorization: Bearer <accessToken> if available,
 *  - sends credentials (so the refresh cookie rides along),
 *  - on 401 (token_expired or invalid_token), tries /auth/refresh ONCE and replays.
 */
export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${env.VITE_API_URL}${path}`;
  const accessToken = useAuthStore.getState().accessToken;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...opts.headers,
  };

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
    credentials: 'include',
    signal: opts.signal ?? null,
  });

  if (res.status === 401 && !opts.skipRefresh) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      // Replay once with new token
      const replayed = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: { ...headers, Authorization: `Bearer ${newToken}` },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
        credentials: 'include',
        signal: opts.signal ?? null,
      });
      if (replayed.ok) return parseSuccess<T>(replayed);
      throw await ApiError.fromResponse(replayed);
    }
  }

  if (!res.ok) throw await ApiError.fromResponse(res);
  return parseSuccess<T>(res);
}

async function parseSuccess<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const json = (await res.json()) as { data: T };
  return json.data;
}

/**
 * Coalesces concurrent refresh attempts into a single request. Returns the new
 * access token, or null if refresh failed (the auth store is also cleared).
 */
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInflight) {
    refreshInflight = (async (): Promise<string | null> => {
      try {
        const res = await fetch(`${env.VITE_API_URL}/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) {
          useAuthStore.getState().clear();
          return null;
        }
        const json = (await res.json()) as { data: { accessToken: string } };
        useAuthStore.getState().setAccessToken(json.data.accessToken);
        return json.data.accessToken;
      } catch {
        useAuthStore.getState().clear();
        return null;
      } finally {
        refreshInflight = null;
      }
    })();
  }
  return refreshInflight;
}
