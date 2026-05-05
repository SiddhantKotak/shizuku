import { and, asc, eq } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { bookmarks, documents } from '@shizuku/db/schema';
import {
  createBookmarkBodySchema,
  documentIdParamSchema,
  type Bookmark,
} from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { newId } from '../../lib/id.js';
import { requireUser } from '../../lib/requireUser.js';
import type { Db } from '@shizuku/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const bookmarkIdParamSchema = documentIdParamSchema.extend({
  bookmarkId: z.string().regex(/^bm_/, 'Not a bookmark id'),
});

function toPublic(row: typeof bookmarks.$inferSelect): Bookmark {
  return {
    id: row.id,
    documentId: row.documentId,
    page: row.page,
    label: row.label ?? null,
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

const bookmarksRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/:id/bookmarks',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: documentIdParamSchema,
        tags: ['documents'],
        summary: 'List bookmarks on a document',
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
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), eq(bookmarks.documentId, req.params.id)))
        .orderBy(asc(bookmarks.page));
      return { data: rows.map(toPublic) };
    },
  );

  app.post(
    '/:id/bookmarks',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: documentIdParamSchema,
        body: createBookmarkBodySchema,
        tags: ['documents'],
        summary: 'Create a bookmark',
        description:
          'Bookmarks are unique on (userId, documentId, page). Posting a duplicate page returns 409 `conflict`.',
        security: [{ bearer: [] }],
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;
      if (!(await ownsDocument(app.db, userId, req.params.id))) {
        throw httpError.notFound();
      }
      try {
        const [row] = await app.db
          .insert(bookmarks)
          .values({
            id: newId('bm'),
            documentId: req.params.id,
            userId,
            page: req.body.page,
            label: req.body.label ?? null,
          })
          .returning();
        if (!row) throw new Error('insert_returned_no_row');
        reply.code(StatusCodes.CREATED);
        return { data: toPublic(row) };
      } catch (err) {
        if (err instanceof Error && err.message.includes('bookmarks')) {
          throw httpError.conflict('conflict', 'A bookmark already exists on that page.');
        }
        throw err;
      }
    },
  );

  app.delete(
    '/:id/bookmarks/:bookmarkId',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: bookmarkIdParamSchema,
        tags: ['documents'],
        summary: 'Delete a bookmark',
        security: [{ bearer: [] }],
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;
      const result = await app.db
        .delete(bookmarks)
        .where(
          and(
            eq(bookmarks.id, req.params.bookmarkId),
            eq(bookmarks.userId, userId),
            eq(bookmarks.documentId, req.params.id),
          ),
        )
        .returning({ id: bookmarks.id });
      if (result.length === 0) throw httpError.notFound();
      reply.code(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default bookmarksRoute;
