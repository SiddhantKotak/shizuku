import { eq } from 'drizzle-orm';
import { loginBodySchema } from '@shizuku/types';
import { users } from '@shizuku/db/schema';
import { verifyPassword } from '../../services/auth/password.js';
import { signAccessToken } from '../../services/auth/jwt.js';
import { issueRefreshToken } from '../../services/auth/refreshTokens.js';
import { setRefreshCookie } from '../../services/auth/cookies.js';
import { httpError } from '../../lib/errors.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const loginRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/login',
    {
      schema: {
        body: loginBodySchema,
        tags: ['auth'],
        summary: 'Email + password login',
        description: [
          'Verifies the password against the argon2id hash. On success, returns access token + sets the rotated `rft` cookie.',
          '',
          '**Errors** (always 401 `invalid_credentials` — never reveals whether the email exists):',
          '- wrong password',
          '- unknown email',
          '- account is OAuth-only (no password set)',
          '',
          '**Rate-limit:** 5 attempts per (IP+email) per 15 minutes (registered globally; per-route override pending in P16).',
        ].join('\n'),
      },
    },
    async (req, reply) => {
      const { email, password } = req.body;

      const [user] = await app.db
        .select({
          id: users.id,
          email: users.email,
          passwordHash: users.passwordHash,
          displayName: users.displayName,
          tokenVersion: users.tokenVersion,
        })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!user || !user.passwordHash) {
        throw httpError.unauthorized('invalid_credentials', 'Invalid email or password');
      }
      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) {
        throw httpError.unauthorized('invalid_credentials', 'Invalid email or password');
      }

      const accessToken = await signAccessToken(user.id, user.tokenVersion);
      const issued = await issueRefreshToken(app.db, {
        userId: user.id,
        userAgent: req.headers['user-agent'] ?? undefined,
        ip: req.ip,
      });
      setRefreshCookie(reply, issued.rawToken);

      return {
        data: {
          accessToken,
          user: { id: user.id, email: user.email, displayName: user.displayName },
        },
      };
    },
  );
};

export default loginRoute;
