import { config as loadDotenv } from 'dotenv';
import { envSchema, type Env } from './schema.js';

let cached: Env | undefined;

/**
 * Parse and validate process.env once. Throws with a readable message
 * listing all missing/invalid vars on first call. Caches the result.
 *
 * Calls dotenv.config() if NODE_ENV !== 'production' to load `.env` from CWD.
 */
export function loadEnv(): Env {
  if (cached) return cached;

  if (process.env['NODE_ENV'] !== 'production') {
    loadDotenv();
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    console.error(`\n❌ Invalid environment variables:\n${issues}\n`);
    throw new Error('Environment validation failed. See errors above.');
  }

  cached = parsed.data;
  return cached;
}

/** Lazy proxy — `env.X` triggers loadEnv() on first access. */
export const env: Env = new Proxy({} as Env, {
  get(_target, key: string) {
    return loadEnv()[key as keyof Env];
  },
});

export type { Env } from './schema.js';
export { envSchema } from './schema.js';
