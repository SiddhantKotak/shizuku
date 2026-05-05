import { and, eq } from 'drizzle-orm';
import { pets } from '@shizuku/db/schema';
import type { Db } from '@shizuku/db';
import { levelForXp } from './engine.js';

/**
 * Pet XP awards.
 *
 * Sources of XP in Slice 1:
 *   - Pages read (debounced ≥30s on a page) → 5 XP each (P12 reading hook)
 *   - Substantive chat (length>30 ∧ contains '?') → 10 XP
 *   - Pomodoro completion → 25 XP (kicked from the pomodoro complete route)
 *   - Quest claim → variable, set on the quest template (`xp_reward`)
 *
 * Quest claim XP goes to the USER's xp+level (general progression).
 * Page/chat/pomodoro XP goes to the PET's xp+level (companion progression).
 * Both progressions exist; they're decoupled.
 *
 * `awardPetXp` updates the active pet's xp + recomputes level. Returns the
 * new level so the route can emit a `level_up` SSE event when it changed.
 */

export interface PetXpDelta {
  newLevel: number;
  leveledUp: boolean;
}

export async function awardPetXp(
  db: Db,
  userId: string,
  amount: number,
): Promise<PetXpDelta | null> {
  if (amount <= 0) return null;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: pets.id, xp: pets.xp, level: pets.level })
      .from(pets)
      .where(and(eq(pets.userId, userId), eq(pets.isActive, true)))
      .limit(1);
    if (!row) return null;
    const newXp = row.xp + amount;
    const newLevel = levelForXp(newXp);
    const leveledUp = newLevel > row.level;
    await tx
      .update(pets)
      .set({ xp: newXp, level: newLevel })
      .where(eq(pets.id, row.id));
    return { newLevel, leveledUp };
  });
}

/**
 * Quality gate for chat XP — the plan says length>30 chars + contains '?'.
 * Stops trivial "ok" / "thanks" chats from minting XP.
 */
export function isQualityChat(message: string): boolean {
  return message.length > 30 && message.includes('?');
}

