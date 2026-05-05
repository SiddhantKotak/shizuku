import { useMutation } from '@tanstack/react-query';
import { postVerifyEmailRequest } from '../lib/api/auth';
import type { ApiError } from '../lib/api/errors';

/**
 * Trigger the API to email the current authed user a fresh 6-digit code.
 * Idempotent on already-verified accounts (returns 204 without sending).
 * Rate-limited at the API: 3 codes per user per 10 minutes — surface a toast
 * if we hit 429.
 */
export function useVerifyEmailRequest() {
  return useMutation<void, ApiError, void>({
    mutationFn: postVerifyEmailRequest,
  });
}
