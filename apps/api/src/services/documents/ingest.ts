import { eq, sql } from 'drizzle-orm';
import type { Db } from '@shizuku/db';
import { documentChunks, documents } from '@shizuku/db/schema';
import { newId } from '../../lib/id.js';
import { chunkPages, type TextChunk } from './chunk.js';
import { embedBatched, EmbedFailure } from './embed.js';
import { parsePdf } from './parse.js';

/**
 * Orchestrates the full ingest pipeline for a single uploaded PDF.
 *
 * The upload route owns: file receipt, the `documents` row insert, the R2
 * upload, and the SSE response. This module owns the CPU/network-heavy
 * inner loop: parse → chunk → embed → insert.
 *
 * Each stage emits a progress callback so the upload route can surface SSE
 * events (`parsed`, `chunked`, `embedding`, `ready`) without coupling this
 * module to Fastify.
 *
 * Failure semantics: on any stage error we mark the document
 * `index_status='failed'` with `index_error` set to the error message so
 * the SPA can surface a useful message and let the user delete + retry.
 */

export interface IngestProgress {
  onParsed?: (totalPages: number, totalChars: number) => void;
  onChunked?: (chunkCount: number) => void;
  onEmbedding?: (batchIndex: number, totalBatches: number) => void;
}

export interface IngestResult {
  chunkCount: number;
}

export async function ingestDocument(
  db: Db,
  args: {
    documentId: string;
    pdfBuffer: Buffer;
  },
  progress: IngestProgress = {},
): Promise<IngestResult> {
  await db
    .update(documents)
    .set({ indexStatus: 'indexing' })
    .where(eq(documents.id, args.documentId));

  let chunks: TextChunk[];
  try {
    const pages = await parsePdf(args.pdfBuffer);
    const totalChars = pages.reduce((acc, p) => acc + p.text.length, 0);
    progress.onParsed?.(pages.length, totalChars);

    chunks = chunkPages(pages);
    progress.onChunked?.(chunks.length);

    if (chunks.length === 0) {
      // Image-only or empty PDF — record success with zero chunks rather
      // than failure. Search will simply return nothing for this doc.
      await db
        .update(documents)
        .set({
          indexStatus: 'ready',
          indexedAt: new Date(),
          pageCount: pages.length,
          chunkCount: 0,
        })
        .where(eq(documents.id, args.documentId));
      return { chunkCount: 0 };
    }

    const vectors = await embedBatched(
      chunks.map((c) => c.content),
      { onBatch: (i, n) => progress.onEmbedding?.(i, n) },
    );

    // Insert chunks + vectors in a single transaction with the document
    // metadata update. If anything in this block fails we'd rather have
    // zero chunks than a partial vector index.
    await db.transaction(async (tx) => {
      const rows = chunks.map((c, i) => ({
        id: newId('chk'),
        documentId: args.documentId,
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
        chunkIndex: c.chunkIndex,
        content: c.content,
        tokenCount: c.tokenCount,
        embedding: vectors[i] ?? null,
      }));
      // Insert in groups of 200 — Drizzle/postgres-js can choke on giant
      // single statements with a few thousand rows of vectors.
      const GROUP_SIZE = 200;
      for (let i = 0; i < rows.length; i += GROUP_SIZE) {
        const slice = rows.slice(i, i + GROUP_SIZE);
        await tx.insert(documentChunks).values(slice);
      }
      await tx
        .update(documents)
        .set({
          indexStatus: 'ready',
          indexedAt: new Date(),
          pageCount: pages.length,
          chunkCount: chunks.length,
        })
        .where(eq(documents.id, args.documentId));
    });
  } catch (err) {
    const message =
      err instanceof EmbedFailure
        ? err.message
        : err instanceof Error
          ? err.message
          : 'unknown_error';
    await db
      .update(documents)
      .set({
        indexStatus: 'failed',
        indexError: message,
        chunkCount: 0,
      })
      .where(eq(documents.id, args.documentId));
    throw err;
  }

  return { chunkCount: chunks.length };
}

/**
 * Manual reindex — purges existing chunks for the document and runs the
 * pipeline again. Used by Slice 1.5+ when the user retries a failed
 * indexing job. Slice 1 doesn't expose this directly; the upload route
 * just creates a fresh document row.
 */
export async function purgeChunks(db: Db, documentId: string): Promise<void> {
  await db.execute(sql`DELETE FROM document_chunks WHERE document_id = ${documentId}`);
}
