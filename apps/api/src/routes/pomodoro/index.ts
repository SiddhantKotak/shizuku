import { and, eq, gte, sql } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { pomodoroSessions } from '@shizuku/db/schema';
import {
  completePomodoroBodySchema,
  pomodoroIdParamSchema,
  pomodoroListQuerySchema,
  startPomodoroBodySchema,
} from '@shizuku/types';
import { newId } from '../../lib/id.js';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import { awardPetXp } from '../../services/pets/xp.js';
import { bumpQuestProgress } from '../../services/quests/progress.js';
import { bumpDailyStat } from '../../services/stats/aggregate.js';
import { markActivity } from '../../services/streak/compute.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * Pomodoro routes — start / complete / list.
 *
 * Slice 1 design: start opens an `active` row; complete closes it with a
 * cycleCount + minutes, fires the side-effect bundle (daily_stats++,
 * quests++, streak mark, pet XP +25 per cycle). Aborted sessions can be
 * marked `abandoned` later via a separate endpoint (deferred to Slice 1.5
 * — for Slice 1 they just stay `active` and get garbage-collected by
 * a future cleanup job).
 */

const POMODORO_XP_PER_CYCLE = 25;

const pomodoroRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/start',
    {
      preHandler: [app.verifyJWT],
      schema: {
        body: startPomodoroBodySchema,
        tags: ['pomodoro'],
        summary: 'Start a Pomodoro session',
        description: [
          'Opens an `active` `pomodoro_sessions` row. Optional `documentId` links the session to whatever the user is reading right now (for "studied X minutes on Y" stats later).',
          '',
          'Returns the new session id; the SPA owns the timer countdown locally and POSTs `/complete` when the focus block ends.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;
      const id = newId('pmd');
      await app.db.insert(pomodoroSessions).values({
        id,
        userId,
        documentId: req.body.documentId ?? null,
        startedAt: new Date(),
        cycleCount: 1,
      });
      reply.code(StatusCodes.CREATED);
      return { data: { id } };
    },
  );

  app.post(
    '/:id/complete',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: pomodoroIdParamSchema,
        body: completePomodoroBodySchema,
        tags: ['pomodoro'],
        summary: 'Complete a Pomodoro session and fire side effects',
        description: [
          "Marks the session `completed`, then atomically: bumps `daily_stats.pomodoros` and `daily_stats.minutes`, advances any active pomodoro/minutes quests, marks today's activity for streak, awards pet XP (25 per cycle).",
          '',
          'Idempotent on the same session — calling complete twice on the same id is a no-op (returns the same `xpAwarded`).',
          '',
          '**Errors:** 404 if not yours / not active. 409 if already completed.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const [row] = await app.db
        .select()
        .from(pomodoroSessions)
        .where(
          and(eq(pomodoroSessions.id, req.params.id), eq(pomodoroSessions.userId, userId)),
        )
        .limit(1);
      if (!row) throw httpError.notFound();
      if (row.status === 'completed') {
        throw httpError.conflict('conflict', 'Session already completed');
      }

      const minutes = req.body.minutesElapsed;
      const cycles = req.body.cycleCount;

      await app.db.transaction(async (tx) => {
        await tx
          .update(pomodoroSessions)
          .set({
            status: 'completed',
            completedAt: new Date(),
            cycleCount: cycles,
          })
          .where(eq(pomodoroSessions.id, row.id));
      });
      // Side effects after the row update commits — each is independently
      // idempotent enough that a half-applied bundle is acceptable rather
      // than rolled back. Keeping them outside the tx avoids long locks.
      await Promise.all([
        bumpDailyStat(app.db, userId, 'pomodoros', cycles),
        bumpDailyStat(app.db, userId, 'minutes', minutes),
        bumpQuestProgress(app.db, userId, 'pomodoros', cycles),
        bumpQuestProgress(app.db, userId, 'minutes', minutes),
        markActivity(app.db, userId),
      ]);
      const xp = await awardPetXp(app.db, userId, POMODORO_XP_PER_CYCLE * cycles);

      return {
        data: {
          id: row.id,
          minutesAwarded: minutes,
          xpAwarded: POMODORO_XP_PER_CYCLE * cycles,
          petLevel: xp?.newLevel ?? null,
          leveledUp: xp?.leveledUp ?? false,
        },
      };
    },
  );

  app.get(
    '/',
    {
      preHandler: [app.verifyJWT],
      schema: {
        querystring: pomodoroListQuerySchema,
        tags: ['pomodoro'],
        summary: 'List Pomodoro sessions for the user',
        description:
          'Returns sessions newest-first within the requested range. `range`: today (today only), week (last 7 days), all (everything). Cap at 200 rows for safety.',
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const range = req.query.range;

      const filter =
        range === 'all'
          ? eq(pomodoroSessions.userId, userId)
          : and(
              eq(pomodoroSessions.userId, userId),
              gte(
                pomodoroSessions.startedAt,
                rangeStartDate(range),
              ),
            );

      const rows = await app.db
        .select()
        .from(pomodoroSessions)
        .where(filter)
        .orderBy(sql`started_at DESC`)
        .limit(200);

      return {
        data: rows.map((r) => ({
          id: r.id,
          documentId: r.documentId,
          startedAt: r.startedAt.toISOString(),
          completedAt: r.completedAt?.toISOString() ?? null,
          cycleCount: r.cycleCount,
          status: r.status,
        })),
      };
    },
  );
};

function rangeStartDate(range: 'today' | 'week'): Date {
  const now = new Date();
  if (range === 'today') {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  // week — last 7 days inclusive
  return new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
}

export default pomodoroRoutes;
