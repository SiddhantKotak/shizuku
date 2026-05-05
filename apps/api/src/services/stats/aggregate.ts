import { and, eq, gte, sql } from 'drizzle-orm';
import { dailyStats } from '@shizuku/db/schema';
import type { Db } from '@shizuku/db';
import { todayKey } from '../../lib/time.js';

/**
 * Daily-stats aggregator.
 *
 * Every metric (pages, chats, pomodoros, minutes) is bumped via
 * `INSERT ... ON CONFLICT (user_id, day) DO UPDATE` so concurrent writers
 * don't lose increments. The (user_id, day) primary key is the conflict
 * target.
 *
 * Reads come in three flavors:
 *   - `today`     → just the current day's row
 *   - `week`      → last 7 days (inclusive of today)
 *   - `all`       → every day with a row, for the calendar heatmap
 */

export type StatsMetric = 'pages' | 'chats' | 'pomodoros' | 'minutes';
export type StatsRange = 'today' | 'week' | 'all';

export interface DailyStatBucket {
  day: string; // ISO YYYY-MM-DD
  minutes: number;
  pages: number;
  chats: number;
  pomodoros: number;
}

/**
 * Bump a daily-stats metric for the user, today. Caller is responsible for
 * choosing the right metric and amount (e.g. pomodoro completion = +1
 * pomodoros + +25 minutes).
 */
export async function bumpDailyStat(
  db: Db,
  userId: string,
  metric: StatsMetric,
  amount = 1,
): Promise<void> {
  const today = todayKey();
  // `metric` is a closed StatsMetric union, so embedding it as a raw SQL
  // identifier is safe (no user input). userId/today/amount stay parameterized.
  const col = sql.raw(metric);
  await db.execute(sql`
    INSERT INTO daily_stats (user_id, day, ${col})
    VALUES (${userId}, ${today}, ${amount})
    ON CONFLICT (user_id, day) DO UPDATE
      SET ${col} = daily_stats.${col} + ${amount}
  `);
}

export async function readStats(
  db: Db,
  userId: string,
  range: StatsRange,
): Promise<DailyStatBucket[]> {
  if (range === 'today') {
    const today = todayKey();
    const [row] = await db
      .select()
      .from(dailyStats)
      .where(and(eq(dailyStats.userId, userId), eq(dailyStats.day, today)))
      .limit(1);
    return row
      ? [
          {
            day: row.day,
            minutes: row.minutes,
            pages: row.pages,
            chats: row.chats,
            pomodoros: row.pomodoros,
          },
        ]
      : [];
  }

  if (range === 'week') {
    const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const cutoff = sevenDaysAgo.toISOString().slice(0, 10);
    const rows = await db
      .select()
      .from(dailyStats)
      .where(and(eq(dailyStats.userId, userId), gte(dailyStats.day, cutoff)))
      .orderBy(dailyStats.day);
    return rows.map((r) => ({
      day: r.day,
      minutes: r.minutes,
      pages: r.pages,
      chats: r.chats,
      pomodoros: r.pomodoros,
    }));
  }

  // all
  const rows = await db
    .select()
    .from(dailyStats)
    .where(eq(dailyStats.userId, userId))
    .orderBy(dailyStats.day);
  return rows.map((r) => ({
    day: r.day,
    minutes: r.minutes,
    pages: r.pages,
    chats: r.chats,
    pomodoros: r.pomodoros,
  }));
}
