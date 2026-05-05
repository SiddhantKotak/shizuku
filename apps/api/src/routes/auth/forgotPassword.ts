import { StatusCodes } from 'http-status-codes';
import { forgotPasswordBodySchema } from '@shizuku/types';
import { findUserIdByEmail, issueOtp } from '../../services/auth/otp.js';
import { emailBodyKey } from '../../plugins/rateLimit.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const forgotPasswordRoute: FastifyPluginAsyncZod = async (app) => {
  /**
   * POST /v1/auth/forgot-password
   *  - body: { email }
   *  - ALWAYS returns 204, even when the email isn't registered. This
   *    prevents user-existence enumeration, which is one of the top OWASP
   *    auth-design rules.
   *  - When a real user matches, issues a 6-digit OTP and emails it.
   *  - Email-keyed rate limit: 3 sends per email per hour. The IP-fallback
   *    catches bots blasting random addresses.
   */
  app.post(
    '/forgot-password',
    {
      schema: {
        body: forgotPasswordBodySchema,
        tags: ['auth'],
        summary: 'Request a password-reset OTP',
        description: [
          'Sends a 6-digit OTP to the email if it belongs to a registered user. **Always** returns 204 regardless — this is intentional, prevents user-existence enumeration (top OWASP auth-design rule).',
          '',
          'Email-send failures are swallowed silently for the same reason: surfacing the error would leak whether the email exists.',
          '',
          '**Rate-limit:** 3 sends per email per hour (falls back to IP if no email body present).',
        ].join('\n'),
      },
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 hour',
          keyGenerator: emailBodyKey,
        },
      },
    },
    async (req, reply) => {
      const userId = await findUserIdByEmail(app.db, req.body.email);
      if (userId) {
        try {
          const { code } = await issueOtp(app.db, 'reset_password', userId);
          await app.email.sendOtp({ to: req.body.email, code, purpose: 'reset' });
        } catch (err) {
          // Swallow — surfacing the error would leak whether the email exists.
          req.log.error({ err, email: req.body.email }, 'forgot_password_send_failed');
        }
      }
      reply.code(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default forgotPasswordRoute;
