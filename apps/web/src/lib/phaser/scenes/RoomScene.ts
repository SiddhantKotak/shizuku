import Phaser from 'phaser';
import { bridge } from '../bridge.js';

/**
 * RoomScene — the user's Private Study.
 *
 * Asset-blocked scene. Until tilemap + avatar + pet sprites land, this
 * scene draws placeholder rectangles for the player + pet so the
 * React-Phaser bridge can be exercised end-to-end without art.
 *
 * Once assets are present (per `assets.ts.exists` flags), this scene will
 * be expanded with:
 *   - Tilemap render with 5 layers (floor, walls, furniture-low, objects,
 *     furniture-high) and a collision pass
 *   - PlayerSprite with WASD + click-to-move (EasyStar.js A* pathfinder)
 *   - PetSprite with follower system (ring buffer of player positions,
 *     lerp 0.18, snap-blink if gap > 6 tiles)
 *   - Interaction zones over desk + pet (emit OPEN_READER / OPEN_CHAT
 *     via the bridge)
 *   - Camera follow with 0.15 lerp
 *
 * For now: a clickable colored square stands in for the pet, and clicking
 * it emits OPEN_CHAT. That single wire validates the bridge integration.
 */
export class RoomScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RoomScene' });
  }

  create(): void {
    // Placeholder backdrop — neutral cozy color until the tilemap lands.
    this.cameras.main.setBackgroundColor(0x2c2a3e);

    const w = this.scale.width;
    const h = this.scale.height;

    this.add
      .text(w / 2, 32, 'Your Private Study', {
        fontFamily: 'Pixelify Sans, monospace',
        fontSize: '24px',
        color: '#fde7a1',
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, 60, '(art assets land per ART_PLAN.md → P7/P14)', {
        fontFamily: 'Inter, sans-serif',
        fontSize: '11px',
        color: '#cccccc',
      })
      .setOrigin(0.5);

    // Player placeholder — small white square at center.
    const player = this.add.rectangle(w / 2, h / 2, 32, 32, 0xffffff);
    player.setStrokeStyle(2, 0xff7a45);
    this.input.keyboard?.on('keydown-W', () => (player.y -= 16));
    this.input.keyboard?.on('keydown-S', () => (player.y += 16));
    this.input.keyboard?.on('keydown-A', () => (player.x -= 16));
    this.input.keyboard?.on('keydown-D', () => (player.x += 16));

    // Pet placeholder — colored square. Clickable; emits OPEN_CHAT.
    const pet = this.add.rectangle(w / 2 + 80, h / 2, 32, 32, 0xff7a45);
    pet.setInteractive({ useHandCursor: true });
    pet.on('pointerdown', () => bridge.emit('OPEN_CHAT', undefined));

    // Desk placeholder — labeled rect. Click → OPEN_READER.
    const desk = this.add.rectangle(w / 2 - 100, h / 2, 64, 32, 0x6e5a3c);
    desk.setInteractive({ useHandCursor: true });
    desk.on('pointerdown', () => bridge.emit('OPEN_READER', {}));
    this.add
      .text(w / 2 - 100, h / 2 + 24, 'desk', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // React → Phaser examples (no-op for now, but proves wiring).
    bridge.on('SWAP_PET_SPRITE', ({ species }) => {
      pet.fillColor = species === 'ember' ? 0xff7a45 : species === 'ripple' ? 0x4a90e2 : 0x7b6ec1;
    });
    bridge.on('PET_THINKING', (thinking) => {
      pet.setStrokeStyle(thinking ? 3 : 0, 0xfde7a1);
    });

    bridge.emit('GAME_READY', undefined);
  }
}
