import type { AvatarConfig, PetSpecies } from '@shizuku/types';
import { createStore } from './createStore';

/** Discrete steps of the onboarding flow. */
export type OnboardingStep = 'avatar' | 'pet-species' | 'pet-name' | 'tutorial' | 'done';

const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'avatar',
  'pet-species',
  'pet-name',
  'tutorial',
  'done',
];

const DEFAULT_AVATAR: AvatarConfig = { presetId: 1, hueShift: 0, satShift: 0 };

interface OnboardingState {
  /** Current step. Persisted so a refresh mid-onboarding resumes correctly. */
  step: OnboardingStep;
  /** Draft avatar before commit to /users/me/avatar. */
  draftAvatar: AvatarConfig;
  /** Pet species pick — null until step 2 is touched. */
  draftSpecies: PetSpecies | null;
  /** Pet name draft — empty until step 3 is touched. */
  draftPetName: string;

  setStep: (step: OnboardingStep) => void;
  next: () => void;
  prev: () => void;
  setDraftAvatar: (avatar: AvatarConfig) => void;
  setDraftSpecies: (species: PetSpecies) => void;
  setDraftPetName: (name: string) => void;
  /** Reset to a fresh onboarding (called after `done` or on logout). */
  reset: () => void;
}

type OnboardingPersisted = Pick<
  OnboardingState,
  'step' | 'draftAvatar' | 'draftSpecies' | 'draftPetName'
>;

const initial: OnboardingPersisted = {
  step: 'avatar',
  draftAvatar: DEFAULT_AVATAR,
  draftSpecies: null,
  draftPetName: '',
};

export const useOnboardingStore = createStore<OnboardingState, OnboardingPersisted>(
  (set, get) => ({
    ...initial,

    setStep: (step) => set({ step }),

    next: () => {
      const i = ONBOARDING_STEPS.indexOf(get().step);
      if (i < 0 || i === ONBOARDING_STEPS.length - 1) return;
      const nextStep = ONBOARDING_STEPS[i + 1];
      if (nextStep) set({ step: nextStep });
    },

    prev: () => {
      const i = ONBOARDING_STEPS.indexOf(get().step);
      if (i <= 0) return;
      const prevStep = ONBOARDING_STEPS[i - 1];
      if (prevStep) set({ step: prevStep });
    },

    setDraftAvatar: (draftAvatar) => set({ draftAvatar }),
    setDraftSpecies: (draftSpecies) => set({ draftSpecies }),
    setDraftPetName: (draftPetName) => set({ draftPetName }),

    reset: () => set(initial),
  }),
  {
    name: 'shizuku-onboarding',
    persist: {
      partialize: (state) => ({
        step: state.step,
        draftAvatar: state.draftAvatar,
        draftSpecies: state.draftSpecies,
        draftPetName: state.draftPetName,
      }),
    },
  },
);
