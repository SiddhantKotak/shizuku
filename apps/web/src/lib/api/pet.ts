import type { Pet } from '@shizuku/types';
import { ApiError } from './errors';
import { apiFetch } from './client';

/**
 * GET /v1/pets/me — active pet for the current user.
 *
 * Translates the API's "no active pet → 404 not_found" response into
 * `null`, which is the more useful client-side shape:
 *   - in `useQuery`, `data === null` cleanly signals "user is authed but
 *     hasn't completed onboarding yet" (drives the `/onboarding` redirect)
 *   - any other error (auth failure, network) propagates as an exception
 */
export async function fetchPet(signal?: AbortSignal): Promise<Pet | null> {
  try {
    return await apiFetch<Pet>('/v1/pets/me', { signal });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
