import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { env } from '@shizuku/config';
import type { FastifyInstance } from 'fastify';

/**
 * OpenAPI 3 spec generation + Swagger UI.
 *
 * Registered EARLY in app.ts (before routes) so it can intercept route
 * registration and harvest each route's `schema` metadata. The
 * `jsonSchemaTransform` from fastify-type-provider-zod converts our Zod
 * request/response schemas into OpenAPI 3 JSON Schema automatically — every
 * route that already has `schema: { body: someZodSchema }` gets typed
 * request docs for free.
 *
 * Hard rule (CLAUDE.md): every new route MUST include `tags`, `summary`, and
 * `description` in its schema option. The OpenAPI spec is part of the
 * deliverable, not an afterthought.
 *
 * UI:
 *   - GET /docs       → Swagger UI (interactive)
 *   - GET /docs/json  → raw OpenAPI 3 JSON
 *
 * Production posture (week 8): we'll keep the UI accessible but require an
 * env-gated header to expose the JSON spec, OR simply move the UI behind a
 * basic-auth gate. For Slice 1 dev / closed beta, fully open is fine.
 */
export default fp(async (app: FastifyInstance) => {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Shizuku API',
        description: 'Pokémon-influenced social study platform — Slice 1 backend.',
        version: '0.1.0',
      },
      servers: [
        {
          url: `http://localhost:${env.API_PORT}`,
          description: 'Local development',
        },
      ],
      components: {
        securitySchemes: {
          bearer: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'Access token returned by /v1/auth/{signup,login,refresh}. 15-minute TTL — refresh via the httpOnly `rft` cookie before expiry.',
          },
        },
      },
      tags: [
        { name: 'auth', description: 'Sessions, OAuth, password + email verification flows.' },
        { name: 'users', description: 'Authenticated user profile (/users/me).' },
        { name: 'pets', description: 'Pet companion lifecycle — create, rename, evolve.' },
        {
          name: 'documents',
          description: 'PDF upload + indexing + RAG chat with the pet companion.',
        },
        {
          name: 'pomodoro',
          description: 'Pomodoro focus sessions — start, complete, list.',
        },
        {
          name: 'quests',
          description: 'Daily quests — lazy-assigned 3 per day, claim rewards.',
        },
        {
          name: 'stats',
          description: 'Per-user-per-day study aggregates (today / week / all-time).',
        },
        { name: 'streak', description: 'Consecutive-day study streak counter.' },
        { name: 'health', description: 'Liveness + readiness probes.' },
      ],
    },
    transform: jsonSchemaTransform,
    hideUntagged: false,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
      tryItOutEnabled: true,
    },
    staticCSP: true,
  });
});
