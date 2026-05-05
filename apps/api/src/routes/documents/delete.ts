import { and, eq } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { documents } from '@shizuku/db/schema';
import { documentIdParamSchema } from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import { deleteObject } from '../../services/storage/r2.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const deleteRoute: FastifyPluginAsyncZod = async (app) => {
  app.delete(
    '/:id',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: documentIdParamSchema,
        tags: ['documents'],
        summary: 'Delete a document and purge its R2 object',
        description: [
          'Hard-deletes the document row (cascades to `document_chunks`, `chat_messages`, `highlights`, `bookmarks`, `reading_progress`, `pomodoro_sessions.document_id`) and best-effort deletes the R2 object.',
          '',
          'R2 deletion is best-effort: if it fails (network blip), the DB delete still proceeds and the orphaned object will be swept by the lifecycle policy. Logged at `warn` for forensic audit.',
          '',
          'Returns 204 on success, 404 if the document doesn\'t exist or belongs to another user.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;
      const [row] = await app.db
        .select({ id: documents.id, r2Key: documents.r2Key })
        .from(documents)
        .where(and(eq(documents.id, req.params.id), eq(documents.userId, userId)))
        .limit(1);
      if (!row) throw httpError.notFound();

      // DB first — if this fails we never touched R2 and the row is still
      // discoverable for retry. R2 deletion is best-effort: an orphaned
      // object is cheap, an orphaned row would be a forever-stuck UX bug.
      await app.db.delete(documents).where(eq(documents.id, row.id));

      try {
        await deleteObject(row.r2Key);
      } catch (err) {
        req.log.warn(
          { err, documentId: row.id, r2Key: row.r2Key },
          'r2_delete_failed (orphan will be swept by lifecycle policy)',
        );
      }
      reply.code(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default deleteRoute;
