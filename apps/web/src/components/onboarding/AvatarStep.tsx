import type { AvatarConfig } from '@shizuku/types';

export interface AvatarStepProps {
  /** Current draft. Read from `useOnboardingStore.draftAvatar`. */
  value: AvatarConfig;
  /** Wire to `useOnboardingStore.setDraftAvatar` (live preview, no server hit). */
  onChange: (next: AvatarConfig) => void;
  /** Wire to a button that calls `useUpdateAvatar` mutation, then `onAdvance` on success. */
  onAdvance: () => void;
  /** Pending state of the avatar mutation, for disabling the Continue button. */
  isSaving: boolean;
}

/**
 * STEP 1 of onboarding — pick a character preset (1-6) and tweak hue/sat.
 *
 * **JSX is user-built in Antigravity.** See `apps/web/ANTIGRAVITY_TODO.md` →
 * "Onboarding · AvatarStep" for the spec (preset grid, recolor sliders,
 * preview panel, GSAP fadeIn on mount, accessibility).
 *
 * The placeholder here keeps types passing while you build.
 */
export function AvatarStep(props: AvatarStepProps): React.JSX.Element {
  return (
    <div data-todo-antigravity="onboarding-avatar-step" className="text-center">
      <p className="text-ink/60">[AvatarStep — build in Antigravity]</p>
      <button
        type="button"
        onClick={props.onAdvance}
        disabled={props.isSaving}
        className="mt-4 rounded-cozy bg-ember-500 px-4 py-2 text-white"
      >
        Continue
      </button>
    </div>
  );
}
