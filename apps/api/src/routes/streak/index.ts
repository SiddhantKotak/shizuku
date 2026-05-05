import { requireUser } from '../../lib/requireUser.js';
import { readStreak } from '../../services/streak/compute.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const streakRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: [app.verifyJWT],
      schema: {
        tags: ['streak'],
        summary: 'Get the current study streak',
        description: [
          "Returns `{ count, lastDay }`. `count` = consecutive days with at least one logged activity (page-read, chat, pomodoro). `lastDay` = the latest UTC date the user logged activity, or null if never.",
          '',
          "If `lastDay` is yesterday (UTC) and the user hasn't done anything today, the streak is at risk; the SPA shows a soft reminder.",
          '',
          "If `lastDay` is older than yesterday, the streak is already broken — the next activity resets `count` to 1.",
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const info = await readStreak(app.db, userId);
      return { data: info };
    },
  );
};

export default streakRoutes;
