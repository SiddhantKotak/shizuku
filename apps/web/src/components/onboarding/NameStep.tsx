import type { PetSpecies } from '@shizuku/types';
import type { ApiError } from '../../lib/api/errors';

export interface NameStepProps {
  /** The species the user picked in step 2; needed for the create-pet payload. */
  species: PetSpecies;
  /** Current draft name. From `useOnboardingStore.draftPetName`. */
  value: string;
  /** Wire to `useOnboardingStore.setDraftPetName`. RHF can drive this. */
  onChange: (next: string) => void;
  /** Wire to a form submit that calls `useCreatePet().mutate({ species, name })`. */
  onSubmit: () => void;
  onBack: () => void;
  /** From the mutation: pending shows a spinner; error shows inline form error. */
  isSubmitting: boolean;
  error: ApiError | null;
}

/**
 * STEP 3 of onboarding — name the pet (RHF + zod, 3-16 unicode letters, spaces,
 * apostrophes, hyphens). On submit, fires `useCreatePet` mutation. The route
 * advances on success.
 *
 * **JSX is user-built in Antigravity.** See `apps/web/ANTIGRAVITY_TODO.md` →
 * "Onboarding · NameStep" for the spec (input + character counter + suggestions
 * list, error message wired to `error.error.code`).
 */
export function NameStep(props: NameStepProps): React.JSX.Element {
  return (
    <div data-todo-antigravity="onboarding-name-step" className="text-center">
      <p className="text-ink/60">[NameStep — build in Antigravity]</p>
      <input
        type="text"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder="Pet name"
        className="mt-2 rounded-cozy border border-ink/20 px-3 py-1.5"
      />
      {props.error ? (
        <p className="mt-2 text-sm text-rose-600">{props.error.message}</p>
      ) : null}
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
          onClick={props.onSubmit}
          disabled={props.isSubmitting || props.value.trim().length < 3}
          className="rounded-cozy bg-ember-500 px-4 py-2 text-white disabled:opacity-50"
        >
          {props.isSubmitting ? 'Creating…' : 'Create pet'}
        </button>
      </div>
    </div>
  );
}
