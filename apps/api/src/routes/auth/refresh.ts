import { eq } from 'drizzle-orm';
import { users } from '@shizuku/db/schema';
import { signAccessToken } from '../../services/auth/jwt.js';
import { rotateRefreshToken } from '../../services/auth/refreshTokens.js';
import {
  REFRESH_COOKIE_NAME,
  setRefreshCookie,
  clearRefreshCookie,
} from '../../services/auth/cookies.js';
import { httpError } from '../../lib/errors.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const refreshRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Rotate the refresh token + mint a new access token',
        description: [
          'Reads the `rft` cookie, rotates it (new opaque token in same family, old one marked rotated), and returns a new access token in the body.',
          '',
          '**Family-wide theft detection (RFC 6749 §10.4-style):** if the same refresh token is presented twice past the 10-second grace window, the entire token family is revoked → all sessions for that login are killed.',
          '',
          '**Errors:**',
          '- 401 `invalid_token` — missing/unknown cookie OR token previously revoked',
          '- 401 `token_expired` — refresh token past its 30-day TTL',
          '- 401 `refresh_reuse` — theft detected; family compromised + revoked',
        ].join('\n'),
      },
    },
    async (req, reply) => {
      const cookieToken = req.cookies[REFRESH_COOKIE_NAME];
      if (!cookieToken) {
        throw httpError.unauthorized('invalid_token', 'Missing refresh cookie');
      }

      let rotation;
      try {
        rotation = await rotateRefreshToken(
          app.db,
          cookieToken,
          req.headers['user-agent'] ?? undefined,
          req.ip,
        );
      } catch (e) {
        clearRefreshCookie(reply);
        throw e;
      }

      const [user] = await app.db
        .select({ tokenVersion: users.tokenVersion })
        .from(users)
        .where(eq(users.id, rotation.userId))
        .limit(1);
      if (!user) {
        clearRefreshCookie(reply);
        throw httpError.unauthorized('invalid_token', 'User no longer exists');
      }

      setRefreshCookie(reply, rotation.rawToken);
      const accessToken = await signAccessToken(rotation.userId, user.tokenVersion);
      return { data: { accessToken } };
    },
  );
};

export default refreshRoute;
