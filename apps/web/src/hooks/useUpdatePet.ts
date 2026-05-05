import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Pet, UpdatePetBody } from '@shizuku/types';
import { patchPet } from '../lib/api/pets';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';

/** PATCH /v1/pets/me — Slice 1 supports renaming only. */
export function useUpdatePet() {
  const queryClient = useQueryClient();
  return useMutation<Pet, ApiError, UpdatePetBody>({
    mutationFn: patchPet,
    onSuccess: (pet) => {
      queryClient.setQueryData(queryKeys.pet(), pet);
    },
  });
}
