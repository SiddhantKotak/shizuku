import multipart from '@fastify/multipart';
import fp from 'fastify-plugin';
import { env } from '@shizuku/config';
import type { FastifyInstance } from 'fastify';

/**
 * Multipart upload plugin — used by the synchronous PDF upload route.
 *
 * Tuned for Slice 1 cost guards:
 *  - `fileSize` matches `COST_LIMIT_PDF_MAX_BYTES` (50 MB default). Hitting
 *    the limit fast-fails with `FST_REQ_FILE_TOO_LARGE` which the global
 *    error handler converts to a 413 envelope.
 *  - `files: 1` prevents zip-bomb-style multi-file uploads.
 *  - We use `await req.file()` (NOT `attachFieldsToBody`) inside the route
 *    so the handler can stream from disk if needed; for now we buffer fully
 *    in memory because PDFs at 50 MB fit comfortably.
 */
export default fp(async (app: FastifyInstance) => {
  await app.register(multipart, {
    limits: {
      fileSize: env.COST_LIMIT_PDF_MAX_BYTES,
      files: 1,
      fields: 4, // title, etc.
    },
    attachFieldsToBody: false,
  });
});
