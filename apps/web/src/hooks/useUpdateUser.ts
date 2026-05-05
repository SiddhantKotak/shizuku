import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdateUserBody, User } from '@shizuku/types';
import { patchMe } from '../lib/api/users';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';

/**
 * PATCH /v1/users/me — currently displayName only. On success we set the
 * `me` query data directly (no refetch) since the API returns the full
 * updated user.
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation<User, ApiError, UpdateUserBody>({
    mutationFn: patchMe,
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.me(), user);
    },
  });
}
