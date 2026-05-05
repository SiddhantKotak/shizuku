import fp from 'fastify-plugin';
import { env } from '@shizuku/config';
import { createNoopEmailService, createResendEmailService } from '../services/email/resend.js';
import type { EmailService } from '../services/email/types.js';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    email: EmailService;
  }
}

interface EmailPluginOptions {
  /** Override (tests inject a CapturingEmailService). */
  service?: EmailService;
}

/**
 * Decorates the Fastify instance with an EmailService.
 *  - Tests pass a capturing spy via opts.service.
 *  - Production with RESEND_API_KEY → real Resend client.
 *  - Dev without RESEND_API_KEY → no-op service that logs codes (so devs can
 *    copy-paste the OTP from the API logs to test the verify flow locally).
 */
export default fp<EmailPluginOptions>(async (app: FastifyInstance, opts) => {
  const service =
    opts.service ??
    (env.RESEND_API_KEY
      ? createResendEmailService({
          apiKey: env.RESEND_API_KEY,
          from: env.RESEND_FROM_EMAIL,
          log: app.log,
        })
      : createNoopEmailService(app.log));
  app.decorate('email', service);
});
