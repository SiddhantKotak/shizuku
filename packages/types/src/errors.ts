/**
 * Canonical error codes. Server emits these in error envelopes; client
 * switches on them for UX (form-level errors vs toast vs disabled-state).
 */
export const API_ERROR_CODES = {
  // Validation
  VALIDATION_ERROR: 'validation_error',

  // Auth
  INVALID_CREDENTIALS: 'invalid_credentials',
  EMAIL_TAKEN: 'email_taken',
  INVALID_TOKEN: 'invalid_token',
  TOKEN_EXPIRED: 'token_expired',
  REFRESH_REUSE: 'refresh_reuse',
  OAUTH_STATE_MISMATCH: 'oauth_state_mismatch',
  OAUTH_PROVIDER_ERROR: 'oauth_provider_error',
  EMAIL_NOT_VERIFIED: 'email_not_verified',

  // Authorization
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',

  // Cost / rate limits
  COST_LIMIT_EXCEEDED: 'cost_limit_exceeded',
  RATE_LIMITED: 'rate_limited',

  // Documents
  PDF_ONLY: 'pdf_only',
  PDF_TOO_LARGE: 'pdf_too_large',
  INDEX_PENDING: 'index_pending',
  INDEX_FAILED: 'index_failed',

  // Pets
  PET_ALREADY_ACTIVE: 'pet_already_active',
  PET_NOT_EVOLVABLE: 'pet_not_evolvable',

  // OTP (verify email + password reset)
  OTP_INVALID: 'otp_invalid',
  OTP_EXPIRED: 'otp_expired',
  OTP_MAX_ATTEMPTS_EXCEEDED: 'otp_max_attempts_exceeded',

  // Server
  INTERNAL: 'internal',
  SERVICE_UNAVAILABLE: 'service_unavailable',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export interface CostLimitDetails {
  kind: 'chat_daily' | 'pdf_total';
  limit: number;
  used: number;
  resetAt?: string;
}
