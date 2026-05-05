import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Refresh tokens with rotation + theft detection.
 *
 * - tokenHash: sha256 of the raw opaque token. Raw token is delivered in the cookie ONCE
 *   and never stored.
 * - tokenFamily: shared across all rotations of one login session. On detected reuse,
 *   the entire family is revoked atomically.
 * - parentId: forms a rotation chain for forensic / 10-second grace-window checks.
 * - rotatedAt: non-null iff the token was successfully rotated. Reuse is detected when
 *   we receive a token whose row already has rotatedAt set.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(), // rft_<nanoid>
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenFamily: text('token_family').notNull(),
    tokenHash: text('token_hash').notNull(),
    parentId: text('parent_id'),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason', {
      enum: ['logout', 'reuse', 'family_compromised', 'password_reset', 'admin'],
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('rft_hash_uidx').on(t.tokenHash),
    index('rft_family_idx').on(t.tokenFamily),
    index('rft_user_idx').on(t.userId),
  ],
);

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type NewRefreshTokenRow = typeof refreshTokens.$inferInsert;
