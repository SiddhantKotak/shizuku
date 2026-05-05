import { queryOptions, useQuery } from '@tanstack/react-query';
import { fetchMe } from '../lib/api/me';
import { queryKeys } from '../lib/api/queryKeys';
import { useAuthStore } from '../stores/authStore';

/**
 * Shared queryOptions so route loaders (`ensureQueryData`) and components
 * (`useQuery`) point at the exact same cache entry.
 */
export const meQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.me(),
    queryFn: ({ signal }) => fetchMe(signal),
    staleTime: 30 * 1000,
  });

/** Hook used by components that render based on the current user. */
export function useMe() {
  const status = useAuthStore((s) => s.status);
  return useQuery({
    ...meQueryOptions(),
    enabled: status === 'authenticated',
  });
}
