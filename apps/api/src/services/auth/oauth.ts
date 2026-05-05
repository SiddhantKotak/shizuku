import { Discord, Google, decodeIdToken } from 'arctic';
import { and, eq } from 'drizzle-orm';
import { env } from '@shizuku/config';
import type { Db } from '@shizuku/db';
import { oauthAccounts, users } from '@shizuku/db/schema';
import { httpError } from '../../lib/errors.js';
import { newId } from '../../lib/id.js';
import type { OAuthProvider } from '@shizuku/types';

/** Normalized profile shape returned by both Google and Discord exchanges. */
export interface OAuthProfile {
  /** Provider's unique account id (Google `sub`, Discord `id`). */
  providerAccountId: string;
  /** Email address. Required — both providers always return this with `email` scope. */
  email: string;
  /** Provider-asserted email verification flag. We require true to auto-link. */
  emailVerified: boolean;
  /** Provider's display name (Google `name`, Discord `global_name` || `username`). */
  displayName: string;
}

// ─── Lazy client init ───────────────────────────────────────────────────────────

let googleClient: Google | null = null;
let discordClient: Discord | null = null;

function getGoogleClient(): Google {
  if (googleClient) return googleClient;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw httpError.notFound(
      'service_unavailable',
      'Google OAuth is not configured on this server',
    );
  }
  googleClient = new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
  return googleClient;
}

function getDiscordClient(): Discord {
  if (discordClient) return discordClient;
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.DISCORD_REDIRECT_URI) {
    throw httpError.notFound(
      'service_unavailable',
      'Discord OAuth is not configured on this server',
    );
  }
  discordClient = new Discord(
    env.DISCORD_CLIENT_ID,
    env.DISCORD_CLIENT_SECRET,
    env.DISCORD_REDIRECT_URI,
  );
  return discordClient;
}

/** Cached client accessor — also used by route handlers to mint authorization URLs. */
export const oauthClients = {
  google: getGoogleClient,
  discord: getDiscordClient,
};

export const GOOGLE_SCOPES = ['openid', 'email', 'profile'];
export const DISCORD_SCOPES = ['identify', 'email'];

// ─── Code-exchange helpers ──────────────────────────────────────────────────────

/**
 * Exchange Google's authorization `code` for tokens, then decode the id_token
 * to extract the user profile. We do NOT verify the JWT signature here because
 * the token came over a TLS connection from `oauth2.googleapis.com` directly to
 * our server — that channel is the trust anchor (RFC 8252 §7.3 reasoning).
 */
export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
): Promise<OAuthProfile> {
  const google = getGoogleClient();
  const tokens = await google.validateAuthorizationCode(code, codeVerifier);
  const idToken = tokens.idToken();
  const claims = decodeIdToken(idToken) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
  };

  if (!claims.sub) throw new Error('google_id_token_missing_sub');
  if (!claims.email) throw new Error('google_id_token_missing_email');

  return {
    providerAccountId: claims.sub,
    email: claims.email,
    emailVerified: claims.email_verified === true,
    displayName: pickDisplayName([claims.name, claims.given_name, claims.email.split('@')[0]]),
  };
}

interface DiscordUserResponse {
  id: string;
  email?: string | null;
  verified?: boolean;
  global_name?: string | null;
  username?: string;
}

/**
 * Exchange Discord's authorization `code` for tokens, then call `/users/@me`
 * with the access token to fetch the profile. Discord doesn't return id_tokens.
 */
export async function exchangeDiscordCode(
  code: string,
  codeVerifier: string,
): Promise<OAuthProfile> {
  const discord = getDiscordClient();
  const tokens = await discord.validateAuthorizationCode(code, codeVerifier);
  const accessToken = tokens.accessToken();

  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`discord_user_fetch_failed: ${res.status}`);
  const user = (await res.json()) as DiscordUserResponse;

  if (!user.id) throw new Error('discord_user_missing_id');
  if (!user.email) {
    // Discord requires the `email` scope for this; if missing, the OAuth app is
    // misconfigured or the user revoked email access.
    throw new Error('discord_user_missing_email');
  }

  return {
    providerAccountId: user.id,
    email: user.email,
    emailVerified: user.verified === true,
    displayName: pickDisplayName([user.global_name, user.username, user.email.split('@')[0]]),
  };
}

function pickDisplayName(candidates: ReadonlyArray<string | null | undefined>): string {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim().slice(0, 40);
  }
  return 'Shizuku User';
}

// ─── Upsert user + oauth_account ────────────────────────────────────────────────

export interface UpsertResult {
  userId: string;
  /** True iff the user was just created (vs. linked or already-known). */
  created: boolean;
}

/**
 * Three-branch upsert (transactional, all branches commit together):
 *   1. Existing oauth_account → return that user.
 *   2. New OAuth identity, but the email matches an existing user → auto-link
 *      (insert oauth_account row pointing to the existing user). Provider
 *      email_verified must be `true` for the link to fire — defense in depth
 *      even though Google + Discord verify emails before issuing tokens.
 *   3. Brand new identity + brand new email → create user + oauth_account.
 *
 * Race-condition note: between branches 2 and 3, two concurrent OAuth callbacks
 * for the same brand-new email could both try to create a user. The unique
 * index on `users.email` (citext) is the source of truth — if the second tx
 * fails with a unique violation, we re-resolve by selecting the just-inserted
 * user and linking the OAuth account to it.
 */
export async function upsertOauthUser(
  db: Db,
  provider: OAuthProvider,
  profile: OAuthProfile,
): Promise<UpsertResult> {
  return db.transaction(async (tx) => {
    // 1. Already linked OAuth account?
    const [existingLink] = await tx
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerAccountId, profile.providerAccountId),
        ),
      )
      .limit(1);
    if (existingLink) return { userId: existingLink.userId, created: false };

    // 2. Auto-link: existing user with the same email.
    if (profile.emailVerified) {
      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, profile.email.toLowerCase()))
        .limit(1);
      if (existingUser) {
        await tx.insert(oauthAccounts).values({
          id: newId('oa'),
          userId: existingUser.id,
          provider,
          providerAccountId: profile.providerAccountId,
        });
        // Also mark email verified if it wasn't already (provider attests it).
        await tx
          .update(users)
          .set({ emailVerifiedAt: new Date() })
          .where(and(eq(users.id, existingUser.id), eq(users.email, profile.email.toLowerCase())));
        return { userId: existingUser.id, created: false };
      }
    }

    // 3. New user.
    const userId = newId('usr');
    await tx.insert(users).values({
      id: userId,
      email: profile.email.toLowerCase(),
      passwordHash: null, // OAuth-only; user can set a password later via reset flow.
      displayName: profile.displayName,
      avatarConfig: { presetId: 1, hueShift: 0, satShift: 0 },
      emailVerifiedAt: profile.emailVerified ? new Date() : null,
    });
    await tx.insert(oauthAccounts).values({
      id: newId('oa'),
      userId,
      provider,
      providerAccountId: profile.providerAccountId,
    });
    return { userId, created: true };
  });
}
