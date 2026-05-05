import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Global rate limiter. Per-route overrides live on each route's `config.rateLimit`.
 *
 * Default key: IP. For authenticated routes that should be per-user, the route
 * sets `keyGenerator: req => req.user?.id ?? req.ip`. For email-based routes
 * (forgot-password, otp-request) that should rate-limit by submitted email,
 * the route sets `keyGenerator: req => (req.body as {email?:string})?.email ?? req.ip`.
 */
export default fp(async (app: FastifyInstance) => {
  await app.register(rateLimit, {
    global: true,
    max: 120, // baseline per-IP per-minute; routes can tighten
    timeWindow: '1 minute',
    cache: 10_000,
    skipOnError: true, // never accidentally 500 because the limiter itself failed
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
    errorResponseBuilder: (_req, context) => ({
      error: {
        code: 'rate_limited',
        message: `Too many requests. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
        details: { limit: context.max, retryAfterSeconds: Math.ceil(context.ttl / 1000) },
      },
    }),
  });
});

/** Helper: per-user-or-IP key generator for use in route configs. */
export const userOrIpKey = (req: FastifyRequest): string => req.user?.id ?? req.ip;

/** Helper: by-email-from-body key generator (falls back to IP). */
export const emailBodyKey = (req: FastifyRequest): string => {
  const body = req.body as { email?: unknown } | undefined;
  if (body && typeof body.email === 'string') {
    return `email:${body.email.toLowerCase()}`;
  }
  return req.ip;
};
