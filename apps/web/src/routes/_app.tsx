import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useAmbientBootstrap } from '../hooks/useAmbientBootstrap';
import { petQueryOptions } from '../hooks/usePet';
import { useAuthStore } from '../stores/authStore';

/**
 * Pathless layout for authenticated routes.
 *
 * Three guards, in order:
 *   1. Unauthenticated → /login (preserves location for post-login redirect)
 *   2. Authenticated + no active pet + NOT already on /onboarding → /onboarding
 *      (avoids redirect loops by exempting the onboarding route itself)
 *   3. Otherwise → render the requested route
 *
 * Status `idle`/`authenticating` is allowed through — the bootstrap effect in
 * app.tsx is in flight, the guard re-runs after status settles.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location, context }) => {
    const status = useAuthStore.getState().status;
    if (status === 'idle' || status === 'authenticating') return;
    if (status === 'unauthenticated') {
      throw redirect({ to: '/login', search: { from: location.href } as never });
    }
    // status === 'authenticated' — check for active pet
    if (location.pathname === '/onboarding') return; // already there, don't loop
    const pet = await context.queryClient.ensureQueryData(petQueryOptions());
    if (!pet) {
      throw redirect({ to: '/onboarding' });
    }
  },
  component: AppLayout,
});

function AppLayout(): React.JSX.Element {
  // Once-per-mount bootstrap of the ambient sound manager. Plays the
  // persisted `currentTrackId` after the first user gesture and keeps the
  // SoundManager subscribed to volume / focus-mode changes from the store.
  useAmbientBootstrap();
  return (
    <div className="min-h-screen bg-surface-base text-ink">
      {/* User builds LeftRail + AppShell in Antigravity. Outlet is enough for now. */}
      <Outlet />
    </div>
  );
}
