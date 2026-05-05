import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router';
import { AvatarStep } from '../../components/onboarding/AvatarStep';
import { NameStep } from '../../components/onboarding/NameStep';
import { SpeciesStep } from '../../components/onboarding/SpeciesStep';
import { TutorialStep } from '../../components/onboarding/TutorialStep';
import { useCreatePet } from '../../hooks/useCreatePet';
import { usePet } from '../../hooks/usePet';
import { useUpdateAvatar } from '../../hooks/useUpdateAvatar';
import { useOnboardingStore } from '../../stores/onboardingStore';

export const Route = createFileRoute('/_app/onboarding')({
  component: OnboardingPage,
});

/**
 * Onboarding step machine. The store owns `step` (persisted across refresh)
 * and the per-step drafts. Each step component receives a typed contract;
 * the JSX is user-built in Antigravity (see ANTIGRAVITY_TODO.md).
 *
 * Server effects:
 *   - Avatar step: calls `PATCH /v1/users/me/avatar` (useUpdateAvatar).
 *   - Name step: calls `POST /v1/pets` (useCreatePet) — the backend transaction
 *     also stamps `users.onboardedAt`, so a user with a pet is "onboarded"
 *     even if they refresh before reaching the tutorial.
 *   - Tutorial step: no server effect — just resets the store + navigates.
 *
 * Route guard: if the user already has a pet, bounce to /room. Otherwise stay
 * here and resume from the persisted step (refresh-safe).
 */
function OnboardingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { data: pet, isPending: petPending } = usePet();
  const store = useOnboardingStore();
  const updateAvatar = useUpdateAvatar();
  const createPet = useCreatePet();

  if (petPending) return <PendingShell />;
  // If the user already has a pet (e.g. they returned to /onboarding by hand
  // after completing it earlier), bounce to /room. The TutorialOverlay in the
  // room can re-introduce them later.
  if (pet) return <Navigate to="/room" />;

  const finishOnboarding = (): void => {
    store.reset();
    void navigate({ to: '/room' });
  };

  switch (store.step) {
    case 'avatar':
      return (
        <Shell>
          <AvatarStep
            value={store.draftAvatar}
            onChange={store.setDraftAvatar}
            isSaving={updateAvatar.isPending}
            onAdvance={() => {
              updateAvatar.mutate(store.draftAvatar, {
                onSuccess: () => store.setStep('pet-species'),
              });
            }}
          />
        </Shell>
      );

    case 'pet-species':
      return (
        <Shell>
          <SpeciesStep
            value={store.draftSpecies}
            onChange={store.setDraftSpecies}
            onAdvance={() => store.setStep('pet-name')}
            onBack={() => store.setStep('avatar')}
          />
        </Shell>
      );

    case 'pet-name': {
      // Defensive: if the user navigated here without picking a species,
      // bounce back. (Shouldn't happen via the UI, but the persisted step
      // could land you here on a refresh after a partial flow.)
      if (!store.draftSpecies) {
        store.setStep('pet-species');
        return <PendingShell />;
      }
      return (
        <Shell>
          <NameStep
            species={store.draftSpecies}
            value={store.draftPetName}
            onChange={store.setDraftPetName}
            isSubmitting={createPet.isPending}
            error={createPet.error ?? null}
            onSubmit={() => {
              if (!store.draftSpecies) return;
              createPet.mutate(
                { species: store.draftSpecies, name: store.draftPetName.trim() },
                {
                  onSuccess: () => store.setStep('tutorial'),
                },
              );
            }}
            onBack={() => store.setStep('pet-species')}
          />
        </Shell>
      );
    }

    case 'tutorial':
      return (
        <Shell>
          <TutorialStep onFinish={finishOnboarding} onSkip={finishOnboarding} />
        </Shell>
      );

    case 'done':
    default:
      // Shouldn't sit on `done` — bounce to /room. (`done` is set transiently
      // by some flows; we treat it the same as "no work left here".)
      return <Navigate to="/room" />;
  }
}

/**
 * Layout wrapper. JSX details (logo, progress dots, side panel) are
 * Antigravity work — see ANTIGRAVITY_TODO.md → "Onboarding · Shell".
 */
function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="rounded-cozy bg-surface-raised p-8 shadow-cozy max-w-md w-full">
        {children}
      </div>
    </div>
  );
}

function PendingShell(): React.JSX.Element {
  return (
    <div className="grid min-h-screen place-items-center">
      <p className="text-sm text-ink/70">Loading…</p>
    </div>
  );
}
