import { env } from '../../env';

export interface OAuthButtonsProps {
  /** Optional copy override (e.g. "Sign up with…" vs "Continue with…"). */
  label?: string;
}

/**
 * Google + Discord OAuth buttons. Plain anchor tags — we WANT a top-level
 * navigation, not an SPA route change (the redirect goes to the provider).
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "P5 ·
 * OAuthButtons" for the spec (provider-branded SVG icons, brand colors,
 * dividers, focus ring, mobile-friendly tap target).
 */
export function OAuthButtons(props: OAuthButtonsProps): React.JSX.Element {
  const label = props.label ?? 'Continue with';
  return (
    <div data-todo-antigravity="auth-oauth-buttons" className="flex flex-col gap-2">
      <a
        href={`${env.VITE_API_URL}/v1/auth/google`}
        className="block rounded-cozy border bg-cream px-4 py-3 text-center text-sm"
      >
        {label} Google
      </a>
      <a
        href={`${env.VITE_API_URL}/v1/auth/discord`}
        className="block rounded-cozy border bg-cream px-4 py-3 text-center text-sm"
      >
        {label} Discord
      </a>
    </div>
  );
}
