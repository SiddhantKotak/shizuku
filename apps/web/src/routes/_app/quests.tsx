import { createFileRoute } from '@tanstack/react-router';
import { QuestsPanel } from '../../components/study-tools/QuestsPanel';

export const Route = createFileRoute('/_app/quests')({
  component: QuestsPage,
});

function QuestsPage(): React.JSX.Element {
  return (
    <main data-todo-antigravity="quests-page" className="mx-auto max-w-xl px-4 py-6">
      <h1 className="font-pixel text-2xl">Daily quests</h1>
      <p className="mt-1 text-xs text-ink/60">
        Three new quests every UTC day. Complete them by reading, focusing, and chatting with
        your pet.
      </p>
      <div className="mt-4">
        <QuestsPanel />
      </div>
    </main>
  );
}
