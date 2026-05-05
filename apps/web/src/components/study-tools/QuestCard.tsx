import type { QuestSummary } from '../../lib/api/studyTools';

export interface QuestCardProps {
  quest: QuestSummary;
  /** Wire to `useClaimQuest().mutate(quest.userQuestId)` (only enable when
   *  status === 'completed' && claimedAt === null). */
  onClaim: () => void;
  isClaiming: boolean;
}

/**
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "Study tools ·
 * QuestCard" for the spec (progress bar, metric icon, ink/xp reward chips,
 * GSAP `questClaimedBurst` on claim).
 */
export function QuestCard(props: QuestCardProps): React.JSX.Element {
  const { quest } = props;
  const pct = Math.min(100, Math.round((quest.progress / quest.target) * 100));
  const claimable = quest.status === 'completed' && quest.claimedAt === null;
  const claimed = quest.claimedAt !== null;
  return (
    <div data-todo-antigravity="study-tools-quest-card" className="rounded-cozy border p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{quest.title}</h4>
        <span className="text-xs text-ink/50">
          {quest.progress} / {quest.target} {quest.metric}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
        <div className="h-full bg-ember-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-ink/60">
          +{quest.inkReward} ink · +{quest.xpReward} xp
        </p>
        {claimed ? (
          <span className="text-xs text-emerald-600">Claimed</span>
        ) : claimable ? (
          <button
            type="button"
            onClick={props.onClaim}
            disabled={props.isClaiming}
            className="rounded-cozy bg-ember-500 px-3 py-1 text-xs text-white disabled:opacity-50"
          >
            {props.isClaiming ? 'Claiming…' : 'Claim'}
          </button>
        ) : (
          <span className="text-xs text-ink/40">In progress</span>
        )}
      </div>
    </div>
  );
}
