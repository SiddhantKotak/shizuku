export interface UsageMeterProps {
  /** Read from `useUsage()` data. */
  used: number;
  limit: number;
  /** ISO timestamp; falsy = no rollover (e.g. PDFs). */
  resetAt?: string | null;
  /** "chats today" / "PDFs uploaded" — the unit label. */
  label: string;
}

/**
 * Small "X / Y label" chip with amber/red tint as it fills.
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "Reader ·
 * UsageMeter" for the spec (ring-progress visual, tooltip with reset time,
 * thresholds: 0-74% = neutral, 75-89% = amber, 90+% = red).
 */
export function UsageMeter(props: UsageMeterProps): React.JSX.Element {
  const pct = Math.round((props.used / props.limit) * 100);
  const tone =
    pct >= 90 ? 'bg-rose-100 text-rose-700' :
    pct >= 75 ? 'bg-amber-100 text-amber-700' :
    'bg-surface-raised text-ink/70';
  return (
    <div data-todo-antigravity="reader-usage-meter" className={`rounded-cozy px-2 py-1 text-[11px] ${tone}`}>
      {props.used} / {props.limit} {props.label}
      {props.resetAt ? <span className="ml-2 text-ink/40">resets at midnight UTC</span> : null}
    </div>
  );
}
