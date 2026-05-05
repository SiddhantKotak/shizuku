import { StatusCodes } from 'http-status-codes';
import { userQuestIdParamSchema } from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import { assignTodayIfNeeded } from '../../services/quests/assign.js';
import { claimQuest } from '../../services/quests/progress.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const questsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/today',
    {
      preHandler: [app.verifyJWT],
      schema: {
        tags: ['quests'],
        summary: "List today's quests for the user (lazy-assigns on first call)",
        description: [
          "Returns the 3 daily quests for the current UTC day. On the first call of the day, lazy-assigns from the catalog (deterministic per (user, day) — same 3 quests on refresh).",
          '',
          'Each item: `{ userQuestId, questCode, title, metric, target, progress, status, completedAt, claimedAt, inkReward, xpReward, assignedDate }`.',
          '',
          'Quests progress automatically as the user reads pages, completes pomodoros, asks the pet questions, or accumulates study minutes — no manual update needed.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const today = await assignTodayIfNeeded(app.db, userId);
      return { data: today };
    },
  );

  app.post(
    '/:id/claim',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: userQuestIdParamSchema,
        tags: ['quests'],
        summary: 'Claim a completed quest',
        description: [
          'Atomically: stamps `claimed_at` on the quest, adds `ink_reward` to `users.ink`, adds `xp_reward` to `users.xp`. Returns `{ inkAwarded, xpAwarded }`.',
          '',
          '**Errors:** 404 if the quest is not yours. 409 `conflict` if the quest is not yet completed or has already been claimed.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;
      const result = await claimQuest(app.db, userId, req.params.id);
      if (!result) {
        throw httpError.conflict(
          'conflict',
          'Quest is not claimable (not yours, not completed, or already claimed).',
        );
      }
      reply.code(StatusCodes.OK);
      return { data: result };
    },
  );
};

export default questsRoutes;
