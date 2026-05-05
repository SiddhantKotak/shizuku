import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  completePomodoro,
  listPomodoros,
  startPomodoro,
  type CompletePomodoroResponse,
  type PomodoroSessionRow,
  type StartPomodoroResponse,
} from '../lib/api/studyTools';
import { queryKeys } from '../lib/api/queryKeys';
import {
  POMODORO_BREAK_MS,
  POMODORO_FOCUS_MS,
  usePomodoroStore,
} from '../stores/pomodoroStore';
import type { ApiError } from '../lib/api/errors';

/**
 * Drift-free Pomodoro ticker.
 *
 * The store holds `endsAt` as a wall-clock timestamp. The ticker re-reads
 * `Date.now()` every animation frame and computes `remainingMs`. When
 * `remainingMs` hits 0, the auto-transition fires:
 *   - focus → break → POST /v1/pomodoro/:id/complete (server side effects),
 *     then cycle the timer to break.
 *   - break → idle (no server call).
 *
 * Returned: `remainingMs`, `phase`, `start/pause/resume/cancel`, plus the
 * mutation pending flags so the SPA can show a spinner during the
 * complete call.
 */

export interface UsePomodoro {
  phase: 'idle' | 'focus' | 'break' | 'paused';
  remainingMs: number;
  totalMs: number;
  cyclesThisStreak: number;
  isStarting: boolean;
  isCompleting: boolean;
  start: (documentId?: string) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

export function usePomodoro(): UsePomodoro {
  const store = usePomodoroStore();
  const qc = useQueryClient();
  const [remainingMs, setRemainingMs] = useState<number>(() =>
    store.phase === 'paused'
      ? store.remainingMsAtPause
      : store.endsAt
        ? Math.max(0, store.endsAt - Date.now())
        : 0,
  );
  const completedRef = useRef(false);

  const startMut = useMutation<StartPomodoroResponse, ApiError, string | undefined>({
    mutationFn: (documentId) => startPomodoro(documentId),
    onSuccess: (res, documentId) => {
      completedRef.current = false;
      store.start({ sessionId: res.id, documentId: documentId ?? null });
    },
  });

  const completeMut = useMutation<
    CompletePomodoroResponse,
    ApiError,
    { id: string; cycleCount: number; minutesElapsed: number }
  >({
    mutationFn: completePomodoro,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.streak() });
      void qc.invalidateQueries({ queryKey: queryKeys.quests.today() });
      void qc.invalidateQueries({ queryKey: queryKeys.stats.range('today') });
      void qc.invalidateQueries({ queryKey: queryKeys.pet() });
      void qc.invalidateQueries({ queryKey: queryKeys.pomodoro.list() });
    },
  });

  // rAF ticker. Re-bound when phase changes (so paused → focus restarts it).
  useEffect(() => {
    if (store.phase === 'idle' || store.phase === 'paused') {
      setRemainingMs(store.phase === 'paused' ? store.remainingMsAtPause : 0);
      return;
    }
    let raf = 0;
    const tick = (): void => {
      const left = Math.max(0, store.endsAt - Date.now());
      setRemainingMs(left);
      if (left <= 0) {
        if (store.phase === 'focus' && !completedRef.current && store.sessionId) {
          completedRef.current = true;
          completeMut.mutate({
            id: store.sessionId,
            cycleCount: 1,
            minutesElapsed: Math.round(POMODORO_FOCUS_MS / 60000),
          });
          store.finishFocus();
        } else if (store.phase === 'break') {
          store.finishBreak();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.phase, store.endsAt, store.sessionId]);

  return {
    phase: store.phase,
    remainingMs,
    totalMs: store.phase === 'break' ? POMODORO_BREAK_MS : POMODORO_FOCUS_MS,
    cyclesThisStreak: store.cyclesThisStreak,
    isStarting: startMut.isPending,
    isCompleting: completeMut.isPending,
    start: (documentId) => startMut.mutate(documentId),
    pause: store.pause,
    resume: store.resume,
    cancel: store.cancel,
  };
}

export function usePomodoroList(range: 'today' | 'week' | 'all' = 'week') {
  return useQuery<PomodoroSessionRow[], ApiError>({
    queryKey: queryKeys.pomodoro.list(),
    queryFn: () => listPomodoros(range),
    staleTime: 60_000,
  });
}
