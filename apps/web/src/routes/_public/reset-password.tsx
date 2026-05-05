import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { ResetPasswordForm } from '../../components/auth/ResetPasswordForm';
import { useResetPassword } from '../../hooks/useResetPassword';

const searchSchema = z.object({
  email: z.string().email().optional(),
});

export const Route = createFileRoute('/_public/reset-password')({
  validateSearch: searchSchema,
  component: ResetPasswordPage,
});

function ResetPasswordPage(): React.JSX.Element {
  const reset = useResetPassword();
  const navigate = useNavigate();
  const { email } = Route.useSearch();
  return (
    <div className="w-full max-w-md rounded-cozy bg-surface-raised p-8 shadow-cozy">
      <h1 className="font-pixel text-2xl text-ink">Reset password</h1>
      <p className="mt-1 text-xs text-ink/60">Enter the 6-digit code we sent to your email.</p>
      <div className="mt-4">
        <ResetPasswordForm
          initialEmail={email}
          onSubmit={(args) => {
            reset.mutate(args, {
              onSuccess: () => {
                void navigate({ to: '/login' });
              },
            });
          }}
          isSubmitting={reset.isPending}
          error={reset.error ?? null}
        />
      </div>
      <a href="/forgot-password" className="mt-3 block text-center text-xs underline">
        Need a new code?
      </a>
    </div>
  );
}
