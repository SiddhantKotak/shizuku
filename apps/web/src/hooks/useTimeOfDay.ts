import { useEffect, useState } from 'react';
import { useAmbientStore, type TimeOfDayMode } from '../stores/ambientStore';

export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * Real-clock-based period bands (local time, simple thresholds).
 * Tweak as needed for vibe — these match common "cozy" aesthetics.
 */
function clockPeriod(now: Date = new Date()): TimePeriod {
  const h = now.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

/**
 * Returns the current period for room theming + ambience suggestion.
 * - In `auto` mode, ticks once per minute.
 * - When user pins a mode (morning/afternoon/evening/night), stays fixed.
 */
export function useTimeOfDay(): TimePeriod {
  const mode: TimeOfDayMode = useAmbientStore((s) => s.timeOfDayMode);
  const [autoPeriod, setAutoPeriod] = useState<TimePeriod>(() => clockPeriod());

  useEffect(() => {
    if (mode !== 'auto') return;
    const tick = (): void => setAutoPeriod(clockPeriod());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [mode]);

  if (mode === 'auto') return autoPeriod;
  return mode; // user override pin
}

/** Tint colors per period — Phaser timeOfDay system reads these as 0xRRGGBB. */
export const PERIOD_TINT: Record<TimePeriod, number> = {
  morning: 0xfff5e0, // warm cream
  afternoon: 0xffffff, // neutral
  evening: 0xffd6a8, // warm sunset
  night: 0xa9b3d6, // cool indigo
};

/** Suggested lofi track per period (used in MusicPicker auto-default). */
export const PERIOD_TRACK_SUGGESTION: Record<TimePeriod, string> = {
  morning: 'sunny-morning',
  afternoon: 'cozy-cafe',
  evening: 'late-library',
  night: 'rainy-night',
};
