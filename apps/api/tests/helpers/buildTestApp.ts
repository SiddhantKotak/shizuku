import { buildApp } from '../../src/app.js';
import { sql } from 'drizzle-orm';
import { like } from 'drizzle-orm';
import { users } from '@shizuku/db/schema';
import { createCapturingEmailService } from '../../src/services/email/resend.js';
import type { CapturingEmailService } from '../../src/services/email/types.js';
import { TEST_EMAIL_DOMAIN } from './uniqueEmail.js';
import type { FastifyInstance } from 'fastify';

export interface TestAppHandle {
  app: FastifyInstance;
  email: CapturingEmailService;
}

/**
 * Build a Fastify instance for tests:
 *  - silent Pino logger
 *  - capturing email spy (tests read OTPs via `handle.email.lastFor(to)`)
 */
export async function buildTestApp(): Promise<TestAppHandle> {
  const email = createCapturingEmailService();
  const app = await buildApp({ logger: false, email, rateLimit: false });
  return { app, email };
}

/**
 * Remove every test user (and cascading rows) created in this run. The unique
 * `@shizuku.test` domain ensures we never touch real data.
 */
export async function cleanupTestUsers(app: FastifyInstance): Promise<void> {
  await app.db.delete(users).where(like(users.email, `%${TEST_EMAIL_DOMAIN}`));
}

/** Read the rft cookie value from a Set-Cookie header string array. */
export function extractRefreshCookie(
  setCookieHeaders: string[] | string | undefined,
): string | null {
  if (!setCookieHeaders) return null;
  const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const c of arr) {
    const m = c.match(/^rft=([^;]+)/);
    if (m && m[1]) {
      return m[1] === '' ? '' : decodeURIComponent(m[1]);
    }
  }
  return null;
}

/** Returns true if any Set-Cookie header clears the rft cookie. */
export function refreshCookieCleared(setCookieHeaders: string[] | string | undefined): boolean {
  if (!setCookieHeaders) return false;
  const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return arr.some(
    (c) => /^rft=;/.test(c) || /Max-Age=0/i.test(c) || /Expires=Thu, 01 Jan 1970/i.test(c),
  );
}

// Re-export so tests can use it without importing drizzle-orm directly
export { sql };
