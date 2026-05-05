import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { refreshTokens } from '@shizuku/db/schema';
import { sha256Hex } from '../src/services/auth/password.js';
import {
  buildTestApp,
  cleanupTestUsers,
  extractRefreshCookie,
  refreshCookieCleared,
} from './helpers/buildTestApp.js';
import { uniqueEmail } from './helpers/uniqueEmail.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await buildTestApp());
  await app.ready();
});

afterAll(async () => {
  if (app) {
    await cleanupTestUsers(app);
    await app.close();
  }
});

const PASSWORD = 'correct horse battery staple 9';

interface SessionResponse {
  data: { accessToken: string; user: { id: string; email: string; displayName: string } };
}

interface ErrorResponse {
  error: { code: string; message: string; details?: unknown };
}

describe('POST /v1/auth/signup', () => {
  it('creates a user, returns access token, sets httpOnly refresh cookie', async () => {
    const email = uniqueEmail();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { email, password: PASSWORD, displayName: 'Test User' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<SessionResponse>();
    expect(body.data.accessToken).toMatch(/^eyJ/); // JWT prefix
    expect(body.data.user.email).toBe(email);
    expect(body.data.user.displayName).toBe('Test User');
    expect(body.data.user.id).toMatch(/^usr_/);

    const setCookie = res.headers['set-cookie'];
    const rft = extractRefreshCookie(setCookie);
    expect(rft).toBeTruthy();
    expect(rft!.length).toBeGreaterThan(40); // base64url of 48 bytes ≈ 64 chars

    // Must be httpOnly + (Secure in prod; localhost is non-Secure in dev) + SameSite=Strict
    const setCookieStr = Array.isArray(setCookie) ? setCookie.join('\n') : (setCookie ?? '');
    expect(setCookieStr).toMatch(/HttpOnly/i);
    expect(setCookieStr).toMatch(/SameSite=Strict/i);
    expect(setCookieStr).toMatch(/Path=\/v1\/auth/);
  });

  it('rejects duplicate email with 409 email_taken', async () => {
    const email = uniqueEmail();
    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { email, password: PASSWORD, displayName: 'First' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { email, password: PASSWORD, displayName: 'Second' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json<ErrorResponse>().error.code).toBe('email_taken');
  });

  it('validates body — short password yields 400 validation_error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { email: uniqueEmail(), password: 'short', displayName: 'Foo' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /v1/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const email = uniqueEmail();
    await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { email, password: PASSWORD, displayName: 'L' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<SessionResponse>().data.accessToken).toMatch(/^eyJ/);
    expect(extractRefreshCookie(res.headers['set-cookie'])).toBeTruthy();
  });

  it('rejects wrong password with 401 invalid_credentials', async () => {
    const email = uniqueEmail();
    await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { email, password: PASSWORD, displayName: 'L' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'wrong-password-here' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorResponse>().error.code).toBe('invalid_credentials');
  });

  it('rejects unknown email with 401 invalid_credentials (no user enumeration)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: uniqueEmail(), password: PASSWORD },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorResponse>().error.code).toBe('invalid_credentials');
  });
});

describe('POST /v1/auth/refresh — rotation + grace + theft detection', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const email = uniqueEmail();
    const signup = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { email, password: PASSWORD, displayName: 'R' },
    });
    const oldRft = extractRefreshCookie(signup.headers['set-cookie'])!;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { rft: oldRft },
    });
    expect(res.statusCode).toBe(200);
    const newRft = extractRefreshCookie(res.headers['set-cookie'])!;
    expect(newRft).toBeTruthy();
    expect(newRft).not.toBe(oldRft);
    expect(res.json<{ data: { accessToken: string } }>().data.accessToken).toMatch(/^eyJ/);
  });

  it('grace window: replaying old token within 10s succeeds (network retry tolerance)', async () => {
    const email = uniqueEmail();
    const signup = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { email, password: PASSWORD, displayName: 'G' },
    });
    const oldRft = extractRefreshCookie(signup.headers['set-cookie'])!;

    // First refresh — succeeds, rotates oldRft
    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { rft: oldRft },
    });
    expect(first.statusCode).toBe(200);

    // Replay oldRft IMMEDIATELY — within 10s grace window, should also succeed
    const replay = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { rft: oldRft },
    });
    expect(replay.statusCode).toBe(200);
  });

  it('theft detection: replaying old token AFTER grace window kills the family', async () => {
    const email = uniqueEmail();
    const signup = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { email, password: PASSWORD, displayName: 'T' },
    });
    const oldRft = extractRefreshCookie(signup.headers['set-cookie'])!;

    // Rotate normally
    const rotated = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { rft: oldRft },
    });
    const newRft = extractRefreshCookie(rotated.headers['set-cookie'])!;
    expect(rotated.statusCode).toBe(200);

    // Time-tamper: backdate the old row's rotated_at by 11 seconds.
    // This avoids fake timers (which can confuse postgres-js connection pool)
    // while exactly reproducing the "11s have passed" condition.
    const oldHash = sha256Hex(oldRft);
    await app.db.execute(sql`
      UPDATE refresh_tokens
      SET rotated_at = NOW() - INTERVAL '11 seconds'
      WHERE token_hash = ${oldHash}
    `);

    // Replay old token → must trigger theft detection
    const reuse = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { rft: oldRft },
    });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json<ErrorResponse>().error.code).toBe('refresh_reuse');

    // Critical: legitimate successor token must ALSO be revoked (entire family)
    const legitimate = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { rft: newRft },
    });
    expect(legitimate.statusCode).toBe(401);
    expect(legitimate.json<ErrorResponse>().error.code).toBe('invalid_token');

    // Verify DB state — both rows revoked with family_compromised reason
    const rows = await app.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, oldHash));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revokedAt).not.toBeNull();
    expect(rows[0]?.revokedReason).toBe('family_compromised');
  });

  it('rejects requests without a refresh cookie with 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/auth/refresh' });
    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorResponse>().error.code).toBe('invalid_token');
  });

  it('rejects unknown refresh tokens with 401 + clears the cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { rft: 'not-a-real-token-xxxxxxxxxxxx' },
    });
    expect(res.statusCode).toBe(401);
    expect(refreshCookieCleared(res.headers['set-cookie'])).toBe(true);
  });
});

describe('POST /v1/auth/logout', () => {
  it('revokes the current refresh token, clears the cookie, blocks subsequent refreshes', async () => {
    const email = uniqueEmail();
    const signup = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { email, password: PASSWORD, displayName: 'O' },
    });
    const rft = extractRefreshCookie(signup.headers['set-cookie'])!;

    const logout = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      cookies: { rft },
    });
    expect(logout.statusCode).toBe(204);
    expect(refreshCookieCleared(logout.headers['set-cookie'])).toBe(true);

    const post = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { rft },
    });
    expect(post.statusCode).toBe(401);
    expect(post.json<ErrorResponse>().error.code).toBe('invalid_token');
  });

  it('returns 204 even with no cookie present (idempotent)', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/auth/logout' });
    expect(res.statusCode).toBe(204);
  });
});

describe('GET /v1/healthz + /v1/readyz', () => {
  it('healthz returns 200 with status:ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { status: string } }>().data.status).toBe('ok');
  });

  it('readyz returns 200 (DB reachable)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { status: string } }>().data.status).toBe('ready');
  });
});
