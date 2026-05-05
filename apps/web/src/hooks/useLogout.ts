import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postLogout } from '../lib/api/auth';
import type { ApiError } from '../lib/api/errors';
import { useAuthStore } from '../stores/authStore';

/**
 * Logout always succeeds locally — the API call is best-effort. Even if the
 * network/server is down we still clear the local session so the user
 * appears logged out immediately. The server-side cookie is also cleared
 * by the API on the success path.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: postLogout,
    onSettled: () => {
      useAuthStore.getState().clear();
      queryClient.clear();
    },
  });
}
