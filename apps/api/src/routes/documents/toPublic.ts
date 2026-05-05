import type { DocumentRow } from '@shizuku/db/schema';
import type { DocumentMeta } from '@shizuku/types';

/**
 * Map a `documents` row to the public DocumentMeta shape.
 *
 * Notes:
 *  - `r2_key` is INTENTIONALLY omitted — clients should never see the raw
 *    storage key. Use `GET /v1/documents/:id/signed-url` for download.
 *  - `index_status='failed'` rows still serialize; the SPA renders them
 *    with a Retry CTA.
 */
export function toPublicDocument(row: DocumentRow): DocumentMeta {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    filename: row.filename,
    pageCount: row.pageCount,
    byteSize: row.byteSize,
    isPrivate: row.isPrivate,
    indexStatus: row.indexStatus,
    indexError: row.indexError,
    chunkCount: row.chunkCount,
    uploadedAt: row.uploadedAt.toISOString(),
    indexedAt: row.indexedAt?.toISOString() ?? null,
  };
}
