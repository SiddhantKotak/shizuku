import { sql } from 'drizzle-orm';
import type { Db } from '@shizuku/db';
import { costCounters } from '@shizuku/db/schema';
import { env } from '@shizuku/config';
import { httpError } from '../../lib/errors.js';
import { todayKey } from '../../lib/time.js';

/**
 * Cost counters — hard guardrails enforced at the API layer to bound
 * OpenAI + R2 spend per user. Limits live in env so they're easy to tune
 * without redeploying the API.
 *
 * The `chats_today` counter resets implicitly: we compare the row's
 * `chats_reset_day` against `todayKey()` (UTC) inside the increment query
 * with an `INSERT ... ON CONFLICT DO UPDATE` so there's no daily cron.
 *
 * The `pdfs_total` counter is lifetime (Slice 1 ships at 5 PDFs/user); we
 * lift the cap or convert to monthly when payments land in Slice 3.
 */

export type CostKind = 'chat' | 'pdf';

export interface CostLimitDetails {
  kind: 'chat_daily' | 'pdf_total';
  limit: number;
  used: number;
  resetAt?: string;
}

/**
 * Read the current usage for a user — does NOT increment. Called by the
 * `enforceCost` preHandler before letting the request through. Increment
 * happens AFTER the route's success path so failed embeddings/chats don't
 * burn quota.
 */
export async function readUsage(db: Db, userId: string, kind: CostKind): Promise<{
  used: number;
  limit: number;
}> {
  const today = todayKey();
  const [row] = await db
    .select()
    .from(costCounters)
    .where(sql`${costCounters.userId} = ${userId}`)
    .limit(1);

  if (kind === 'chat') {
    const used = row && row.chatsResetDay === today ? row.chatsToday : 0;
    return { used, limit: env.COST_LIMIT_CHATS_PER_DAY };
  }
  // pdf
  const used = row?.pdfsTotal ?? 0;
  return { used, limit: env.COST_LIMIT_PDFS_PER_USER };
}

/**
 * Throw a 429 if the user has hit the limit for `kind`. Otherwise return.
 * Caller increments via `incrementUsage` AFTER the gated work succeeds.
 */
export async function checkLimit(db: Db, userId: string, kind: CostKind): Promise<void> {
  const { used, limit } = await readUsage(db, userId, kind);
  if (used >= limit) {
    const details: CostLimitDetails =
      kind === 'chat'
        ? { kind: 'chat_daily', limit, used, resetAt: nextUtcMidnightIso() }
        : { kind: 'pdf_total', limit, used };
    const msg =
      kind === 'chat'
        ? `Daily chat limit reached (${limit}). Resets at UTC midnight.`
        : `Maximum ${limit} PDFs per account.`;
    throw httpError.rateLimited('cost_limit_exceeded', msg, details);
  }
}

/**
 * Atomic increment via INSERT … ON CONFLICT DO UPDATE. The `chats_today`
 * branch self-resets when `chats_reset_day` no longer matches today —
 * makes the daily reset a side-effect of the increment instead of a cron.
 */
export async function incrementUsage(
  db: Db,
  userId: string,
  kind: CostKind,
  amount = 1,
): Promise<void> {
  const today = todayKey();
  if (kind === 'chat') {
    await db.execute(sql`
      INSERT INTO cost_counters (user_id, chats_today, chats_reset_day, pdfs_total)
      VALUES (${userId}, ${amount}, ${today}, 0)
      ON CONFLICT (user_id) DO UPDATE
      SET chats_today = CASE
            WHEN cost_counters.chats_reset_day = ${today}
            THEN cost_counters.chats_today + ${amount}
            ELSE ${amount}
          END,
          chats_reset_day = ${today}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO cost_counters (user_id, chats_today, chats_reset_day, pdfs_total)
      VALUES (${userId}, 0, ${today}, ${amount})
      ON CONFLICT (user_id) DO UPDATE
      SET pdfs_total = cost_counters.pdfs_total + ${amount}
    `);
  }
}

function nextUtcMidnightIso(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}
