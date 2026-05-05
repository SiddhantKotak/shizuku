import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from '@shizuku/config';
import { LOG_REDACT_CENSOR, LOG_REDACT_PATHS } from './lib/logRedaction.js';
import authPlugin from './plugins/auth.js';
import costGuardPlugin from './plugins/costGuard.js';
import dbPlugin from './plugins/db.js';
import emailPlugin from './plugins/email.js';
import errorHandlerPlugin from './plugins/errorHandler.js';
import multipartPlugin from './plugins/multipart.js';
import rateLimitPlugin from './plugins/rateLimit.js';
import requestIdPlugin, { generateRequestId } from './plugins/requestId.js';
import securityPlugin from './plugins/security.js';
import sentryPlugin from './plugins/sentry.js';
import swaggerPlugin from './plugins/swagger.js';
import authRoutes from './routes/auth/index.js';
import documentRoutes from './routes/documents/index.js';
import healthRoutes from './routes/health.js';
import petRoutes from './routes/pets/index.js';
import pomodoroRoutes from './routes/pomodoro/index.js';
import questsRoutes from './routes/quests/index.js';
import statsRoutes from './routes/stats/index.js';
import streakRoutes from './routes/streak/index.js';
import usageRoutes from './routes/usage/index.js';
import userRoutes from './routes/users/index.js';
import type { EmailService } from './services/email/types.js';

export interface BuildAppOptions {
  /** Override Pino logger options. Tests pass `false` for silence. */
  logger?: boolean | object;
  /** Inject an email service (tests use a CapturingEmailService). Defaults to env-derived. */
  email?: EmailService;
  /**
   * Disable @fastify/rate-limit. Tests pass `false` because all calls share
   * `127.0.0.1`, which would saturate per-IP buckets across test cases. The
   * 3-strike OTP cap and other domain-level limits still run.
   */
  rateLimit?: boolean;
}

/**
 * Build a fully-configured Fastify instance. Used by:
 *  - server.ts (production / dev entry)
 *  - tests (light-my-request via app.inject())
 *
 * Returning a fresh instance means tests are isolated; production calls .listen().
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const baseLogger = {
    level: env.LOG_LEVEL,
    redact: { paths: LOG_REDACT_PATHS, censor: LOG_REDACT_CENSOR, remove: false },
  };
  const app = Fastify({
    logger:
      opts.logger ??
      (env.NODE_ENV === 'production'
        ? baseLogger
        : {
            ...baseLogger,
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
            },
          }),
    genReqId: generateRequestId,
    disableRequestLogging: false,
    bodyLimit: env.COST_LIMIT_PDF_MAX_BYTES + 1024, // multipart adds overhead; +1KB headroom
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  // Zod-compatible validator + serializer for all routes
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Plugins (order matters)
  await app.register(requestIdPlugin);
  await app.register(securityPlugin);
  // Sentry attaches `onRequest` + `onError` hooks; register early so it sees
  // every request. No-op when SENTRY_DSN is unset (dev/CI default).
  await app.register(sentryPlugin);
  // Swagger registers BEFORE routes so it captures every route's schema metadata.
  await app.register(swaggerPlugin);
  if (opts.rateLimit !== false) {
    await app.register(rateLimitPlugin);
  }
  await app.register(errorHandlerPlugin); // last so it catches everything
  await app.register(dbPlugin);
  await app.register(authPlugin);
  await app.register(costGuardPlugin);
  await app.register(multipartPlugin);
  await app.register(emailPlugin, opts.email ? { service: opts.email } : {});

  // Routes — versioned under /v1
  await app.register(
    async (v1) => {
      await v1.register(healthRoutes);
      await v1.register(authRoutes, { prefix: '/auth' });
      await v1.register(userRoutes, { prefix: '/users' });
      await v1.register(petRoutes, { prefix: '/pets' });
      await v1.register(documentRoutes, { prefix: '/documents' });
      await v1.register(pomodoroRoutes, { prefix: '/pomodoro' });
      await v1.register(questsRoutes, { prefix: '/quests' });
      await v1.register(statsRoutes, { prefix: '/stats' });
      await v1.register(streakRoutes, { prefix: '/streak' });
      await v1.register(usageRoutes, { prefix: '/usage' });
    },
    { prefix: '/v1' },
  );

  return app;
}
