import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import { env } from '@shizuku/config';
import type { FastifyInstance } from 'fastify';

/**
 * Bundle of security/utility plugins registered together so app.ts stays clean.
 * - CORS: only the configured WEB_ORIGIN is allowed (credentials enabled for cookies).
 * - Helmet: standard security headers.
 * - Cookie: signed cookies for OAuth state/PKCE + the refresh-token cookie.
 * - Sensible: provides reply.unauthorized(), reply.notFound(), etc.
 */
export default fp(async (app: FastifyInstance) => {
  await app.register(cors, {
    origin: [env.WEB_ORIGIN],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // SPA frontend handles its own CSP
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cookie, {
    secret: env.JWT_REFRESH_COOKIE_SECRET,
    parseOptions: {},
  });

  await app.register(sensible);
});
