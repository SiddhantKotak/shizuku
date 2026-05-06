import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { RoomScene } from './scenes/RoomScene.js';
import { setPhaserGame } from './bridge.js';

/**
 * Build the single Phaser.Game instance. Called from `RoomCanvas` (a React
 * component the user creates in Antigravity) inside a `useLayoutEffect` so
 * Strict-Mode double-invocation is guarded by a ref.
 *
 * Lifecycle:
 *   - Mount: createGame(parent) — registers the game with the bridge.
 *   - Unmount: game.destroy(true) + setPhaserGame(null).
 *
 * Why a factory and not a singleton: tests + storybook may want fresh
 * games. The singleton-ness is enforced at the React component level
 * (the route only mounts RoomCanvas once at a time).
 */
export function createGame(parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || 960,
    height: parent.clientHeight || 540,
    backgroundColor: '#2c2a3e',
    pixelArt: true, // disable smoothing — strict pixel grid
    roundPixels: true,
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, RoomScene],
  });
  setPhaserGame(game);
  return game;
}
