/**
 * Asset registry for Phaser scenes. Each entry has `exists: boolean`
 * computed from a manifest the build pipeline can stamp later. For now,
 * all default to `false` so BootScene skips them and RoomScene falls back
 * to placeholder shapes.
 *
 * When art lands per `ART_PLAN.md`:
 *   1. Drop the file at the indicated path under `apps/web/public/`.
 *   2. Flip `exists: true` on the matching row.
 *   3. The next reload picks it up.
 *
 * Eventually this manifest gets generated from a `scripts/art/manifest.ts`
 * that scans `apps/web/public/assets/phaser/` at build time. For now,
 * hand-edit this file as you produce art.
 */

const PUB = '/assets/phaser';

export const ASSETS = {
  tilemap: {
    json: `${PUB}/tilesets/room.json`,
    image: `${PUB}/tilesets/room.png`,
  },
  avatars: [
    {
      key: 'avatar-01',
      image: `${PUB}/sprites/avatar/preset-01.png`,
      json: `${PUB}/sprites/avatar/preset-01.json`,
      exists: false,
    },
    {
      key: 'avatar-02',
      image: `${PUB}/sprites/avatar/preset-02.png`,
      json: `${PUB}/sprites/avatar/preset-02.json`,
      exists: false,
    },
    {
      key: 'avatar-03',
      image: `${PUB}/sprites/avatar/preset-03.png`,
      json: `${PUB}/sprites/avatar/preset-03.json`,
      exists: false,
    },
    {
      key: 'avatar-04',
      image: `${PUB}/sprites/avatar/preset-04.png`,
      json: `${PUB}/sprites/avatar/preset-04.json`,
      exists: false,
    },
    {
      key: 'avatar-05',
      image: `${PUB}/sprites/avatar/preset-05.png`,
      json: `${PUB}/sprites/avatar/preset-05.json`,
      exists: false,
    },
    {
      key: 'avatar-06',
      image: `${PUB}/sprites/avatar/preset-06.png`,
      json: `${PUB}/sprites/avatar/preset-06.json`,
      exists: false,
    },
  ] as ReadonlyArray<AvatarEntry>,
  pets: [
    {
      key: 'ember-stage1',
      image: `${PUB}/sprites/pets/ember-stage1.png`,
      json: `${PUB}/sprites/pets/ember-stage1.json`,
      exists: false,
    },
    {
      key: 'ember-stage2',
      image: `${PUB}/sprites/pets/ember-stage2.png`,
      json: `${PUB}/sprites/pets/ember-stage2.json`,
      exists: false,
    },
    {
      key: 'ember-stage3',
      image: `${PUB}/sprites/pets/ember-stage3.png`,
      json: `${PUB}/sprites/pets/ember-stage3.json`,
      exists: false,
    },
    {
      key: 'ripple-stage1',
      image: `${PUB}/sprites/pets/ripple-stage1.png`,
      json: `${PUB}/sprites/pets/ripple-stage1.json`,
      exists: false,
    },
    {
      key: 'ripple-stage2',
      image: `${PUB}/sprites/pets/ripple-stage2.png`,
      json: `${PUB}/sprites/pets/ripple-stage2.json`,
      exists: false,
    },
    {
      key: 'ripple-stage3',
      image: `${PUB}/sprites/pets/ripple-stage3.png`,
      json: `${PUB}/sprites/pets/ripple-stage3.json`,
      exists: false,
    },
    {
      key: 'quill-stage1',
      image: `${PUB}/sprites/pets/quill-stage1.png`,
      json: `${PUB}/sprites/pets/quill-stage1.json`,
      exists: false,
    },
    {
      key: 'quill-stage2',
      image: `${PUB}/sprites/pets/quill-stage2.png`,
      json: `${PUB}/sprites/pets/quill-stage2.json`,
      exists: false,
    },
    {
      key: 'quill-stage3',
      image: `${PUB}/sprites/pets/quill-stage3.png`,
      json: `${PUB}/sprites/pets/quill-stage3.json`,
      exists: false,
    },
  ] as ReadonlyArray<PetEntry>,
  particles: {
    spark: `${PUB}/particles/spark.png`,
  },
} as const;

interface AvatarEntry {
  key: string;
  image: string;
  json: string;
  exists: boolean;
}
interface PetEntry {
  key: string;
  image: string;
  json: string;
  exists: boolean;
}

/**
 * Quick boolean rollup so BootScene doesn't scan the array for each
 * preload check. Flip these as you ship art.
 */
export const hasAssetsAvailable = {
  tilemap: false,
  particles: false,
} as const;
