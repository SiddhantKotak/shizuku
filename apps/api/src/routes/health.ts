import { sql } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import type { FastifyInstance } from 'fastify';

/**
 * Health endpoints.
 * - /v1/healthz — liveness; never touches the DB. Should always return 200.
 * - /v1/readyz  — readiness; checks DB connectivity. Returns 503 if DB is down.
 */
export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/healthz',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness probe',
        description:
          'Returns 200 unconditionally — does not touch the DB or any external service. Used by Railway/Kubernetes to decide whether to restart the container.',
      },
    },
    async () => ({
      data: { status: 'ok', service: 'shizuku-api', uptime: process.uptime() },
    }),
  );

  app.get(
    '/readyz',
    {
      schema: {
        tags: ['health'],
        summary: 'Readiness probe',
        description:
          'Returns 200 if the API can talk to the DB right now (executes `SELECT 1`). Returns 503 with `{error.code: service_unavailable}` if the DB is unreachable. Used by load balancers to decide whether to route traffic.',
      },
    },
    async (_req, reply) => {
      try {
        // 1ms-class round trip; fails fast if connection pool is broken
        await app.db.execute(sql`SELECT 1`);
        return { data: { status: 'ready' } };
      } catch (err) {
        app.log.error({ err }, 'readyz_db_check_failed');
        reply.code(StatusCodes.SERVICE_UNAVAILABLE);
        return {
          error: {
            code: 'service_unavailable',
            message: 'Database not reachable',
          },
        };
      }
    },
  );
}
