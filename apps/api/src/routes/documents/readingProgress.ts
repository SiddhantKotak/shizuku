import { and, eq, sql } from 'drizzle-orm';
import { documents, readingProgress } from '@shizuku/db/schema';
import {
  documentIdParamSchema,
  updateReadingProgressBodySchema,
  type ReadingProgress,
} from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import { bumpDailyStat } from '../../services/stats/aggregate.js';
import { bumpQuestProgress } from '../../services/quests/progress.js';
import { markActivity } from '../../services/streak/compute.js';
import { awardPetXp } from '../../services/pets/xp.js';
import type { Db } from '@shizuku/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * Reading progress — one row per (user, document). The SPA debounces the PUT
 * to ~once per page-flip with a ≥30s dwell time gate.
 *
 * Side effects on update (when `currentPage` advances forward):
 *   - daily_stats.pages += diff
 *   - bump 'pages' quests
 *   - mark streak activity
 *   - award pet XP (5 per page) if it's a forward jump
 *
 * The "≥30s dwell" gate is enforced CLIENT-SIDE — the server trusts the
 * client to only PUT after the user actually spent time on a page. Stat
 * inflation is bounded by `cost_counters` and the user's daily_stats can
 * cap easily if abuse becomes a problem (Slice 1.5 concern).
 */

const PAGES_XP = 5;

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

function toPublic(row: typeof readingProgress.$inferSelect): ReadingProgress {
  return {
    documentId: row.documentId,
    currentPage: row.currentPage,
    lastReadAt: row.lastReadAt.toISOString(),
  };
}

const readingProgressRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/:id/reading-progress',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: documentIdParamSchema,
        tags: ['documents'],
        summary: 'Get reading progress for a document',
        description:
          'Returns `{ documentId, currentPage, lastReadAt }` or 404 if no progress yet (SPA defaults to page 1).',
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      if (!(await ownsDocument(app.db, userId, req.params.id))) {
        throw httpError.notFound();
      }
      const [row] = await app.db
        .select()
        .from(readingProgress)
        .where(
          and(
            eq(readingProgress.userId, userId),
            eq(readingProgress.documentId, req.params.id),
          ),
        )
        .limit(1);
      if (!row) throw httpError.notFound();
      return { data: toPublic(row) };
    },
  );

  app.put(
    '/:id/reading-progress',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: documentIdParamSchema,
        body: updateReadingProgressBodySchema,
        tags: ['documents'],
        summary: 'Upsert reading progress',
        description: [
          'Idempotent: sets `currentPage` to the provided page and `lastReadAt` to NOW. Forward progress (`new > old`) fires side effects (daily_stats.pages += diff, quest progress, streak mark, pet XP).',
          '',
          'Backward "scroll-back" PUTs do not fire side effects — the server caps quest/XP gains at the high-water mark per (user, document, day).',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      if (!(await ownsDocument(app.db, userId, req.params.id))) {
        throw httpError.notFound();
      }
      const target = req.body.currentPage;

      const [existing] = await app.db
        .select({ currentPage: readingProgress.currentPage })
        .from(readingProgress)
        .where(
          and(
            eq(readingProgress.userId, userId),
            eq(readingProgress.documentId, req.params.id),
          ),
        )
        .limit(1);
      const previousPage = existing?.currentPage ?? 0;
      const forwardDelta = Math.max(0, target - previousPage);

      // Upsert via INSERT ON CONFLICT — preserves the row's stable PK
      // semantics without doing a separate read-then-update.
      await app.db.execute(sql`
        INSERT INTO reading_progress (user_id, document_id, current_page, last_read_at)
        VALUES (${userId}, ${req.params.id}, ${target}, NOW())
        ON CONFLICT (user_id, document_id) DO UPDATE
        SET current_page = EXCLUDED.current_page,
            last_read_at = EXCLUDED.last_read_at
      `);

      if (forwardDelta > 0) {
        // Side-effect bundle, fire-and-forget on partial failure.
        await Promise.all([
          bumpDailyStat(app.db, userId, 'pages', forwardDelta),
          bumpQuestProgress(app.db, userId, 'pages', forwardDelta),
          markActivity(app.db, userId),
          awardPetXp(app.db, userId, PAGES_XP * forwardDelta),
        ]).catch((err) => {
          req.log.warn({ err, userId }, 'reading_progress_side_effects_partial_failure');
        });
      }

      return {
        data: {
          documentId: req.params.id,
          currentPage: target,
          lastReadAt: new Date().toISOString(),
          pagesAwarded: forwardDelta,
        },
      };
    },
  );
};

export default readingProgressRoute;
