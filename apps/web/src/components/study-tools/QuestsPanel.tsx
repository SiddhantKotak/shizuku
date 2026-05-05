import { useClaimQuest, useQuestsToday } from '../../hooks/useQuests';
import { QuestCard } from './QuestCard';

/**
 * Wraps `useQuestsToday` + `useClaimQuest` and renders the 3 cards.
 *
 * **Visual layout your Antigravity work.** See ANTIGRAVITY_TODO.md →
 * "Study tools · QuestsPanel" for the spec (header, empty state, GSAP
 * stagger-in on mount).
 */
export function QuestsPanel(): React.JSX.Element {
  const today = useQuestsToday();
  const claim = useClaimQuest();
  return (
    <section data-todo-antigravity="study-tools-quests-panel" className="space-y-2">
      <h3 className="text-sm font-medium">Today's quests</h3>
      {today.isPending ? (
        <p className="text-xs text-ink/50">Loading…</p>
      ) : today.data?.length === 0 ? (
        <p className="text-xs text-ink/50">No quests today.</p>
      ) : (
        today.data?.map((q) => (
          <QuestCard
            key={q.userQuestId}
            quest={q}
            onClaim={() => claim.mutate(q.userQuestId)}
            isClaiming={claim.isPending && claim.variables === q.userQuestId}
          />
        ))
      )}
    </section>
  );
}
