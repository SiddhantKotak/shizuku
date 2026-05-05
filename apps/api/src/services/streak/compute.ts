import { eq, sql } from 'drizzle-orm';
import { users } from '@shizuku/db/schema';
import type { Db } from '@shizuku/db';
import { todayKey } from '../../lib/time.js';

/**
 * Streak engine.
 *
 * The streak counter advances when a user logs ANY activity (page-read,
 * chat, pomodoro completion). Idempotent within a UTC day — calling
 * `markActivity` 50 times in the same day is the same as calling it once.
 *
 * Rules:
 *   - First-ever activity: streakCount → 1, streakLastDay → today.
 *   - Activity today, streakLastDay was yesterday: streakCount + 1, streakLastDay = today.
 *   - Activity today, streakLastDay was today: no-op (idempotent).
 *   - Activity today, streakLastDay was older than yesterday: streakCount → 1, streakLastDay = today (reset).
 */

export interface StreakInfo {
  count: number;
  lastDay: string | null;
}

/**
 * Idempotent: bump the user's streak based on today's activity. Pure SQL —
 * runs in one statement so it's safe to call from inside larger transactions.
 */
export async function markActivity(db: Db, userId: string): Promise<void> {
  const today = todayKey();
  await db.execute(sql`
    UPDATE users
    SET
      streak_count = CASE
        WHEN streak_last_day = ${today}::date THEN streak_count
        WHEN streak_last_day = (${today}::date - INTERVAL '1 day')::date THEN streak_count + 1
        ELSE 1
      END,
      streak_last_day = ${today}::date,
      updated_at = NOW()
    WHERE id = ${userId}
  `);
}

/** Read the current streak. */
export async function readStreak(db: Db, userId: string): Promise<StreakInfo> {
  const [row] = await db
    .select({ count: users.streakCount, lastDay: users.streakLastDay })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return {
    count: row?.count ?? 0,
    lastDay: row?.lastDay ?? null,
  };
}
