import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { env } from '../../env';

const loginSearchSchema = z.object({
  from: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute('/_public/login')({
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

/**
 * Placeholder login surface. The user builds the real LoginForm in Antigravity
 * (P5). Until then this page provides:
 *   - Two anchor links for Google + Discord OAuth (P4 smoke-test surface).
 *   - A visible note about post-OAuth-failure redirects so we know they fired.
 *
 * The OAuth flow is initiated via plain `<a href>` because we WANT a full
 * top-level navigation (provider redirect), not an SPA route change.
 */
function LoginPage(): React.JSX.Element {
  const search = Route.useSearch();
  return (
    <div className="w-full max-w-md rounded-cozy bg-surface-raised p-8 shadow-cozy">
      <h1 className="font-pixel text-3xl text-ink">Shizuku</h1>
      <p className="mt-2 text-sm text-ink/70">
        Login form (email/password) lands in Phase 5 — implement in Antigravity.
      </p>

      {search.error === 'oauth_failed' ? (
        <p className="mt-4 rounded-md bg-ember/10 px-3 py-2 text-xs text-ember">
          OAuth sign-in didn&rsquo;t complete. Try again, or use email/password (coming in P5).
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        <a
          href={`${env.VITE_API_URL}/v1/auth/google`}
          className="block rounded-md border border-ink/15 bg-cream px-4 py-3 text-center text-sm font-medium text-ink hover:bg-surface-overlay"
        >
          Continue with Google
        </a>
        <a
          href={`${env.VITE_API_URL}/v1/auth/discord`}
          className="block rounded-md border border-ink/15 bg-cream px-4 py-3 text-center text-sm font-medium text-ink hover:bg-surface-overlay"
        >
          Continue with Discord
        </a>
      </div>
    </div>
  );
}
