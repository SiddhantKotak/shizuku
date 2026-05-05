# apps/api — Project Memory

Fastify 5 + Drizzle + Postgres+pgvector + custom JWT auth.

## Architecture

- `app.ts` — `buildApp()` factory. Plugin order matters: requestId → security
  bundle (cors+helmet+cookie+sensible) → errorHandler (last so it catches all) →
  db → auth. Routes register under `/v1` prefix.
- `server.ts` — listen entry; SIGINT/SIGTERM trigger graceful `app.close()`.
- `plugins/` — Fastify plugins. All wrapped with `fastify-plugin` (`fp(...)`) so
  they decorate the parent instance, not just the inner scope.
- `routes/` — `FastifyPluginAsyncZod` async functions. The Zod type provider
  flows `req.body` types from the route's `schema.body` Zod schema.
- `services/` — business logic. **No Fastify imports here.** Services are pure
  functions taking `Db` + inputs and returning data or throwing `HttpError`.
- `lib/` — small utilities (id, time, errors). No business logic.

## Error handling

Throw `HttpError` from services / routes. The global handler in
`plugins/errorHandler.ts` converts to `{ error: { code, message, details? } }`.

```ts
import { httpError } from '../lib/errors.js';
throw httpError.conflict('email_taken', 'Email is already in use');
throw httpError.unauthorized('invalid_token', 'Refresh token revoked');
```

Anything that ISN'T an `HttpError` → 500 with generic `{code: 'internal'}`, real
message hidden, full error logged to Pino.

## Auth — critical patterns to preserve

1. **Refresh-token rotation must split into two transactions** when reuse is
   detected. Throwing inside the FOR UPDATE row-read transaction rolls back the
   family-revoke UPDATE → attack succeeds. See `services/auth/refreshTokens.ts`.
2. **`tokenVersion` on `users`** is the global-revoke knob. Bump it on password
   reset / account compromise. `verifyJWT` checks the JWT's `ver` claim against
   the live `users.tokenVersion`.
3. **Cookies are scoped to `/v1/auth`** so they never leak to data routes.
4. **Login rate-limit** is enforced per-IP+per-email at 5/15min. Always show
   `invalid_credentials` (never `email_not_found`) to prevent enumeration.

## Adding a route

1. Define request/response schemas in `@shizuku/types`.
2. Create `routes/<resource>/<action>.ts` exporting a `FastifyPluginAsyncZod`.
3. Use the schema option with **all** of:

   ```ts
   app.post(
     '/path',
     {
       preHandler: [app.verifyJWT], // if authed
       schema: {
         body: someZodSchema, // if there's a body
         querystring: someZodSchema, // if there are query params
         tags: ['users'], // mandatory
         summary: 'One-line summary', // mandatory
         description: 'Multi-line — happy path + error codes + rate limits',
         security: [{ bearer: [] }], // mandatory for authed routes
       },
     },
     async (req, reply) => {
       /* handler */
     },
   );
   ```

   `req.body`/`req.query` are automatically typed from the Zod schemas via
   `fastify-type-provider-zod`. `tags + summary + description` are NOT optional
   — they appear in Swagger UI at `GET /docs` and routes without them get
   rejected at code review.

4. Register in `routes/<resource>/index.ts` (also `FastifyPluginAsyncZod`).
5. Mount in `app.ts` under `/v1` with appropriate prefix.
6. Add tests in `tests/<resource>.test.ts` using `app.inject()`.
7. Verify the route shows up in `GET /docs` UI with the expected tag.

## Tests

- `tests/setup.ts` loads `.env`, sets DNS ipv4first.
- `tests/helpers/buildTestApp.ts` returns a silent-logger Fastify instance.
- `tests/helpers/uniqueEmail.ts` — every test makes its own `@shizuku.test`
  email so runs don't collide. `cleanupTestUsers()` in `afterAll`.
- Run sequentially (`pool: forks, singleFork: true`) — auth tests mutate
  refresh-token state, parallel runs would race.
- Time-tamper via SQL `UPDATE rotated_at = NOW() - INTERVAL '11s'`, never
  `vi.useFakeTimers()` (postgres-js pool gets weird).

## OpenAI usage (week 5+)

- One client lives in `services/ai/openai.ts` (to be created week 5).
- Embedding: batch=100, retry on 429/5xx with exponential backoff (1/2/4/8/16s,
  5 attempts max → mark document `index_status='failed'`).
- Chat: streaming via `openai.chat.completions.create({stream:true})`, tokens
  emitted as `event: token data: {content}` SSE events.
- Cost guards: `request.enforceCost('chat'|'pdf')` preHandler reads daily
  counters from `cost_counters`. Increments AFTER successful response, not
  before — failed requests don't burn quota.
