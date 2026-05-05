import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

/**
 * Reads x-request-id from the incoming request if present (e.g. forwarded by
 * a load balancer); otherwise generates a UUID. Bound to the per-request logger
 * via Fastify's built-in genReqId option (set in app.ts).
 *
 * Echoes the id back via x-request-id response header so clients can correlate.
 */
export default fp(async (app: FastifyInstance) => {
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });
});

export function generateRequestId(req: { headers: Record<string, unknown> }): string {
  const incoming = req.headers['x-request-id'];
  if (typeof incoming === 'string' && incoming.length > 0 && incoming.length < 200) {
    return incoming;
  }
  return randomUUID();
}
