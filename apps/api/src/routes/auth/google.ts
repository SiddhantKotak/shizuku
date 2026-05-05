import { eq } from 'drizzle-orm';
import { generateCodeVerifier, generateState } from 'arctic';
import { z } from 'zod';
import { env } from '@shizuku/config';
import { users } from '@shizuku/db/schema';
import { httpError } from '../../lib/errors.js';
import { signAccessToken } from '../../services/auth/jwt.js';
import {
  GOOGLE_SCOPES,
  exchangeGoogleCode,
  oauthClients,
  upsertOauthUser,
} from '../../services/auth/oauth.js';
import {
  clearOauthFlowCookies,
  readOauthFlowCookies,
  setOauthFlowCookies,
} from '../../services/auth/oauthCookies.js';
import { issueRefreshToken } from '../../services/auth/refreshTokens.js';
import { setRefreshCookie } from '../../services/auth/cookies.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const googleRoute: FastifyPluginAsyncZod = async (app) => {
  /**
   * GET /v1/auth/google
   *  - Generate state + PKCE codeVerifier, store both in 10-min httpOnly cookies
   *    scoped to the callback path.
   *  - 302 to Google's consent screen.
   */
  app.get(
    '/google',
    {
      schema: {
        tags: ['auth'],
        summary: 'Initiate Google OAuth (302 to Google)',
        description: [
          "Generates a fresh state + PKCE code verifier, stores both as 10-minute httpOnly cookies scoped to `/v1/auth/google/callback` (SameSite=Lax for the redirect-back), then redirects the browser to Google's consent screen with `openid email profile` scopes.",
          '',
          'On success Google redirects to `/v1/auth/google/callback`.',
          '',
          '**Use as a top-level navigation** (`window.location = ...`), not via fetch — XHR cannot follow cross-origin redirects with cookies.',
        ].join('\n'),
      },
    },
    async (_req, reply) => {
      const google = oauthClients.google();
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const url = google.createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES);
      setOauthFlowCookies(reply, 'google', state, codeVerifier);
      return reply.redirect(url.toString());
    },
  );

  /**
   * GET /v1/auth/google/callback
   *  - Validate state matches the cookie (CSRF defense).
   *  - Exchange code with codeVerifier (PKCE) → id_token → profile.
   *  - Upsert user + oauth_account.
   *  - Mint session pair, set refresh cookie.
   *  - 302 to the SPA's /oauth/callback?provider=google&new=0|1, where the
   *    SPA bootstraps via /auth/refresh and smart-detects /room vs /onboarding.
   */
  app.get(
    '/google/callback',
    {
      schema: {
        querystring: callbackQuerySchema,
        tags: ['auth'],
        summary: 'Google OAuth callback',
        description: [
          'Google redirects here with `?code=...&state=...` after the user consents. We validate the state against the cookie (CSRF defense), exchange the code for tokens via PKCE, decode the id_token to extract the user profile, then upsert the user (auto-link by verified email if a matching email already exists), set the rotated `rft` cookie, and redirect the browser to the SPA at `${WEB_ORIGIN}/oauth/callback?provider=google&new=0|1` where it bootstraps a session via `/v1/auth/refresh` and smart-detects /room vs /onboarding.',
          '',
          '**Errors:**',
          '- 400 `oauth_state_mismatch` — missing cookies OR state in query ≠ state in cookie',
          '- 400 `oauth_provider_error` — Google rejected the code or the id_token was malformed',
          '- Provider-side errors (user denied, etc.) → 302 to SPA `/oauth/callback?error=provider_error`',
        ].join('\n'),
      },
    },
    async (req, reply) => {
      const { code, state: stateFromQuery, error, error_description } = req.query;
      const { state: stateCookie, codeVerifier } = readOauthFlowCookies(req.cookies, 'google');

      // Always clear the flow cookies — even on failure they're single-use.
      clearOauthFlowCookies(reply, 'google');

      if (error) {
        req.log.warn({ error, description: error_description }, 'google_oauth_provider_error');
        return reply.redirect(
          `${env.WEB_ORIGIN}/oauth/callback?provider=google&error=provider_error`,
        );
      }

      if (!code || !stateFromQuery || !stateCookie || !codeVerifier) {
        throw httpError.badRequest('oauth_state_mismatch', 'Missing OAuth state');
      }
      if (stateFromQuery !== stateCookie) {
        throw httpError.badRequest('oauth_state_mismatch', 'OAuth state mismatch');
      }

      let profile;
      try {
        profile = await exchangeGoogleCode(code, codeVerifier);
      } catch (e) {
        req.log.error({ err: e }, 'google_oauth_exchange_failed');
        throw httpError.badRequest('oauth_provider_error', 'Could not exchange code with Google');
      }

      const { userId, created } = await upsertOauthUser(app.db, 'google', profile);

      // Mint a session: read tokenVersion (always 0 for fresh users; could be
      // bumped later via password reset, so we read every time).
      const [user] = await app.db
        .select({ tokenVersion: users.tokenVersion })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) throw httpError.notFound();

      const accessToken = await signAccessToken(userId, user.tokenVersion);
      const issued = await issueRefreshToken(app.db, {
        userId,
        userAgent: req.headers['user-agent'] ?? undefined,
        ip: req.ip,
      });
      setRefreshCookie(reply, issued.rawToken);

      // Surface accessToken to the SPA via short-lived URL fragment? No — too leaky.
      // The SPA picks up the access token by calling /v1/auth/refresh on land,
      // which reads the refresh cookie we just set.
      void accessToken;

      const target = `${env.WEB_ORIGIN}/oauth/callback?provider=google&new=${created ? '1' : '0'}`;
      return reply.redirect(target);
    },
  );
};

export default googleRoute;
