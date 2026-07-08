/**
 * domain/score.ts — streak / XP / stat-level math (SPEC §4.2 + §10).
 *
 * Pure functions over HabitEntry history, computed per DAY (multiple rows per date are
 * summed — SPEC §4.1). No React, no I/O.
 *  - computeStreak walks the calendar backward from `today`; blank, `partial`, and
 *    exception-skip days are transparent (neither count nor break), a non-exception skip
 *    breaks. (`partial` transparency upholds the scoped fairness rule — SPEC §3.2/A5.)
 *  - computeXP is the single progression currency and branches on habit.kind:
 *      count  → floor-met base + over bonus + above-floor intensity + once-only streak milestones.
 *      binary → floor-met base + decaying streak-milestone bonuses (milestoneBonusXP).
 *    `partial` days earn 0 XP (their sum is below floor, so nothing accrues).
 *  - levelForXP maps cumulative XP to a level index; computeStatLevel = levelForXP(computeXP).
 */
import type { Habit, HabitEntry } from '../models';
import { TUNING } from '../config/tuning';
import { addDays, dayRecordMap, toDayRecords, type DayRecord } from './util';

type HabitShape = Pick<Habit, 'floor' | 'target' | 'kind'>;

/**
 * Consecutive done/over DAYS walking BACKWARD from `today` over the calendar.
 * Blank, `partial`, and exception-skip days are transparent; a non-exception skip breaks.
 */
export function computeStreak(entries: HabitEntry[], today: string, habit: HabitShape): number {
  if (entries.length === 0) return 0;

  const records = dayRecordMap(entries, habit);
  let earliest = entries[0].date;
  for (const e of entries) {
    if (e.date < earliest) earliest = e.date;
  }

  let count = 0;
  let d = today;
  while (d >= earliest) {
    const r = records.get(d);
    if (!r || r.state === 'partial') {
      // blank / partial — transparent
    } else if (r.state === 'skip') {
      if (r.effectiveSkipReason !== 'exception') break; // non-exception skip breaks
      // exception skip — transparent
    } else if (r.state === 'done' || r.state === 'over') {
      count++;
    }
    d = addDays(d, -1);
  }
  return count;
}

/**
 * Longest run of done/over DAYS, iterating ascending by date, resetting on each
 * non-exception skip and stepping transparently over `partial` / exception-skip days.
 * Blank days are naturally absent from the records.
 */
function longestStreak(records: DayRecord[]): number {
  let run = 0;
  let max = 0;
  for (const r of records) {
    if (r.state === 'partial') continue; // transparent
    if (r.state === 'skip') {
      if (r.effectiveSkipReason === 'exception') continue; // transparent
      run = 0; // non-exception skip resets
      continue;
    }
    if (r.state === 'done' || r.state === 'over') {
      run++;
      if (run > max) max = run;
    }
  }
  return max;
}

/**
 * Binary (yes/no) streak-milestone bonus XP with diminishing returns on re-achievement.
 *
 * A "run" is a maximal sequence of done DAYS (blank / partial / exception skips are
 * transparent; a non-exception skip resets the run). Each milestone M fires once per run
 * that climbs through it; the k-th time M is reached awards round(base_M * decay^(k-1)),
 * dropping awards below milestoneBonusEpsilon. Grouping by day makes multiple "done" rows
 * on one date count once; merely-blank gaps are forgiven (one long run).
 */
export function milestoneBonusXP(entries: HabitEntry[], habit: HabitShape): number {
  const milestones = Object.keys(TUNING.binaryStreakMilestones)
    .map(Number)
    .sort((a, b) => a - b);
  const records = toDayRecords(entries, habit); // ascending by date
  const reached = new Map<number, number>();
  let run = 0;
  let total = 0;
  for (const r of records) {
    if (r.state === 'partial') continue; // transparent
    if (r.state === 'skip') {
      if (r.effectiveSkipReason === 'exception') continue; // transparent
      run = 0; // non-exception skip resets the run
      continue;
    }
    if (r.state !== 'done' && r.state !== 'over') continue;
    run += 1; // done day
    for (const m of milestones) {
      if (run !== m) continue; // exact upward crossing — fires once per run
      const k = (reached.get(m) ?? 0) + 1;
      reached.set(m, k);
      const award = Math.round(TUNING.binaryStreakMilestones[m] * TUNING.binaryMilestoneDecay ** (k - 1));
      if (award >= TUNING.milestoneBonusEpsilon) total += award;
    }
  }
  return total;
}

/**
 * XP — the single progression currency. Both kinds earn floor-met base XP; count habits
 * additionally earn the over bonus, above-floor intensity (per day), and once-only streak
 * milestones, while binary habits earn the decaying streak-milestone bonus instead.
 * `partial` days earn nothing (sum below floor → not counted, no above-floor amount).
 */
export function computeXP(entries: HabitEntry[], habit: Habit): number {
  const records = toDayRecords(entries, habit);
  const floorMetDays = records.filter((r) => r.state === 'done' || r.state === 'over').length;
  let xp = floorMetDays * TUNING.xpPerFloorCompletion;

  if (habit.kind === 'binary') {
    return xp + milestoneBonusXP(entries, habit);
  }

  const overDays = records.filter((r) => r.state === 'over').length;
  const aboveFloor = records.reduce((sum, r) => sum + Math.max(0, r.sumActual - habit.floor), 0);
  xp += overDays * TUNING.xpBonusTargetExceed + aboveFloor * TUNING.xpPerAboveFloorUnit;

  const longest = longestStreak(records);
  for (const key of Object.keys(TUNING.xpStreakBonus)) {
    const milestone = Number(key);
    if (longest >= milestone) xp += TUNING.xpStreakBonus[milestone];
  }
  return xp;
}

/**
 * Highest level index i with statLevelThresholds[i] <= xp. thresholds[0] = 0 so the
 * result is always >= 0; clamps to the last index.
 */
export function levelForXP(xp: number): number {
  const thresholds = TUNING.statLevelThresholds;
  let level = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (thresholds[i] <= xp) level = i;
    else break;
  }
  return level;
}

/** A stat's level is the threshold lookup over its cumulative XP. */
export function computeStatLevel(entries: HabitEntry[], habit: Habit): number {
  return levelForXP(computeXP(entries, habit));
}
