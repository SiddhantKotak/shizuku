import { and, eq } from 'drizzle-orm';
import { documents } from '@shizuku/db/schema';
import { documentIdParamSchema } from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import { presignDownloadUrl } from '../../services/storage/r2.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const SIGNED_URL_TTL_SECONDS = 15 * 60;

const signedUrlRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/:id/signed-url',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: documentIdParamSchema,
        tags: ['documents'],
        summary: 'Generate a 15-minute signed URL for the document PDF',
        description: [
          'Returns `{ url, expiresAt }` — a short-lived (15 min) GET URL signed with our R2 credentials. The URL itself confers access; ownership is verified server-side before signing.',
          '',
          'The SPA fetches this just before opening the PDF reader; if the URL expires while the reader is open, the next page request fails and the SPA re-fetches.',
          '',
          '**Errors:** 404 if the document does not exist or belongs to another user. 503 `index_pending` if the document is still being indexed (R2 upload may not have completed yet).',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const [row] = await app.db
        .select({
          r2Key: documents.r2Key,
          indexStatus: documents.indexStatus,
        })
        .from(documents)
        .where(and(eq(documents.id, req.params.id), eq(documents.userId, userId)))
        .limit(1);
      if (!row) throw httpError.notFound();

      // The R2 object is always uploaded before the SSE stream emits any
      // ingest progress, so `pending` here would be unusual but not impossible
      // (race between insert and PUT). Surface it as 503 so the SPA polls again.
      if (row.indexStatus === 'pending') {
        // Defensive: the upload route uploads to R2 before transitioning the
        // row to 'indexing', so 'pending' here means the upload is mid-flight.
        // SPA should poll the document detail endpoint until status changes.
        throw httpError.conflict(
          'index_pending',
          'Document upload still in progress — try again in a few seconds.',
        );
      }

      const url = await presignDownloadUrl(row.r2Key);
      const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();
      return { data: { url, expiresAt } };
    },
  );
};

export default signedUrlRoute;
