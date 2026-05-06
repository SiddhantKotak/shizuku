import Phaser from 'phaser';
import { ASSETS, hasAssetsAvailable } from '../assets';

/**
 * BootScene — preloads tilemap, sprites, and audio for the room. Renders a
 * simple progress bar while loading.
 *
 * Asset paths are centralized in `apps/web/src/lib/phaser/assets.ts` so the
 * art pipeline can land files (`apps/web/public/assets/phaser/...`) without
 * touching scene code. When an expected asset doesn't exist yet, BootScene
 * skips the load and continues — RoomScene will render placeholder shapes
 * for missing sprites.
 *
 * Transitions to RoomScene on complete.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.drawProgressBar();

    // Tilemap — only attempt load if the file exists per the asset registry.
    if (hasAssetsAvailable.tilemap) {
      this.load.tilemapTiledJSON('room-map', ASSETS.tilemap.json);
      this.load.image('room-tileset', ASSETS.tilemap.image);
    }
    // Avatar atlases — load whichever presets are present.
    for (const preset of ASSETS.avatars) {
      if (preset.exists) {
        this.load.atlas(preset.key, preset.image, preset.json);
      }
    }
    // Pet atlases — same lazy load.
    for (const pet of ASSETS.pets) {
      if (pet.exists) {
        this.load.atlas(pet.key, pet.image, pet.json);
      }
    }
    // Particles.
    if (hasAssetsAvailable.particles) {
      this.load.image('spark', ASSETS.particles.spark);
    }
  }

  create(): void {
    this.scene.start('RoomScene');
  }

  /**
   * Centered progress bar that fills during preload. Pure pixel-perfect so
   * it matches the rest of the visual style without needing assets.
   */
  private drawProgressBar(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const barW = 240;
    const barH = 8;
    const bg = this.add.rectangle(w / 2, h / 2, barW, barH, 0x1a1a1a);
    bg.setOrigin(0.5);
    const fill = this.add.rectangle(w / 2 - barW / 2, h / 2, 0, barH, 0xff7a45);
    fill.setOrigin(0, 0.5);

    this.load.on('progress', (p: number) => {
      fill.width = barW * p;
    });
    this.load.on('complete', () => {
      bg.destroy();
      fill.destroy();
    });
  }
}
