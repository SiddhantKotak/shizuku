import { createFileRoute } from '@tanstack/react-router';
import { ForgotPasswordForm } from '../../components/auth/ForgotPasswordForm';
import { useForgotPassword } from '../../hooks/useForgotPassword';

export const Route = createFileRoute('/_public/forgot-password')({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage(): React.JSX.Element {
  const forgot = useForgotPassword();
  return (
    <div className="w-full max-w-md rounded-cozy bg-surface-raised p-8 shadow-cozy">
      <h1 className="font-pixel text-2xl text-ink">Reset password</h1>
      <p className="mt-1 text-xs text-ink/60">
        We&rsquo;ll send a 6-digit code to your email if it&rsquo;s registered.
      </p>
      <div className="mt-4">
        <ForgotPasswordForm
          onSubmit={(email) => forgot.mutate({ email })}
          isSubmitting={forgot.isPending}
          error={forgot.error ?? null}
          isSent={forgot.isSuccess}
        />
      </div>
      {forgot.isSuccess ? (
        <a href="/reset-password" className="mt-3 block text-center text-xs underline">
          I have a code → Reset
        </a>
      ) : null}
    </div>
  );
}
