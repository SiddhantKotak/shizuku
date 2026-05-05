import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DeleteUserBody } from '@shizuku/types';
import { deleteMe } from '../lib/api/users';
import type { ApiError } from '../lib/api/errors';
import { useAuthStore } from '../stores/authStore';

/**
 * DELETE /v1/users/me — irreversible. Cascades on the server (oauth_accounts,
 * refresh_tokens, pets, documents, …). On success we clear the entire query
 * cache + auth store so no stale data survives the unmount.
 *
 * Caller is responsible for routing to the public landing page after the
 * mutation resolves — the route guards will redirect to /login automatically
 * once authStore is cleared, but a deliberate `navigate` makes the UX crisp.
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, DeleteUserBody>({
    mutationFn: deleteMe,
    onSuccess: () => {
      useAuthStore.getState().clear();
      queryClient.clear();
    },
  });
}
