import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  claimQuest,
  getTodayQuests,
  type ClaimQuestResult,
  type QuestSummary,
} from '../lib/api/studyTools';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';

export function useQuestsToday() {
  return useQuery<QuestSummary[], ApiError>({
    queryKey: queryKeys.quests.today(),
    queryFn: getTodayQuests,
    // Quests can advance from any side effect (chat done, pomodoro done,
    // page-read PUT). 30s staleness is conservative — the SPA also calls
    // setQueryData / invalidate in the relevant mutations.
    staleTime: 30_000,
  });
}

export function useClaimQuest() {
  const qc = useQueryClient();
  return useMutation<ClaimQuestResult, ApiError, string>({
    mutationFn: claimQuest,
    onSuccess: () => {
      // Re-fetch today's quests for the updated `claimedAt`, plus the user
      // (ink+xp went up).
      void qc.invalidateQueries({ queryKey: queryKeys.quests.today() });
      void qc.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}
