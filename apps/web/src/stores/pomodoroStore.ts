import { createStore } from './createStore';

/**
 * Pomodoro phase + endsAt clock.
 *
 * Persisted to localStorage so a refresh / tab-close mid-session resumes
 * cleanly: the SPA re-derives "remaining" from `endsAt - Date.now()`. No
 * stored "remaining seconds" field — that would drift from the wall clock.
 *
 * Phases:
 *   - 'idle'   — no active session
 *   - 'focus'  — 25-min focus block (or whatever the user configures)
 *   - 'break'  — 5-min break (auto-transition after focus)
 *   - 'paused' — focus paused; endsAt is irrelevant, remainingMsAtPause is
 *                stored. Resume: endsAt = now + remainingMsAtPause.
 *
 * Server-side `pomodoro_sessions` row is opened on focus start (POST
 * /v1/pomodoro/start) and closed on focus complete (POST /v1/pomodoro/:id/
 * complete) — the BREAK phase is purely a client UX timer; the server
 * doesn't track it. Cycles are counted client-side too.
 */

const FOCUS_MS = 25 * 60 * 1000;
const BREAK_MS = 5 * 60 * 1000;

export type PomodoroPhase = 'idle' | 'focus' | 'break' | 'paused';

interface PomodoroState {
  phase: PomodoroPhase;
  /** Wall-clock end time. `0` when idle/paused. */
  endsAt: number;
  /** When paused, remaining ms at the pause moment (so resume picks up). */
  remainingMsAtPause: number;
  /** Current focus session id from the server. Cleared when phase=idle. */
  sessionId: string | null;
  /** Optional document the session is linked to. */
  documentId: string | null;
  /** Cycles completed in this rolling streak (client-side; resets on idle). */
  cyclesThisStreak: number;
  /** Minutes elapsed in the current focus phase (used by the complete call). */
  focusMinutesAccumulated: number;

  start: (args: { sessionId: string; documentId?: string | null }) => void;
  pause: () => void;
  resume: () => void;
  finishFocus: () => void;
  finishBreak: () => void;
  cancel: () => void;
}

type Persisted = Pick<
  PomodoroState,
  | 'phase'
  | 'endsAt'
  | 'remainingMsAtPause'
  | 'sessionId'
  | 'documentId'
  | 'cyclesThisStreak'
  | 'focusMinutesAccumulated'
>;

const initial: Persisted = {
  phase: 'idle',
  endsAt: 0,
  remainingMsAtPause: 0,
  sessionId: null,
  documentId: null,
  cyclesThisStreak: 0,
  focusMinutesAccumulated: 0,
};

export const usePomodoroStore = createStore<PomodoroState, Persisted>(
  (set, get) => ({
    ...initial,

    start: ({ sessionId, documentId }) =>
      set({
        phase: 'focus',
        endsAt: Date.now() + FOCUS_MS,
        remainingMsAtPause: 0,
        sessionId,
        documentId: documentId ?? null,
        focusMinutesAccumulated: 0,
      }),

    pause: () => {
      const { phase, endsAt } = get();
      if (phase !== 'focus') return;
      const remaining = Math.max(0, endsAt - Date.now());
      set({ phase: 'paused', remainingMsAtPause: remaining });
    },

    resume: () => {
      const { phase, remainingMsAtPause } = get();
      if (phase !== 'paused') return;
      set({
        phase: 'focus',
        endsAt: Date.now() + remainingMsAtPause,
        remainingMsAtPause: 0,
      });
    },

    finishFocus: () =>
      set((s) => ({
        phase: 'break',
        endsAt: Date.now() + BREAK_MS,
        cyclesThisStreak: s.cyclesThisStreak + 1,
        focusMinutesAccumulated: s.focusMinutesAccumulated + Math.round(FOCUS_MS / 60000),
      })),

    finishBreak: () => set({ phase: 'idle', endsAt: 0, sessionId: null, documentId: null }),

    cancel: () =>
      set({ phase: 'idle', endsAt: 0, remainingMsAtPause: 0, sessionId: null, documentId: null }),
  }),
  {
    name: 'shizuku-pomodoro',
    persist: {
      partialize: (state) => ({
        phase: state.phase,
        endsAt: state.endsAt,
        remainingMsAtPause: state.remainingMsAtPause,
        sessionId: state.sessionId,
        documentId: state.documentId,
        cyclesThisStreak: state.cyclesThisStreak,
        focusMinutesAccumulated: state.focusMinutesAccumulated,
      }),
    },
  },
);

export const POMODORO_FOCUS_MS = FOCUS_MS;
export const POMODORO_BREAK_MS = BREAK_MS;
