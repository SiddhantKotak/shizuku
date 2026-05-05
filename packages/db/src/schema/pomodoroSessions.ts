import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { documents } from './documents.js';
import { users } from './users.js';

export const pomodoroSessions = pgTable(
  'pomodoro_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    documentId: text('document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cycleCount: integer('cycle_count').notNull().default(1),
    status: text('status', { enum: ['active', 'completed', 'abandoned'] })
      .notNull()
      .default('active'),
  },
  (t) => [index('pmd_user_started_idx').on(t.userId, t.startedAt)],
);

export type PomodoroSessionRow = typeof pomodoroSessions.$inferSelect;
export type NewPomodoroSessionRow = typeof pomodoroSessions.$inferInsert;
