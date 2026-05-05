import fp from 'fastify-plugin';
import { createDb, type Db } from '@shizuku/db';
import { env } from '@shizuku/config';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

/**
 * Decorates the Fastify instance with a Drizzle client backed by postgres-js.
 * The pool is closed on `app.close()` (Fastify lifecycle hook).
 */
export default fp(async (app: FastifyInstance) => {
  const { db, close } = await createDb({
    url: env.DATABASE_URL,
    logger: env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace',
  });
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await close();
  });
});
