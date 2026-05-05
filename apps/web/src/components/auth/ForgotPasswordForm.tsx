import type { ApiError } from '../../lib/api/errors';

export interface ForgotPasswordFormProps {
  onSubmit: (email: string) => void;
  isSubmitting: boolean;
  error: ApiError | null;
  /** Whether the no-enumeration "if-it-exists" copy should be shown. */
  isSent: boolean;
}

/**
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "P5 ·
 * ForgotPasswordForm" for the spec (single email input, on success show
 * "If an account exists for that email, we've sent a reset code. Check
 * your inbox." — non-revealing copy by design).
 */
export function ForgotPasswordForm(props: ForgotPasswordFormProps): React.JSX.Element {
  if (props.isSent) {
    return (
      <p data-todo-antigravity="auth-forgot-password-sent" className="text-sm text-ink/70">
        If an account exists for that email, we&rsquo;ve sent a 6-digit reset code. Check your inbox
        (it expires in 10 minutes).
      </p>
    );
  }
  return (
    <form
      data-todo-antigravity="auth-forgot-password-form"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        props.onSubmit(String(data.get('email') ?? ''));
      }}
      className="space-y-3"
    >
      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        className="block w-full rounded-cozy border px-3 py-2 text-sm"
      />
      {props.error ? <p className="text-xs text-rose-600">{props.error.message}</p> : null}
      <button
        type="submit"
        disabled={props.isSubmitting}
        className="w-full rounded-cozy bg-ember-500 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {props.isSubmitting ? 'Sending…' : 'Send reset code'}
      </button>
    </form>
  );
}
