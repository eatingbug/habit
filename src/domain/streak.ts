/**
 * domain/streak.ts — the never-miss-twice intervention signal (SPEC §4.3).
 *
 * Mirror of computeStreak, but counting consecutive MISS DAYS instead of completions:
 * walking backward from `asOfDate` over the calendar, blank / `partial` / exception-skip
 * days are TRANSPARENT (neither count nor break the run), a done/over day BREAKS the run,
 * and a non-exception skip counts +1. Computed per day (multiple rows are summed).
 */
import type { Habit, HabitEntry } from '../models';
import { TUNING } from '../config/tuning';
import { addDays, dayRecordMap } from './util';

type HabitShape = Pick<Habit, 'floor' | 'target' | 'kind'>;

/**
 * Consecutive non-exception skip DAYS walking backward from `asOfDate`.
 *
 * Transparent days (blank / partial / exception skip) are stepped over without affecting
 * the count; the first done/over day stops the walk, as does passing the earliest entry.
 */
export function consecutiveMissCount(
  entries: HabitEntry[],
  asOfDate: string,
  habit: HabitShape,
): number {
  if (entries.length === 0) return 0;

  const records = dayRecordMap(entries, habit);
  let earliest = entries[0].date;
  for (const e of entries) {
    if (e.date < earliest) earliest = e.date;
  }

  let count = 0;
  let d = asOfDate;
  while (d >= earliest) {
    const r = records.get(d);
    if (!r || r.state === 'partial') {
      // blank / partial — transparent
    } else if (r.state === 'done' || r.state === 'over') {
      break; // completion breaks the miss run
    } else if (r.state === 'skip') {
      if (r.effectiveSkipReason !== 'exception') count++; // non-exception skip
      // exception skip — transparent
    }
    d = addDays(d, -1);
  }
  return count;
}

/** True when consecutive misses have reached the intervention threshold (SPEC §4.3). */
export function needsNeverMissTwiceIntervention(
  entries: HabitEntry[],
  asOfDate: string,
  habit: HabitShape,
): boolean {
  return consecutiveMissCount(entries, asOfDate, habit) >= TUNING.statusLight.interventionConsecMiss;
}
