import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatePetBody, Pet } from '@shizuku/types';
import { postPet } from '../lib/api/pets';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';

/**
 * POST /v1/pets — final step of onboarding. Sets the new pet directly into
 * the `pet` query cache so the next `_app` route guard call doesn't need a
 * fresh fetch (avoids a brief flash of "loading" between onboarding and /room).
 *
 * Error code to surface in the form:
 *   - 'pet_already_active' → toast + redirect to /room (the user already
 *     has one, they shouldn't be on onboarding)
 */
export function useCreatePet() {
  const queryClient = useQueryClient();
  return useMutation<Pet, ApiError, CreatePetBody>({
    mutationFn: postPet,
    onSuccess: (pet) => {
      queryClient.setQueryData(queryKeys.pet(), pet);
    },
  });
}
