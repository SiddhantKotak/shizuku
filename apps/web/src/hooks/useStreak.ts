import { useQuery } from '@tanstack/react-query';
import { getStreak, type StreakInfo } from '../lib/api/studyTools';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';

export function useStreak() {
  return useQuery<StreakInfo, ApiError>({
    queryKey: queryKeys.streak(),
    queryFn: getStreak,
    staleTime: 60_000,
  });
}
