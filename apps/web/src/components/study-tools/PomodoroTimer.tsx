import type { UsePomodoro } from '../../hooks/usePomodoro';

export interface PomodoroTimerProps extends UsePomodoro {
  /** Optional: pass a documentId so the focus block links to it for stats. */
  documentId?: string | null;
}

/**
 * Pomodoro timer face. Reads everything from `usePomodoro()`.
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "Study tools ·
 * PomodoroTimer" for the full spec (vinyl-spinner aesthetic, ring progress,
 * GSAP `pomodoroComplete` flourish on phase end, focus/break color theme).
 */
export function PomodoroTimer(props: PomodoroTimerProps): React.JSX.Element {
  const minutes = Math.floor(props.remainingMs / 60000);
  const seconds = Math.floor((props.remainingMs % 60000) / 1000)
    .toString()
    .padStart(2, '0');
  const isIdle = props.phase === 'idle';

  return (
    <div data-todo-antigravity="study-tools-pomodoro-timer" className="rounded-cozy border p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-ink/50">
        {props.phase === 'focus'
          ? 'Focus'
          : props.phase === 'break'
            ? 'Break'
            : props.phase === 'paused'
              ? 'Paused'
              : 'Ready'}
      </p>
      <p className="font-pixel text-5xl">
        {minutes}:{seconds}
      </p>
      <p className="mt-1 text-xs text-ink/50">
        {props.cyclesThisStreak} cycle{props.cyclesThisStreak === 1 ? '' : 's'} today
      </p>
      <div className="mt-3 flex justify-center gap-2">
        {isIdle ? (
          <button
            type="button"
            onClick={() => props.start(props.documentId ?? undefined)}
            disabled={props.isStarting}
            className="rounded-cozy bg-ember-500 px-3 py-1 text-xs text-white disabled:opacity-50"
          >
            Start focus
          </button>
        ) : props.phase === 'paused' ? (
          <>
            <button
              type="button"
              onClick={props.resume}
              className="rounded-cozy bg-ember-500 px-3 py-1 text-xs text-white"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={props.cancel}
              className="rounded-cozy border px-3 py-1 text-xs"
            >
              Cancel
            </button>
          </>
        ) : props.phase === 'focus' ? (
          <button
            type="button"
            onClick={props.pause}
            className="rounded-cozy border px-3 py-1 text-xs"
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={props.cancel}
            className="rounded-cozy border px-3 py-1 text-xs"
          >
            End break
          </button>
        )}
      </div>
    </div>
  );
}
