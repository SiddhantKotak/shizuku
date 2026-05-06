# Antigravity Build TODO — Shizuku

**Purpose.** I (Claude) ship the structural code: routes, hooks, stores,
mutations, types, animation primitives. **You** ship the JSX/Tailwind/visual
design in Antigravity. This document is the running list of every component,
asset, sprite, sound, and copy block you need to produce, with the exact file
path and contract it must satisfy.

This doc grows phase-by-phase. The latest section is at the bottom.

**Contract reading guide.** Each component entry has:

- **File** — exact path to create/edit (relative to repo root).
- **Props** — TypeScript interface; do not change the names — the route/wrapper
  passes these exact keys.
- **State** — which Zustand store / TanStack Query hook / RHF schema the
  component reads from.
- **Behavior** — happy path + error states + animation cues.
- **Assets needed** — sprites, audio, copy blocks, palette tokens.

If anything is unclear, reply with a question; do not invent props/state I
didn't list — the route relies on those exact names.

**Visual style anchor.** Pixel-art / Pokémon Gen 3 vibe. Soft outlines, palette
pulled from `design/palette.gpl` (48 colors, shared). Inter Variable for body
text, Pixelify Sans for display headings. GSAP for any DOM animation > 200ms.

---

## Global UI primitives (cross-cutting — build first)

These are reused everywhere. Build them once and import.

### `apps/web/src/components/ui-primitives/Button.tsx`

Variants: `primary | ghost | danger`. Sizes: `sm | md | lg`. States: hover,
focus, disabled, pending (with spinner). Pixel-edged corners (4px radius via
`rounded-cozy`). Press-down animation on click via `active:translate-y-0.5`.

### `apps/web/src/components/ui-primitives/Input.tsx`

Wraps `<input>` for RHF. Forwarded ref. Error variant when paired with
`aria-invalid`. Pixel border, soft inner shadow on focus.

### `apps/web/src/components/ui-primitives/Modal.tsx`

GSAP slide-up entry (`presets.slideUpModal` once `lib/gsap/presets.ts` lands).
ESC + overlay-click to close. Focus trap. Honor `prefers-reduced-motion`.

### `apps/web/src/components/ui-primitives/Toast.tsx` + `ToastHost.tsx`

Use `uiStore` (lands in P11+) for queue. 3-tier severity. Auto-dismiss 5s unless
severity=error. Sliding in from top-right with stack offset.

### `apps/web/src/components/ui-primitives/IconButton.tsx`

Square, `aria-label` required. Lucide React for the icon set; the 6 brand icons
(Ink coin, XP rune, streak flame, pomodoro ring, evolution arrow, level badge)
come from the SDXL pipeline (P14).

---

## Layout shells (build alongside the primitives)

These are the outermost wrappers that every authed/unauthed page lives inside.
Existing route files (`__root.tsx`, `_public.tsx`, `_app.tsx`) already do the
routing/guard logic — your job is to provide the visual chrome.

### Layout · RootShell (`apps/web/src/routes/__root.tsx`)

**Wraps every page.** Already mounts: TanStack QueryClient, Router devtools in
dev, an outer `<ErrorBoundary>` and a placeholder `<ModalRoot>`/`<ToastHost>`
slot. Your job:

- Replace the placeholder `<div>` shell with: a thin global header (no nav links
  — those live per-layout) showing Shizuku wordmark + ember icon, just so
  unauthenticated and authenticated pages share visual identity.
- Mount the real `<ToastHost>` and `<ModalRoot>` portals (see "UI primitives"
  above) so any descendant can fire a toast/modal via the uiStore.

### Layout · AuthLayout (`apps/web/src/routes/_public.tsx`)

**Wraps unauthenticated pages** — `/login`, `/signup`, `/forgot-password`,
`/reset-password`, `/oauth/callback`. Today renders just `<Outlet />`. Build the
cozy split-screen brand panel:

- Left half: gradient + pixel-art illustration (cozy room sketch) + the tagline
  "Your pet companion explains your books."
- Right half: a centered card (max-w-md) where each route renders its form.
- Mobile: collapse to single column, illustration becomes a small banner.

### Layout · AppLayout (`apps/web/src/routes/_app.tsx`)

**Wraps authenticated pages** — `/room`, `/onboarding`, `/library`,
`/reader/$pdfId`, `/quests`, `/stats`. Today renders just `<Outlet />`. Build
the persistent chrome:

- **LeftRail** (vertical, ~64px wide): Shizuku icon at top; nav buttons for
  /room, /library, /quests, /stats; user avatar + dropdown at bottom (logout,
  settings, account).
- **Top bar** (only visible on `/room`?): pet's current XP/level chip, streak
  badge, ink coin balance — read from `useMe()` and `usePet()`.
- **Main content area**: `<Outlet />` for the active route.
- The Phaser room (P7) takes over the entire main area when `/room` is active;
  everywhere else, normal scrolling content.

### Layout · LeftRail (`apps/web/src/components/layout/LeftRail.tsx`)

NEW component you create. Props (suggested):

```ts
interface LeftRailProps {
  user: User | undefined; // from useMe()
  pet: Pet | null; // from usePet()
  active: '/room' | '/library' | '/quests' | '/stats' | string;
}
```

Each nav button is an icon (Lucide: Home, Library, ListChecks, BarChart3)

- tooltip on hover. Active button has the ember-tinted background.

### Layout · ToastHost (`apps/web/src/components/layout/ToastHost.tsx`)

Reads from a uiStore queue (NOT YET CREATED — you'll add it as
`stores/uiStore.ts` per the spec below). Renders fixed-position stack of
`<Toast>` primitives in the top-right corner. Auto-dismisses non-error toasts
after 5s.

### Layout · ModalRoot (`apps/web/src/components/layout/ModalRoot.tsx`)

Listens to `uiStore.activeModal` (single-modal-at-a-time policy). Renders the
matching `<Modal>` primitive with the modal's payload.

### Layout · ErrorScreen + PendingScreen

Two simple full-page states:

- **ErrorScreen** (`apps/web/src/components/layout/ErrorScreen.tsx`):
  catastrophic error fallback — used by RootShell's `<Sentry.ErrorBoundary>`.
  Shows: pet looking sad, "Something went wrong", a Reload button + a "Go home"
  button.
- **PendingScreen** (`apps/web/src/components/layout/PendingScreen.tsx`):
  full-page skeleton/loading state — used by route loaders during heavy initial
  data fetches. Shows: pet animation + "Loading…" + a thin progress bar.

### Layout · uiStore (NEW Zustand store you create)

**File.** `apps/web/src/stores/uiStore.ts`. Not persisted (UI state is
session-only). Suggested shape:

```ts
interface UiState {
  toasts: Toast[];
  activeModal: { kind: string; payload?: unknown } | null;
  pushToast: (t: Omit<Toast, 'id' | 'createdAt'>) => void;
  dismissToast: (id: string) => void;
  openModal: (kind: string, payload?: unknown) => void;
  closeModal: () => void;
}
```

Use `createStore` from `stores/createStore.ts` (already exists).

---

## P5 — Auth pages

Hooks + fetchers + form schemas are all wired (`useLogin`, `useSignup`,
`useForgotPassword`, `useResetPassword`, `useVerifyEmailRequest`,
`useVerifyEmailConfirm`, `useLogout`, `useDeleteUser`, plus
`lib/forms/schemas/auth.ts`). Your job: replace the placeholder JSX in the route
files with real forms, using the stub components I shipped.

**Stub components I shipped** (do NOT change props — the routes pass these exact
keys):

| File                                                  | Status                                |
| ----------------------------------------------------- | ------------------------------------- |
| `apps/web/src/components/auth/LoginForm.tsx`          | placeholder JSX, contract typed       |
| `apps/web/src/components/auth/SignupForm.tsx`         | placeholder JSX, contract typed       |
| `apps/web/src/components/auth/ForgotPasswordForm.tsx` | placeholder JSX, contract typed       |
| `apps/web/src/components/auth/ResetPasswordForm.tsx`  | placeholder JSX, contract typed       |
| `apps/web/src/components/auth/OAuthButtons.tsx`       | placeholder, anchor links functional  |
| `apps/web/src/components/auth/VerifyEmailBanner.tsx`  | placeholder, full state machine wired |

**Routes I shipped** (already wire the hooks → components):

| Route                                | Status                                                           |
| ------------------------------------ | ---------------------------------------------------------------- |
| `routes/_public/login.tsx`           | placeholder body — replace with `<LoginForm>` + `<OAuthButtons>` |
| `routes/_public/signup.tsx`          | same — replace with `<SignupForm>` + `<OAuthButtons>`            |
| `routes/_public/forgot-password.tsx` | wired ✓ — visual polish only                                     |
| `routes/_public/reset-password.tsx`  | wired ✓ — visual polish only                                     |
| `routes/_public/oauth.callback.tsx`  | "Signing you in…" pending state — polish                         |

### P5 · LoginForm

**File.** `apps/web/src/components/auth/LoginForm.tsx`. **Props.**
`{ onSubmit, isSubmitting, error }`. **Build.**

- Email + password inputs (use `Input` primitive). Password input has show/hide
  toggle.
- "Forgot password?" link below password field, navigates to `/forgot-password`.
- Error code → message map: `invalid_credentials` → "Email or password
  incorrect" (don't say which); `email_not_verified` → "Verify your email
  first" + "Resend verification" CTA; `validation_error` → per-field errors via
  RHF.
- RHF + `zodResolver(loginBodySchema)` from `lib/forms/schemas/auth.ts`.
- GSAP fadeIn on mount, slight stagger on the two fields.

### P5 · SignupForm

**File.** `apps/web/src/components/auth/SignupForm.tsx`. **Props.**
`{ onSubmit, isSubmitting, error }`. **Build.**

- Display name + email + password inputs.
- Inline `<PasswordStrengthMeter>` (you build) under the password field — 4-tier
  (Weak / OK / Strong / Excellent), based on length + character variety. Pure
  visual; the schema's 10-char min is the actual gate.
- Error: `email_taken` → "this email is already in use, [Sign in]" link.
- Terms-of-service checkbox if you want one (no requirement yet — Slice 3 if we
  add ToS).

### P5 · ForgotPasswordForm

**File.** `apps/web/src/components/auth/ForgotPasswordForm.tsx`. **Props.**
`{ onSubmit, isSubmitting, error, isSent }`. **Build.**

- Single email input + submit button.
- When `isSent` is true (after 204 response), the form swaps to a "if that email
  is registered, we sent a 6-digit code" message + a "Go to reset" button that
  navigates to `/reset-password?email=…`.
- DO NOT reveal whether the email exists — the API is anti-enumeration by
  design.

### P5 · ResetPasswordForm

**File.** `apps/web/src/components/auth/ResetPasswordForm.tsx`. **Props.**
`{ initialEmail?, onSubmit, isSubmitting, error }`. **Build.**

- Email + 6-digit code + new-password inputs.
- The 6-digit code field is a special-cased "single char per cell" visual (6
  boxes side-by-side), auto-tabs to next on input. (Or fall back to a single
  `<input pattern="[0-9]{6}">` if you want to ship faster.)
- Error codes: `otp_invalid` → highlight the code field with "wrong code";
  `otp_expired` → "code expired" + "request a new code" CTA;
  `otp_max_attempts_exceeded` → toast + force-redirect back to forgot-password.
- On success the route navigates to /login (already wired).

### P5 · OAuthButtons

**File.** `apps/web/src/components/auth/OAuthButtons.tsx`. **Props.**
`{ label? }`. **Build.**

- Two buttons stacked: Google + Discord.
- Each shows the provider logo (use `react-icons/fa` for FaGoogle and FaDiscord,
  or grab inline SVGs from the brand kits — both providers have permissive
  icon-use guidelines).
- Brand colors: Google's button is white-with-grey-border + colored logo;
  Discord's button is `#5865F2` + white logo.
- Plain `<a href>` — DO NOT convert to a SPA `<Link>`; the redirect to the
  provider needs a full-page navigation.

### P5 · VerifyEmailBanner

**File.** `apps/web/src/components/auth/VerifyEmailBanner.tsx`. **Props.**
`{ onRequestCode, isSendingCode, isSent, onConfirm, isConfirming, confirmError }`.
**Build.**

- Sticky banner shown at top of `/room` (and other authed pages) when
  `useMe().data?.emailVerifiedAt === null`.
- Initial state: amber pill with "Verify your email" + "Send me a code" button.
- After click → `onRequestCode` fires → `isSent=true` → expand to inline 6-digit
  OTP input + Verify button.
- On success: banner self-dismisses with a confetti/checkmark animation; the
  next `useMe()` refetch will show `emailVerifiedAt !== null` and the parent
  stops mounting it.
- Persist a "I dismissed this 3 times" cap in localStorage so the banner doesn't
  hound users forever.

### P5 · PasswordStrengthMeter (NEW — please write)

**File.** `apps/web/src/components/auth/PasswordStrengthMeter.tsx`. **Props.**
`{ password: string }`. **Build.**

- Pure-display 4-segment bar that fills based on password length + variety. No
  state, no validation — schema is the source of truth for pass/fail.
- Tiers: <10 chars red; 10-13 chars amber; 14+ with mixed case + digit green;
  16+ with also a symbol "excellent" (purple).

### P5 · OAuth callback polish

**File.** `apps/web/src/routes/_public/oauth.callback.tsx`. The route logic is
wired (calls authStore.bootstrap, then redirects to `/onboarding` or `/room`).
UI is currently "Signing you in…". Polish:

- Spinner / skeleton.
- On error (`?error=oauth_failed` ends up in URL): show "Sign-in didn't
  complete" + "Try again" button that goes to `/login`.
- GSAP fade-out before the redirect fires so it doesn't flash.

---

## P6 — Onboarding (current phase)

**Route file (do not edit unless asked):**
`apps/web/src/routes/_app/onboarding.tsx` — already wires the step machine.

The route imports four step components from
`apps/web/src/components/onboarding/`. Each has a placeholder JSX block today;
your job is to replace the `data-todo-antigravity="..."` div with the real UI.

### Onboarding · Shell (layout chrome around steps)

**File.** `apps/web/src/routes/_app/onboarding.tsx` (just the `<Shell>` helper
at the bottom). **Build.** Centered card layout with:

- Top-left Shizuku wordmark + small ember icon
- Step progress dots (4 dots; 1-based highlight per current step)
- Right-side flavor panel showing a generative pixel-art preview that updates
  with the live draft (avatar preset → species silhouette → final pet sprite).
  This panel is optional for v1; a simple gradient is fine if sprites aren't
  ready.

**Animation.** GSAP fadeIn on first mount; cross-fade between steps (250ms).

### Onboarding · AvatarStep

**File.** `apps/web/src/components/onboarding/AvatarStep.tsx` (replace the
placeholder div). **Props (already defined).** `value: AvatarConfig`,
`onChange: (next: AvatarConfig) => void`, `onAdvance: () => void`,
`isSaving: boolean`. **Behavior.**

- 6 preset cards in a 3x2 grid. Each card is a button showing
  `assets/avatars/preset-0X.png` (pre-rendered by the user from Mana Seed
  Character Base — see "Assets needed" below). Selected = ember outline glow.
- Two sliders: **Hue** (-180 to 180, snaps to 0), **Saturation** (-50 to 50,
  snaps to 0). Wire to `onChange({ ...value, hueShift, satShift })`.
- Live preview panel applies
  `filter: hue-rotate(${hueShift}deg) saturate(${satShift+100}%)` to the chosen
  preset.
- Continue button (primary) calls `onAdvance`. Disable when `isSaving`.

**Animation.** GSAP scale-tap on preset click; slider thumbs glow on drag.
**Assets needed.**

- `assets/avatars/preset-01.png` … `preset-06.png` (single pose, 64x64, pixel
  art). These are the static UI cards — NOT the Phaser walk atlases. Source from
  Mana Seed Character Base (~$5) or commission. **You produce these in
  Antigravity / Aseprite; track in `assets/README.md`.**
- 2 SVG slider thumb assets (round, 16x16, with outline).

### Onboarding · SpeciesStep

**File.** `apps/web/src/components/onboarding/SpeciesStep.tsx`. **Props.**
`value: PetSpecies | null`, `onChange: (next: PetSpecies) => void`, `onAdvance`,
`onBack`. **Behavior.**

- Three large cards in a row: **Ember**, **Ripple**, **Quill**.
- Each card shows: species name (Pixelify Sans), idle preview (32x32 pet sprite
  — see "Assets needed"), `PET_FLAVORS[species].flavor` body text, and the three
  stage names (`PET_FLAVORS[species].stageNames`).
- Picked card = ember outline glow + slight scale-up.
- Continue disabled until a card is picked. Back returns to avatar step.

**Animation.** Staggered slide-in on mount (each card 100ms delay). On hover,
sprite plays its idle animation (loop 4-frame at 4 FPS). On selection, a small
spark particle bursts from card center. **Imports needed.**

```ts
import { PET_FLAVORS } from '@shizuku/types';
```

**Assets needed (deferred to P14 — placeholders OK for now).**

- `assets/sprites/preview/ember-stage1.png` (single idle frame, 32x32)
- Same for ripple, quill.
- These are **only the static idle frame** for the picker. The full walk-cycle
  atlases are P14 work.
- Until you have these, render a colored circle with the species name centered.

### Onboarding · NameStep

**File.** `apps/web/src/components/onboarding/NameStep.tsx`. **Props.**
`species`, `value`, `onChange`, `onSubmit`, `onBack`, `isSubmitting`, `error`.
**Behavior.**

- One text input + character counter (`value.length` / 16).
- Validation regex (matches backend): `/^[\p{L}\p{N} '-]+$/u`, length 3-16. Use
  the imported `createPetBodySchema.shape.name` from `@shizuku/types` if you
  want runtime validation (you'd wrap the input in RHF + zodResolver — see
  `apps/web/src/lib/forms/schemas/onboarding.ts`).
- "Suggestions" row of 3 thematic auto-generated names per species:
  - ember: Cinder, Ash, Ignis
  - ripple: Brook, Coral, Tide
  - quill: Page, Sage, Inkling Click a suggestion = `onChange("name")` then
    `onSubmit()` (skip Continue click for speed).
- Submit button shows pending spinner when `isSubmitting`.
- If `error.code === 'pet_already_active'`, show an inline message + a "Go to
  room" button instead of the form (the backend got crossed up; bouncing them to
  /room recovers).
- Other errors render `error.message` inline below the input.

**Animation.** GSAP `levelUpFlourish`-like burst when submit succeeds (the route
advances 200ms after the burst, so the user sees the celebration).

### Onboarding · TutorialStep

**File.** `apps/web/src/components/onboarding/TutorialStep.tsx`. **Props.**
`onFinish: () => void`, `onSkip: () => void`. **Behavior.**

- 3-card carousel. Cards:
  1. **"Walk around"** — WASD or click anywhere on the floor. Static screenshot
     of the room with arrow overlays.
  2. **"Open a book"** — click the desk to upload a PDF and read with your pet's
     help. Screenshot showing the desk highlighted.
  3. **"Say hi to your pet"** — click your pet to chat. Screenshot showing the
     pet sprite highlighted.
- Dots/arrows for navigation. "Got it" button on card 3 calls `onFinish`. "Skip
  tour" link below the carousel calls `onSkip`.

**Both `onFinish` and `onSkip` reset the onboarding store + navigate to
`/room`** (already wired in the route).

**Animation.** GSAP cross-fade between cards. Optional: pet sprite cameo in the
corner that walks in when card 3 mounts.

**Assets needed.**

- 3 in-room screenshots — these can come AFTER P7 when the room actually exists.
  Until then, placeholder grey blocks with descriptive captions are fine.

---

## Sprite & art production — running list

This section grows as more phases need art. Today's needs (any phase up to P6):

| Asset                        | Where used                                | Source / status                                   |
| ---------------------------- | ----------------------------------------- | ------------------------------------------------- |
| 6 avatar preset cards (PNG)  | AvatarStep grid                           | Mana Seed Character Base (~$5) — TODO             |
| 3 species idle preview (PNG) | SpeciesStep cards                         | SDXL pipeline P14 — placeholder OK for now        |
| Lucide icon set              | All buttons & HUD                         | npm `lucide-react` (already in deps; just import) |
| Pixelify Sans font           | Display headings everywhere               | Google Fonts OFL — wire in `<head>`               |
| Inter Variable font          | Body text everywhere                      | Google Fonts OFL — wire in `<head>`               |
| Spark / sparkle particles    | Onboarding success burst, level-up toasts | Kenney Particle Pack CC0 — pick 2-3 textures      |

---

## Forward-looking outline (skeleton — full specs land as each phase opens)

- **P7 — Phaser room.** Tilemap (LimeZu Modern Interiors), avatar atlases, one
  pet sprite atlas placeholder, RoomHUD overlay (streak / level / XP / Ink /
  quest button).
- **P9 — Reader.** PDFViewer scaffolding, ReaderToolbar, BookmarkPanel,
  TOCPanel, HighlightLayer (4 colors), PetChatSidebar shell.
- **P11 — RAG chat sidebar.** ChatMessage (markdown), ChatInput, UsageMeter, pet
  "thinking" reaction. SSE-driven streaming.
- **P13 — Study tools.** PomodoroTimer (vinyl-spinner aesthetic), QuestsPanel,
  StreakBadge, StatsDashboard (recharts).
- **P14 — Pet system polish.** 9 sprite atlases (3 species x 3 stages), level-up
  toast, EvolutionScene cutscene polish.
- **P15 — Cozy ambient layer.** MusicPicker (vinyl-record control),
  FocusModeToggle, ambient particle effects.

When each phase opens, this doc gets a new section pinned to the bottom with the
same level of detail as P6 above.

---

## P11 — Reader chat sidebar (current phase)

**Files I shipped (do not edit unless asked):**

- `lib/sse/sseClient.ts` — fetch + ReadableStream SSE consumer.
- `stores/chatStore.ts` — drafts, currentStream, disabledUntil.
- `hooks/useChatStream.ts` — streaming send/abort with optimistic insert, rAF
  token batching, judge `refinable` event handling, cost-limit recovery.
- `hooks/useChatHistory.ts` — TanStack Query for the GET history.
- `hooks/useUsage.ts` — TanStack Query polling `/v1/usage` every 60s.
- `lib/api/chat.ts`, `lib/api/usage.ts` — typed fetchers.

**Components for you (`apps/web/src/components/reader/*.tsx`):**

### Reader · ChatMessage

**File.** `apps/web/src/components/reader/ChatMessage.tsx`. **Props.**
`{ message, liveBuffer?, onRefine?, isRefining? }` — already typed.
**Behavior.**

- User messages right-aligned (or however you want); assistant left-aligned.
- Body: render markdown via `react-markdown` + `rehype-sanitize` (npm install
  needed — both in deps already? check `apps/web/package.json`. If not:
  `pnpm --filter @shizuku/web add react-markdown rehype-sanitize`).
  - When `liveBuffer` is set, render that string instead of `message.content`
    (it's the in-progress streaming text).
- Citation pills: parse `[p.X]` patterns in the body and render small
  pill-shaped badges that, on click, scroll the PDF reader to that page (you'll
  wire a `onCitationClick(page: number)` prop in P11+).
- `[Refine]` button: visible only when
  `message.judgeVerdict === 'needs_refinement'` AND `props.onRefine` is
  provided. Disabled while `isRefining`. Subtle styling — it's a "would you like
  a more careful answer?" affordance, not a primary action.

**Animation.** GSAP fade-in on mount (`presets.fadeIn` once that's wired in
P12+).

### Reader · ChatInput

**File.** `apps/web/src/components/reader/ChatInput.tsx`. **Props.**
`{ value, onChange, onSubmit, onAbort, isStreaming, isDisabled, caption? }` —
already typed. **Behavior.**

- Auto-resizing textarea (`react-textarea-autosize` is a tiny dep; install if
  you want it, otherwise CSS field-sizing can do it).
- Submit on `Enter`; newline on `Shift+Enter`.
- Send button morphs to "Stop" with a square icon while `isStreaming` — clicking
  it calls `onAbort`.
- When `isDisabled`, show `caption` as the placeholder + below-input hint. The
  route-level `PetChatSidebar` already builds the caption text.
- Character counter visible from 1500 chars onward, red at 2000 (the backend cap
  is 2000).

### Reader · UsageMeter

**File.** `apps/web/src/components/reader/UsageMeter.tsx`. **Props.**
`{ used, limit, resetAt?, label }` — already typed. **Behavior.**

- Tiny chip: "X / Y label".
- Background tint by `used/limit`: 0-74% neutral, 75-89% amber, 90-100% red.
- Tooltip on hover: shows `resetAt` formatted as "Resets in 4h 12m" (use
  `date-fns` `formatDistance` — already in deps).
- Optional ring-progress ring around the number for visual interest.

### Reader · PetChatSidebar

**File.** `apps/web/src/components/reader/PetChatSidebar.tsx`. **Props.**
`{ documentId }` — already typed. **Behavior.**

- 360px-wide right-rail layout. Header (sticky) shows the pet's avatar + name +
  species + UsageMeter. Body scrolls (newest at bottom — auto-scroll on new
  messages unless the user has manually scrolled up; `react-virtuoso` or
  hand-rolled `IntersectionObserver` works). Footer is the ChatInput.
- Empty state: a small illustration + copy ("Ask your pet about this document.
  They've read it cover to cover.") — placeholder copy is in the shipped file.
- The data wiring (history hook, stream hook, draft store) is already done — you
  ONLY need to handle visual layout + auto-scroll behavior.

**Animation.** GSAP slideIn from right when the sidebar opens (route-level
toggle in P9 reader).

**Assets needed.**

- Pet sprite header thumb (32×32 or 48×48) — pulled from
  `assets/sprites/preview/<species>-stage<n>.png` (P14).
- Empty-state illustration — pixel art, ~120×120, tied to the 48-color palette.
  Generate via SDXL or commission. Placeholder gradient is fine.

---

## P12 backend — no UI work

Pomodoro / quests / stats / streak are pure backend in P12. Their UI lands in
P13 — that section will be added to this doc when P13 opens.

---

## P9 — Reader (PDF.js + library) (current phase)

**Files I shipped (do not edit unless asked):**

- `lib/pdf/workerSetup.ts` — PDF.js worker registration via `?url`.
- `lib/pdf/usePdf.ts` — load `PDFDocumentProxy` from a signed URL with cancel.
- `lib/pdf/outline.ts` — flat TOC builder from `doc.getOutline()`.
- `lib/pdf/highlights.ts` — Range serialize/deserialize with fuzzy fallback
  (used by `HighlightLayer` once you build it).
- `lib/api/documents.ts` — list/get/delete/signed-url/highlights/bookmarks
  /reading-progress fetchers.
- `hooks/useDocuments.ts` — TanStack Query hooks for everything above (infinite
  list, detail, signed URL, highlights CRUD, bookmarks CRUD, reading-progress).
- `hooks/usePdfUpload.ts` — multipart + SSE stream consumer with stage tracking.
- `routes/_app/library.tsx` — wired list + upload; visual layout for you.
- `routes/_app/reader.$pdfId.tsx` — wired three-pane layout (TOC | viewer | chat
  sidebar) + URL `?page=` sync + 30s-debounced reading-progress PUT. Visual
  layout for you.
- Component stubs:
  - `components/library/{DocumentCard,UploadButton}.tsx`
  - `components/reader/{PDFViewer,PDFPage,BookmarkPanel,TOCPanel}.tsx`

**Backend you can rely on (already shipped):**

- `GET /v1/documents` (cursor pagination, `{ documents, nextCursor }`)
- `POST /v1/documents` (multipart + SSE:
  `created → parsed → chunked → embedding → ready/error`)
- `GET /v1/documents/:id`, `DELETE /v1/documents/:id`
- `GET /v1/documents/:id/signed-url` (15 min)
- `GET/POST/PATCH/DELETE /v1/documents/:id/highlights[/:hlId]`
- `GET/POST/DELETE /v1/documents/:id/bookmarks[/:bmId]`
- `GET/PUT /v1/documents/:id/reading-progress`

### Library · LibraryPage

**File.** `apps/web/src/routes/_app/library.tsx` (just the wrapper / grid).
**Build.** Grid of DocumentCards (3-col on desktop, 1-col on mobile, 280px
gutter min). Empty state copy: "No PDFs yet — drop one to get started." The
UploadButton sits above the grid; gets sticky on scroll. Header shows "X/5 PDFs"
using `useUsage` data.

### Library · DocumentCard

**File.** `apps/web/src/components/library/DocumentCard.tsx`. **Props.**
`{ doc, onOpen, onDelete, isDeleting }` — already typed. **Build.** Card layout
with: a generated cover (use the title's first letter on a colored gradient —
pixel-art style), title (`font-pixel`), page count + upload date
(`date-fns formatRelative`), index-status pill (`ready` = green, `indexing` =
amber pulse, `failed` = red, `pending` = grey), `[Open]` button that calls
`onOpen`, "..." menu with Delete (confirm modal).

### Library · UploadButton

**File.** `apps/web/src/components/library/UploadButton.tsx`. **Props.**
`{ onUpload, progress, isLifetimeLimitHit }` — already typed. **Build.** A
drag-and-drop zone (border-dashed, file-input on click) + inline progress bar.
Stages render distinct copy:

- `created` → "Uploaded, parsing…"
- `parsed` → "Parsed N pages, chunking…"
- `chunked` → "Made N chunks, indexing…"
- `embedding` → "Indexing batch B/T…" with progress ring
  (`progress.batchIndex / progress.totalBatches`)
- `ready` → "Done! Opening…"
- `error` → red banner with `progress.error.message` + retry CTA When
  `isLifetimeLimitHit`, replace the dropzone with a copy that says "You've used
  all 5 PDF slots. Delete one in /library to free up space."

### Reader · ReaderPage layout

**File.** `apps/web/src/routes/_app/reader.$pdfId.tsx` (just the layout).
**Build.** Three columns: 220px TOC/Bookmarks rail | flexible viewer | 360px
chat sidebar. Mobile collapse: TOC becomes a slide-over (the left rail toggles
via a button in the toolbar). Top bar with back-to- library button + document
title + page X / Y indicator + zoom buttons.

### Reader · PDFViewer

**File.** `apps/web/src/components/reader/PDFViewer.tsx`. **Props.**
`{ doc, currentPage, onPageChange, pageWidth }` — already typed. **Build.** Add
scroll-shadow chrome; page-break separator strip between pages with a small
page-number badge floating left.

### Reader · PDFPage

**File.** `apps/web/src/components/reader/PDFPage.tsx`. **Props.**
`{ doc, pageNumber, width }` — already typed. **Important.** The canvas +
text-layer rendering inside the `useEffect` is correct — don't gut it. You can
wrap the `<div>` in a styled container, add a loading skeleton, or position a
HighlightLayer on top, but the canvas + text-layer overlay structure
(text-transparent + absolute spans) is what HighlightLayer relies on.

### Reader · HighlightLayer (new — please write)

**File.** `apps/web/src/components/reader/HighlightLayer.tsx` (you create this).
**Props (recommended).**
`{ pageNumber, pageContainer, highlights, onCreate, onDelete }`. **Build.**

- Listens to `selectionchange` on `pageContainer`.
- On a non-collapsed selection, shows a floating toolbar at the selection end (4
  colors + Note button).
- When a color is clicked, calls `serializeRange(range, pageContainer)` from
  `lib/pdf/highlights.ts`, then `onCreate({ page, range, color })`.
- Renders existing highlights as absolutely-positioned colored rectangles
  underneath the text-layer (z-index < text-layer, > canvas). Compute rects from
  the deserialized Range's `getClientRects()`.
- Click an existing highlight → small popover with note + delete.

### Reader · BookmarkPanel

**File.** `apps/web/src/components/reader/BookmarkPanel.tsx`. **Props.**
`{ bookmarks, onJumpTo, onDelete }` — already typed. **Build.** Sticky header
"Bookmarks" + "+" button (opens a quick-add for the current page label). Each
row clickable to jump; pencil edit + × delete on hover. Empty state: "Bookmark a
page to come back later."

### Reader · TOCPanel

**File.** `apps/web/src/components/reader/TOCPanel.tsx`. **Props.**
`{ entries, onJumpTo }` — already typed. **Build.** Indent each entry by
`entry.level * 12px`. Highlight the entry whose `page` matches the current page
(sticky-scroll into view when the PDF page changes — use `IntersectionObserver`
on the active row).

### Reader · ReaderToolbar (new — please write)

**File.** `apps/web/src/components/reader/ReaderToolbar.tsx` (you create this).
**Props (recommended).**
`{ docTitle, currentPage, totalPages, zoom, onZoom, onAddBookmark, onCloseChat, onOpenChat, isChatOpen }`.
**Build.** Top bar: back arrow + title (truncate) + page X / Y + zoom -/+

- bookmark current-page button + chat sidebar toggle.

**Assets needed for P9.**

- 4 highlight color swatches — solid colored squares, no outline.
- Cursor cue for "ready to highlight" (text I-beam is the default; that's fine).
- Empty-state illustration for /library — same palette as onboarding.

---

## P13 — Study tools UI (current phase)

**Files I shipped (do not edit unless asked):**

- `stores/pomodoroStore.ts` — phase + endsAt + cycle counter, persisted.
- `lib/api/studyTools.ts` — pomodoro/quests/stats/streak fetchers.
- `hooks/usePomodoro.ts` — drift-free rAF ticker + start/pause/resume/cancel +
  auto-transition focus → break → idle. Calls `/v1/pomodoro/:id/complete` when
  focus runs out (server bumps daily_stats + quest progress + streak + pet XP).
- `hooks/useQuests.ts`, `hooks/useStreak.ts`, `hooks/useStats.ts` — TanStack
  Query hooks.
- `routes/_app/quests.tsx`, `routes/_app/stats.tsx` — route shells.
- Component stubs:
  - `components/study-tools/PomodoroTimer.tsx`
  - `components/study-tools/QuestsPanel.tsx` + `QuestCard.tsx`
  - `components/study-tools/StreakBadge.tsx`
  - `components/study-tools/StatsDashboard.tsx` + `StatsTodayCard.tsx`

### Study tools · PomodoroTimer

**File.** `apps/web/src/components/study-tools/PomodoroTimer.tsx`. **Props.**
Spread of `usePomodoro()` return + optional `documentId`. **Build.**

- Vinyl-spinner aesthetic — outer ring fills as the focus block elapses
  (`1 - remainingMs / totalMs`). Center circle has the `MM:SS` countdown and a
  small "Focus" / "Break" / "Paused" label.
- During focus: ring is ember-colored, slowly draining. During break: ring is
  teal, draining faster (5 min vs 25 min). During paused: ring is grey
  - dashed border.
- Buttons: Start / Pause / Resume / Cancel — already wired in the stub; restyle
  to match the vinyl theme.
- On phase auto-transition (focus → break), fire a GSAP `pomodoroComplete`
  flourish (when `lib/gsap/presets.ts` lands in P14+) + ambient chime via
  `lib/utils/sound.ts`.
- Cycle counter: small "🍅 × N" pip below the timer.

### Study tools · QuestsPanel + QuestCard

**Files.** `apps/web/src/components/study-tools/{QuestsPanel,QuestCard}.tsx`.
**Build.**

- 3 vertically-stacked cards (or grid on wide screens). Each card: metric icon
  (Lucide: BookOpen for pages, Clock for minutes, Timer for pomodoros,
  MessageCircle for chats) + title + progress bar with target on the right +
  reward chips (Ink coin + XP rune) + Claim button state machine.
- States: `In progress` (greyed), `Claim` (ember button), `Claimed` (faded green
  checkmark + pulsing once on the transition).
- GSAP `questClaimedBurst` (when `presets.ts` lands) on Claim → scale-up +
  particle burst (use a Kenney CC0 sparkle) → cards re-shuffle as Claimed sinks
  to bottom.
- Stagger-in animation on first mount.

### Study tools · StreakBadge

**File.** `apps/web/src/components/study-tools/StreakBadge.tsx`. **Props.**
`{ className? }` — already typed. **Build.**

- Flame icon + count (large pixel-font number).
- Hover tooltip: 7-day dot calendar (filled = activity that day, empty = no
  activity). Uses `useStats('week')` to derive activity.
- Color shifts at milestones: 7 days = warmer ember, 30 = gold, 100 = purple.
- Tap-to-shake animation when count > 0 to call attention. Disabled when 0.

### Study tools · StatsDashboard

**File.** `apps/web/src/components/study-tools/StatsDashboard.tsx`. **Build.**

- Header: range tabs (Today / Week / All-time). Persist active tab in Zustand or
  URL search if you want shareable links.
- Today section: 4 `StatsTodayCard`s (already shipped). Optional: small "+N from
  yesterday" delta badge per card.
- Week section: **recharts ComposedChart** — bars for pages, line for minutes,
  on the same X axis (last 7 days). Use `useStats('week')` → format X axis
  labels as "Mon / Tue / …" via date-fns. Tooltip shows the full breakdown.
- All-time section: **calendar heatmap** — 365-day grid, intensity by total
  minutes that day. Library: `react-calendar-heatmap` (5kb, MIT) or hand-roll
  with CSS grid. Hover shows day + minutes.

### Study tools · StatsTodayCard

**File.** `apps/web/src/components/study-tools/StatsTodayCard.tsx`. **Props.**
`{ metric, label }` — already typed. **Build.**

- Big pixel-font number with a metric icon to the left.
- Number animates on change (CSS counter or react-spring).
- Optional comparison chip beneath: "+12 from yesterday".

**Assets needed for P13.**

- 4 metric icons (Lucide is fine: BookOpen, Clock, Timer, MessageCircle).
- 2 reward icons: Ink coin + XP rune (32×32 pixel art, SDXL pipeline P14 or
  commission). Placeholder unicode (💧 / ✦) is fine for v1.
- Optional ambient chime SFX for pomodoro phase transitions (Kenney CC0 —
  `assets/audio/chime.ogg`).

---

## P15 — Cozy ambient (bootstrap shipped)

**Files I shipped (do not edit unless asked):**

- `hooks/useAmbientBootstrap.ts` — mounted in `_app.tsx`. Subscribes the
  SoundManager to `ambientStore` (volume + focus-mode reactivity) and starts
  playback of the persisted track on first user gesture.
- `components/room/MusicPicker.tsx` — vinyl-record style picker stub.
- `components/room/FocusModeToggle.tsx` — toggle button stub.

(`stores/ambientStore.ts`, `lib/utils/sound.ts`, `hooks/useTimeOfDay.ts` were
already in place from earlier scaffolding.)

### P15 · MusicPicker

**File.** `apps/web/src/components/room/MusicPicker.tsx`. **Build.**

- Vinyl-record disc — outer ring (palette teal), inner spiral, center paper
  label with track title. The disc rotates while music plays (CSS
  `@keyframes spin 18s linear infinite`, paused when `paused=true`).
- Track scroller: tap the side of the disc to skip to the next/prev track (or
  open a small dropdown — your choice).
- Volume slider: vertical, alongside the disc, with a tactile rail look.
- Attribution caption below: e.g. "Rainy Night by [artist] (CC-BY)". Pull from
  `LOFI_TRACKS[id].attribution`.
- Tooltip on disc: shows current track + period suggestion from
  `useTimeOfDay()` + `PERIOD_TRACK_SUGGESTION`.

### P15 · FocusModeToggle

**File.** `apps/web/src/components/room/FocusModeToggle.tsx`. **Build.**

- Compact toggle button. Off state: outline-only. On state: ember-tinted fill +
  small "focus" icon (Lucide `Eye` or `Target`).
- GSAP transition: when toggled on, fade a fixed-position overlay div to
  `bg-black/70` over 600ms (everything except `data-focus-target` elements
  becomes dimmed). When toggled off, fade overlay out.
- Optional global keyboard shortcut: `Cmd/Ctrl-Shift-F` calls `toggle()`. Add a
  `useEffect` with `keydown` listener at the route level — keep it scoped, don't
  pollute the document listener forever.

### P15 · Per-Phaser TimeOfDay system (deferred to P7)

When P7 lands, add `apps/web/src/lib/phaser/systems/timeOfDay.ts` that:

- Subscribes to `ambientStore.timeOfDayMode` + `useTimeOfDay()`.
- Applies the matching tint from `PERIOD_TINT` to the room scene's tilemap
  layers via `layer.setTint(period)`.
- Crossfades over 30s when the period transitions.

---

## Status snapshot (single-shot summary)

Component-level status across every wired phase. Flip ⏸ → 🚧 → ✅ as you ship
the JSX. Update the "current state" column in the same commit.

### Cross-cutting primitives

| Component  | File                                      | Status |
| ---------- | ----------------------------------------- | ------ |
| Button     | `components/ui-primitives/Button.tsx`     | ⏸      |
| Input      | `components/ui-primitives/Input.tsx`      | ⏸      |
| Modal      | `components/ui-primitives/Modal.tsx`      | ⏸      |
| Toast      | `components/ui-primitives/Toast.tsx`      | ⏸      |
| IconButton | `components/ui-primitives/IconButton.tsx` | ⏸      |

### Layout shells

| Component     | File                                  | Status                        |
| ------------- | ------------------------------------- | ----------------------------- |
| RootShell     | `routes/__root.tsx` (extract chrome)  | ⏸                             |
| AuthLayout    | `routes/_public.tsx`                  | ⏸ placeholder                 |
| AppLayout     | `routes/_app.tsx`                     | ⏸ placeholder                 |
| LeftRail      | `components/layout/LeftRail.tsx`      | ⏸ NEW                         |
| ToastHost     | `components/layout/ToastHost.tsx`     | ⏸ NEW                         |
| ModalRoot     | `components/layout/ModalRoot.tsx`     | ⏸ NEW                         |
| ErrorScreen   | `components/layout/ErrorScreen.tsx`   | ⏸ NEW                         |
| PendingScreen | `components/layout/PendingScreen.tsx` | ⏸ NEW                         |
| `uiStore`     | `stores/uiStore.ts`                   | ⏸ NEW (toasts + modals queue) |

### P5 — Auth (forms wired, JSX needed)

| Component                | File                                        | Status                       |
| ------------------------ | ------------------------------------------- | ---------------------------- |
| LoginForm                | `components/auth/LoginForm.tsx`             | 🚧 stub shipped              |
| SignupForm               | `components/auth/SignupForm.tsx`            | 🚧 stub shipped              |
| ForgotPasswordForm       | `components/auth/ForgotPasswordForm.tsx`    | 🚧 stub shipped              |
| ResetPasswordForm        | `components/auth/ResetPasswordForm.tsx`     | 🚧 stub shipped              |
| OAuthButtons             | `components/auth/OAuthButtons.tsx`          | 🚧 stub shipped              |
| VerifyEmailBanner        | `components/auth/VerifyEmailBanner.tsx`     | 🚧 stub shipped              |
| PasswordStrengthMeter    | `components/auth/PasswordStrengthMeter.tsx` | ⏸ NEW                        |
| `/login` route polish    | `routes/_public/login.tsx`                  | ⏸ swap placeholder for forms |
| `/signup` route polish   | `routes/_public/signup.tsx`                 | ⏸ swap placeholder for forms |
| `/forgot-password` route | `routes/_public/forgot-password.tsx`        | 🚧 wired, polish             |
| `/reset-password` route  | `routes/_public/reset-password.tsx`         | 🚧 wired, polish             |
| OAuth callback polish    | `routes/_public/oauth.callback.tsx`         | 🚧 functional, polish        |

### P6 — Onboarding

| Component       | File                                        | Status  |
| --------------- | ------------------------------------------- | ------- |
| OnboardingShell | `routes/_app/onboarding.tsx` (Shell helper) | 🚧 stub |
| AvatarStep      | `components/onboarding/AvatarStep.tsx`      | 🚧 stub |
| SpeciesStep     | `components/onboarding/SpeciesStep.tsx`     | 🚧 stub |
| NameStep        | `components/onboarding/NameStep.tsx`        | 🚧 stub |
| TutorialStep    | `components/onboarding/TutorialStep.tsx`    | 🚧 stub |

### P9 — Reader / library

| Component         | File                                   | Status                      |
| ----------------- | -------------------------------------- | --------------------------- |
| LibraryPage       | `routes/_app/library.tsx`              | 🚧 wired                    |
| DocumentCard      | `components/library/DocumentCard.tsx`  | 🚧 stub                     |
| UploadButton      | `components/library/UploadButton.tsx`  | 🚧 stub                     |
| ReaderPage layout | `routes/_app/reader.$pdfId.tsx`        | 🚧 wired                    |
| PDFViewer         | `components/reader/PDFViewer.tsx`      | 🚧 stub                     |
| PDFPage           | `components/reader/PDFPage.tsx`        | 🚧 canvas+textlayer correct |
| BookmarkPanel     | `components/reader/BookmarkPanel.tsx`  | 🚧 stub                     |
| TOCPanel          | `components/reader/TOCPanel.tsx`       | 🚧 stub                     |
| HighlightLayer    | `components/reader/HighlightLayer.tsx` | ⏸ NEW                       |
| ReaderToolbar     | `components/reader/ReaderToolbar.tsx`  | ⏸ NEW                       |

### P11 — Pet chat sidebar

| Component      | File                                   | Status  |
| -------------- | -------------------------------------- | ------- |
| ChatMessage    | `components/reader/ChatMessage.tsx`    | 🚧 stub |
| ChatInput      | `components/reader/ChatInput.tsx`      | 🚧 stub |
| UsageMeter     | `components/reader/UsageMeter.tsx`     | 🚧 stub |
| PetChatSidebar | `components/reader/PetChatSidebar.tsx` | 🚧 stub |

### P13 — Study tools

| Component              | File                                        | Status   |
| ---------------------- | ------------------------------------------- | -------- |
| PomodoroTimer          | `components/study-tools/PomodoroTimer.tsx`  | 🚧 stub  |
| QuestsPanel            | `components/study-tools/QuestsPanel.tsx`    | 🚧 stub  |
| QuestCard              | `components/study-tools/QuestCard.tsx`      | 🚧 stub  |
| StreakBadge            | `components/study-tools/StreakBadge.tsx`    | 🚧 stub  |
| StatsDashboard         | `components/study-tools/StatsDashboard.tsx` | 🚧 stub  |
| StatsTodayCard         | `components/study-tools/StatsTodayCard.tsx` | 🚧 stub  |
| `/quests` route polish | `routes/_app/quests.tsx`                    | 🚧 wired |
| `/stats` route polish  | `routes/_app/stats.tsx`                     | 🚧 wired |

### P15 — Cozy ambient

| Component       | File                                  | Status  |
| --------------- | ------------------------------------- | ------- |
| MusicPicker     | `components/room/MusicPicker.tsx`     | 🚧 stub |
| FocusModeToggle | `components/room/FocusModeToggle.tsx` | 🚧 stub |

### Asset-blocked phases (NOT in stub list yet)

| Phase                        | Why blocked                                                     | Unblocks when                     |
| ---------------------------- | --------------------------------------------------------------- | --------------------------------- |
| P7 — Phaser room             | needs LimeZu tilemap + Mana Seed avatar atlases + 9 pet atlases | art assets land per `ART_PLAN.md` |
| P14 — Pet polish + evolution | needs pet sprite atlases + cutscene art                         | same                              |

---

## Suggested build order (low-risk → high-risk)

If you want a stack-rank, build in this order. Each row blocks the next ones
beneath it; within a row, any order is fine.

1. **UI primitives** (Button, Input, Modal, Toast, IconButton) — every other
   component imports these. Build first.
2. **uiStore** + **ToastHost** + **ModalRoot** — ambient infra for any inline
   error/confirm UX.
3. **AuthLayout** + **LoginForm** + **OAuthButtons** — minimal sign-in path. Now
   you can log in to the deployed app.
4. **AppLayout** + **LeftRail** — once logged in, the persistent chrome shows
   up. Onboarding works against it too.
5. **OnboardingShell** + 4 step components — full new-user flow.
6. **DocumentCard** + **UploadButton** + **LibraryPage** polish — upload a PDF.
7. **PDFViewer** + **PDFPage** + **BookmarkPanel** + **TOCPanel** — read the
   PDF.
8. **ChatMessage** + **ChatInput** + **PetChatSidebar** + **UsageMeter** — talk
   to your pet.
9. **HighlightLayer** + **ReaderToolbar** — reader polish.
10. **PomodoroTimer** + **QuestsPanel** + **StreakBadge** + **StatsDashboard** —
    study tools.
11. **MusicPicker** + **FocusModeToggle** — cozy ambient.
12. **VerifyEmailBanner** + **PasswordStrengthMeter** — auth polish.
13. **ErrorScreen** + **PendingScreen** — fallback states.

The whole app is functional after step 8. Steps 9-13 are visual+cozy polish.

---

## Animation primitives (wired — use directly)

`apps/web/src/lib/gsap/presets.ts` ships **7 reusable animations**. ALL of them
honor `prefers-reduced-motion` automatically, so you don't have to think about
accessibility per-call.

| Preset                                                     | When to use                                   |
| ---------------------------------------------------------- | --------------------------------------------- |
| `fadeIn(el)`                                               | Any card / row / route content reveal — 0.25s |
| `slideUpModal(el)`                                         | `<Modal>` primitive entry — 0.28s             |
| `levelUpFlourish(el)`                                      | `LevelUpToast` (P14) — 0.6s pop+glow          |
| `questClaimedBurst(el)`                                    | `QuestCard` claim button — 0.4s scale-pop     |
| `pomodoroComplete({ ring, card, bell })`                   | `PomodoroTimer` phase end                     |
| `evolutionSequence({ silhouette, particles, nameBanner })` | `EvolutionScene` — 4.5s timeline              |
| `staggerIn(els, { delayBetween })`                         | Lists/grids on mount — quest panel, dashboard |

Use via `useGSAP` from `apps/web/src/lib/gsap/useGsap.ts` (wraps `@gsap/react`):

```ts
import { useGSAP } from '../../lib/gsap/useGsap';
import { fadeIn } from '../../lib/gsap/presets';
const ref = useRef<HTMLDivElement>(null);
useGSAP(() => fadeIn(ref.current), { scope: ref });
```

**ESLint rule**: raw `gsap.to` / `gsap.from` / `gsap.timeline` calls outside
`apps/web/src/lib/gsap/` are blocked. If you need a new preset, add it to
`presets.ts` and use it; don't reach for `gsap.to` inline.

---

## Phaser bridge (wired — P7 unblocked for non-art work)

`apps/web/src/lib/phaser/` ships:

| File                  | What it gives you                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `bridge.ts`           | Typed mitt event bus + `useBridge(event, handler)` React hook                                       |
| `assets.ts`           | Asset path manifest with `exists` flags — flip `false → true` per ART_PLAN entry                    |
| `scenes/BootScene.ts` | Asset preload + progress bar; loads only `exists: true` assets                                      |
| `scenes/RoomScene.ts` | Placeholder room (colored squares for player/pet/desk) — emits `OPEN_CHAT` / `OPEN_READER` on click |
| `createGame.ts`       | Factory that builds `Phaser.Game` + registers it with the bridge                                    |

The placeholder room WORKS now: build a `RoomCanvas` React component that mounts
a `<div ref>` and calls `createGame(ref.current)` in `useLayoutEffect`. Click
the orange square → React receives `OPEN_CHAT` via `useBridge`. No art assets
required for this phase of integration.

When sprite atlases land per `ART_PLAN.md`, flip the `exists` flags in
`assets.ts`; BootScene picks them up automatically. RoomScene then needs the
real player/pet/tilemap rendering swapped in (currently stubbed rectangles).
I'll do that swap as a follow-up phase once art is in.

**P7 work for you (Antigravity):**

- `apps/web/src/components/room/RoomCanvas.tsx` — the mount point. Uses
  `useLayoutEffect` to call `createGame`, holds the game in a ref, calls
  `game.destroy(true)` on unmount.
- `apps/web/src/components/room/RoomHUD.tsx` — overlay div with streak badge,
  level/XP chip, ink coin, quest panel button. Reads from `useMe`, `usePet`,
  `useStreak`. Listens to bridge events (`LEVEL_UP`, `NEAR_INTERACTABLE`) for
  transient overlays.

---

_Last updated: GSAP presets + Phaser bridge + BootScene/RoomScene + asset
manifest wired. Specs for ~35 components your Antigravity work needs to fill in.
P7 placeholder room is interactive (colored squares); art-dependent parts of
P7/P14 remain blocked per `ART_PLAN.md`._
