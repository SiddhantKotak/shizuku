import { useMutation } from '@tanstack/react-query';
import type { ResetPasswordBody } from '@shizuku/types';
import { postResetPassword } from '../lib/api/auth';
import type { ApiError } from '../lib/api/errors';
import { useAuthStore } from '../stores/authStore';

/**
 * Reset password with the OTP from forgot-password. After a successful reset
 * the API has bumped `tokenVersion` and revoked every refresh family for
 * this user, so any access tokens we held are now dead. We clear local
 * session and let the form route the user to /login to start fresh.
 *
 * Common error codes:
 *   - 'otp_invalid'              → per-field error on the code input
 *   - 'otp_expired'              → toast: "Code expired, request a new one"
 *   - 'otp_max_attempts_exceeded'→ toast + force back to forgot-password
 */
export function useResetPassword() {
  return useMutation<void, ApiError, ResetPasswordBody>({
    mutationFn: postResetPassword,
    onSuccess: () => {
      useAuthStore.getState().clear();
    },
  });
}
