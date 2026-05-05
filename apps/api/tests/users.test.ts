import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@shizuku/db/schema';
import { buildTestApp, cleanupTestUsers, type TestAppHandle } from './helpers/buildTestApp.js';
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

const PASSWORD = 'correct horse battery staple 9';

interface SessionResponse {
  data: { accessToken: string; user: { id: string; email: string; displayName: string } };
}

async function signup(): Promise<{ email: string; accessToken: string; userId: string }> {
  const email = uniqueEmail();
  const res = await handle.app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: { email, password: PASSWORD, displayName: 'Users Test' },
  });
  const body = res.json<SessionResponse>();
  return { email, accessToken: body.data.accessToken, userId: body.data.user.id };
}

describe('GET /v1/users/me', () => {
  it('returns the authed user', async () => {
    const { email, accessToken, userId } = await signup();
    const res = await handle.app.inject({
      method: 'GET',
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { id: string; email: string; level: number; ink: number } }>();
    expect(body.data.id).toBe(userId);
    expect(body.data.email).toBe(email);
    expect(body.data.level).toBe(1);
    expect(body.data.ink).toBe(0);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/v1/users/me' });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /v1/users/me', () => {
  it('updates displayName', async () => {
    const { accessToken } = await signup();
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { displayName: 'New Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { displayName: string } }>().data.displayName).toBe('New Name');
  });

  it('rejects extra fields (Zod strict)', async () => {
    const { accessToken } = await signup();
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { displayName: 'OK', isAdmin: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /v1/users/me/avatar', () => {
  it('updates avatarConfig', async () => {
    const { accessToken } = await signup();
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/v1/users/me/avatar',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { presetId: 3, hueShift: 120, satShift: -10 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { presetId: number; hueShift: number } }>().data).toEqual({
      presetId: 3,
      hueShift: 120,
      satShift: -10,
    });
  });

  it('rejects out-of-range presetId', async () => {
    const { accessToken } = await signup();
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/v1/users/me/avatar',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { presetId: 99, hueShift: 0, satShift: 0 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /v1/users/me', () => {
  it('requires the password and cascades the user row away', async () => {
    const { email, accessToken, userId } = await signup();

    // Wrong password rejected
    const wrong = await handle.app.inject({
      method: 'DELETE',
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { password: 'wrong-password' },
    });
    expect(wrong.statusCode).toBe(401);

    // Correct password deletes
    const ok = await handle.app.inject({
      method: 'DELETE',
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { password: PASSWORD },
    });
    expect(ok.statusCode).toBe(204);

    const [row] = await handle.app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    expect(row).toBeUndefined();

    // Subsequent /me with the now-orphaned access token is 401 (user gone)
    const me = await handle.app.inject({
      method: 'GET',
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(401);
    void userId;
  });
});
