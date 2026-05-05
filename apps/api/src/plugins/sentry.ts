import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

/**
 * Server-side Sentry — placeholder until deploy.
 *
 * Why not wired today: `@sentry/node` pulls in `@opentelemetry/api` as a
 * peer dependency, which makes pnpm install Drizzle ORM twice with
 * different peer-resolution contexts. That breaks TypeScript's identity
 * check on the `SQL<unknown>` symbol — the same value flows through two
 * declarations of the same type and tsc can't unify them.
 *
 * The right fix lands when we deploy: wire @sentry/node directly inside
 * the Railway-deployed image where the dep graph is frozen, OR switch to
 * the lower-level `@sentry/core` Hub API once Slice 1 is shipping.
 *
 * Until then, frontend Sentry (apps/web/src/lib/analytics/sentry.ts)
 * captures any user-visible error. Server-side errors are logged to Pino
 * with structured request context — readable from Railway logs.
 *
 * This plugin still registers so `app.ts` doesn't need to know about the
 * deferral. It's a no-op.
 */
export default fp(async (app: FastifyInstance) => {
  if (process.env['SENTRY_DSN']) {
    app.log.warn(
      'sentry: SENTRY_DSN is set but server-side Sentry is not wired (peer-dep conflict; see plugins/sentry.ts). Pino logs only for now.',
    );
  }
});
