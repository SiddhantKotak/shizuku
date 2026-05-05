import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@shizuku/db';
import { refreshTokens, type RefreshTokenRow } from '@shizuku/db/schema';
import { httpError } from '../../lib/errors.js';
import { newId } from '../../lib/id.js';
import { sha256Hex } from './password.js';

export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const ROTATION_GRACE_MS = 10 * 1000; // 10s grace window after rotation

export interface IssueRefreshOptions {
  userId: string;
  /** Existing token family on rotation; new on login. */
  tokenFamily?: string;
  /** parentId for rotation chain (null on initial login). */
  parentId?: string | null;
  userAgent?: string | undefined;
  ip?: string | undefined;
}

export interface IssuedRefresh {
  rawToken: string; // delivered ONCE in the cookie; never stored
  rowId: string;
  tokenFamily: string;
  expiresAt: Date;
}

/**
 * Mints a new refresh token row and returns the raw secret to set in the cookie.
 * Caller is responsible for setting the cookie on the FastifyReply.
 */
export async function issueRefreshToken(db: Db, opts: IssueRefreshOptions): Promise<IssuedRefresh> {
  const rawToken = randomBytes(48).toString('base64url');
  const tokenHash = sha256Hex(rawToken);
  const tokenFamily = opts.tokenFamily ?? randomUUID();
  const id = newId('rft');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await db.insert(refreshTokens).values({
    id,
    userId: opts.userId,
    tokenFamily,
    tokenHash,
    parentId: opts.parentId ?? null,
    expiresAt,
    userAgent: opts.userAgent ?? null,
    ip: opts.ip ?? null,
  });

  return { rawToken, rowId: id, tokenFamily, expiresAt };
}

export interface RotationResult {
  /** New raw token to set in the cookie. */
  rawToken: string;
  newRowId: string;
  expiresAt: Date;
  userId: string;
}

type RotationOutcome =
  | { kind: 'ok'; result: RotationResult }
  | { kind: 'reuse'; tokenFamily: string };

/**
 * Rotation + theft detection.
 *
 * Happy path:
 *   1. Look up row by tokenHash (FOR UPDATE).
 *   2. If row missing/expired/revoked → 401 invalid_token.
 *   3. If row already rotated:
 *      a. Within 10s grace window → return SAME successor (network-retry tolerance).
 *      b. Otherwise → REUSE: revoke entire family + throw refresh_reuse.
 *   4. Otherwise mark row rotated, insert new row in same family, return new token.
 *
 * Critical: if reuse is detected we MUST commit the family revocation BEFORE
 * throwing. Throwing inside the FOR UPDATE transaction rolls back the revoke,
 * leaving the legitimate refresh token alive — exactly the security failure
 * we're trying to prevent. So we split into two transactions: read+rotate, and
 * (separately) revoke-family. The compromise sentinel is returned from txn #1,
 * txn #2 commits the revoke, and only THEN do we throw.
 */
export async function rotateRefreshToken(
  db: Db,
  rawIncomingToken: string,
  userAgent: string | undefined,
  ip: string | undefined,
): Promise<RotationResult> {
  const incomingHash = sha256Hex(rawIncomingToken);

  const outcome = await db.transaction(async (tx): Promise<RotationOutcome> => {
    const [row] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, incomingHash))
      .for('update');

    if (!row) throw httpError.unauthorized('invalid_token', 'Unknown refresh token');
    if (row.expiresAt.getTime() < Date.now()) {
      throw httpError.unauthorized('token_expired', 'Refresh token expired');
    }
    if (row.revokedAt) {
      throw httpError.unauthorized('invalid_token', 'Refresh token revoked');
    }

    if (row.rotatedAt) {
      const elapsed = Date.now() - row.rotatedAt.getTime();
      if (elapsed <= ROTATION_GRACE_MS) {
        // Network-retry tolerance: re-issue rather than burn the family.
        return { kind: 'ok', result: await rotateInner(tx, row, userAgent, ip) };
      }
      // Genuine reuse — signal back to caller so the family revoke commits
      // OUTSIDE this transaction (otherwise the throw would roll it back).
      return { kind: 'reuse', tokenFamily: row.tokenFamily };
    }

    return { kind: 'ok', result: await rotateInner(tx, row, userAgent, ip) };
  });

  if (outcome.kind === 'reuse') {
    // Commit the revocation in a separate transaction, then throw.
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), revokedReason: 'family_compromised' })
      .where(
        and(eq(refreshTokens.tokenFamily, outcome.tokenFamily), isNull(refreshTokens.revokedAt)),
      );
    throw httpError.unauthorized('refresh_reuse', 'Refresh token reuse detected; session ended');
  }

  return outcome.result;
}

async function rotateInner(
  tx: Db,
  parent: RefreshTokenRow,
  userAgent: string | undefined,
  ip: string | undefined,
): Promise<RotationResult> {
  // Mark parent rotated
  await tx
    .update(refreshTokens)
    .set({ rotatedAt: new Date() })
    .where(eq(refreshTokens.id, parent.id));

  // Issue successor in same family
  const issued = await issueRefreshToken(tx, {
    userId: parent.userId,
    tokenFamily: parent.tokenFamily,
    parentId: parent.id,
    userAgent,
    ip,
  });

  return {
    rawToken: issued.rawToken,
    newRowId: issued.rowId,
    expiresAt: issued.expiresAt,
    userId: parent.userId,
  };
}

/** Revoke a single refresh token (logout). No family-wide effect. */
export async function revokeRefreshToken(db: Db, rawToken: string): Promise<void> {
  const tokenHash = sha256Hex(rawToken);
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), revokedReason: 'logout' })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
}

/** Revoke all of a user's refresh families (password reset, account deletion). */
export async function revokeAllUserRefreshTokens(
  db: Db,
  userId: string,
  reason: 'password_reset' | 'admin' = 'password_reset',
): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
