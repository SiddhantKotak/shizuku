# Shizuku — Project Memory for Claude

> Pokémon-influenced social study platform. Slice 1 ("Cozy Slice") is the first
> deployable product: upload PDF → pet companion explains it via RAG → study in
> a single static pixel-art room with Pomodoro + quests + streak + evolving pet.

## Hard rules (never violate)

- **NO Supabase, NO Next.js, NO Express, NO Prisma** — explicitly rejected by
  user. Stack is Vite + React + TanStack + Zustand + Phaser 3 (frontend),
  Fastify 5 + Drizzle + Postgres + pgvector + custom JWT (`jose`) + Arctic OAuth
  (backend), OpenAI gpt-4o + text-embedding-3-small (AI), Cloudflare R2
  (storage), Resend (email), Vercel + Railway + Neon (deploy).
- **NO video module.** Image/manga generation is Slice 1.5+; audio gen is
  Slice 2.
- **`document.is_private` defaults to `true`** at every layer (schema + API
  enforcement). Never expose raw R2 URLs — always 15-min signed URLs,
  ownership-checked.
- **`packages/types` is the single source of truth** for shared interfaces. No
  duplicate type definitions across apps.
- **All env vars validated by Zod** in `packages/config`. No inline
  `process.env` access. Loaded once, cached, lazy-Proxy on the `env` export.
- **Strict TypeScript everywhere**: `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noUnusedLocals`, `verbatimModuleSyntax`. ESM
  imports use `.js` extensions in TS source.
- **No raw SQL except for vector search and HNSW index DDL.** All other queries
  go through Drizzle.
- **All external input validated by Zod** before use (request bodies, OAuth
  callbacks, env). Routes use `FastifyPluginAsyncZod` to type `req.body`.
- **Status codes via `http-status-codes`** (`StatusCodes.UNAUTHORIZED` etc.) —
  no raw numbers.
- **Every Fastify route MUST include OpenAPI metadata** in its `schema`: `tags`
  (at least one), `summary` (one-liner), `description` (multi-line — cover happy
  path, error codes, rate limits), and `security: [{ bearer: [] }]` for authed
  routes. Swagger UI at `GET /docs` is part of the deliverable, not an
  afterthought. Routes shipped without metadata get reverted in code review.
- **The user builds UI components themselves in Antigravity.** Plan provides
  routes/state/types/hooks/animation primitives — NOT JSX implementations. Don't
  pull in shadcn/ui, Mantine, or AI-generated components.

## Stack snapshot (locked)

| Layer       | Choice                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo    | Turborepo + pnpm 10 workspaces (Node 22 LTS)                                                                                                              |
| Frontend    | Vite 5 + React 18 + TanStack Router v1 + TanStack Query v5 + Zustand 4 + Tailwind 3.4 + GSAP (`@gsap/react`) + Phaser 3 + PDF.js                          |
| API         | Fastify 5 + `fastify-type-provider-zod` + Drizzle 0.38 + Postgres 16 + pgvector (HNSW) + custom JWT (`jose`) + Arctic OAuth (Google + Discord) + argon2id |
| AI          | OpenAI gpt-4o (chat, streaming SSE) + text-embedding-3-small (1536-dim, batch 100)                                                                        |
| Storage     | Cloudflare R2 (`@aws-sdk/client-s3`), 15-min signed URLs only                                                                                             |
| Email       | Resend (transactional, OTP-based verification + password reset)                                                                                           |
| Tests       | Vitest + light-my-request (`app.inject()`) — sequential, ~44s for full auth suite                                                                         |
| Lint/format | ESLint 9 flat config (typescript-eslint strict) + Prettier 3                                                                                              |
| Deploy      | Vercel (web SPA) + Railway (Fastify API) + Neon (Postgres+pgvector) + R2 + Resend + Sentry                                                                |

## Monorepo layout

```
shizuku/
├─ apps/
│  ├─ api/        Fastify 5 service (port 3001). Plugins: db, auth, security
│  │              (cors+helmet+cookie+sensible), errorHandler, requestId.
│  │              Routes: /v1/auth/{signup,login,refresh,logout},
│  │              /v1/healthz, /v1/readyz. Tests in apps/api/tests/.
│  └─ web/        Vite + React SPA (port 5173). TanStack Router file-based
│                 routes under apps/web/src/routes/. Generated routeTree.gen.ts
│                 is overwritten on every dev/build by router-plugin.
├─ packages/
│  ├─ config/     Zod env schema (single source of truth)
│  ├─ types/      Shared DTOs, SSE event unions, error codes
│  └─ db/         Drizzle schema (17 tables) + migrations + migrate.ts
│                 (creates pgvector + citext + pgcrypto + HNSW index)
├─ infra/postgres/init.sql   pgvector + citext + pgcrypto extensions
├─ docker-compose.dev.yml    Local Postgres+pgvector (only used if NOT on Neon)
├─ scripts/art/              AI art pipeline (SDXL + LoRA + Aseprite)
└─ design/                   Shared 48-color palette (.gpl)
```

## Common commands

```bash
pnpm install              # all workspaces
pnpm dev                  # api + web in parallel (turbo)
pnpm typecheck            # all 5 workspaces
pnpm lint                 # ESLint flat config
pnpm format               # Prettier write
pnpm test                 # turbo test (api auth suite)
pnpm db:generate          # generate Drizzle migration after schema changes
pnpm db:migrate           # apply pending migrations + create HNSW index
pnpm db:seed              # seed quest catalog (12 templates)
pnpm db:studio            # open Drizzle Studio
```

The user's `.env` is gitignored. `.env.example` documents every required key.

## Auth model — security-critical, do not break

- **Access token**: JWT HS256 via `jose`, 15-min TTL, returned in JSON body.
  Payload includes `ver: tokenVersion` for global revoke (bump = all sessions
  invalid). Verified in `plugins/auth.ts` `verifyJWT` preHandler (also checks
  user still exists + tokenVersion matches).
- **Refresh token**: opaque `crypto.randomBytes(48).toString('base64url')`,
  sha256-hashed at rest. Cookie: `rft`, httpOnly, SameSite=Strict, Secure in
  prod, path=`/v1/auth`, 30-day max-age.
- **Rotation**: every `/v1/auth/refresh` issues a new opaque token in same
  family (`parentId` chains them). Concurrent refresh prevented via
  `SELECT ... FOR UPDATE`.
- **Theft detection** (RFC 6749 §10.4): if a token's `rotatedAt` is set AND
  > 10s elapsed (grace window for legit network retries), the entire
  > `tokenFamily` is revoked with `revokedReason='family_compromised'`. **The
  > family-revoke UPDATE MUST happen in a separate transaction from the FOR
  > UPDATE row read** — throwing inside the read transaction rolls back the
  > revoke and the attack succeeds. See
  > `apps/api/src/services/auth/refreshTokens.ts`.
- **OTP verification + password reset**: 6-digit numeric codes (Linear/Vercel
  pattern). sha256-hashed, 10-min TTL, 3-attempts-then-invalidated via
  `attempts` column on `email_verifications` and `password_reset_tokens`.
  Implementation lands week 3 of the sprint.
- **OAuth**: Arctic 3.x for Google + Discord. State + PKCE in 10-min httpOnly
  cookies during the redirect flow. Implementation lands week 3.

## RAG pipeline (week 5+)

Synchronous indexing in the upload route — no Redis/BullMQ in Slice 1. Pipeline:
`pdf2json` → 500-token chunks (paragraph-then-sentence split, 50-token overlap)
→ OpenAI embeddings (batch 100) → INSERT into `document_chunks` (vector(1536)) →
HNSW index search via `<=>` cosine distance, `SET LOCAL hnsw.ef_search=40` per
query, score threshold 0.25.

## Known gotchas / dev workarounds

- **`DB_DNS_SERVERS` env-gated dev DNS workaround.** When this env var is set
  (comma-separated DNS server IPs), `packages/db/src/client.ts` uses a custom
  `Resolver` pinned to those servers to look up the DB hostname AND injects the
  resolved IPv4 as `host` while keeping the hostname as TLS SNI servername. When
  unset (production default), the system resolver is used normally — so prod
  stays compatible with private DNS (PrivateLink, Tailscale, internal CoreDNS).
  Set in dev only when:
  - `systemd-resolved` REFUSEs the AWS/Neon hostname (we hit this once)
  - WSL2 has IPv6 advertised but unroutable (Node "happy eyeballs" hangs)
  - Corporate DNS blocks AWS edge zones Local `.env` has
    `DB_DNS_SERVERS=1.1.1.1,8.8.8.8`. Production deployments should leave this
    unset.
- **`pnpm db:migrate`** uses `DATABASE_DIRECT_URL` (non-pooled) for DDL. The
  migrate script also auto-creates the HNSW vector index after Drizzle's
  generated migrations apply, because drizzle-kit's HNSW parameter syntax varies
  by version.
- **TanStack Router** generates `apps/web/src/routeTree.gen.ts` only when
  `vite dev`/`vite build` runs. First-run-only manual stub gets overwritten; the
  file has `// @ts-nocheck` so it never breaks typecheck.
- **Tests are sequential**
  (`vitest sequence: { concurrent: false }, pool: 'forks', singleFork: true`).
  Auth tests share refresh-token state in the DB and would race under
  parallelism. Time-tampering for the theft test uses
  `UPDATE refresh_tokens SET rotated_at = NOW() - INTERVAL '11 seconds'` rather
  than `vi.useFakeTimers()` (avoids postgres-js connection-pool weirdness).
- **argon2 native binding**: declared in
  `package.json#pnpm.onlyBuiltDependencies` alongside `esbuild` and `msw` so
  build scripts run on install.

## Slice 1 status (8-week sprint)

|  Wk | Backend                                                                                                                          | Frontend                                                                                                         |
| --: | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
|   1 | ✅ Bootstrap, packages, schema (17 tables), Fastify skeleton, auth core (signup/login/refresh/logout, theft detection, 15 tests) | ✅ Vite scaffold, TanStack Router, Zustand auth store, API client w/ refresh-on-401, route placeholders          |
|   2 | ⏳ —                                                                                                                             | ⏳ —                                                                                                             |
|   3 | OAuth (Arctic Google + Discord), OTP email verification + password reset (Resend), rate-limit plugin, /users/me + /pets routes   | Phaser foundation: BootScene + RoomScene + movement (WASD + EasyStar click) + pet follower + React-Phaser bridge |
|   4 | Documents R2 + signed URLs, multipart upload, schemas                                                                            | Pet system + RoomHUD + tutorial overlay                                                                          |
|   5 | RAG ingest pipeline (pdf2json + chunker + OpenAI embed batching)                                                                 | Reader (PDF.js + Virtuoso virtualized + highlights + bookmarks + TOC)                                            |
|   6 | RAG chat SSE + cost guards (100 chats/day, 5 PDFs/user lifetime)                                                                 | Chat UI w/ SSE streaming + UsageMeter                                                                            |
|   7 | Pomodoro/quests/stats/streak routes, daily_stats hooks                                                                           | Pomodoro UI, quests panel, stats dashboard, evolution cutscene                                                   |
|   8 | Hardening, Sentry, deploy to Railway/Neon prod                                                                                   | Lighthouse pass, Playwright E2E, Vercel deploy                                                                   |

## Cozy/ambient layer (locked add)

3-4 days extra: lofi loop + volume slider + 3-5 track switcher + time-of-day
visual sync (room tilemap tint shifts warm/cool/indigo per real-world hour) +
focus mode toggle + ambient particles + soft chime on level-up. Infrastructure
scaffolded in `apps/web/src/stores/ambientStore.ts`,
`apps/web/src/lib/utils/sound.ts`, `apps/web/src/hooks/useTimeOfDay.ts`. UI
components are user's Antigravity work.

## Pet design (Slice 1)

3 species × 3 evolution stages = 9 sprite atlases. Pixel art, 32×32 per frame,
4-row × 4-col walk atlas, 4-frame walk @ 8 FPS, idle @ 4 FPS. Generated via
SDXL + nerijs/pixel-art-xl LoRA + ControlNet (cross-stage consistency), cleaned
in Aseprite. Plan B if pipeline doesn't land week 2: commission ~$300-500.

- **Ember** (fire fox): bold/encouraging, fire/spark metaphors. Stages: Sprout /
  Spark / Inferno.
- **Ripple** (water otter): calm/reflective, river metaphors. Stages: Drop /
  Stream / Tide.
- **Quill** (forest owl): scholarly/dry-witty. Stages: Page / Chapter / Tome.

Personality is fixed per species (hardcoded system prompts in
`services/pets/personalities.ts`). NO mood system. XP from pages-read (debounced
≥30s on page) + chats with pet (length>30 chars + contains '?').

## Reference

- **Full design + sprint plan**:
  `~/.claude/plans/lets-plan-everthing-carefully-robust-moon.md`
- **Original feature list**: `2007069a-...PDF` (gitignored, kept locally for
  reference)
- **Original blueprint script**: `file.txt` (gitignored, generates a different
  technical blueprint PDF; superseded by the locked plan above)

## What NOT to do

- Don't add auth providers (Auth.js, Lucia, Supabase Auth, Clerk) — custom JWT
  is the explicit choice.
- Don't add an ORM other than Drizzle.
- Don't add Express, NestJS, or any non-Fastify framework on the API.
- Don't add Next.js or Remix on the frontend — Vite SPA only.
- Don't introduce a UI component library. The user writes JSX themselves.
- Don't commit / `git init` without explicit user request.
- Don't add Redis or BullMQ in Slice 1. RAG indexing runs synchronously inside
  the upload route's SSE stream. BullMQ enters in Slice 2 with audio gen.
- Don't downgrade strictness in tsconfig or eslint.config.js.
- Don't add tests with `vi.useFakeTimers()` against postgres-js — the connection
  pool's idle-timeout interactions get weird. Tamper time via SQL UPDATE.
