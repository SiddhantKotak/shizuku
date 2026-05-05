import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { z } from 'zod';
import { meQueryOptions } from '../../hooks/useMe';
import { petQueryOptions } from '../../hooks/usePet';
import { ApiError } from '../../lib/api/errors';
import { useAuthStore } from '../../stores/authStore';

/**
 * The API redirects with `?provider=…&new=0|1&error=…?` but we only consume
 * `provider` and `error` here. Schema is intentionally non-strict (no
 * `.strict()`) so the `new` flag passes through as untyped extra without
 * tripping re-validation — TanStack Router re-runs `validateSearch` on every
 * navigation, and a `.transform()` here would fail on the second pass.
 */
const callbackSearchSchema = z.object({
  provider: z.enum(['google', 'discord']).optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute('/_public/oauth/callback')({
  validateSearch: callbackSearchSchema,
  component: OAuthCallbackPage,
});

/**
 * Landing page after the API's `/v1/auth/{google,discord}/callback` redirects
 * here with the refresh-token cookie already set.
 *
 * Steps:
 *   1. Call `authStore.bootstrap()` → reads the refresh cookie via
 *      /v1/auth/refresh, mints an access token, marks the session authenticated.
 *   2. Prefetch /v1/users/me + /v1/pets/me into the TanStack Query cache.
 *   3. Smart-redirect:
 *        - has pet      → /room
 *        - no pet (404) → /onboarding
 *        - failure      → /login?error=oauth_failed
 *
 * The body is intentionally minimal — the user spends < 1 second here.
 */
function OAuthCallbackPage(): React.JSX.Element {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const ranOnce = useRef(false);
  const queryClient = Route.useRouteContext().queryClient;

  useEffect(() => {
    // React strict mode runs effects twice in dev; this guard keeps us from
    // racing two simultaneous bootstraps + navigations.
    if (ranOnce.current) return;
    ranOnce.current = true;

    void (async () => {
      if (search.error) {
        void navigate({ to: '/login', search: { error: 'oauth_failed' } as never });
        return;
      }

      try {
        await useAuthStore.getState().bootstrap();
        if (useAuthStore.getState().status !== 'authenticated') {
          throw new Error('bootstrap_failed');
        }
        const [, pet] = await Promise.all([
          queryClient.ensureQueryData(meQueryOptions()),
          queryClient.ensureQueryData(petQueryOptions()),
        ]);
        void navigate({ to: pet ? '/room' : '/onboarding' });
      } catch (e) {
        // ApiError or anything else — fall back to login with a flag.
        if (e instanceof ApiError) {
          console.warn('oauth_callback_post_redirect_failed', e.code, e.message);
        }
        void navigate({ to: '/login', search: { error: 'oauth_failed' } as never });
      }
    })();
  }, [navigate, queryClient, search.error]);

  return (
    <div className="rounded-cozy bg-surface-raised p-8 shadow-cozy text-center">
      <h1 className="font-pixel text-2xl text-ink">Signing you in…</h1>
      <p className="mt-2 text-sm text-ink/70">
        {search.provider === 'discord' ? 'Discord' : 'Google'} auth complete. Hang on.
      </p>
    </div>
  );
}
