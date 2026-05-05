import { eq, sql } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { resetPasswordBodySchema } from '@shizuku/types';
import { users } from '@shizuku/db/schema';
import { httpError } from '../../lib/errors.js';
import { findUserIdByEmail, otpOutcomeToError, verifyOtp } from '../../services/auth/otp.js';
import { hashPassword } from '../../services/auth/password.js';
import { revokeAllUserRefreshTokens } from '../../services/auth/refreshTokens.js';
import { emailBodyKey } from '../../plugins/rateLimit.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const resetPasswordRoute: FastifyPluginAsyncZod = async (app) => {
  /**
   * POST /v1/auth/reset-password
   *  - body: { email, code, password }
   *  - verifies OTP, replaces password hash, BUMPS users.token_version (kills
   *    all access tokens for this user globally), revokes every refresh-token
   *    family they own.
   *  - email-keyed rate limit: 10 attempts per hour. The OTP 3-strike cap is
   *    the real protection.
   */
  app.post(
    '/reset-password',
    {
      schema: {
        body: resetPasswordBodySchema,
        tags: ['auth'],
        summary: 'Reset password with the OTP from forgot-password',
        description: [
          'Verifies the 6-digit code, swaps the argon2id hash, **bumps `users.token_version`** (kills every active access token for this user globally), and revokes every refresh-token family they own. The user must log in fresh after this.',
          '',
          '**Errors:**',
          '- 401 `otp_invalid` — wrong code OR unknown email (deliberately same response to prevent enumeration)',
          '- 401 `otp_expired` — code past 10-minute TTL',
          '- 401 `otp_max_attempts_exceeded` — 3 wrong attempts; request a new code',
          '',
          '**Rate-limit:** 10 attempts per email per hour (the OTP 3-strike cap is the real protection).',
        ].join('\n'),
      },
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 hour',
          keyGenerator: emailBodyKey,
        },
      },
    },
    async (req, reply) => {
      const userId = await findUserIdByEmail(app.db, req.body.email);
      if (!userId) {
        // Don't leak existence. Same response shape as a wrong code.
        throw httpError.unauthorized('otp_invalid', 'Invalid verification code');
      }
      const outcome = await verifyOtp(app.db, 'reset_password', userId, req.body.code);
      if (outcome.kind !== 'ok') throw otpOutcomeToError(outcome);

      const passwordHash = await hashPassword(req.body.password);
      await app.db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            passwordHash,
            tokenVersion: sql`${users.tokenVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      });
      // Revoke refresh tokens AFTER the password update commits — outside the
      // transaction so a failure here can't roll back the password change.
      await revokeAllUserRefreshTokens(app.db, userId, 'password_reset');

      reply.code(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default resetPasswordRoute;
