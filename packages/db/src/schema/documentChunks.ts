import { index, integer, pgTable, text, vector } from 'drizzle-orm/pg-core';
import { documents } from './documents.js';

/**
 * RAG vector store. 1536-dim embeddings from OpenAI text-embedding-3-small.
 *
 * Two index columns live on this table that Drizzle does NOT manage; both
 * are added by `packages/db/scripts/migrate.ts` after the generated
 * migrations run.
 *
 *   1. `embedding` HNSW index (semantic similarity):
 *        CREATE INDEX chunks_embedding_hnsw
 *          ON document_chunks USING hnsw (embedding vector_cosine_ops)
 *          WITH (m = 16, ef_construction = 64);
 *      Per-query: SET LOCAL hnsw.ef_search = 40;
 *
 *   2. `content_tsv` tsvector generated column + GIN index (BM25-style
 *      lexical search for the hybrid retrieval path):
 *        ALTER TABLE document_chunks
 *          ADD COLUMN content_tsv tsvector
 *          GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
 *        CREATE INDEX chunks_content_tsv_gin
 *          ON document_chunks USING gin (content_tsv);
 *      Per-query: ts_rank_cd(content_tsv, plainto_tsquery('english', $q))
 *
 * Both are intentionally NOT modeled in the Drizzle schema — they're
 * search artifacts, never read or written by application code outside of
 * the retrieval service which hand-rolls the SQL.
 */
export const documentChunks = pgTable(
  'document_chunks',
  {
    id: text('id').primaryKey(), // chk_<nanoid>
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    pageStart: integer('page_start').notNull(),
    pageEnd: integer('page_end').notNull(),
    chunkIndex: integer('chunk_index').notNull(), // 0-based per doc
    content: text('content').notNull(),
    tokenCount: integer('token_count').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
  },
  (t) => [index('chunks_doc_idx').on(t.documentId)],
);

export type DocumentChunkRow = typeof documentChunks.$inferSelect;
export type NewDocumentChunkRow = typeof documentChunks.$inferInsert;
