import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Email verification via 6-digit OTP (modern industry pattern: Linear, Vercel,
 * Slack). User receives a code, enters it into a form. After 3 wrong attempts
 * the code is invalidated (consumedAt set) and they must request a new one.
 *
 * `tokenHash` stores sha256 of the 6-digit code. The raw code is never stored
 * (still hashed at rest even though it's short — defense in depth, plus we
 * rate-limit at the API layer to defeat brute force).
 */
export const emailVerifications = pgTable(
  'email_verifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ev_hash_uidx').on(t.tokenHash), index('ev_user_idx').on(t.userId)],
);

export type EmailVerificationRow = typeof emailVerifications.$inferSelect;
export type NewEmailVerificationRow = typeof emailVerifications.$inferInsert;
