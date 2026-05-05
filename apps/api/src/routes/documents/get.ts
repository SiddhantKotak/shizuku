import { and, eq } from 'drizzle-orm';
import { documents } from '@shizuku/db/schema';
import { documentIdParamSchema } from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import { toPublicDocument } from './toPublic.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const getRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/:id',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: documentIdParamSchema,
        tags: ['documents'],
        summary: 'Get a single document by id',
        description: [
          'Returns the `DocumentMeta` for the given document. Ownership is enforced — fetching another user\'s document returns 404 (deliberate, not 403, to avoid leaking existence).',
          '',
          'Use this endpoint to poll for `indexStatus` after upload. Once it transitions `pending → indexing → ready`, the SPA can open the reader and chat.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const [row] = await app.db
        .select()
        .from(documents)
        .where(and(eq(documents.id, req.params.id), eq(documents.userId, userId)))
        .limit(1);
      if (!row) throw httpError.notFound();
      return { data: toPublicDocument(row) };
    },
  );
};

export default getRoute;
