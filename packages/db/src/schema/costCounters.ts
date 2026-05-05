import { date, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Hard cost guardrails. One row per user.
 * - chatsToday / chatsResetDay: reset implicitly when chatsResetDay != todayKey(UTC).
 * - pdfsTotal: lifetime counter (5 PDFs/user lifetime in Slice 1).
 */
export const costCounters = pgTable('cost_counters', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  chatsToday: integer('chats_today').notNull().default(0),
  chatsResetDay: date('chats_reset_day').notNull(),
  pdfsTotal: integer('pdfs_total').notNull().default(0),
});

export type CostCounterRow = typeof costCounters.$inferSelect;
export type NewCostCounterRow = typeof costCounters.$inferInsert;
