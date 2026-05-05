import type { ApiError } from '../../lib/api/errors';

export interface SignupFormProps {
  /** Wire to `useSignup().mutate({ email, password, displayName })`. */
  onSubmit: (args: { email: string; password: string; displayName: string }) => void;
  isSubmitting: boolean;
  error: ApiError | null;
}

/**
 * Email + password + display name signup form.
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "P5 ·
 * SignupForm" for the spec (RHF + zodResolver from
 * `lib/forms/schemas/auth.ts`, password strength meter inline, error
 * codes: `email_taken` → "this email is in use, [Sign in]?",
 * `validation_error` → field-level errors).
 */
export function SignupForm(props: SignupFormProps): React.JSX.Element {
  return (
    <form
      data-todo-antigravity="auth-signup-form"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        props.onSubmit({
          email: String(data.get('email') ?? ''),
          password: String(data.get('password') ?? ''),
          displayName: String(data.get('displayName') ?? ''),
        });
      }}
      className="space-y-3"
    >
      <input
        name="displayName"
        required
        placeholder="Display name"
        minLength={1}
        maxLength={40}
        className="block w-full rounded-cozy border px-3 py-2 text-sm"
      />
      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        className="block w-full rounded-cozy border px-3 py-2 text-sm"
      />
      <input
        name="password"
        type="password"
        required
        placeholder="Password (10+ chars)"
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
        {props.isSubmitting ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
