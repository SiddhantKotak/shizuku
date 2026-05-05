import { eq } from 'drizzle-orm';
import { documents } from '@shizuku/db/schema';
import { env } from '@shizuku/config';
import { newId } from '../../lib/id.js';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import { incrementUsage } from '../../services/cost/counters.js';
import { ingestDocument } from '../../services/documents/ingest.js';
import { documentKey } from '../../services/storage/keys.js';
import { putObject, deleteObject } from '../../services/storage/r2.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyReply } from 'fastify';

/**
 * 25-minute hard cap on the synchronous ingest pipeline. A 50 MB PDF with
 * dense text produces ~2k chunks × 20 batches × 3 s ≈ 60 s for embeddings,
 * plus parse time. 25 minutes leaves ample headroom and matches Railway's
 * default request lifecycle. Past this, we abort with `index_failed`.
 */
const INGEST_HARD_CAP_MS = 25 * 60 * 1000;

interface SseWriter {
  send: (event: string, data: unknown) => void;
  close: () => void;
  isClosed: () => boolean;
}

function createSseWriter(reply: FastifyReply): SseWriter {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (e.g. nginx)
  });
  // Flush headers immediately so the client opens the stream.
  reply.raw.flushHeaders();

  let closed = false;
  reply.raw.on('close', () => {
    closed = true;
  });

  return {
    send: (event, data) => {
      if (closed || reply.raw.writableEnded) return;
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close: () => {
      if (closed || reply.raw.writableEnded) return;
      closed = true;
      reply.raw.end();
    },
    isClosed: () => closed || reply.raw.writableEnded,
  };
}

const uploadRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/',
    {
      preHandler: [app.verifyJWT, app.enforceCost('pdf')],
      schema: {
        // No `body` schema — multipart bodies don't go through Zod
        // validators. We hand-parse via `req.file()` inside the handler.
        consumes: ['multipart/form-data'],
        tags: ['documents'],
        summary: 'Upload a PDF and stream ingest progress (SSE)',
        description: [
          'Multipart upload with field name `file`. Returns an SSE stream of progress events:',
          '',
          '```',
          'event: created     data: { documentId, r2Key }',
          'event: parsed      data: { pages, totalChars }',
          'event: chunked     data: { chunkCount }',
          'event: embedding   data: { batchIndex, totalBatches }',
          'event: ready       data: { documentId, chunkCount }   ← terminal success',
          'event: error       data: { code, message }            ← terminal failure',
          '```',
          '',
          '**Cost guards:** preHandler `enforceCost("pdf")` rejects with 429 `cost_limit_exceeded` if the user has uploaded 5 PDFs. The successful row counts toward that limit AFTER ingest commits.',
          '',
          '**Limits:** 50 MB max PDF size (`COST_LIMIT_PDF_MAX_BYTES`). 25-min hard cap on the ingest pipeline.',
          '',
          '**Client-disconnect tolerant:** if the SPA drops the SSE connection mid-ingest, the server keeps indexing. The SPA can later open the document and see `indexStatus="ready"`.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;

      // 1. Receive the multipart file. We buffer fully — 50 MB fits in RAM
      //    and pdf2json wants a Buffer anyway.
      const file = await req.file();
      if (!file) {
        throw httpError.badRequest('validation_error', 'Missing file field');
      }
      if (file.mimetype !== 'application/pdf') {
        throw httpError.badRequest('pdf_only', 'Only PDF uploads are supported');
      }

      const buffer = await file.toBuffer();
      // @fastify/multipart reports `truncated` when `fileSize` was hit. The
      // 413 envelope is friendlier than a generic stream-end error.
      if (file.file.truncated) {
        throw httpError.badRequest(
          'pdf_too_large',
          `PDF exceeds ${env.COST_LIMIT_PDF_MAX_BYTES} bytes`,
        );
      }

      const documentId = newId('doc');
      const r2Key = documentKey(userId, documentId);
      const filename = file.filename ?? 'document.pdf';
      const title = filename.replace(/\.pdf$/i, '');

      // 2. PUT to R2 BEFORE inserting the row — if the PUT fails we don't
      //    want a dangling 'pending' row with no object behind it.
      try {
        await putObject({ key: r2Key, body: buffer, contentType: 'application/pdf' });
      } catch (err) {
        req.log.error({ err, userId }, 'r2_put_failed');
        throw httpError.badRequest('internal', 'Storage upload failed; please retry');
      }

      // 3. Now persist the row. From here on, any failure leaves a row we
      //    can mark `index_status='failed'` and the user can delete + retry.
      await app.db.insert(documents).values({
        id: documentId,
        userId,
        title,
        filename,
        byteSize: buffer.byteLength,
        r2Key,
        // pageCount + chunkCount default to null/0; ingest fills them in.
      });

      // 4. Switch the response to SSE and stream ingest events. Important:
      //    we do NOT `throw` from the handler after this point — Fastify
      //    would try to send a JSON error on a stream that already started.
      //    All errors become `event: error` SSE frames + a normal close.
      reply.hijack(); // Tell Fastify we own the response from here on.
      const sse = createSseWriter(reply);

      sse.send('created', { documentId, r2Key });

      // Even if the client disconnects, we keep ingesting. The SSE writer
      // turns into a no-op (its `closed` flag flips in the 'close' handler)
      // but ingestDocument continues to update the DB row.
      let totalBatches = 0;
      const ingestPromise = ingestDocument(
        app.db,
        { documentId, pdfBuffer: buffer },
        {
          onParsed: (pages, totalChars) => sse.send('parsed', { pages, totalChars }),
          onChunked: (chunkCount) => {
            totalBatches = Math.ceil(chunkCount / 100);
            sse.send('chunked', { chunkCount });
          },
          onEmbedding: (batchIndex, n) => {
            totalBatches = n;
            sse.send('embedding', { batchIndex, totalBatches });
          },
        },
      );

      const timeout = new Promise<never>((_, rejectTimeout) =>
        setTimeout(
          () =>
            rejectTimeout(
              new Error(`ingest_timeout: exceeded ${INGEST_HARD_CAP_MS / 60000} minutes`),
            ),
          INGEST_HARD_CAP_MS,
        ),
      );

      try {
        const result = await Promise.race([ingestPromise, timeout]);
        // Cost guard: increment AFTER successful commit so failures don't
        // burn quota. The preHandler already gated on the BEFORE count.
        await incrementUsage(app.db, userId, 'pdf');
        sse.send('ready', { documentId, chunkCount: result.chunkCount });
        sse.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown_error';
        req.log.error({ err, documentId }, 'ingest_failed');
        // Mark the row failed so the SPA can show a Retry CTA.
        await app.db
          .update(documents)
          .set({ indexStatus: 'failed', indexError: message })
          .where(eq(documents.id, documentId))
          .catch(() => {
            /* if even this fails we've logged enough */
          });
        // Best-effort R2 cleanup so the bucket doesn't grow with corrupt PDFs.
        await deleteObject(r2Key).catch(() => {
          /* lifecycle policy will sweep */
        });
        sse.send('error', { code: 'index_failed', message });
        sse.close();
      }
    },
  );
};

export default uploadRoute;
