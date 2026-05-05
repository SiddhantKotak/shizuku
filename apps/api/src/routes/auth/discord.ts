import { eq } from 'drizzle-orm';
import { generateCodeVerifier, generateState } from 'arctic';
import { z } from 'zod';
import { env } from '@shizuku/config';
import { users } from '@shizuku/db/schema';
import { httpError } from '../../lib/errors.js';
import { signAccessToken } from '../../services/auth/jwt.js';
import {
  DISCORD_SCOPES,
  exchangeDiscordCode,
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

const discordRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/discord',
    {
      schema: {
        tags: ['auth'],
        summary: 'Initiate Discord OAuth (302 to Discord)',
        description: [
          'Generates state + PKCE code verifier, stores them in 10-min httpOnly cookies scoped to the callback path, then redirects to Discord with `identify email` scopes.',
          '',
          'Use as a top-level navigation, not via fetch.',
        ].join('\n'),
      },
    },
    async (_req, reply) => {
      const discord = oauthClients.discord();
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const url = discord.createAuthorizationURL(state, codeVerifier, DISCORD_SCOPES);
      setOauthFlowCookies(reply, 'discord', state, codeVerifier);
      return reply.redirect(url.toString());
    },
  );

  app.get(
    '/discord/callback',
    {
      schema: {
        querystring: callbackQuerySchema,
        tags: ['auth'],
        summary: 'Discord OAuth callback',
        description: [
          "Discord redirects here with `?code=...&state=...`. We validate state, exchange code via PKCE, fetch the user from Discord's `/users/@me` endpoint with the access token (Discord doesn't return id_tokens), upsert the user (auto-link by verified email), set the `rft` cookie, and redirect to the SPA.",
          '',
          '**Errors:** same shape as Google callback — `oauth_state_mismatch` (400), `oauth_provider_error` (400), or 302-with-error-flag back to SPA.',
        ].join('\n'),
      },
    },
    async (req, reply) => {
      const { code, state: stateFromQuery, error, error_description } = req.query;
      const { state: stateCookie, codeVerifier } = readOauthFlowCookies(req.cookies, 'discord');

      clearOauthFlowCookies(reply, 'discord');

      if (error) {
        req.log.warn({ error, description: error_description }, 'discord_oauth_provider_error');
        return reply.redirect(
          `${env.WEB_ORIGIN}/oauth/callback?provider=discord&error=provider_error`,
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
        profile = await exchangeDiscordCode(code, codeVerifier);
      } catch (e) {
        req.log.error({ err: e }, 'discord_oauth_exchange_failed');
        throw httpError.badRequest('oauth_provider_error', 'Could not exchange code with Discord');
      }

      const { userId, created } = await upsertOauthUser(app.db, 'discord', profile);

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
      void accessToken;

      const target = `${env.WEB_ORIGIN}/oauth/callback?provider=discord&new=${created ? '1' : '0'}`;
      return reply.redirect(target);
    },
  );
};

export default discordRoute;
