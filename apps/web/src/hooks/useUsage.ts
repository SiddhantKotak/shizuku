import { useQuery } from '@tanstack/react-query';
import { getUsage, type UsageSnapshot } from '../lib/api/usage';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';

const POLL_INTERVAL_MS = 60_000; // 1 min — good enough for a slowly-changing limit

/**
 * GET /v1/usage — current chat + PDF usage versus the daily / lifetime caps.
 *
 * Polled every 60s while the chat sidebar is mounted. UsageMeter component
 * reads this to render the "X / 100 chats today" indicator and to tint
 * amber/red as the user approaches the limit.
 */
export function useUsage() {
  return useQuery<UsageSnapshot, ApiError>({
    queryKey: queryKeys.usage(),
    queryFn: getUsage,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 15_000,
  });
}
