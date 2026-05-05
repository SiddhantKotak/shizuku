import { createFileRoute } from '@tanstack/react-router';
import { StatsDashboard } from '../../components/study-tools/StatsDashboard';
import { StreakBadge } from '../../components/study-tools/StreakBadge';

export const Route = createFileRoute('/_app/stats')({
  component: StatsPage,
});

function StatsPage(): React.JSX.Element {
  return (
    <main data-todo-antigravity="stats-page" className="mx-auto max-w-3xl px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="font-pixel text-2xl">Stats</h1>
        <StreakBadge />
      </header>
      <div className="mt-4">
        <StatsDashboard />
      </div>
    </main>
  );
}
