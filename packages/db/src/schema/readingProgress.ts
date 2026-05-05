import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { documents } from './documents.js';
import { users } from './users.js';

export const readingProgress = pgTable(
  'reading_progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    currentPage: integer('current_page').notNull().default(1),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.documentId] })],
);

export type ReadingProgressRow = typeof readingProgress.$inferSelect;
export type NewReadingProgressRow = typeof readingProgress.$inferInsert;
