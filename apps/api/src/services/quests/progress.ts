import { and, eq, sql } from 'drizzle-orm';
import { quests, userQuests } from '@shizuku/db/schema';
import type { Db } from '@shizuku/db';
import { todayKey } from '../../lib/time.js';
import type { StatsMetric } from '../stats/aggregate.js';

/**
 * Quest-progress nudge.
 *
 * Called from event hooks (chat completion, pomodoro completion, page-read
 * debounce) — every active user_quest matching the metric for today gets
 * its `progress` bumped by `amount`. If progress meets or exceeds the
 * quest's `target`, status flips to `completed` with `completed_at = NOW()`.
 *
 * Pure SQL — runs in one statement so it's safe inside larger transactions.
 * The `WHERE` clause caps progress at `target` to keep the column from
 * over-counting (display logic still shows `min(progress, target) / target`,
 * but capping in SQL keeps the data clean).
 */
export async function bumpQuestProgress(
  db: Db,
  userId: string,
  metric: StatsMetric,
  amount = 1,
): Promise<void> {
  const today = todayKey();
  await db.execute(sql`
    UPDATE user_quests AS uq
    SET
      progress = LEAST(uq.progress + ${amount}, q.target),
      status = CASE
        WHEN uq.progress + ${amount} >= q.target THEN 'completed'
        ELSE uq.status
      END,
      completed_at = CASE
        WHEN uq.progress + ${amount} >= q.target AND uq.completed_at IS NULL THEN NOW()
        ELSE uq.completed_at
      END
    FROM quests AS q
    WHERE uq.quest_code = q.code
      AND uq.user_id = ${userId}
      AND uq.assigned_date = ${today}::date
      AND uq.status = 'active'
      AND q.metric = ${metric}
  `);
}

/**
 * Claim a completed quest — moves Ink + XP to the user and stamps
 * `claimed_at`. Returns the rewards granted, or null if the quest is not
 * claimable (not completed, already claimed, or wrong owner).
 */
export interface ClaimResult {
  inkAwarded: number;
  xpAwarded: number;
}

export async function claimQuest(
  db: Db,
  userId: string,
  userQuestId: string,
): Promise<ClaimResult | null> {
  return db.transaction(async (tx) => {
    // Lock the row + verify state.
    const [uq] = await tx.execute(sql`
      SELECT uq.id, uq.user_id, uq.quest_code, uq.status, uq.claimed_at,
             q.ink_reward, q.xp_reward
      FROM user_quests uq
      INNER JOIN quests q ON q.code = uq.quest_code
      WHERE uq.id = ${userQuestId}
      FOR UPDATE
    `) as unknown as Array<{
      id: string;
      user_id: string;
      status: 'active' | 'completed' | 'expired';
      claimed_at: Date | null;
      ink_reward: number;
      xp_reward: number;
    }>;

    if (!uq || uq.user_id !== userId) return null;
    if (uq.status !== 'completed') return null;
    if (uq.claimed_at !== null) return null;

    await tx
      .update(userQuests)
      .set({ claimedAt: new Date() })
      .where(and(eq(userQuests.id, userQuestId), eq(userQuests.userId, userId)));

    await tx.execute(sql`
      UPDATE users
      SET ink = ink + ${uq.ink_reward},
          xp = xp + ${uq.xp_reward},
          updated_at = NOW()
      WHERE id = ${userId}
    `);

    return { inkAwarded: uq.ink_reward, xpAwarded: uq.xp_reward };
  });
}

// Re-export so route handlers can introspect what's a valid metric without
// importing from stats/aggregate.
export { quests };
