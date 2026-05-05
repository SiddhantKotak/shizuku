import type { ApiError } from '../../lib/api/errors';

export interface VerifyEmailBannerProps {
  /** Wire to `useVerifyEmailRequest().mutate()`. */
  onRequestCode: () => void;
  isSendingCode: boolean;
  /** True if a code was just sent (show "code sent" copy + open the modal). */
  isSent: boolean;
  /** Wire to `useVerifyEmailConfirm().mutate(code)`. */
  onConfirm: (code: string) => void;
  isConfirming: boolean;
  confirmError: ApiError | null;
}

/**
 * Sticky banner at top of `/room` (and elsewhere) when
 * `useMe().emailVerifiedAt === null`. On click, fires verify-email/request,
 * then opens an inline 6-digit OTP input.
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "P5 ·
 * VerifyEmailBanner" for the spec (collapsible inline form, GSAP slide-in,
 * dismissible state in localStorage, error handling for
 * `otp_invalid` / `otp_expired` / `otp_max_attempts_exceeded`).
 */
export function VerifyEmailBanner(props: VerifyEmailBannerProps): React.JSX.Element {
  return (
    <aside
      data-todo-antigravity="auth-verify-email-banner"
      className="rounded-cozy bg-amber-100 px-3 py-2 text-xs text-amber-800"
    >
      <p>
        Verify your email to enable account recovery.
        {!props.isSent ? (
          <button
            type="button"
            onClick={props.onRequestCode}
            disabled={props.isSendingCode}
            className="ml-2 underline"
          >
            {props.isSendingCode ? 'Sending…' : 'Send me a code'}
          </button>
        ) : null}
      </p>
      {props.isSent ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            props.onConfirm(String(data.get('code') ?? ''));
          }}
          className="mt-2 flex gap-2"
        >
          <input
            name="code"
            required
            pattern="[0-9]{6}"
            placeholder="6-digit code"
            className="rounded-cozy border px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={props.isConfirming}
            className="rounded-cozy bg-ember-500 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            {props.isConfirming ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      ) : null}
      {props.confirmError ? (
        <p className="mt-1 text-rose-700">{props.confirmError.message}</p>
      ) : null}
    </aside>
  );
}
