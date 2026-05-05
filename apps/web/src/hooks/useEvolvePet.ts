import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Pet } from '@shizuku/types';
import { postEvolvePet } from '../lib/api/pets';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';

/**
 * POST /v1/pets/me/evolve — bumps `evolutionStage`. The component should
 * trigger the EvolutionScene cutscene (Phaser, P14) ON success rather than
 * before, so a `pet_not_evolvable` failure doesn't play a misleading
 * animation.
 *
 * Errors:
 *   - 'pet_not_evolvable' → toast: "Need to reach level X first"
 *   - 'not_found' → reload — no active pet (shouldn't happen in normal UX)
 */
export function useEvolvePet() {
  const queryClient = useQueryClient();
  return useMutation<Pet, ApiError, void>({
    mutationFn: postEvolvePet,
    onSuccess: (pet) => {
      queryClient.setQueryData(queryKeys.pet(), pet);
    },
  });
}
