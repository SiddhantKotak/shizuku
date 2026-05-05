import { useStreak } from '../../hooks/useStreak';

export interface StreakBadgeProps {
  /** Optional CSS class for layout. */
  className?: string;
}

/**
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "Study tools ·
 * StreakBadge" for the spec (flame icon, count, tooltip with last-7-days
 * dot calendar, color shift at 7/30/100-day milestones).
 */
export function StreakBadge(props: StreakBadgeProps): React.JSX.Element {
  const streak = useStreak();
  const count = streak.data?.count ?? 0;
  return (
    <div
      data-todo-antigravity="study-tools-streak-badge"
      className={`inline-flex items-center gap-1 rounded-cozy bg-ember-100 px-2 py-1 text-xs text-ember-700 ${props.className ?? ''}`}
      title={streak.data?.lastDay ? `Last activity: ${streak.data.lastDay}` : 'No activity yet'}
    >
      <span aria-hidden>🔥</span>
      <span>{count}</span>
    </div>
  );
}
