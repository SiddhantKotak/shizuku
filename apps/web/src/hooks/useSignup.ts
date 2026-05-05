import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AuthSessionResponse, SignupBody } from '@shizuku/types';
import { postSignup } from '../lib/api/auth';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';
import { useAuthStore } from '../stores/authStore';

/**
 * Create a new account. Server sets the rft cookie; same post-success
 * hydration as useLogin. Caller is responsible for routing to /onboarding
 * after the mutation resolves (new users always need to pick a pet).
 *
 * Common error codes the form should switch on:
 *   - 'email_taken' → field-level error on the email input
 *   - 'validation_error' → fall back to RHF's per-field messages
 */
export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation<AuthSessionResponse, ApiError, SignupBody>({
    mutationFn: postSignup,
    onSuccess: (data) => {
      useAuthStore.getState().setSession(data.accessToken, data.user);
      void queryClient.invalidateQueries({ queryKey: queryKeys.all });
    },
  });
}
