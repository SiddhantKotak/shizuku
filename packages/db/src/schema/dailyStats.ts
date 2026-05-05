import { date, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Per-user-per-day aggregate counters. Updated via INSERT ... ON CONFLICT ... DO UPDATE
 * from event hooks (page-read debounce, chat completion, pomodoro complete).
 */
export const dailyStats = pgTable(
  'daily_stats',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    minutes: integer('minutes').notNull().default(0),
    pages: integer('pages').notNull().default(0),
    chats: integer('chats').notNull().default(0),
    pomodoros: integer('pomodoros').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export type DailyStatsRow = typeof dailyStats.$inferSelect;
export type NewDailyStatsRow = typeof dailyStats.$inferInsert;
