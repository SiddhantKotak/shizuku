import { and, eq, asc } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { documents, highlights } from '@shizuku/db/schema';
import {
  createHighlightBodySchema,
  documentIdParamSchema,
  updateHighlightBodySchema,
  type Highlight,
  type HighlightColor,
  type HighlightRange,
} from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { newId } from '../../lib/id.js';
import { requireUser } from '../../lib/requireUser.js';
import type { Db } from '@shizuku/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * Highlights CRUD — scoped to a single document.
 *
 * The `range` blob is treated as opaque jsonb on the server; the SPA owns
 * the serialization format (`{startNodeIndex, startOffset, endNodeIndex,
 * endOffset, quote}`) and the deserializer that walks the PDF text-layer
 * to re-render the visual highlight.
 */

const highlightIdParamSchema = documentIdParamSchema.extend({
  highlightId: z.string().regex(/^hl_/, 'Not a highlight id'),
});

function toPublic(row: typeof highlights.$inferSelect): Highlight {
  return {
    id: row.id,
    documentId: row.documentId,
    page: row.page,
    range: row.rangeJson as HighlightRange,
    color: row.color as HighlightColor,
    note: row.note ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function ownsDocument(
  db: Db,
  userId: string,
  documentId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
    .limit(1);
  return Boolean(row);
}

const highlightsRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/:id/highlights',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: documentIdParamSchema,
        tags: ['documents'],
        summary: 'List highlights on a document',
        description:
          "Returns all highlights for the user on the given document, ordered by page ascending. Each highlight includes the opaque `range` blob the SPA needs to re-render.",
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      if (!(await ownsDocument(app.db, userId, req.params.id))) {
        throw httpError.notFound();
      }
      const rows = await app.db
        .select()
        .from(highlights)
        .where(and(eq(highlights.userId, userId), eq(highlights.documentId, req.params.id)))
        .orderBy(asc(highlights.page), asc(highlights.createdAt));
      return { data: rows.map(toPublic) };
    },
  );

  app.post(
    '/:id/highlights',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: documentIdParamSchema,
        body: createHighlightBodySchema,
        tags: ['documents'],
        summary: 'Create a highlight',
        security: [{ bearer: [] }],
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;
      if (!(await ownsDocument(app.db, userId, req.params.id))) {
        throw httpError.notFound();
      }
      const id = newId('hl');
      const [row] = await app.db
        .insert(highlights)
        .values({
          id,
          documentId: req.params.id,
          userId,
          page: req.body.page,
          rangeJson: req.body.range,
          color: req.body.color,
          note: req.body.note ?? null,
        })
        .returning();
      if (!row) throw new Error('insert_returned_no_row');
      reply.code(StatusCodes.CREATED);
      return { data: toPublic(row) };
    },
  );

  app.patch(
    '/:id/highlights/:highlightId',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: highlightIdParamSchema,
        body: updateHighlightBodySchema,
        tags: ['documents'],
        summary: 'Update a highlight (color or note)',
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const updates: Record<string, unknown> = {};
      if (req.body.color !== undefined) updates.color = req.body.color;
      if (req.body.note !== undefined) updates.note = req.body.note;

      const [row] = await app.db
        .update(highlights)
        .set(updates)
        .where(
          and(
            eq(highlights.id, req.params.highlightId),
            eq(highlights.userId, userId),
            eq(highlights.documentId, req.params.id),
          ),
        )
        .returning();
      if (!row) throw httpError.notFound();
      return { data: toPublic(row) };
    },
  );

  app.delete(
    '/:id/highlights/:highlightId',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: highlightIdParamSchema,
        tags: ['documents'],
        summary: 'Delete a highlight',
        security: [{ bearer: [] }],
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;
      const result = await app.db
        .delete(highlights)
        .where(
          and(
            eq(highlights.id, req.params.highlightId),
            eq(highlights.userId, userId),
            eq(highlights.documentId, req.params.id),
          ),
        )
        .returning({ id: highlights.id });
      if (result.length === 0) throw httpError.notFound();
      reply.code(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default highlightsRoute;
