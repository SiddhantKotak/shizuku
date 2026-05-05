import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';

/**
 * Quest catalog (template definitions). Seeded once at startup;
 * not user-editable. Daily assignments live in user_quests.
 */
export const quests = pgTable('quests', {
  code: text('code').primaryKey(), // 'read_20_pages'
  title: text('title').notNull(),
  metric: text('metric', { enum: ['pages', 'pomodoros', 'chats', 'minutes'] }).notNull(),
  target: integer('target').notNull(),
  inkReward: integer('ink_reward').notNull(),
  xpReward: integer('xp_reward').notNull(),
  active: boolean('active').notNull().default(true),
});

export type QuestRow = typeof quests.$inferSelect;
export type NewQuestRow = typeof quests.$inferInsert;
