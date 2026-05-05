import { and, desc, eq, lt } from 'drizzle-orm';
import { documents } from '@shizuku/db/schema';
import { listDocumentsQuerySchema } from '@shizuku/types';
import { requireUser } from '../../lib/requireUser.js';
import { toPublicDocument } from './toPublic.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const listRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: [app.verifyJWT],
      schema: {
        querystring: listDocumentsQuerySchema,
        tags: ['documents'],
        summary: "List the authenticated user's PDFs",
        description: [
          "Returns the user's documents, newest first. Cursor pagination — pass the previous response's trailing `uploadedAt` as `?cursor=` to fetch the next page. `limit` defaults to 20, max 50.",
          '',
          'Each item is a `DocumentMeta` (id, title, filename, pageCount, byteSize, indexStatus, indexError, chunkCount, uploadedAt, indexedAt). The `r2_key` is never exposed — call `/signed-url` to download.',
          '',
          '**Response envelope:** `{ data: DocumentMeta[], nextCursor: string | null }`. `nextCursor` is `null` when there are no more pages.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const { cursor, limit } = req.query;

      const where = cursor
        ? and(eq(documents.userId, userId), lt(documents.uploadedAt, new Date(cursor)))
        : eq(documents.userId, userId);

      const rows = await app.db
        .select()
        .from(documents)
        .where(where)
        .orderBy(desc(documents.uploadedAt))
        .limit(limit + 1); // +1 to detect "more pages"

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && page.length > 0
          ? (page[page.length - 1]?.uploadedAt.toISOString() ?? null)
          : null;

      return {
        data: {
          documents: page.map(toPublicDocument),
          nextCursor,
        },
      };
    },
  );
};

export default listRoute;
