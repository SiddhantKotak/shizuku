import { queryOptions, useQuery } from '@tanstack/react-query';
import { fetchPet } from '../lib/api/pet';
import { queryKeys } from '../lib/api/queryKeys';
import { useAuthStore } from '../stores/authStore';

export const petQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.pet(),
    queryFn: ({ signal }) => fetchPet(signal),
    staleTime: 30 * 1000,
  });

/**
 * Returns the active pet, `null` if the user hasn't onboarded a pet yet,
 * or undefined while the query is pending.
 */
export function usePet() {
  const status = useAuthStore((s) => s.status);
  return useQuery({
    ...petQueryOptions(),
    enabled: status === 'authenticated',
  });
}
