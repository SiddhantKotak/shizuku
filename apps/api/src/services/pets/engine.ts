import type { EvolutionStage } from '@shizuku/types';

/**
 * Pet leveling + evolution math.
 *
 * Slice 1 curve (gentle, encouraging early progression):
 *   xp_to_reach(L) = 50 * L + 25 * L * (L - 1) / 2
 *   So: L1=50 cumulative, L2=125, L5=500, L10=1750, L20=6500, L25=10000
 *
 * Stage thresholds tuned so the average user evolves once a week of moderate
 * use (≈ 200-300 XP/day from pages-read + chats):
 *   stage 1 → 2 at level 8  (≈ 1000 XP)
 *   stage 2 → 3 at level 20 (≈ 6500 XP)
 *
 * These values are tunable; just don't change them without coordinating UX
 * (the level-up + evolution cutscenes are timed against expected pacing).
 */

export const STAGE_THRESHOLDS = { stage2: 8, stage3: 20 } as const;

/** Cumulative XP required to *reach* (i.e. just hit) the given level. */
export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  // Sum_{k=2..level} (50 + 25*(k-1)) = 50*(level-1) + 25*(level-1)*level/2
  const n = level - 1;
  return 50 * n + (25 * n * level) / 2;
}

/** Inverse — level reached when total XP equals or exceeds threshold. */
export function levelForXp(totalXp: number): number {
  if (totalXp < 50) return 1;
  // Binary search to keep this O(log L) even for very long-lived pets.
  let lo = 1;
  let hi = 200;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xpRequiredForLevel(mid) <= totalXp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Evolution stage that the pet is *eligible* for at a given level. */
export function eligibleEvolutionStageForLevel(level: number): EvolutionStage {
  if (level >= STAGE_THRESHOLDS.stage3) return 3;
  if (level >= STAGE_THRESHOLDS.stage2) return 2;
  return 1;
}

/** True when the pet's current evolution stage is behind what its level allows. */
export function canEvolve(args: { level: number; evolutionStage: EvolutionStage }): boolean {
  return eligibleEvolutionStageForLevel(args.level) > args.evolutionStage;
}
