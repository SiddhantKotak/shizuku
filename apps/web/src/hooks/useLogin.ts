import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AuthSessionResponse, LoginBody } from '@shizuku/types';
import { postLogin } from '../lib/api/auth';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';
import { useAuthStore } from '../stores/authStore';

/**
 * Email + password login. On success:
 *   - hydrates `authStore` with the access token + user
 *   - invalidates every shizuku-scoped query so stale data from a previous
 *     session never leaks into the new one
 */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation<AuthSessionResponse, ApiError, LoginBody>({
    mutationFn: postLogin,
    onSuccess: (data) => {
      useAuthStore.getState().setSession(data.accessToken, data.user);
      void queryClient.invalidateQueries({ queryKey: queryKeys.all });
    },
  });
}
