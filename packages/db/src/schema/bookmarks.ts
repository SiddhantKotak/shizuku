import { integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { documents } from './documents.js';
import { users } from './users.js';

export const bookmarks = pgTable(
  'bookmarks',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    page: integer('page').notNull(),
    label: text('label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('bm_user_doc_page_uidx').on(t.userId, t.documentId, t.page)],
);

export type BookmarkRow = typeof bookmarks.$inferSelect;
export type NewBookmarkRow = typeof bookmarks.$inferInsert;
