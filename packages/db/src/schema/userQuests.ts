import { date, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { quests } from './quests.js';
import { users } from './users.js';

export const userQuests = pgTable(
  'user_quests',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questCode: text('quest_code')
      .notNull()
      .references(() => quests.code),
    assignedDate: date('assigned_date').notNull(),
    progress: integer('progress').notNull().default(0),
    status: text('status', { enum: ['active', 'completed', 'expired'] })
      .notNull()
      .default('active'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('uq_user_date_code_uidx').on(t.userId, t.assignedDate, t.questCode)],
);

export type UserQuestRow = typeof userQuests.$inferSelect;
export type NewUserQuestRow = typeof userQuests.$inferInsert;
