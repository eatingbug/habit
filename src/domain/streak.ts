/**
 * domain/streak.ts — the never-miss-twice intervention signal (SPEC §4.3).
 *
 * Mirror of computeStreak, but counting consecutive MISSES instead of completions:
 * walking backward from `asOfDate` over the calendar, blank days and exception skips
 * are TRANSPARENT (neither count nor break the run), a done/over day BREAKS the run,
 * and a non-exception skip counts +1.
 */
import type { HabitEntry } from '../models';
import { TUNING } from '../config/tuning';
import { addDays, isExceptionSkip, metFloor } from './util';

/**
 * Consecutive non-exception skips walking backward from `asOfDate`.
 *
 * Transparent days (blank / exception skip) are stepped over without affecting the
 * count; the first done/over day stops the walk. The walk also stops once we pass the
 * earliest recorded entry (no data before then → nothing more to count).
 */
export function consecutiveMissCount(entries: HabitEntry[], asOfDate: string): number {
  if (entries.length === 0) return 0;

  const map = new Map<string, HabitEntry>();
  let earliest = entries[0].date;
  for (const e of entries) {
    map.set(e.date, e);
    if (e.date < earliest) earliest = e.date;
  }

  let count = 0;
  let d = asOfDate;
  while (d >= earliest) {
    const e = map.get(d);
    if (!e) {
      // blank day — transparent
    } else if (isExceptionSkip(e)) {
      // exception skip — transparent
    } else if (metFloor(e)) {
      break; // done/over breaks the run
    } else {
      count++; // non-exception skip
    }
    d = addDays(d, -1);
  }
  return count;
}

/** True when consecutive misses have reached the intervention threshold (SPEC §4.3). */
export function needsNeverMissTwiceIntervention(entries: HabitEntry[], asOfDate: string): boolean {
  return consecutiveMissCount(entries, asOfDate) >= TUNING.statusLight.interventionConsecMiss;
}
