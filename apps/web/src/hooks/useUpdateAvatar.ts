import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AvatarConfig, UpdateAvatarBody, User } from '@shizuku/types';
import { patchAvatar } from '../lib/api/users';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';

/**
 * PATCH /v1/users/me/avatar — sets the AvatarConfig blob. Optimistic update
 * via `setQueryData`: the avatar preview should react to slider changes
 * without waiting for the round trip.
 */
export function useUpdateAvatar() {
  const queryClient = useQueryClient();
  return useMutation<AvatarConfig, ApiError, UpdateAvatarBody>({
    mutationFn: patchAvatar,
    onSuccess: (avatarConfig) => {
      // Patch the cached User so anything reading `useMe` sees the new avatar.
      queryClient.setQueryData<User | undefined>(queryKeys.me(), (prev) =>
        prev ? { ...prev, avatarConfig } : prev,
      );
    },
  });
}
