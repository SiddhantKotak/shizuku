import { eq } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { signupBodySchema } from '@shizuku/types';
import { users } from '@shizuku/db/schema';
import { hashPassword } from '../../services/auth/password.js';
import { signAccessToken } from '../../services/auth/jwt.js';
import { issueRefreshToken } from '../../services/auth/refreshTokens.js';
import { setRefreshCookie } from '../../services/auth/cookies.js';
import { httpError } from '../../lib/errors.js';
import { newId } from '../../lib/id.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const signupRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/signup',
    {
      schema: {
        body: signupBodySchema,
        tags: ['auth'],
        summary: 'Create a new email/password account',
        description: [
          'Creates a user with email + argon2id-hashed password. Returns the access token in the response body and sets the rotated refresh-token cookie (`rft`, httpOnly, SameSite=Strict, Path=/v1/auth, 30d).',
          '',
          '**Errors:**',
          '- 400 `validation_error` — request body invalid',
          '- 409 `email_taken` — that email is already registered',
          '',
          'OAuth users (sign-up via Google/Discord) bypass this route entirely — see `GET /v1/auth/google` and `GET /v1/auth/discord`.',
        ].join('\n'),
      },
    },
    async (req, reply) => {
      const { email, password, displayName } = req.body;

      // Pre-check (race-tolerant: the unique index is the source of truth).
      const [existing] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      if (existing) {
        throw httpError.conflict('email_taken', 'Email is already in use');
      }

      const passwordHash = await hashPassword(password);
      const userId = newId('usr');

      try {
        await app.db.insert(users).values({
          id: userId,
          email: email.toLowerCase(),
          passwordHash,
          displayName,
          avatarConfig: { presetId: 1, hueShift: 0, satShift: 0 },
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes('users_email_unique')) {
          throw httpError.conflict('email_taken', 'Email is already in use');
        }
        throw err;
      }

      const accessToken = await signAccessToken(userId, 0);
      const issued = await issueRefreshToken(app.db, {
        userId,
        userAgent: req.headers['user-agent'] ?? undefined,
        ip: req.ip,
      });
      setRefreshCookie(reply, issued.rawToken);

      // TODO(week-3): trigger Resend verification OTP email here.

      reply.code(StatusCodes.CREATED);
      return {
        data: {
          accessToken,
          user: { id: userId, email: email.toLowerCase(), displayName },
        },
      };
    },
  );
};

export default signupRoute;
