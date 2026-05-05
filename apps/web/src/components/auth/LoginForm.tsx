import type { ApiError } from '../../lib/api/errors';

export interface LoginFormProps {
  /** Wire to `useLogin().mutate({ email, password })`. */
  onSubmit: (args: { email: string; password: string }) => void;
  /** True while the login mutation is in flight. */
  isSubmitting: boolean;
  /** Mutation error, or null. */
  error: ApiError | null;
}

/**
 * Email + password login form.
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "P5 ·
 * LoginForm" for the spec (RHF + zodResolver, schema from
 * `lib/forms/schemas/auth.ts`, error code → message mapping, "Forgot
 * password?" link, GSAP fadeIn on mount).
 */
export function LoginForm(props: LoginFormProps): React.JSX.Element {
  return (
    <form
      data-todo-antigravity="auth-login-form"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        props.onSubmit({
          email: String(data.get('email') ?? ''),
          password: String(data.get('password') ?? ''),
        });
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
      <input
        name="password"
        type="password"
        required
        placeholder="Password"
        className="block w-full rounded-cozy border px-3 py-2 text-sm"
      />
      {props.error ? <p className="text-xs text-rose-600">{props.error.message}</p> : null}
      <button
        type="submit"
        disabled={props.isSubmitting}
        className="w-full rounded-cozy bg-ember-500 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {props.isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
