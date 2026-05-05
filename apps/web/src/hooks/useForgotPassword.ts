import { useMutation } from '@tanstack/react-query';
import type { ForgotPasswordBody } from '@shizuku/types';
import { postForgotPassword } from '../lib/api/auth';
import type { ApiError } from '../lib/api/errors';

/**
 * Request a password-reset OTP. The API ALWAYS responds 204 regardless of
 * whether the email exists (anti-enumeration), so the success state should
 * just say "if that email is registered, we sent a code". Don't promise the
 * user the email definitely arrived — they'd learn whether the address
 * exists by trying the form, which defeats the purpose.
 */
export function useForgotPassword() {
  return useMutation<void, ApiError, ForgotPasswordBody>({
    mutationFn: postForgotPassword,
  });
}
