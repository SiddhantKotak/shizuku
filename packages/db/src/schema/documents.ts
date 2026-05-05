import { boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const documents = pgTable(
  'documents',
  {
    id: text('id').primaryKey(), // doc_<nanoid>
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    filename: text('filename').notNull(),
    pageCount: integer('page_count'),
    byteSize: integer('byte_size').notNull(),
    r2Key: text('r2_key').notNull(),
    isPrivate: boolean('is_private').notNull().default(true), // PRIVATE BY DEFAULT — schema-level enforcement
    indexStatus: text('index_status', {
      enum: ['pending', 'indexing', 'ready', 'failed'],
    })
      .notNull()
      .default('pending'),
    indexError: text('index_error'),
    chunkCount: integer('chunk_count').notNull().default(0),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),
  },
  (t) => [index('docs_user_idx').on(t.userId)],
);

export type DocumentRow = typeof documents.$inferSelect;
export type NewDocumentRow = typeof documents.$inferInsert;
