import { StatusCodes } from 'http-status-codes';
import { revokeRefreshToken } from '../../services/auth/refreshTokens.js';
import { REFRESH_COOKIE_NAME, clearRefreshCookie } from '../../services/auth/cookies.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const logoutRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'End the current session',
        description: [
          'Revokes the current refresh token and clears the `rft` cookie. Idempotent — returns 204 even if no cookie is present.',
          '',
          'Does NOT revoke other token families the user might own (e.g. a session on another device). For full account-wide logout, use the password-reset flow which bumps `tokenVersion` and revokes every family.',
        ].join('\n'),
      },
    },
    async (req, reply) => {
      const cookieToken = req.cookies[REFRESH_COOKIE_NAME];
      if (cookieToken) {
        try {
          await revokeRefreshToken(app.db, cookieToken);
        } catch (err) {
          req.log.warn({ err }, 'logout_revoke_failed');
        }
      }
      clearRefreshCookie(reply);
      reply.code(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default logoutRoute;
