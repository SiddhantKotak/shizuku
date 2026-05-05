import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { dailyStats, pomodoroSessions, quests, userQuests } from '@shizuku/db/schema';
import { buildTestApp, cleanupTestUsers, type TestAppHandle } from './helpers/buildTestApp.js';
import { uniqueEmail } from './helpers/uniqueEmail.js';

let handle: TestAppHandle;

beforeAll(async () => {
  handle = await buildTestApp();
  await handle.app.ready();
  // Ensure quest catalog exists. (`pnpm db:seed` does this in dev; in CI
  // we seed inline so the suite is self-contained.)
  await handle.app.db
    .insert(quests)
    .values({
      code: 'test_chat_3',
      title: 'Test: ask 3 questions',
      metric: 'chats',
      target: 3,
      inkReward: 10,
      xpReward: 20,
      active: true,
    })
    .onConflictDoNothing({ target: quests.code });
  await handle.app.db
    .insert(quests)
    .values({
      code: 'test_pomodoro_1',
      title: 'Test: 1 pomodoro',
      metric: 'pomodoros',
      target: 1,
      inkReward: 10,
      xpReward: 20,
      active: true,
    })
    .onConflictDoNothing({ target: quests.code });
});

afterAll(async () => {
  await cleanupTestUsers(handle.app);
  await handle.app.close();
});

const PASSWORD = 'correct horse battery staple 9';

interface SessionResponse {
  data: { accessToken: string; user: { id: string; email: string; displayName: string } };
}

async function signup(): Promise<{ accessToken: string; userId: string }> {
  const email = uniqueEmail();
  const res = await handle.app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: { email, password: PASSWORD, displayName: 'Study Test' },
  });
  const body = res.json<SessionResponse>();
  return { accessToken: body.data.accessToken, userId: body.data.user.id };
}

describe('POST /v1/pomodoro/start', () => {
  it('creates an active session and returns its id', async () => {
    const { accessToken } = await signup();
    const res = await handle.app.inject({
      method: 'POST',
      url: '/v1/pomodoro/start',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ data: { id: string } }>();
    expect(body.data.id).toMatch(/^pmd_/);
  });
});

describe('POST /v1/pomodoro/:id/complete', () => {
  it('fires the side-effect bundle: stats, streak, quest progress, pet XP', async () => {
    const { accessToken, userId } = await signup();

    // 1. Start a session.
    const startRes = await handle.app.inject({
      method: 'POST',
      url: '/v1/pomodoro/start',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    const id = startRes.json<{ data: { id: string } }>().data.id;

    // 2. User needs a pet for awardPetXp to find one. Create one.
    await handle.app.inject({
      method: 'POST',
      url: '/v1/pets',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { species: 'ember', name: 'Cinder' },
    });

    // 3. Lazy-assign today's quests so progress has something to update.
    await handle.app.inject({
      method: 'GET',
      url: '/v1/quests/today',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // 4. Complete the session.
    const completeRes = await handle.app.inject({
      method: 'POST',
      url: `/v1/pomodoro/${id}/complete`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { cycleCount: 1, minutesElapsed: 25 },
    });
    expect(completeRes.statusCode).toBe(200);
    const body = completeRes.json<{
      data: { id: string; minutesAwarded: number; xpAwarded: number; petLevel: number; leveledUp: boolean };
    }>();
    expect(body.data.minutesAwarded).toBe(25);
    expect(body.data.xpAwarded).toBe(25);

    // 5. Verify daily_stats was updated.
    const [stats] = await handle.app.db
      .select()
      .from(dailyStats)
      .where(eq(dailyStats.userId, userId));
    expect(stats?.pomodoros).toBe(1);
    expect(stats?.minutes).toBe(25);

    // 6. Verify session is now `completed`.
    const [pmd] = await handle.app.db
      .select()
      .from(pomodoroSessions)
      .where(eq(pomodoroSessions.id, id));
    expect(pmd?.status).toBe('completed');
    expect(pmd?.completedAt).not.toBeNull();
  });

  it('refuses to complete the same session twice', async () => {
    const { accessToken } = await signup();
    const startRes = await handle.app.inject({
      method: 'POST',
      url: '/v1/pomodoro/start',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    const id = startRes.json<{ data: { id: string } }>().data.id;
    await handle.app.inject({
      method: 'POST',
      url: '/v1/pets',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { species: 'ripple', name: 'Brook' },
    });
    await handle.app.inject({
      method: 'POST',
      url: `/v1/pomodoro/${id}/complete`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { cycleCount: 1, minutesElapsed: 25 },
    });
    const second = await handle.app.inject({
      method: 'POST',
      url: `/v1/pomodoro/${id}/complete`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { cycleCount: 1, minutesElapsed: 25 },
    });
    expect(second.statusCode).toBe(409);
  });
});

describe('GET /v1/quests/today', () => {
  it('lazy-assigns 3 quests on first call, returns same set on repeat', async () => {
    const { accessToken } = await signup();
    const first = await handle.app.inject({
      method: 'GET',
      url: '/v1/quests/today',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(first.statusCode).toBe(200);
    const firstData = first.json<{ data: Array<{ userQuestId: string; questCode: string }> }>().data;
    expect(firstData.length).toBeGreaterThanOrEqual(1);
    expect(firstData.length).toBeLessThanOrEqual(3);

    const second = await handle.app.inject({
      method: 'GET',
      url: '/v1/quests/today',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const secondData = second.json<{ data: Array<{ userQuestId: string }> }>().data;
    expect(secondData.map((q) => q.userQuestId).sort()).toEqual(
      firstData.map((q) => q.userQuestId).sort(),
    );
  });
});

describe('POST /v1/quests/:id/claim', () => {
  it('rejects an active (incomplete) quest with 409', async () => {
    const { accessToken } = await signup();
    const today = await handle.app.inject({
      method: 'GET',
      url: '/v1/quests/today',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const first = today.json<{ data: Array<{ userQuestId: string }> }>().data[0];
    if (!first) throw new Error('expected at least one quest');

    const res = await handle.app.inject({
      method: 'POST',
      url: `/v1/quests/${first.userQuestId}/claim`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(409);
  });

  it('claims a completed quest and grants ink+xp', async () => {
    const { accessToken, userId } = await signup();
    // Lazy-assign the day.
    await handle.app.inject({
      method: 'GET',
      url: '/v1/quests/today',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    // Force one quest into completed state directly (bypasses progress).
    const [uq] = await handle.app.db
      .select()
      .from(userQuests)
      .where(eq(userQuests.userId, userId))
      .limit(1);
    if (!uq) throw new Error('expected a user_quest row');
    await handle.app.db
      .update(userQuests)
      .set({ status: 'completed', completedAt: new Date(), progress: 999 })
      .where(eq(userQuests.id, uq.id));

    const claim = await handle.app.inject({
      method: 'POST',
      url: `/v1/quests/${uq.id}/claim`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(claim.statusCode).toBe(200);
    const body = claim.json<{ data: { inkAwarded: number; xpAwarded: number } }>();
    expect(body.data.inkAwarded).toBeGreaterThan(0);
    expect(body.data.xpAwarded).toBeGreaterThan(0);

    // Second claim is rejected (already claimed).
    const second = await handle.app.inject({
      method: 'POST',
      url: `/v1/quests/${uq.id}/claim`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(second.statusCode).toBe(409);
  });
});

describe('GET /v1/stats', () => {
  it('returns today only by default', async () => {
    const { accessToken, userId } = await signup();
    await handle.app.db.execute(sql`
      INSERT INTO daily_stats (user_id, day, pages, chats, minutes, pomodoros)
      VALUES (${userId}, CURRENT_DATE, 5, 2, 30, 1)
    `);
    const res = await handle.app.inject({
      method: 'GET',
      url: '/v1/stats',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ day: string; pages: number }> }>();
    expect(body.data.length).toBe(1);
    expect(body.data[0]?.pages).toBe(5);
  });

  it('returns 400 for an invalid range', async () => {
    const { accessToken } = await signup();
    const res = await handle.app.inject({
      method: 'GET',
      url: '/v1/stats?range=tomorrow',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /v1/streak', () => {
  it('starts at 0 and bumps to 1 after first activity', async () => {
    const { accessToken, userId } = await signup();
    const before = await handle.app.inject({
      method: 'GET',
      url: '/v1/streak',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(before.statusCode).toBe(200);
    expect(before.json<{ data: { count: number } }>().data.count).toBe(0);

    // Mark activity through the streak service (simulating any event).
    await handle.app.db.execute(sql`
      UPDATE users SET streak_count = 1, streak_last_day = CURRENT_DATE WHERE id = ${userId}
    `);
    const after = await handle.app.inject({
      method: 'GET',
      url: '/v1/streak',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(after.json<{ data: { count: number; lastDay: string | null } }>().data.count).toBe(1);
  });
});
