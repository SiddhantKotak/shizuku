import type { OtpPurpose } from './types.js';

/**
 * Plain-HTML OTP email body. Inline styles for client compatibility.
 *
 * Slice 1 keeps templates as string-based HTML to avoid the @react-email/render
 * dependency. If we want a designer-friendly authoring story later, swap the
 * body of these functions to render React Email components — call sites and
 * EmailService contract stay identical.
 */
export function renderOtpEmail(args: { code: string; purpose: OtpPurpose }): {
  subject: string;
  text: string;
  html: string;
} {
  const verb = args.purpose === 'verify' ? 'verify your email' : 'reset your password';
  const subject =
    args.purpose === 'verify'
      ? 'Your Shizuku verification code'
      : 'Your Shizuku password reset code';

  const text = [
    `Your Shizuku code is: ${args.code}`,
    '',
    `Use it within 10 minutes to ${verb}.`,
    'If you didn’t request this, you can safely ignore this email.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#faf6eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#1a1320;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#fffcf6;border-radius:14px;box-shadow:0 4px 24px -8px rgba(26,19,32,0.16);">
      <tr><td style="padding:32px 32px 16px 32px;">
        <h1 style="margin:0 0 8px 0;font-size:18px;color:#1a1320;letter-spacing:-0.01em;">Shizuku</h1>
        <p style="margin:0;color:#6b5f7a;font-size:14px;">Use this code to ${verb}.</p>
      </td></tr>
      <tr><td style="padding:8px 32px 8px 32px;text-align:center;">
        <div style="display:inline-block;padding:16px 28px;background:#f0e8da;border-radius:12px;font-family:'SF Mono',Menlo,monospace;font-size:32px;letter-spacing:0.32em;font-weight:700;color:#1a1320;">${args.code}</div>
      </td></tr>
      <tr><td style="padding:16px 32px 32px 32px;">
        <p style="margin:0;color:#6b5f7a;font-size:13px;line-height:1.5;">
          This code expires in 10 minutes and can be used 3 times before it’s invalidated.<br>
          If you didn’t request this, ignore this email — your account stays safe.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
