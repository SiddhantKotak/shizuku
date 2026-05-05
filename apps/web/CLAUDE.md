# apps/web — Project Memory

Vite + React 18 + TanStack Router + Zustand + Tailwind + GSAP + Phaser 3 +
PDF.js.

## Architecture

- `main.tsx` → `app.tsx` (providers wrap order: QueryClient → RouterProvider).
  authStore.bootstrap() runs once on mount to swap a refresh cookie for an
  access token (silent re-auth on cold start).
- `router.ts` — single `createRouter()` from generated `routeTree.gen.ts`.
  Module augmentation registers `typeof router` so all route paths are typed.
- `routes/` — file-based via `@tanstack/router-plugin/vite`. Pathless layouts
  `_public` (auth pages, redirects authed users away) and `_app` (app pages,
  redirects unauthed users to `/login`).
- `stores/` — Zustand. `createStore` helper applies devtools + optional
  `persist`. Auth `accessToken` is in-memory only (refresh cookie is the source
  of truth across reloads).
- `lib/api/client.ts` — fetch wrapper with refresh-on-401 (concurrent refresh
  attempts coalesced via a shared in-flight promise) and 429 handling.
- `lib/sse/sseClient.ts` (week 6) — fetch+ReadableStream-based SSE because
  EventSource can't send POST bodies or auth headers.
- `lib/phaser/` (week 3) — Phaser 3 scenes + systems + the typed `mitt` bridge
  (the only sanctioned React↔Phaser channel).
- `lib/gsap/presets.ts` (week 4+) — animation primitives. Always use `useGSAP`
  from `@gsap/react`, never raw `gsap.to` (strict-mode safety). ESLint rule will
  block raw `gsap.to` outside `lib/gsap/`.

## State boundaries

| Lives in             | What                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TanStack Query       | server state — user, pet, streak, quests, stats, PDFs, highlights, chat history, usage limits                                                                                |
| Zustand              | client state — accessToken (in-memory), Pomodoro phase (persisted), reader zoom (persisted), modal/toast/sidebar UI, onboarding step (persisted), chat draft + stream buffer |
| Router params/search | shareable state — current PDF id, current page, focused highlight                                                                                                            |
| RHF                  | form fields — never lift to Zustand                                                                                                                                          |

## UI components — user-built in Antigravity

Plan provides component contracts (props/types), state hooks, animation
primitives. The user writes the JSX/Tailwind. **Don't add shadcn/ui, Mantine,
Chakra, or AI-generated components.** Custom hand-crafted UI is the explicit
choice.

## Asset pipeline

- `assets/phaser/tilesets/room.json` (Tiled JSON export from LimeZu Modern
  Interiors) — week 2.
- `assets/phaser/sprites/avatar/preset-0X.png` (4×4 atlases, 32×32 per frame) —
  week 2-3 from Mana Seed Character Base + recolors.
- `assets/phaser/sprites/pets/<species>-stage<n>.png` (9 atlases) — generated
  via `scripts/art/` SDXL pipeline, hand-cleaned in Aseprite.
- `assets/audio/music/*.ogg` — 5 lofi tracks (CC-BY).
- `assets/audio/ambience/*.ogg` — rain/fireplace/birds (Kenney CC0).

## Cozy ambient layer

`stores/ambientStore.ts` + `lib/utils/sound.ts` (audio manager with crossfading
channels) + `hooks/useTimeOfDay.ts` (clock-based period + tint constants for
Phaser TOD system) are scaffolded. UI (MusicPicker vinyl-record control,
FocusModeToggle dim overlay, RoomTimeOfDay tint applier in Phaser) is user's
Antigravity work.
