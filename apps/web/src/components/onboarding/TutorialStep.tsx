export interface TutorialStepProps {
  /** Wire to `onboardingStore.reset()` then `navigate({ to: '/room' })`. */
  onFinish: () => void;
  /** Lets the user skip directly to /room. Same handler as onFinish for now. */
  onSkip: () => void;
}

/**
 * STEP 4 of onboarding — light "what to do next" tutorial. Real interactive
 * walk-through over the Phaser room lands in P7 (TutorialOverlay synced via
 * REQUEST_FOCUS_TARGET bridge events). For now, a static 3-card preview is
 * enough to get users into the room.
 *
 * **JSX is user-built in Antigravity.** See `apps/web/ANTIGRAVITY_TODO.md` →
 * "Onboarding · TutorialStep" for the spec (3 cards: WASD-to-move, click-desk-to-read,
 * click-pet-to-chat; "Got it" button on the last card; carousel arrows or dots).
 */
export function TutorialStep(props: TutorialStepProps): React.JSX.Element {
  return (
    <div data-todo-antigravity="onboarding-tutorial-step" className="text-center">
      <p className="text-ink/60">[TutorialStep — build in Antigravity]</p>
      <div className="mt-4 flex gap-2 justify-center">
        <button
          type="button"
          onClick={props.onSkip}
          className="rounded-cozy border border-ink/20 px-3 py-1.5"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={props.onFinish}
          className="rounded-cozy bg-ember-500 px-4 py-2 text-white"
        >
          Enter the room
        </button>
      </div>
    </div>
  );
}
