/**
 * Pino redact paths — anything that could plausibly contain a secret or PII.
 *
 * Pino's redact wildcards: `*.foo` matches any one-level-down `.foo`; `*.*.foo`
 * matches two levels. We list both bare paths and `*.X` so accidental nesting
 * (e.g. `{ context: { password: ... } }`) still gets caught.
 *
 * The `code` redaction below is intentional: an OTP could leak if someone logs
 * `{ body }` from a verify-email route. Six-digit numeric codes look harmless
 * but are the auth secret for the verification flow.
 */
export const LOG_REDACT_PATHS: string[] = [
  // Request headers — cookies + bearer tokens
  'req.headers.cookie',
  'req.headers.authorization',
  'request.headers.cookie',
  'request.headers.authorization',
  'headers.cookie',
  'headers.authorization',
  // Response headers — set-cookie carries the rft
  'res.headers["set-cookie"]',
  'response.headers["set-cookie"]',

  // Top-level common secret/PII fields (and 1-2 levels deep via wildcards)
  'password',
  '*.password',
  '*.*.password',
  'passwordHash',
  '*.passwordHash',
  'password_hash',
  '*.password_hash',

  // Refresh-token primitives
  'rawToken',
  '*.rawToken',
  'tokenHash',
  '*.tokenHash',
  'token_hash',
  '*.token_hash',

  // OTP codes — narrowly target the request-body field where the raw 6-digit
  // OTP arrives. Do NOT use the bare `code` / `*.code` patterns: those would
  // also clobber error envelopes like `{ error: { code: 'not_found' } }` and
  // log lines like `{ code: 'invalid_token' }` which are non-secret enums and
  // are essential for debugging.
  'req.body.code',
  'request.body.code',
  'body.code',
  'otp',
  '*.otp',

  // Env-var-like secrets if anything ever logs the env object
  'JWT_SECRET',
  'JWT_REFRESH_COOKIE_SECRET',
  'OPENAI_API_KEY',
  'RESEND_API_KEY',
  'R2_SECRET_ACCESS_KEY',
  'R2_ACCESS_KEY_ID',
  'GOOGLE_CLIENT_SECRET',
  'DISCORD_CLIENT_SECRET',
  'STRIPE_SECRET_KEY',
  'DATABASE_URL', // contains the password
  'DATABASE_DIRECT_URL',
];

export const LOG_REDACT_CENSOR = '[REDACTED]';
