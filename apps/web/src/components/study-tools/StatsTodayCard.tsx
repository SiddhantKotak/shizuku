import { useStats } from '../../hooks/useStats';

export interface StatsTodayCardProps {
  metric: 'minutes' | 'pages' | 'chats' | 'pomodoros';
  label: string;
}

/**
 * Single big-number card. Composes 4 of these in StatsDashboard.
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "Study tools ·
 * StatsTodayCard" for the spec (number transitions on update, metric icon,
 * comparison to yesterday's value).
 */
export function StatsTodayCard(props: StatsTodayCardProps): React.JSX.Element {
  const today = useStats('today');
  const value = today.data?.[0]?.[props.metric] ?? 0;
  return (
    <div data-todo-antigravity="study-tools-stats-today-card" className="rounded-cozy border p-3 text-center">
      <p className="font-pixel text-3xl">{value}</p>
      <p className="text-xs text-ink/60">{props.label}</p>
    </div>
  );
}
