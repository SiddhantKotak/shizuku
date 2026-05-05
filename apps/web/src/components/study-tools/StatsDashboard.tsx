import { useStats } from '../../hooks/useStats';
import { StatsTodayCard } from './StatsTodayCard';

/**
 * Composition shell — 4 today cards + a week chart placeholder.
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "Study tools ·
 * StatsDashboard" for the spec (recharts ComposedChart for week, calendar
 * heatmap for all-time, range-tab switcher).
 */
export function StatsDashboard(): React.JSX.Element {
  const week = useStats('week');
  const all = useStats('all');
  return (
    <div data-todo-antigravity="study-tools-stats-dashboard" className="space-y-4">
      <section>
        <h3 className="text-sm font-medium">Today</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatsTodayCard metric="minutes" label="Minutes" />
          <StatsTodayCard metric="pages" label="Pages read" />
          <StatsTodayCard metric="chats" label="Chats" />
          <StatsTodayCard metric="pomodoros" label="Pomodoros" />
        </div>
      </section>
      <section>
        <h3 className="text-sm font-medium">Week</h3>
        <p className="text-xs text-ink/50">
          {week.data?.length ?? 0} days with activity. (recharts ComposedChart goes here in
          Antigravity — see ANTIGRAVITY_TODO.md.)
        </p>
      </section>
      <section>
        <h3 className="text-sm font-medium">All-time</h3>
        <p className="text-xs text-ink/50">
          {all.data?.length ?? 0} days total. (calendar heatmap goes here in
          Antigravity — see ANTIGRAVITY_TODO.md.)
        </p>
      </section>
    </div>
  );
}
