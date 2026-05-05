# Shizuku — Art & Asset Plan (Slice 1, current state)

**This file is the single source of truth for art/asset production.** It
reflects what we've built, what we've decided, and what's still missing —
nothing is preserved here for historical reasons. When something changes
(new component needs an icon, palette swaps, decision flips), update this
file in the same commit.

**Companion docs:**

- `apps/web/ANTIGRAVITY_TODO.md` — JSX work that consumes these assets.
- `CLAUDE.md` (repo root) — locked decisions / hard rules. Don't edit; this
  file (`ART_PLAN.md`) supersedes its art section for working details.

---

## Style guide (locked)

| Spec | Value |
|---|---|
| Resolution (sprites + tiles) | **32×32 per cell** |
| Resolution (UI icons) | **24×24 line art (Lucide) or 32×32 pixel art** |
| Palette | Single shared **48-color palette**, defined at `design/palette.gpl` (Aseprite GPL format) |
| Pixel grid | Strict — no anti-aliasing, no sub-pixel. Aseprite "Pixel-perfect" mode always on |
| Style anchor | Pokémon Gen 3 (Ruby/Sapphire/Emerald): soft outlines, 4-6 colors per element, expressive but limited animation |
| Walk-cycle frame rate | **8 FPS** (125 ms/frame) |
| Idle frame rate | **4 FPS** (250 ms/frame) |
| Pet "thinking" anim | **6 FPS**, 3 frames |
| Sprite-sheet layout (atlases) | **4 rows × 4 cols** — rows = down/left/right/up, cols = walk frames 0-3. Idle = col 0 of row 0 |
| Atlas export format | PNG + JSON sidecar (Aseprite hash-export format) |

**Tools (locked):**

- **Aseprite** ($20 one-time) — primary pixel-art editor + atlas builder
- **Tiled Map Editor** (free) — room tilemap layout
- **Stable Diffusion XL on Replicate** (~$0.005/image) — pet sprite generation
- **LoRA: `nerijs/pixel-art-xl`** — pixel-style fidelity (strength 0.85)
- **ControlNet (canny)** — cross-stage character consistency
- **Python 3.11+** — pipeline scripts (quantize, atlas validate)
- **Lucide React** (npm, MIT) — UI icon set (~80% of needs)

---

## Source vendors / packs (purchased once, used across phases)

| Vendor / pack | Price | Used for | Status |
|---|---|---|---|
| [LimeZu — Modern Interiors](https://limezu.itch.io/moderninteriors) | ~$20 | Room tilemap (P7) | ⏸ not yet purchased |
| [Mana Seed Character Base](https://seliel-the-shaper.itch.io/character-base) | ~$5 | Avatar atlases (P7) | ⏸ not yet purchased |
| [Kenney — Particle Pack](https://kenney.nl/assets/particle-pack) | CC0 | Sparkles, motes, level-up bursts | ⏸ not yet downloaded |
| [Kenney — UI Audio + RPG Sound](https://kenney.nl/assets/ui-audio) | CC0 | Pomodoro chime, level-up cue, claim ding | ⏸ not yet downloaded |
| [Kenney — Ambient Sounds](https://kenney.nl/assets/ambient-sounds) | CC0 | Rain, fireplace, birds (cozy ambient layer) | ⏸ not yet downloaded |
| [Freesound](https://freesound.org/search/?q=lofi+room+ambient&f=license:%22Attribution%22) (CC-BY) | free | 5 lofi music tracks (different vibes) | ⏸ not yet selected |
| Google Fonts — Inter Variable + Pixelify Sans | OFL | Body + display fonts | ✅ ready to wire |
| Lucide React | npm MIT | UI icons (~30 of ~36 we need) | ✅ already in `@shizuku/web` deps |

---

## Slice 1 asset inventory (current need — by phase)

Status legend: ✅ done · 🚧 in progress · ⏸ pending · ❌ blocked

### P6 — Onboarding (active)

Consumed by `apps/web/src/components/onboarding/{AvatarStep,SpeciesStep,NameStep,TutorialStep}.tsx`.

| Asset | Path | Source | Status |
|---|---|---|---|
| 6 avatar preset cards | `apps/web/public/assets/avatars/preset-0[1-6].png` (64×64 single pose, neutral colors) | Mana Seed Character Base — compose body+hair+outfit per preset, export single down-facing idle frame | ⏸ |
| 3 species idle previews | `apps/web/public/assets/sprites/preview/{ember,ripple,quill}-stage1.png` (32×32 single idle frame) | SDXL pipeline (see "Pet pipeline" below); placeholder OK until P14 | ⏸ |
| Sparkle particle (single frame) | `apps/web/public/assets/particles/sparkle.png` (16×16) | Kenney *Particle Pack* recolored to our palette | ⏸ |
| 4 step icons (avatar, pet, name, walkthrough) | inline Lucide (`Palette`, `Cat`, `Pencil`, `Sparkles`) | Lucide — no production needed | ✅ |
| 3 tutorial-card screenshots | `apps/web/public/assets/tutorial/{walk,read,chat}.png` (room screenshots) | Take from Phaser room (P7); placeholder grey rect with caption is fine in v1 | ⏸ |

**Production order (P6):** 6 avatar presets first (Mana Seed Character Base
+ Aseprite recolor), then species placeholders (any 3 simple silhouettes
matching the palette), then real species sprites in P14.

### P9 — Reader

Consumed by `apps/web/src/components/{library,reader}/*.tsx`.

| Asset | Path | Source | Status |
|---|---|---|---|
| Empty-state illustration (library) | `apps/web/public/assets/empty/library.png` (~120×120) | SDXL — "pixel-art empty bookshelf, cozy lighting, 32×32 style" + Aseprite cleanup | ⏸ |
| Empty-state illustration (reader) | `apps/web/public/assets/empty/reader.png` (~120×120) | SDXL — same vibe | ⏸ |
| 4 highlight color swatches | inline Tailwind classes — `bg-yellow-300`, `bg-green-300`, `bg-blue-300`, `bg-pink-300` | CSS only — no production | ✅ |
| Document cover placeholder | gradient + first letter (CSS only) | none — the JSX renders the gradient | ✅ |
| Lucide icons used | `Upload`, `Trash2`, `Bookmark`, `BookmarkPlus`, `List`, `ZoomIn`, `ZoomOut`, `ChevronLeft`, `Highlighter`, `MessageCircle` | Lucide | ✅ |

### P11 — Pet chat sidebar

Consumed by `apps/web/src/components/reader/{ChatMessage,ChatInput,UsageMeter,PetChatSidebar}.tsx`.

| Asset | Path | Source | Status |
|---|---|---|---|
| Pet header thumb (per species) | reuses `apps/web/public/assets/sprites/preview/{species}-stage{n}.png` (32×32 idle) — pulled by species + `pet.evolutionStage` | shared with P6/P14 | ⏸ |
| Empty-state chat illustration | `apps/web/public/assets/empty/chat.png` (~120×120) | SDXL pet-with-book theme | ⏸ |
| Lucide icons | `Send`, `Square` (stop), `Sparkle` (refine) | Lucide | ✅ |

### P13 — Study tools UI

Consumed by `apps/web/src/components/study-tools/*.tsx`.

| Asset | Path | Source | Status |
|---|---|---|---|
| 4 metric icons (pages/minutes/chats/pomodoros) | inline Lucide — `BookOpen`, `Clock`, `Timer`, `MessageCircle` | Lucide | ✅ |
| Ink coin icon | `apps/web/public/assets/icons/ink.png` (32×32 pixel art, blue droplet) | SDXL + Aseprite cleanup | ⏸ (placeholder unicode `💧` OK in v1) |
| XP rune icon | `apps/web/public/assets/icons/xp.png` (32×32 pixel art, geometric rune) | SDXL + Aseprite cleanup | ⏸ (placeholder unicode `✦` OK in v1) |
| Streak flame | `apps/web/public/assets/icons/flame.png` (32×32) — or just emoji `🔥` for Slice 1 | SDXL or emoji | ⏸ (emoji is fine for now) |
| Pomodoro chime SFX | `apps/web/public/assets/audio/sfx/pomodoro-end.ogg` (~1s) | Kenney *UI Audio Pack* CC0 | ⏸ |
| Quest-claim ding SFX | `apps/web/public/assets/audio/sfx/quest-claim.ogg` (~0.6s) | Kenney *UI Audio* CC0 | ⏸ |
| Level-up chime SFX | `apps/web/public/assets/audio/sfx/level-up.ogg` (~1.2s) | Kenney *RPG Sound Pack* CC0 | ⏸ |

### P7 — Phaser room (deferred — biggest art lift)

Consumed by `apps/web/src/lib/phaser/scenes/RoomScene.ts` (not yet written).

| Asset | Path | Source | Status |
|---|---|---|---|
| Room tileset PNG | `apps/web/public/assets/phaser/tilesets/room.png` (32×32 grid) | LimeZu *Modern Interiors* | ⏸ |
| Room map JSON | `apps/web/public/assets/phaser/tilesets/room.json` | Tiled Map Editor — design ~20×15 cozy bedroom-study, 5 layers (floor / walls / furniture-low / objects / furniture-high), collision layer + interaction object layer | ⏸ |
| 6 avatar walk atlases | `apps/web/public/assets/phaser/sprites/avatar/preset-0[1-6].{png,json}` (4×4 grid 32×32, ~80 frames each) | Mana Seed Character Base + Aseprite onion-skin walk-cycle hand-tween | ⏸ |
| 9 pet sprite atlases | `apps/web/public/assets/phaser/sprites/pets/{ember,ripple,quill}-stage[1-3].{png,json}` (4×4 grid 32×32, ~24 frames each) | SDXL pipeline — see "Pet pipeline" below | ⏸ |
| Particle textures | `apps/web/public/assets/phaser/particles/{spark,leaf,dust}.png` (16×16) | Kenney *Particle Pack* recolored | ⏸ |

### P14 — Pet polish + evolution

| Asset | Path | Source | Status |
|---|---|---|---|
| 9 pet atlases (full walk + idle) | shared with P7 row above | SDXL pipeline | ⏸ |
| Evolution background | `apps/web/public/assets/phaser/sprites/cutscene/evolution-bg.png` (full-screen, ~720×480 pixel art) | SDXL "pixel-art ethereal background, cosmic, soft glow" | ⏸ |
| Sparkle ring (evolution) | `apps/web/public/assets/phaser/sprites/cutscene/sparkle-ring.png` (8 frames, 64×64 each) | SDXL or hand-paint in Aseprite | ⏸ |
| Name banner (evolution) | `apps/web/public/assets/phaser/sprites/cutscene/name-banner.png` | hand-paint in Aseprite (palette banner + text overlay drawn at runtime) | ⏸ |
| Evolution chime SFX | `apps/web/public/assets/audio/sfx/evolution.ogg` | Kenney *RPG Sound Pack* CC0 | ⏸ |

### P15 — Cozy ambient layer

Consumed by `apps/web/src/stores/ambientStore.ts`, `lib/utils/sound.ts`, `hooks/useTimeOfDay.ts` (already wired) + future `MusicPicker` / `FocusModeToggle` JSX.

| Asset | Path | Source | Status |
|---|---|---|---|
| 5 lofi music tracks (different vibes) | `apps/web/public/assets/audio/music/{rainy-night,morning-sun,late-library,snowfall,study-cafe}.ogg` (3-5 min each, looped) | Freesound CC-BY — credit in `apps/web/public/credits.html` | ⏸ |
| Rain ambience | `apps/web/public/assets/audio/ambience/rain.ogg` (loopable) | Kenney *Ambient Sounds* CC0 | ⏸ |
| Fireplace ambience | `apps/web/public/assets/audio/ambience/fireplace.ogg` | Kenney *Ambient Sounds* CC0 | ⏸ |
| Birds ambience | `apps/web/public/assets/audio/ambience/birds.ogg` | Kenney *Ambient Sounds* CC0 | ⏸ |
| Vinyl-record UI control art | inline CSS gradient + spinning `<div>` (no asset needed) | CSS | ✅ |

---

## Pet sprite pipeline (the unique-to-you art track)

This is the most distinctive art lift in Slice 1: 9 pet atlases (3 species ×
3 evolution stages), each ~24 frames, generated via SDXL + LoRA, cleaned in
Aseprite, exported to Phaser-compatible atlases.

**Pets are locked.** Don't change them after this point — animation cadence,
file paths, and prompts depend on these names + numbers.

| Species | Stages (level threshold) | Theme |
|---|---|---|
| **Ember** (fire fox) | Sprout (L1) → Spark (L8) → Inferno (L20) | Bold, encouraging; fire/spark metaphors |
| **Ripple** (water otter) | Drop (L1) → Stream (L8) → Tide (L20) | Calm, reflective; river/flow metaphors |
| **Quill** (forest owl) | Page (L1) → Chapter (L8) → Tome (L20) | Scholarly, dry-witty; book/page metaphors |

### One-time setup

Run these BEFORE producing any pet sprites. Order matters.

1. **Install Aseprite** ($20 — itch.io or Steam). Open it once to confirm
   it launches.
2. **Create `design/palette.gpl`** — the shared 48-color palette. Pick any
   pixel-art reference set (Pokémon Gen 3 sprite rips work) and run a
   color-quantization pass to extract 48 colors. Save as Aseprite GPL
   format. Commit `design/palette.gpl` to the repo.
3. **Create the SDXL Replicate token.** Sign up at replicate.com, generate
   an API token, paste into a local `.env.scripts`:
   ```
   REPLICATE_API_TOKEN=r8_…
   ```
4. **Create `scripts/art/`** with these files (templates to be added in a
   future commit; track here):
   - `quantize.py` — load PNG → nearest-neighbor downscale to 32×32 →
     `Image.quantize(palette=palette_image, dither=Dither.NONE)` against
     `design/palette.gpl`.
   - `prompt-builder.py` — takes species + stage briefs (below) and emits
     refined SDXL prompts via gpt-4o (one OpenAI call per atlas).
   - `build-atlas.sh` — Aseprite CLI wrapper that takes a folder of cleaned
     PNG frames, exports a 4×4 atlas + JSON sidecar.
   - `validate-atlas.py` — verify expected frame counts + tags exist before
     commit. Failing CI gate.

### Per-atlas workflow (~2 hours each, ~18 hours total for 9 atlases)

For each species × stage combination:

**1. Brief → SDXL prompt** (5 min). Plug into `scripts/art/prompt-builder.py`:

```
Species: ember | ripple | quill
Stage:   1 (Sprout/Drop/Page) | 2 (Spark/Stream/Chapter) | 3 (Inferno/Tide/Tome)
```

The script emits an SDXL prompt like:

```
32x32 pixel art, Pokémon Gen 3 sprite style, [creature description for stage], idle pose facing camera, soft outlines, 4-6 color palette per element, transparent background, centered composition, sprite sheet ready, no anti-aliasing
```

Plus the negative prompt:

```
anti-aliasing, blurry, photorealistic, 3D, smooth gradients, modern UI illustration, anime, watercolor, oil painting, multiple characters, text
```

**2. Generate** (15-20 min, ~$0.08). Run on Replicate with `nerijs/pixel-art-xl`
LoRA strength 0.85. Generate 16 candidate poses at 1024×1024.

**3. Cherry-pick** (5 min). Pick 3-4 cleanest poses for: idle, walk-down,
walk-left, walk-right, walk-up.

**4. Cross-stage consistency** (only Stages 2+3, 10 min). Feed the chosen
Stage-1 silhouette into ControlNet (canny edge mode) when generating
Stage-2/Stage-3. Bias the model to evolve the silhouette naturally.

**5. Quantize** (1 min): `python scripts/art/quantize.py raw/ember-stage1-pose1.png`.

**6. Hand-clean in Aseprite** (30-60 min). Open the quantized PNG. Use
"Pixel-perfect" tool always on. Fix sub-pixel artifacts, broken outlines,
palette drift. Then use onion-skin to hand-tween the 4 walk frames per
direction from one cleaned reference pose. Faster than fighting SDXL for
walk-cycle frame consistency.

**7. Atlas assembly** (10 min). Run `scripts/art/build-atlas.sh ember stage1`.
Outputs `apps/web/public/assets/phaser/sprites/pets/ember-stage1.{png,json}`.

**8. Validate** (1 min). `python scripts/art/validate-atlas.py
apps/web/public/assets/phaser/sprites/pets/ember-stage1.json` — fails CI
if frame counts wrong.

**Hard time-box: 2 hours per atlas.** Anything over goes into a "polish
later" tag for week 7. Don't perfectionism-stall a single sprite.

### Plan B trigger (end of week 2)

If by end of week 2 you don't have at least one Stage-1 pet atlas at
"I'd ship this" quality:

- Commission 9 atlases on r/pixelart Hire-an-Artist or Itch.io
  (~$300-500 total, ~4-week lead time).
- Use [Kenney *Tiny Battle Pack*](https://kenney.nl/assets/tiny-battle) or
  similar CC0 monsters as placeholders weeks 3-6.
- Keep AI pipeline for UI icons + particles regardless — those are simpler
  and safer to AI-generate.

---

## Avatar pipeline (Mana Seed Character Base, ~6-8 hours total)

The 6 avatar presets are the user's character in the room.

1. **Buy + download** Mana Seed Character Base (~$5).
2. **Compose 6 fixed presets** in Aseprite by stacking body + hair + outfit
   layers from the pack. Recommended hair/outfit combinations:
   - **P1**: short hair + casual hoodie
   - **P2**: long hair + sweater
   - **P3**: ponytail + jacket
   - **P4**: short curls + button-up
   - **P5**: bun + cardigan
   - **P6**: undercut + t-shirt
3. **Export single-pose card** (P6 onboarding need): `apps/web/public/assets/avatars/preset-0X.png` — 64×64 down-facing idle frame, neutral coloring.
4. **Export full walk atlas** (P7 Phaser need): `apps/web/public/assets/phaser/sprites/avatar/preset-0X.{png,json}` — 4×4 grid (down/left/right/up × 4-frame walk).

**Recolor at runtime, not pre-baked.** The atlases stay neutral; recolor
applies via:

- `AvatarPreview` (form preview): CSS `filter: hue-rotate(${hueShift}deg) saturate(${100+satShift}%)`
- Phaser room: `sprite.setTint()` driven by `users.avatarConfig.{hueShift, satShift}`

---

## Tilemap pipeline (LimeZu Modern Interiors, ~4-6 hours)

1. **Buy** LimeZu Modern Interiors (~$20). Download the tileset PNG.
2. **Open Tiled** Map Editor. Import the tileset.
3. **Lay out a ~20×15 cozy bedroom-study.** Required interactions:
   - **Desk + chair** — `OPEN_READER` interaction (invisible object zone over the desk).
   - **Pet house / pet zone** — `OPEN_CHAT` interaction (clickable pet sprite).
   - **Window with curtains** (for time-of-day tint to look right).
   - **Bookshelf, rug, lamp, potted plant, optional bed** — atmosphere.
4. **5-layer structure (locked):**
   1. `floor` — wood / carpet
   2. `walls` — wallpaper, window frame
   3. `furniture-low` — rug, low items
   4. `objects` — interactable: desk, pet house (Phaser collision + interaction zones)
   5. `furniture-high` — bookshelf top, lamp top — drawn ABOVE the player so they walk behind
5. **Collision layer** — mark non-walkable tiles (walls, large furniture) for EasyStar.js + Phaser physics.
6. **Object layer** — invisible rectangles over desk + pet zone, with custom properties `interaction: 'reader' | 'chat'` so the React-Phaser bridge can dispatch the right event.
7. **Export** as JSON (embedded tilesets) → `apps/web/public/assets/phaser/tilesets/room.json` and `room.png`.

---

## UI icons (~80% Lucide, ~6 custom)

The 6 brand-specific icons we generate ourselves:

| Icon | Used in | SDXL prompt fragment |
|---|---|---|
| Ink coin | StatsTodayCard, QuestCard reward | "32×32 pixel art coin, blue ink droplet motif, soft outline" |
| XP rune | StatsTodayCard, QuestCard reward | "32×32 pixel art geometric rune, magenta glow, mystical" |
| Streak flame | StreakBadge | "32×32 pixel art flame, ember orange-red, lively shape" |
| Pomodoro ring | PomodoroTimer (optional) | "32×32 pixel art tomato with leaf, cute, simple" |
| Evolution arrow | EvolutionScene cutscene | "32×32 pixel art upward arrow with sparkles, magical" |
| Level badge | LevelUpToast | "32×32 pixel art shield with star, gold accent" |

All other icons (Upload, Trash2, BookOpen, MessageCircle, etc.) come from
Lucide React — no production needed. Use these via `import { Upload } from 'lucide-react'`.

---

## Audio inventory

| Cue | Path | Trigger | Source |
|---|---|---|---|
| `pomodoro-end.ogg` | `assets/audio/sfx/` | Focus block ends | Kenney *UI Audio* CC0 |
| `pomodoro-tick.ogg` (optional) | `assets/audio/sfx/` | 30s before end | Kenney *UI Audio* CC0 |
| `quest-claim.ogg` | `assets/audio/sfx/` | User claims a quest | Kenney *UI Audio* CC0 |
| `level-up.ogg` | `assets/audio/sfx/` | Pet (or user) levels up | Kenney *RPG Sound Pack* CC0 |
| `evolution.ogg` | `assets/audio/sfx/` | Pet evolves | Kenney *RPG Sound Pack* CC0 |
| `chat-refinable.ogg` (optional) | `assets/audio/sfx/` | Judge flags response | Kenney *UI Audio* CC0 (quiet) |
| 5 lofi tracks | `assets/audio/music/` | Room ambient music picker | Freesound CC-BY |
| 4 ambience loops | `assets/audio/ambience/` | Layered under music in room | Kenney *Ambient Sounds* CC0 |

**Loudness target:** −18 LUFS for music, −24 LUFS for SFX. Audacity can
normalize. Loop seamlessly via Audacity's "Repeat" preview.

**Attribution:** every CC-BY asset gets a row in `apps/web/public/credits.html`
with author + license URL. CC0 assets don't need attribution but list them
anyway for transparency.

---

## Status table (single-shot summary)

Update the **Status** column on every commit that produces an asset.

| Phase | Asset | Status | Notes |
|---|---|---|---|
| P6 | 6 avatar preset cards | ⏸ | Mana Seed pack purchase pending |
| P6 | 3 species idle previews (placeholder) | ⏸ | Coloured circles fine until P14 |
| P6 | Sparkle particle | ⏸ | Kenney recolor |
| P9 | Library empty-state illustration | ⏸ | SDXL one-off |
| P9 | Reader empty-state illustration | ⏸ | SDXL one-off |
| P11 | Chat empty-state illustration | ⏸ | SDXL one-off |
| P13 | Ink coin icon | ⏸ | Unicode placeholder OK |
| P13 | XP rune icon | ⏸ | Unicode placeholder OK |
| P13 | Pomodoro chime SFX | ⏸ | Kenney pack |
| P13 | Quest-claim ding SFX | ⏸ | Kenney pack |
| P13 | Level-up chime SFX | ⏸ | Kenney pack |
| P7 | Room tileset PNG + JSON | ⏸ | LimeZu purchase pending |
| P7 | 6 avatar walk atlases | ⏸ | Mana Seed → Aseprite |
| P7 | 9 pet sprite atlases | ⏸ | SDXL pipeline (~18hr) |
| P7 | Particle textures | ⏸ | Kenney recolor |
| P14 | Evolution background | ⏸ | SDXL one-off |
| P14 | Sparkle ring (evolution) | ⏸ | Aseprite hand-paint |
| P14 | Name banner (evolution) | ⏸ | Aseprite hand-paint |
| P14 | Evolution chime SFX | ⏸ | Kenney pack |
| P15 | 5 lofi music tracks | ⏸ | Freesound CC-BY selection |
| P15 | 4 ambience loops | ⏸ | Kenney pack |

---

## When this file gets edited

- **Adding a new component that needs an asset** → add a row to its phase
  section (path, source, status).
- **An asset ships** → flip status from ⏸ → ✅ and link the commit hash in a
  trailing parenthetical: `✅ (commit abc1234)`.
- **A decision flips** (palette change, species swap, tool switch) → update
  the "Style guide (locked)" or "Source vendors" sections in-place. Don't
  preserve the old decision in this file; commit history covers history.
- **A whole phase deferred** → mark its rows ⏸ and add a one-line "deferred
  to Slice 1.5+" note in that section header.

---

_Last updated: P10.8 (chat tests) shipped. No new asset needs introduced
this session — the testing infrastructure doesn't consume art._
