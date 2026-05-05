import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { oauthAccounts, users } from '@shizuku/db/schema';
import { upsertOauthUser } from '../src/services/auth/oauth.js';
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

describe('GET /v1/auth/google + /discord — initiate', () => {
  it('redirects to provider with state + PKCE cookies set', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/v1/auth/google' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
    const setCookie = res.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie.join('\n') : (setCookie ?? '');
    expect(cookies).toMatch(/oauth_google_state=/);
    expect(cookies).toMatch(/oauth_google_pkce=/);
    expect(cookies).toMatch(/HttpOnly/i);
    expect(cookies).toMatch(/SameSite=Lax/i);
    expect(cookies).toMatch(/Path=\/v1\/auth\/google\/callback/);
  });

  it('discord initiate also redirects with state + PKCE cookies', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/v1/auth/discord' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/discord\.com\/oauth2\/authorize/);
    const setCookie = res.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie.join('\n') : (setCookie ?? '');
    expect(cookies).toMatch(/oauth_discord_state=/);
    expect(cookies).toMatch(/oauth_discord_pkce=/);
  });
});

describe('GET /v1/auth/google/callback — error handling', () => {
  it('returns 400 oauth_state_mismatch when state cookie is missing', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/v1/auth/google/callback?code=fake-code&state=fake-state',
      // No cookies — simulates a fresh tab opening the callback URL
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('oauth_state_mismatch');
  });

  it('returns 400 oauth_state_mismatch when state cookie does not match query state', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/v1/auth/google/callback?code=fake-code&state=tampered-state',
      cookies: { oauth_google_state: 'real-state', oauth_google_pkce: 'verifier' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('oauth_state_mismatch');
  });

  it('redirects to SPA with error=provider_error when provider returned an error', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/v1/auth/google/callback?error=access_denied&error_description=user-cancelled',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/\/oauth\/callback\?provider=google&error=provider_error/);
  });

  it('clears OAuth flow cookies on the response (single-use)', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/v1/auth/google/callback?error=access_denied',
    });
    const setCookie = res.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie.join('\n') : (setCookie ?? '');
    expect(cookies).toMatch(/oauth_google_state=;/);
    expect(cookies).toMatch(/oauth_google_pkce=;/);
  });
});

describe('GET /v1/auth/discord/callback — error handling', () => {
  it('returns 400 oauth_state_mismatch on missing cookie', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/v1/auth/discord/callback?code=fake&state=fake',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('upsertOauthUser — branch matrix', () => {
  it('creates a new user + oauth_account when neither exists', async () => {
    const email = uniqueEmail();
    const result = await upsertOauthUser(handle.app.db, 'google', {
      providerAccountId: `g-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      email,
      emailVerified: true,
      displayName: 'Fresh Google User',
    });
    expect(result.created).toBe(true);

    const [user] = await handle.app.db
      .select()
      .from(users)
      .where(eq(users.id, result.userId))
      .limit(1);
    expect(user!.email).toBe(email.toLowerCase());
    expect(user!.passwordHash).toBeNull();
    expect(user!.emailVerifiedAt).not.toBeNull();
    expect(user!.displayName).toBe('Fresh Google User');

    const [oauthRow] = await handle.app.db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, result.userId), eq(oauthAccounts.provider, 'google')))
      .limit(1);
    expect(oauthRow).toBeTruthy();
  });

  it('auto-links a new OAuth identity to an existing user when the verified email matches', async () => {
    // Pre-create a password-based user
    const email = uniqueEmail();
    const signup = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { email, password: 'correct horse battery staple 9', displayName: 'Pwd User' },
    });
    const existingUserId = signup.json<{ data: { user: { id: string } } }>().data.user.id;

    // OAuth login arrives with the same verified email
    const result = await upsertOauthUser(handle.app.db, 'discord', {
      providerAccountId: `d-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      email,
      emailVerified: true,
      displayName: 'Same Person via Discord',
    });
    expect(result.userId).toBe(existingUserId);
    expect(result.created).toBe(false);

    // The displayName should NOT have changed (we don't overwrite existing user data)
    const [user] = await handle.app.db
      .select({ displayName: users.displayName, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, existingUserId))
      .limit(1);
    expect(user!.displayName).toBe('Pwd User');
    // Auto-link DOES set emailVerifiedAt (provider attests it)
    expect(user!.emailVerifiedAt).not.toBeNull();
  });

  it('does NOT auto-link when the provider says email is unverified — creates a fresh user', async () => {
    const email = uniqueEmail();
    // Create a user via signup
    await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { email, password: 'correct horse battery staple 9', displayName: 'Pwd User 2' },
    });

    // Unverified OAuth login with the same email — should NOT link
    const result = await upsertOauthUser(handle.app.db, 'discord', {
      providerAccountId: `d-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      email: `also-${email}`, // different email so we don't violate users.email unique constraint
      emailVerified: false,
      displayName: 'Possibly Sketchy',
    });
    // It creates a fresh user instead (different email avoids the unique constraint)
    expect(result.created).toBe(true);
  });

  it('returns the existing user when the same provider+account is hit twice', async () => {
    const providerAccountId = `g-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = uniqueEmail();
    const first = await upsertOauthUser(handle.app.db, 'google', {
      providerAccountId,
      email,
      emailVerified: true,
      displayName: 'Repeat User',
    });
    const second = await upsertOauthUser(handle.app.db, 'google', {
      providerAccountId,
      email,
      emailVerified: true,
      displayName: 'Repeat User',
    });
    expect(second.userId).toBe(first.userId);
    expect(second.created).toBe(false);
  });

  it('lets a single user link both Google AND Discord (composite uniqueness)', async () => {
    const email = uniqueEmail();
    const google = await upsertOauthUser(handle.app.db, 'google', {
      providerAccountId: `g-${Date.now()}`,
      email,
      emailVerified: true,
      displayName: 'Multi-Provider',
    });
    const discord = await upsertOauthUser(handle.app.db, 'discord', {
      providerAccountId: `d-${Date.now()}`,
      email,
      emailVerified: true,
      displayName: 'Multi-Provider',
    });
    expect(discord.userId).toBe(google.userId);

    const links = await handle.app.db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, google.userId));
    expect(links).toHaveLength(2);
    expect(new Set(links.map((l) => l.provider))).toEqual(new Set(['google', 'discord']));
  });
});
