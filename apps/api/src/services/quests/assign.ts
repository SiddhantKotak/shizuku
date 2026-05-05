import { and, eq } from 'drizzle-orm';
import { quests, userQuests, type QuestRow, type UserQuestRow } from '@shizuku/db/schema';
import type { Db } from '@shizuku/db';
import { newId } from '../../lib/id.js';
import { todayKey } from '../../lib/time.js';

/**
 * Lazy daily quest assigner.
 *
 * Picks 3 quest templates from the active catalog (one per metric ideally)
 * and inserts a row per pick into `user_quests` for the current UTC day.
 * Idempotent: a UNIQUE (user_id, assigned_date, quest_code) constraint
 * prevents double-insert; subsequent calls just return the existing rows.
 *
 * Triggered on the first `GET /v1/quests/today` of the day. No cron needed.
 *
 * **Selection strategy:** deterministic per-(user, day) — uses a hash of
 * `userId + day` as the seed so a user sees the same 3 quests no matter
 * how many times they refresh. Different users see different quests.
 */

const DAILY_QUEST_COUNT = 3;

export interface AssignedQuest {
  userQuestId: string;
  questCode: string;
  title: string;
  metric: 'pages' | 'pomodoros' | 'chats' | 'minutes';
  target: number;
  inkReward: number;
  xpReward: number;
  progress: number;
  status: 'active' | 'completed' | 'expired';
  completedAt: string | null;
  claimedAt: string | null;
  assignedDate: string;
}

export async function assignTodayIfNeeded(
  db: Db,
  userId: string,
): Promise<AssignedQuest[]> {
  const today = todayKey();

  // 1. Read existing assignments first — fast path on the second-and-subsequent
  //    GET of the day.
  const existing = await readTodaysQuests(db, userId, today);
  if (existing.length >= DAILY_QUEST_COUNT) return existing;

  // 2. Need to assign. Pull active catalog. Deterministic shuffle by user+day.
  const catalog = await db.select().from(quests).where(eq(quests.active, true));
  if (catalog.length === 0) return existing;

  const seed = hashStringToInt(`${userId}::${today}`);
  const shuffled = deterministicShuffle(catalog, seed);
  const picks = pickByDistinctMetric(shuffled, DAILY_QUEST_COUNT);

  // 3. Insert with conflict-do-nothing so concurrent first-GETs (rare) don't
  //    explode. Skip codes already assigned (the partial existing list).
  const existingCodes = new Set(existing.map((e) => e.questCode));
  const toInsert = picks.filter((p) => !existingCodes.has(p.code));
  if (toInsert.length > 0) {
    await db
      .insert(userQuests)
      .values(
        toInsert.map((p) => ({
          id: newId('uq'),
          userId,
          questCode: p.code,
          assignedDate: today,
          progress: 0,
          status: 'active' as const,
        })),
      )
      .onConflictDoNothing({
        target: [userQuests.userId, userQuests.assignedDate, userQuests.questCode],
      });
  }

  return readTodaysQuests(db, userId, today);
}

/**
 * Read the day's user_quests joined with the quest template fields.
 */
export async function readTodaysQuests(
  db: Db,
  userId: string,
  day = todayKey(),
): Promise<AssignedQuest[]> {
  const rows = await db
    .select({
      uq: userQuests,
      q: quests,
    })
    .from(userQuests)
    .innerJoin(quests, eq(userQuests.questCode, quests.code))
    .where(and(eq(userQuests.userId, userId), eq(userQuests.assignedDate, day)));
  return rows.map(({ uq, q }) => toAssigned(uq, q));
}

function toAssigned(uq: UserQuestRow, q: QuestRow): AssignedQuest {
  return {
    userQuestId: uq.id,
    questCode: q.code,
    title: q.title,
    metric: q.metric,
    target: q.target,
    inkReward: q.inkReward,
    xpReward: q.xpReward,
    progress: uq.progress,
    status: uq.status,
    completedAt: uq.completedAt?.toISOString() ?? null,
    claimedAt: uq.claimedAt?.toISOString() ?? null,
    assignedDate: uq.assignedDate,
  };
}

/**
 * Pick `count` quests from `pool` while preferring distinct `metric` values.
 * Falls back to taking duplicates if the catalog doesn't have enough variety.
 */
function pickByDistinctMetric(pool: QuestRow[], count: number): QuestRow[] {
  const picks: QuestRow[] = [];
  const seenMetrics = new Set<QuestRow['metric']>();
  for (const q of pool) {
    if (picks.length >= count) break;
    if (seenMetrics.has(q.metric)) continue;
    picks.push(q);
    seenMetrics.add(q.metric);
  }
  // Fill any remaining with leftovers.
  for (const q of pool) {
    if (picks.length >= count) break;
    if (!picks.some((p) => p.code === q.code)) picks.push(q);
  }
  return picks;
}

/** xorshift32 — tiny, deterministic, good enough for shuffling 12 items. */
function deterministicShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  let s = (seed | 0) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const j = Math.abs(s) % (i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

function hashStringToInt(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i); // djb2-xor
    h |= 0;
  }
  return h;
}

