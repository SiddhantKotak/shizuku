import { requireUser } from '../../lib/requireUser.js';
import { readUsage } from '../../services/cost/counters.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const usageRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: [app.verifyJWT],
      schema: {
        tags: ['stats'],
        summary: 'Current cost-counter usage for the user',
        description: [
          'Returns `{ chats: { used, limit, resetAt }, pdfs: { used, limit } }`.',
          '',
          '`chats.resetAt` is the next UTC midnight; the SPA uses this to disable the chat input automatically when the limit is hit and re-enable it after rollover.',
          '',
          '`pdfs.used` is lifetime in Slice 1 — there is no resetAt.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const [chats, pdfs] = await Promise.all([
        readUsage(app.db, userId, 'chat'),
        readUsage(app.db, userId, 'pdf'),
      ]);
      return {
        data: {
          chats: {
            used: chats.used,
            limit: chats.limit,
            resetAt: nextUtcMidnightIso(),
          },
          pdfs: {
            used: pdfs.used,
            limit: pdfs.limit,
          },
        },
      };
    },
  );
};

function nextUtcMidnightIso(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

export default usageRoutes;
