import type { ApiError } from '../../lib/api/errors';

export interface ResetPasswordFormProps {
  /** Pre-fill the email if the user came in via a link with `?email=`. */
  initialEmail?: string | undefined;
  onSubmit: (args: { email: string; code: string; password: string }) => void;
  isSubmitting: boolean;
  error: ApiError | null;
}

/**
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "P5 ·
 * ResetPasswordForm" for the spec (3 fields: email, 6-digit code,
 * new password; auto-focus on code field if email is prefilled; error
 * codes: `otp_invalid` / `otp_expired` / `otp_max_attempts_exceeded`
 * → request a new code CTA).
 */
export function ResetPasswordForm(props: ResetPasswordFormProps): React.JSX.Element {
  return (
    <form
      data-todo-antigravity="auth-reset-password-form"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        props.onSubmit({
          email: String(data.get('email') ?? ''),
          code: String(data.get('code') ?? ''),
          password: String(data.get('password') ?? ''),
        });
      }}
      className="space-y-3"
    >
      <input
        name="email"
        type="email"
        required
        defaultValue={props.initialEmail ?? ''}
        placeholder="Email"
        className="block w-full rounded-cozy border px-3 py-2 text-sm"
      />
      <input
        name="code"
        required
        pattern="[0-9]{6}"
        placeholder="6-digit code"
        className="block w-full rounded-cozy border px-3 py-2 text-sm"
      />
      <input
        name="password"
        type="password"
        required
        placeholder="New password (10+ chars)"
        minLength={10}
        maxLength={200}
        className="block w-full rounded-cozy border px-3 py-2 text-sm"
      />
      {props.error ? <p className="text-xs text-rose-600">{props.error.message}</p> : null}
      <button
        type="submit"
        disabled={props.isSubmitting}
        className="w-full rounded-cozy bg-ember-500 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {props.isSubmitting ? 'Resetting…' : 'Reset password'}
      </button>
    </form>
  );
}
