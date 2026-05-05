/** UTC date helpers. All quest assignments + cost-counter resets use UTC midnight. */

/** Returns YYYY-MM-DD for the current UTC day. */
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Returns the next UTC midnight as ISO string. */
export function nextUtcMidnight(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0); // setUTCHours(24,...) rolls to next day at 00:00
  return d;
}

/** Returns YYYY-MM-DD for N UTC days ago. */
export function daysAgoKey(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of YYYY-MM-DD keys for the last N days, oldest first. */
export function lastNDaysKeys(n: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(daysAgoKey(i, now));
  return keys;
}
