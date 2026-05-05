/**
 * Email service contract. Implementations:
 *  - `createResendEmailService()` — production (Resend SDK)
 *  - `createNoopEmailService(log)` — dev fallback when RESEND_API_KEY is unset.
 *    Logs the OTP at warn level so developers can copy-paste it locally.
 *  - `createCapturingEmailService()` — tests; pushes sends into an array for
 *    assertions.
 */
export type OtpPurpose = 'verify' | 'reset';

export interface SendOtpArgs {
  to: string;
  code: string;
  purpose: OtpPurpose;
}

export interface EmailService {
  sendOtp(args: SendOtpArgs): Promise<void>;
}

export interface CapturedEmail extends SendOtpArgs {
  sentAt: Date;
}

export interface CapturingEmailService extends EmailService {
  /** All sends since the spy was created. */
  readonly captured: ReadonlyArray<CapturedEmail>;
  /** Most recent send for a given recipient, or undefined. */
  lastFor(to: string): CapturedEmail | undefined;
  reset(): void;
}
