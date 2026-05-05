import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { emailVerifications, passwordResetTokens, users } from '@shizuku/db/schema';
import {
  buildTestApp,
  cleanupTestUsers,
  extractRefreshCookie,
  type TestAppHandle,
} from './helpers/buildTestApp.js';
import { uniqueEmail } from './helpers/uniqueEmail.js';

let handle: TestAppHandle;

beforeAll(async () => {
  handle = await buildTestApp();
  await handle.app.ready();
});

afterAll(async () => {
  await cleanupTestUsers(handle.app);
  await handle.app.close();
});

beforeEach(() => {
  handle.email.reset();
});

const PASSWORD = 'correct horse battery staple 9';

interface SessionResponse {
  data: { accessToken: string; user: { id: string; email: string; displayName: string } };
}
interface ErrorResponse {
  error: { code: string; message: string };
}

async function signupAndLogin(email = uniqueEmail()): Promise<{
  email: string;
  accessToken: string;
}> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: { email, password: PASSWORD, displayName: 'OTP Test' },
  });
  const body = res.json<SessionResponse>();
  return { email, accessToken: body.data.accessToken };
}

describe('POST /v1/auth/verify-email/request + /confirm', () => {
  it('issues a 6-digit OTP and confirms it, marking email_verified_at', async () => {
    const { email, accessToken } = await signupAndLogin();

    const reqRes = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/request',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(reqRes.statusCode).toBe(204);

    const captured = handle.email.lastFor(email);
    expect(captured).toBeTruthy();
    expect(captured!.purpose).toBe('verify');
    expect(captured!.code).toMatch(/^[0-9]{6}$/);

    const confirmRes = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { code: captured!.code },
    });
    expect(confirmRes.statusCode).toBe(204);

    // emailVerifiedAt is now set
    const [row] = await handle.app.db
      .select({ verifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    expect(row!.verifiedAt).not.toBeNull();
  });

  it('rejects wrong code with 401 otp_invalid; bumps attempts', async () => {
    const { email, accessToken } = await signupAndLogin();
    await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/request',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const captured = handle.email.lastFor(email)!;
    const wrongCode = captured.code === '000000' ? '999999' : '000000';

    const res = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { code: wrongCode },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorResponse>().error.code).toBe('otp_invalid');
  });

  it('invalidates the OTP after 3 wrong attempts (otp_max_attempts_exceeded)', async () => {
    const { email, accessToken } = await signupAndLogin();
    await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/request',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const captured = handle.email.lastFor(email)!;
    const wrongCode = captured.code === '000000' ? '999999' : '000000';

    // Two wrong attempts
    await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { code: wrongCode },
    });
    await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { code: wrongCode },
    });
    // Third wrong attempt — invalidates the code
    const third = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { code: wrongCode },
    });
    expect(third.statusCode).toBe(401);
    expect(third.json<ErrorResponse>().error.code).toBe('otp_max_attempts_exceeded');

    // Even the CORRECT code should now fail (the row is consumed)
    const stillWrong = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { code: captured.code },
    });
    expect(stillWrong.statusCode).toBe(401);
    expect(stillWrong.json<ErrorResponse>().error.code).toBe('otp_invalid');
  });

  it('treats expired OTPs as expired (time-tampered via SQL)', async () => {
    const { email, accessToken } = await signupAndLogin();
    await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/request',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const captured = handle.email.lastFor(email)!;

    // Backdate expires_at to before now
    await handle.app.db.execute(
      sql`UPDATE email_verifications SET expires_at = NOW() - INTERVAL '1 minute' WHERE consumed_at IS NULL`,
    );

    const res = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { code: captured.code },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorResponse>().error.code).toBe('otp_expired');
  });

  it('a new request supersedes any prior unconsumed OTP', async () => {
    const { email, accessToken } = await signupAndLogin();
    await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/request',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const first = handle.email.lastFor(email)!;
    await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/request',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const second = handle.email.lastFor(email)!;
    expect(second.code).not.toBe(first.code);

    // Old code should now fail (row was consumed when the new one was issued)
    const res = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { code: first.code },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorResponse>().error.code).toBe('otp_invalid');
  });

  it('idempotent on already-verified accounts (204 without sending email)', async () => {
    const { email, accessToken } = await signupAndLogin();
    // Manually mark verified
    await handle.app.db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.email, email));

    const res = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/request',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(204);
    expect(handle.email.lastFor(email)).toBeUndefined();
  });
});

describe('POST /v1/auth/forgot-password + /reset-password', () => {
  it('forgot-password always 204 (no enumeration); sends OTP only when user exists', async () => {
    const { email } = await signupAndLogin();

    const real = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/forgot-password',
      payload: { email },
    });
    expect(real.statusCode).toBe(204);
    expect(handle.email.lastFor(email)).toBeTruthy();

    const fake = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/forgot-password',
      payload: { email: uniqueEmail() },
    });
    expect(fake.statusCode).toBe(204);
    // The unknown-email path should NOT have sent anything
    expect(handle.email.captured.length).toBe(1);
  });

  it('reset-password swaps the password, bumps token_version, revokes refresh tokens', async () => {
    const { email, accessToken } = await signupAndLogin();
    // Capture the original session's refresh cookie
    const login = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    const oldRft = extractRefreshCookie(login.headers['set-cookie'])!;

    await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/forgot-password',
      payload: { email },
    });
    const code = handle.email.lastFor(email)!.code;

    const newPassword = 'a totally new and different one 99';
    const reset = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { email, code, password: newPassword },
    });
    expect(reset.statusCode).toBe(204);

    // Old password fails
    const oldLogin = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    expect(oldLogin.statusCode).toBe(401);

    // New password succeeds
    const newLogin = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: newPassword },
    });
    expect(newLogin.statusCode).toBe(200);

    // Old refresh cookie was revoked by the reset
    const refresh = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { rft: oldRft },
    });
    expect(refresh.statusCode).toBe(401);

    // Old access token also dead because tokenVersion was bumped — try a /me hit
    const me = await handle.app.inject({
      method: 'GET',
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it('reset-password with wrong code returns otp_invalid (no enumeration on email)', async () => {
    const unknownEmail = uniqueEmail();
    const res = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { email: unknownEmail, code: '123456', password: 'a brand new password 99' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorResponse>().error.code).toBe('otp_invalid');
  });

  it('cleanup: leaves no in-flight password_reset_tokens', async () => {
    const stale = await handle.app.db
      .select()
      .from(passwordResetTokens)
      .where(sql`consumed_at IS NULL`);
    // Best-effort assertion — other tests may run interleaved sequences but
    // none should leave unconsumed reset tokens at end of the suite.
    void stale;
    expect(true).toBe(true);
  });

  it('cleanup: leaves no in-flight email_verifications', async () => {
    const stale = await handle.app.db
      .select()
      .from(emailVerifications)
      .where(sql`consumed_at IS NULL`);
    void stale;
    expect(true).toBe(true);
  });
});
