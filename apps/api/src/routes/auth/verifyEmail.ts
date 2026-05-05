import { eq } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { users } from '@shizuku/db/schema';
import { verifyEmailConfirmBodySchema } from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import { issueOtp, otpOutcomeToError, verifyOtp } from '../../services/auth/otp.js';
import { userOrIpKey } from '../../plugins/rateLimit.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const verifyEmailRoute: FastifyPluginAsyncZod = async (app) => {
  /**
   * POST /v1/auth/verify-email/request
   *  - authed
   *  - issues a fresh 6-digit OTP, supersedes any prior unconsumed code
   *  - sends email; returns 204 (no body, never leaks the code)
   *  - rate-limited per user: 3 codes per 10 minutes
   */
  app.post(
    '/verify-email/request',
    {
      preHandler: [app.verifyJWT],
      schema: {
        tags: ['auth'],
        summary: 'Request a 6-digit email verification code',
        description: [
          "Issues a fresh 6-digit OTP, sends it to the authenticated user's email via Resend, and supersedes any prior unconsumed code for this user.",
          '',
          'Returns 204 — never echoes the code in the response body. Idempotent on already-verified accounts (returns 204 without sending email).',
          '',
          '**Rate-limit:** 3 codes per user per 10 minutes.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '10 minutes',
          keyGenerator: userOrIpKey,
        },
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;
      const [user] = await app.db
        .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) throw httpError.notFound();
      if (user.emailVerifiedAt) {
        // No-op idempotent success — don't burn an email if already verified.
        reply.code(StatusCodes.NO_CONTENT).send();
        return;
      }

      const { code } = await issueOtp(app.db, 'verify_email', userId);
      try {
        await app.email.sendOtp({ to: user.email, code, purpose: 'verify' });
      } catch (err) {
        req.log.error({ err }, 'verify_email_send_failed');
        throw httpError.rateLimited(
          'service_unavailable',
          'Could not send verification email. Try again shortly.',
        );
      }
      reply.code(StatusCodes.NO_CONTENT).send();
    },
  );

  /**
   * POST /v1/auth/verify-email/confirm
   *  - authed
   *  - body: { code }
   *  - verifies OTP, marks users.emailVerifiedAt
   *  - 401 with otp_invalid | otp_expired | otp_max_attempts_exceeded on failure
   *  - rate-limited per user: 10 attempts/min (the OTP service's 3-strike rule
   *    is the real protection; this just discourages bot loops)
   */
  app.post(
    '/verify-email/confirm',
    {
      preHandler: [app.verifyJWT],
      schema: {
        body: verifyEmailConfirmBodySchema,
        tags: ['auth'],
        summary: 'Confirm a 6-digit email verification code',
        description: [
          'Verifies the OTP and marks `users.email_verified_at` if correct.',
          '',
          '**Errors:**',
          '- 401 `otp_invalid` — wrong code (attempts counter incremented)',
          '- 401 `otp_expired` — code past its 10-minute TTL',
          '- 401 `otp_max_attempts_exceeded` — 3 wrong attempts → code auto-invalidated; user must request a new one',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: userOrIpKey,
        },
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;
      const outcome = await verifyOtp(app.db, 'verify_email', userId, req.body.code);
      if (outcome.kind !== 'ok') {
        throw otpOutcomeToError(outcome);
      }
      await app.db
        .update(users)
        .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, userId));
      reply.code(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default verifyEmailRoute;
