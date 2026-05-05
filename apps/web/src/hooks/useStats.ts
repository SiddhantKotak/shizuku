import { useQuery } from '@tanstack/react-query';
import { getStats, type StatsRow } from '../lib/api/studyTools';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';

export type StatsRange = 'today' | 'week' | 'all';

export function useStats(range: StatsRange) {
  return useQuery<StatsRow[], ApiError>({
    queryKey: queryKeys.stats.range(range),
    queryFn: () => getStats(range),
    // Today's stats can change between visits to the dashboard; week/all are
    // stale-tolerant for longer.
    staleTime: range === 'today' ? 30_000 : 5 * 60_000,
  });
}
