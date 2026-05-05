import type { PetSpecies } from '@shizuku/types';

export interface SpeciesStepProps {
  /** Currently-picked species (null = nothing chosen yet). From `useOnboardingStore.draftSpecies`. */
  value: PetSpecies | null;
  /** Wire to `useOnboardingStore.setDraftSpecies` (no server hit until name step commits). */
  onChange: (next: PetSpecies) => void;
  onAdvance: () => void;
  onBack: () => void;
}

/**
 * STEP 2 of onboarding — pick Ember / Ripple / Quill.
 *
 * **JSX is user-built in Antigravity.** See `apps/web/ANTIGRAVITY_TODO.md` →
 * "Onboarding · SpeciesStep" for the spec (3-card grid, hover/active states,
 * `PET_FLAVORS[species].flavor` on each card, idle-animation preview when
 * sprites land, GSAP staggered slide-in on mount).
 */
export function SpeciesStep(props: SpeciesStepProps): React.JSX.Element {
  return (
    <div data-todo-antigravity="onboarding-species-step" className="text-center">
      <p className="text-ink/60">[SpeciesStep — build in Antigravity]</p>
      <div className="mt-4 flex gap-2 justify-center">
        <button
          type="button"
          onClick={props.onBack}
          className="rounded-cozy border border-ink/20 px-3 py-1.5"
        >
          Back
        </button>
        <button
          type="button"
          onClick={props.onAdvance}
          disabled={!props.value}
          className="rounded-cozy bg-ember-500 px-4 py-2 text-white disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
