import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useAuthStore } from '../stores/authStore';

/**
 * Pathless layout for unauthenticated routes (login, signup, password reset).
 * If the user is already authenticated, redirect to /room.
 */
export const Route = createFileRoute('/_public')({
  beforeLoad: async () => {
    const status = useAuthStore.getState().status;
    if (status === 'authenticated') {
      throw redirect({ to: '/room' });
    }
  },
  component: PublicLayout,
});

function PublicLayout(): React.JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base p-6">
      {/* User builds the visual layer in Antigravity. This is the structural shell. */}
      <Outlet />
    </div>
  );
}
