import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { pets } from '@shizuku/db/schema';
import { buildTestApp, cleanupTestUsers, type TestAppHandle } from './helpers/buildTestApp.js';
import { uniqueEmail } from './helpers/uniqueEmail.js';
import {
  STAGE_THRESHOLDS,
  canEvolve,
  eligibleEvolutionStageForLevel,
  levelForXp,
  xpRequiredForLevel,
} from '../src/services/pets/engine.js';

let handle: TestAppHandle;

beforeAll(async () => {
  handle = await buildTestApp();
  await handle.app.ready();
});

afterAll(async () => {
  await cleanupTestUsers(handle.app);
  await handle.app.close();
});

const PASSWORD = 'correct horse battery staple 9';

interface SessionResponse {
  data: { accessToken: string; user: { id: string } };
}

async function signup(): Promise<{ accessToken: string; userId: string }> {
  const res = await handle.app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: { email: uniqueEmail(), password: PASSWORD, displayName: 'Pets Test' },
  });
  const body = res.json<SessionResponse>();
  return { accessToken: body.data.accessToken, userId: body.data.user.id };
}

describe('pet engine — XP curve + evolution', () => {
  it('xpRequiredForLevel(1) === 0 (start of L1)', () => {
    expect(xpRequiredForLevel(1)).toBe(0);
  });

  it('levelForXp is the inverse of xpRequiredForLevel', () => {
    for (const lvl of [1, 2, 5, 8, 10, 15, 20, 25]) {
      expect(levelForXp(xpRequiredForLevel(lvl))).toBe(lvl);
    }
  });

  it('STAGE_THRESHOLDS gate eligibleEvolutionStageForLevel correctly', () => {
    expect(eligibleEvolutionStageForLevel(STAGE_THRESHOLDS.stage2 - 1)).toBe(1);
    expect(eligibleEvolutionStageForLevel(STAGE_THRESHOLDS.stage2)).toBe(2);
    expect(eligibleEvolutionStageForLevel(STAGE_THRESHOLDS.stage3 - 1)).toBe(2);
    expect(eligibleEvolutionStageForLevel(STAGE_THRESHOLDS.stage3)).toBe(3);
  });

  it('canEvolve returns true only when stage is behind eligible', () => {
    expect(canEvolve({ level: 1, evolutionStage: 1 })).toBe(false);
    expect(canEvolve({ level: STAGE_THRESHOLDS.stage2, evolutionStage: 1 })).toBe(true);
    expect(canEvolve({ level: STAGE_THRESHOLDS.stage2, evolutionStage: 2 })).toBe(false);
    expect(canEvolve({ level: STAGE_THRESHOLDS.stage3, evolutionStage: 2 })).toBe(true);
    expect(canEvolve({ level: STAGE_THRESHOLDS.stage3, evolutionStage: 3 })).toBe(false);
  });
});

describe('POST /v1/pets', () => {
  it('creates the first pet with valid species + name', async () => {
    const { accessToken } = await signup();
    const res = await handle.app.inject({
      method: 'POST',
      url: '/v1/pets',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { species: 'ember', name: 'Cinder' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ data: { species: string; name: string; level: number } }>();
    expect(body.data.species).toBe('ember');
    expect(body.data.name).toBe('Cinder');
    expect(body.data.level).toBe(1);
  });

  it('rejects a second pet (one active per user)', async () => {
    const { accessToken } = await signup();
    await handle.app.inject({
      method: 'POST',
      url: '/v1/pets',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { species: 'ripple', name: 'Splash' },
    });
    const second = await handle.app.inject({
      method: 'POST',
      url: '/v1/pets',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { species: 'quill', name: 'Inkling' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json<{ error: { code: string } }>().error.code).toBe('pet_already_active');
  });

  it('rejects unknown species (Zod enum)', async () => {
    const { accessToken } = await signup();
    const res = await handle.app.inject({
      method: 'POST',
      url: '/v1/pets',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { species: 'pikachu', name: 'Sparky' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /v1/pets/me + PATCH', () => {
  it('GET returns 404 before pet creation, then the pet after', async () => {
    const { accessToken } = await signup();
    const before = await handle.app.inject({
      method: 'GET',
      url: '/v1/pets/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(before.statusCode).toBe(404);

    await handle.app.inject({
      method: 'POST',
      url: '/v1/pets',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { species: 'quill', name: 'Inkling' },
    });
    const after = await handle.app.inject({
      method: 'GET',
      url: '/v1/pets/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(after.statusCode).toBe(200);
    expect(after.json<{ data: { species: string } }>().data.species).toBe('quill');
  });

  it('PATCH /me renames the pet', async () => {
    const { accessToken } = await signup();
    await handle.app.inject({
      method: 'POST',
      url: '/v1/pets',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { species: 'ember', name: 'OldName' },
    });
    const res = await handle.app.inject({
      method: 'PATCH',
      url: '/v1/pets/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'NewName' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { name: string } }>().data.name).toBe('NewName');
  });
});

describe('POST /v1/pets/me/evolve', () => {
  it('refuses to evolve a level-1 pet (pet_not_evolvable)', async () => {
    const { accessToken } = await signup();
    await handle.app.inject({
      method: 'POST',
      url: '/v1/pets',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { species: 'ember', name: 'Newt' },
    });
    const res = await handle.app.inject({
      method: 'POST',
      url: '/v1/pets/me/evolve',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('pet_not_evolvable');
  });

  it('evolves a stage-1 pet that has reached the stage-2 level threshold', async () => {
    const { accessToken, userId } = await signup();
    const create = await handle.app.inject({
      method: 'POST',
      url: '/v1/pets',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { species: 'ripple', name: 'Brook' },
    });
    const petId = create.json<{ data: { id: string } }>().data.id;
    void userId;

    // Set the pet to stage-2 threshold
    await handle.app.db
      .update(pets)
      .set({ level: STAGE_THRESHOLDS.stage2, xp: xpRequiredForLevel(STAGE_THRESHOLDS.stage2) })
      .where(eq(pets.id, petId));

    const res = await handle.app.inject({
      method: 'POST',
      url: '/v1/pets/me/evolve',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(
      res.json<{ data: { evolutionStage: number; level: number } }>().data.evolutionStage,
    ).toBe(2);
  });
});
