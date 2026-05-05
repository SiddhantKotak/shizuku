import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VerifyEmailConfirmBody } from '@shizuku/types';
import { postVerifyEmailConfirm } from '../lib/api/auth';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';

/**
 * Submit the 6-digit code. On success we invalidate `useMe()` so the UI
 * picks up the new `emailVerifiedAt` timestamp and any verify-email banners
 * disappear immediately.
 *
 * Error codes the form should switch on:
 *   - 'otp_invalid'              → per-field error on the code input
 *   - 'otp_expired'              → toast + button to request a new code
 *   - 'otp_max_attempts_exceeded'→ toast: "Too many wrong attempts, request a new code"
 */
export function useVerifyEmailConfirm() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, VerifyEmailConfirmBody>({
    mutationFn: postVerifyEmailConfirm,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}
