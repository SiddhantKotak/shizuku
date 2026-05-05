import type { User } from '@shizuku/types';
import { apiFetch } from './client';

/** GET /v1/users/me — full user view (level, ink, streak, avatar config). */
export async function fetchMe(signal?: AbortSignal): Promise<User> {
  return apiFetch<User>('/v1/users/me', { signal });
}
