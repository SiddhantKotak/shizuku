import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const url = z.string().url();
const nonEmpty = z.string().min(1);

export const envSchema = z.object({
  // Shared
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  DATABASE_URL: nonEmpty,
  DATABASE_DIRECT_URL: z.string().optional(),

  /**
   * Optional comma-separated list of DNS servers used ONLY to resolve the DB
   * hostname. When set, the DB client also forces IPv4 (Node "happy eyeballs"
   * can hang when AAAA records resolve but IPv6 routing is broken).
   *
   * Leave UNSET in production — the system resolver is correct there.
   *
   * Set in local dev (.env) when:
   *   - systemd-resolved REFUSEs the AWS/Neon hostname
   *   - WSL2's resolv.conf doesn't recurse to public NS
   *   - Corporate DNS blocks AWS edge zones
   *
   * Example: DB_DNS_SERVERS=1.1.1.1,8.8.8.8
   */
  DB_DNS_SERVERS: z.string().optional(),

  // Auth
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_COOKIE_SECRET: z.string().min(32),
  COOKIE_DOMAIN: z.string().optional(),

  // OAuth — Google
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: url.optional(),

  // OAuth — Discord
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_REDIRECT_URI: url.optional(),

  // OpenAI
  OPENAI_API_KEY: z.string().startsWith('sk-').optional(),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  // Cloudflare R2
  R2_ENDPOINT: url.optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default('shizuku-dev'),

  // Email
  RESEND_API_KEY: z.string().startsWith('re_').optional(),
  RESEND_FROM_EMAIL: z.string().default('Shizuku <hello@example.com>'),
  RESEND_WEBHOOK_SECRET: z.string().optional(),

  // Sentry
  SENTRY_DSN: z.string().optional(),

  // API service
  API_PORT: port.default(3001),
  WEB_ORIGIN: url.default('http://localhost:5173'),

  // Cost guardrails (overridable for testing)
  COST_LIMIT_CHATS_PER_DAY: z.coerce.number().int().positive().default(100),
  COST_LIMIT_PDFS_PER_USER: z.coerce.number().int().positive().default(5),
  COST_LIMIT_PDF_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024),
});

export type Env = z.infer<typeof envSchema>;
