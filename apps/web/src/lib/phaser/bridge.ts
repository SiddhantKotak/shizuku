import mitt, { type Emitter } from 'mitt';

/**
 * The ONLY sanctioned channel between React and Phaser.
 *
 * React components emit / listen via this typed mitt bus. Phaser scenes
 * import the same `bridge` and emit / listen on it. Everything stays
 * type-safe through `BridgeEvents` below — adding a new event = adding a
 * row here = TypeScript autocompletes both sides.
 *
 * Why a bus, not a Zustand store: React subscribers are fine with stores,
 * but Phaser scenes don't have a React lifecycle, and the store would
 * double-render React on every Phaser tick. The bus is fire-and-forget;
 * subscribers opt in.
 *
 * Lifetime: bound to the lifetime of the React tab. Both sides clean up
 * their listeners on unmount / scene shutdown.
 */

// `mitt` requires the event map to be a Record<EventType, unknown>, which
// `interface` doesn't satisfy because TS interfaces have no implicit
// index signature. Using `type` makes the constraint pass.
export type BridgeEvents = {
  // ─── Phaser → React ───────────────────────────────────────────────────
  /** Emitted when the Phaser game has loaded its assets and the room is interactive. */
  GAME_READY: undefined;
  /** Player position changed — debounced to ~10Hz inside the scene. */
  PLAYER_MOVED: { x: number; y: number };
  /** Player is overlapping an interactable. `null` = no overlap. */
  NEAR_INTERACTABLE: { kind: 'desk' | 'pet'; documentId?: string } | null;
  /** Player levelled up (XP threshold crossed in the room). */
  LEVEL_UP: { newLevel: number };
  /** Pet evolution triggered — React shows the cutscene overlay; scene pauses. */
  EVOLUTION_TRIGGERED: { fromStage: 1 | 2 | 3; toStage: 1 | 2 | 3 };

  // ─── React → Phaser ───────────────────────────────────────────────────
  /** React asks Phaser to open the reader for the document at the desk. */
  OPEN_READER: { documentId?: string };
  /** React asks Phaser to open the chat sidebar (after pet click). */
  OPEN_CHAT: undefined;
  /** TutorialOverlay asks the camera/scene to pan to a specific tile. */
  REQUEST_FOCUS_TARGET: { tileX: number; tileY: number };
  /** Pet "thinking" animation toggle — fired when chat stream starts/ends. */
  PET_THINKING: boolean;
  /** Time-of-day system: apply tint to room scene. */
  APPLY_TIME_OF_DAY_TINT: { tint: number; period: 'morning' | 'afternoon' | 'evening' | 'night' };
  /** Pet sprite needs to swap (e.g. evolution finished). */
  SWAP_PET_SPRITE: { species: 'ember' | 'ripple' | 'quill'; stage: 1 | 2 | 3 };
};

/** Singleton emitter — both sides import this to talk to each other. */
export const bridge: Emitter<BridgeEvents> = mitt<BridgeEvents>();

/**
 * Hook helper for React. Subscribes to a bridge event for the lifetime of
 * the component, auto-unsubscribes on unmount.
 *
 * Usage:
 *   useBridge('PLAYER_MOVED', ({ x, y }) => setPosition({ x, y }));
 */
import { useEffect } from 'react';

export function useBridge<K extends keyof BridgeEvents>(
  event: K,
  handler: (payload: BridgeEvents[K]) => void,
): void {
  useEffect(() => {
    bridge.on(event, handler);
    return () => bridge.off(event, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}

// ─── Phaser-side game accessor ────────────────────────────────────────────
// Stored separately so React can call `bridge.dispatch('OPEN_READER', ...)`
// AND access the Phaser instance for direct calls (rare). Most React→Phaser
// communication SHOULD go through the bus; this is for things like
// `game.destroy()` on unmount.
import type Phaser from 'phaser';

let gameInstance: Phaser.Game | null = null;

export function setPhaserGame(game: Phaser.Game | null): void {
  gameInstance = game;
  if (game) bridge.emit('GAME_READY', undefined);
}

export function getPhaserGame(): Phaser.Game | null {
  return gameInstance;
}
