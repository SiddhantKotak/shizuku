import { statsQuerySchema } from '@shizuku/types';
import { requireUser } from '../../lib/requireUser.js';
import { readStats } from '../../services/stats/aggregate.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const statsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: [app.verifyJWT],
      schema: {
        querystring: statsQuerySchema,
        tags: ['stats'],
        summary: 'Per-user-per-day study aggregates',
        description: [
          "Returns `daily_stats` rows for the requested range. Each row: `{ day (YYYY-MM-DD), minutes, pages, chats, pomodoros }`.",
          '',
          '`range`: today → 0-1 row; week → up to 7 rows (last 7 days inclusive); all → every day with a row (calendar heatmap).',
          '',
          'Aggregates are written by event hooks (pomodoro complete, chat complete, page-read debounce). No direct mutation API in Slice 1.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const rows = await readStats(app.db, userId, req.query.range);
      return { data: rows };
    },
  );
};

export default statsRoutes;
