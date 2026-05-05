import { Resend } from 'resend';
import { renderOtpEmail } from './templates.js';
import type { CapturedEmail, CapturingEmailService, EmailService, SendOtpArgs } from './types.js';

interface MinimalLogger {
  warn: (obj: object, msg: string) => void;
  info: (obj: object, msg: string) => void;
}

/**
 * Production email service backed by Resend.
 *
 * Sends fail loudly (throw) so the caller (e.g. an OTP-request route) can
 * decide whether to surface the error or swallow it (forgot-password swallows
 * to prevent email-existence enumeration).
 */
export function createResendEmailService(args: {
  apiKey: string;
  from: string;
  log: MinimalLogger;
}): EmailService {
  const client = new Resend(args.apiKey);
  return {
    async sendOtp(send: SendOtpArgs): Promise<void> {
      const { subject, text, html } = renderOtpEmail({ code: send.code, purpose: send.purpose });
      const result = await client.emails.send({
        from: args.from,
        to: send.to,
        subject,
        text,
        html,
      });
      if (result.error) {
        // Resend returns errors inline rather than throwing; rethrow as Error.
        throw new Error(`resend_send_failed: ${result.error.name} ${result.error.message}`);
      }
      args.log.info({ to: send.to, purpose: send.purpose, id: result.data?.id }, 'email_sent');
    },
  };
}

/**
 * Dev fallback when RESEND_API_KEY isn't set. Logs the code so the developer
 * can grab it from the terminal output. NEVER chosen in production.
 */
export function createNoopEmailService(log: MinimalLogger): EmailService {
  return {
    async sendOtp({ to, code, purpose }: SendOtpArgs): Promise<void> {
      log.warn(
        { to, code, purpose },
        'email_skipped_no_resend_key (dev fallback — code printed for local testing)',
      );
    },
  };
}

/** Test spy that records every send. */
export function createCapturingEmailService(): CapturingEmailService {
  const captured: CapturedEmail[] = [];
  return {
    captured,
    async sendOtp(send: SendOtpArgs): Promise<void> {
      captured.push({ ...send, sentAt: new Date() });
    },
    lastFor(to) {
      for (let i = captured.length - 1; i >= 0; i--) {
        if (captured[i]?.to === to) return captured[i];
      }
      return undefined;
    },
    reset() {
      captured.length = 0;
    },
  };
}
