# Shizuku — Slice 1 ("Cozy Slice")

> Pokémon-influenced social study platform. Slice 1 is the first deployable
> product: _upload your textbook, your pet companion explains it to you in your
> cozy room while you study with Pomodoro and quests._

## Stack

- **Frontend**: Vite + React 18 + TanStack Router/Query + Zustand + Tailwind +
  GSAP + Phaser 3 + PDF.js
- **API**: Fastify 5 + Drizzle ORM + Postgres 16 + pgvector + custom JWT
  (`jose`) + Arctic OAuth
- **AI**: OpenAI gpt-4o (chat) + text-embedding-3-small (embeddings)
- **Storage**: Cloudflare R2 (signed URLs)
- **Email**: Resend
- **Deploy**: Vercel (web) + Railway (api) + Neon (Postgres) + R2 + Sentry

## Layout

```
shizuku/
├─ apps/
│  ├─ web/          # Vite + React (deploy: Vercel)
│  └─ api/          # Fastify (deploy: Railway)
├─ packages/
│  ├─ config/       # Zod-validated env, single source of truth
│  ├─ types/        # Shared DTOs, SSE event unions
│  └─ db/           # Drizzle schema + migrations
├─ scripts/art/     # AI art pipeline (SDXL + LoRA + Aseprite)
├─ design/          # Shared palette (.gpl), style references
└─ docs/            # Runbook, deploy notes
```

## Getting started

### Prerequisites

- Node 22+ (`nvm use`)
- pnpm 10+ (`npm i -g pnpm@10`)
- Docker (for local Postgres + pgvector)

### Setup

```bash
pnpm install
cp .env.example .env   # fill in real secrets
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate
pnpm dev
```

API runs on http://localhost:3001, Web on http://localhost:5173.

### Common commands

```bash
pnpm dev              # all services in parallel
pnpm build            # production build
pnpm typecheck        # all packages
pnpm test             # all tests
pnpm db:generate      # generate a new Drizzle migration after schema changes
pnpm db:migrate       # apply pending migrations
pnpm db:studio        # open Drizzle Studio
```

## Slice 1 Plan

Full design + sprint plan:
`~/.claude/plans/lets-plan-everthing-carefully-robust-moon.md`

## License

All rights reserved (TBD before public launch).
