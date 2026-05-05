import fp from 'fastify-plugin';
import { checkLimit, type CostKind } from '../services/cost/counters.js';
import { requireUser } from '../lib/requireUser.js';
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * preHandler factory: returns a hook that 429s if the user has hit
     * their limit for `kind`. Caller increments AFTER success in the route
     * handler via `incrementUsage` from `services/cost/counters.ts`.
     *
     * Usage in a route:
     *   app.post('/chat', { preHandler: [app.verifyJWT, app.enforceCost('chat')] }, ...)
     */
    enforceCost: (kind: CostKind) => preHandlerAsyncHookHandler;
  }
}

export default fp(async (app: FastifyInstance) => {
  app.decorate('enforceCost', (kind: CostKind): preHandlerAsyncHookHandler => {
    return async (req: FastifyRequest) => {
      const user = requireUser(req);
      await checkLimit(app.db, user.id, kind);
    };
  });
});
