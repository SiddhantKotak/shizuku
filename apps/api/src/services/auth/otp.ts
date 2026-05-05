import { randomInt } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '@shizuku/db';
import type { PgTable } from 'drizzle-orm/pg-core';
import { emailVerifications, passwordResetTokens, users } from '@shizuku/db/schema';
import { httpError } from '../../lib/errors.js';
import { newId } from '../../lib/id.js';
import { sha256Hex } from './password.js';

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 3;

/** Generate a 6-digit numeric code. Uniformly random across [000000, 999999]. */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export type OtpVerifyOutcome =
  | { kind: 'ok'; userId: string }
  | { kind: 'invalid' } // wrong code, attempts < max
  | { kind: 'expired' }
  | { kind: 'too_many_attempts' };

export type OtpKind = 'verify_email' | 'reset_password';

interface OtpTableMap {
  verify_email: typeof emailVerifications;
  reset_password: typeof passwordResetTokens;
}
const OTP_TABLES: OtpTableMap = {
  verify_email: emailVerifications,
  reset_password: passwordResetTokens,
};

/**
 * Issue a fresh OTP for `userId`. Invalidates any unconsumed OTPs the user
 * already has (consume them) so a request always supersedes stale codes.
 *
 * Returns the raw 6-digit code — emailed once, never stored. Only the sha256
 * hash is persisted.
 */
export async function issueOtp(
  db: Db,
  kind: OtpKind,
  userId: string,
): Promise<{ code: string; expiresAt: Date }> {
  const table = OTP_TABLES[kind];
  const code = generateOtpCode();
  const codeHash = sha256Hex(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await db.transaction(async (tx) => {
    // Invalidate any in-flight OTPs of this kind for this user
    await tx
      .update(table)
      .set({ consumedAt: new Date() })
      .where(and(eq(table.userId, userId), isNull(table.consumedAt)));

    await tx.insert(table).values({
      id: newId(kind === 'verify_email' ? 'ev' : 'pwr'),
      userId,
      tokenHash: codeHash,
      expiresAt,
    });
  });

  return { code, expiresAt };
}

/**
 * Verify an OTP. Atomically:
 *   - locks the most recent unconsumed row for the user/kind,
 *   - if expired, marks consumed and returns `expired`,
 *   - if hash matches, marks consumed and returns `ok` (caller applies side effects),
 *   - else increments `attempts`; if attempts >= MAX, marks consumed and returns
 *     `too_many_attempts`; otherwise returns `invalid`.
 *
 * The decision is enclosed in a single transaction with FOR UPDATE row lock to
 * prevent race conditions where two concurrent verify attempts would both see
 * (attempts < MAX) and both succeed in incrementing past the limit.
 */
export async function verifyOtp(
  db: Db,
  kind: OtpKind,
  userId: string,
  code: string,
): Promise<OtpVerifyOutcome> {
  const table = OTP_TABLES[kind];
  const codeHash = sha256Hex(code);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), isNull(table.consumedAt)))
      .orderBy(desc(table.createdAt))
      .limit(1)
      .for('update');

    if (!row) return { kind: 'invalid' as const };

    if (row.expiresAt.getTime() < Date.now()) {
      await tx.update(table).set({ consumedAt: new Date() }).where(eq(table.id, row.id));
      return { kind: 'expired' as const };
    }

    if (row.tokenHash === codeHash) {
      await tx.update(table).set({ consumedAt: new Date() }).where(eq(table.id, row.id));
      return { kind: 'ok' as const, userId };
    }

    const newAttempts = row.attempts + 1;
    if (newAttempts >= OTP_MAX_ATTEMPTS) {
      await tx
        .update(table)
        .set({ attempts: newAttempts, consumedAt: new Date() })
        .where(eq(table.id, row.id));
      return { kind: 'too_many_attempts' as const };
    }
    await tx.update(table).set({ attempts: newAttempts }).where(eq(table.id, row.id));
    return { kind: 'invalid' as const };
  });
}

/** Map an OtpVerifyOutcome into an HttpError. Caller throws on non-ok. */
export function otpOutcomeToError(outcome: Exclude<OtpVerifyOutcome, { kind: 'ok' }>): Error {
  switch (outcome.kind) {
    case 'invalid':
      return httpError.unauthorized('otp_invalid', 'Invalid verification code');
    case 'expired':
      return httpError.unauthorized('otp_expired', 'Verification code expired');
    case 'too_many_attempts':
      return httpError.unauthorized(
        'otp_max_attempts_exceeded',
        'Too many wrong attempts. Request a new code.',
      );
  }
}

/** Look up a user id by email (case-insensitive via citext) without leaking existence. */
export async function findUserIdByEmail(db: Db, email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return row?.id ?? null;
}

// `PgTable` re-exported for service-test mocks if ever needed. Not used here directly.
export type { PgTable };
