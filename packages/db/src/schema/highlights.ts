import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { HighlightRange } from '@shizuku/types';
import { documents } from './documents.js';
import { users } from './users.js';

export const highlights = pgTable(
  'highlights',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    page: integer('page').notNull(),
    rangeJson: jsonb('range_json').$type<HighlightRange>().notNull(),
    color: text('color', { enum: ['yellow', 'green', 'blue', 'pink'] }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('hl_doc_page_idx').on(t.documentId, t.page)],
);

export type HighlightRow = typeof highlights.$inferSelect;
export type NewHighlightRow = typeof highlights.$inferInsert;
