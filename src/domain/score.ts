/**
 * domain/score.ts — streak / XP / stat-level math (SPEC §4.2 + §10).
 *
 * Pure functions over HabitEntry history. No React, no I/O.
 *  - computeStreak walks the calendar backward from `today`; blanks and exception
 *    skips are transparent (neither count nor break), a non-exception skip breaks.
 *  - computeXP is the single progression currency and branches on habit.kind:
 *      count  → floor-met base + over bonus + above-floor intensity + once-only streak milestones.
 *      binary → floor-met base + decaying streak-milestone bonuses (milestoneBonusXP).
 *    It has no `today`, so streak-derived bonuses come from runs found in history (ascending).
 *  - levelForXP maps cumulative XP to a level index; computeStatLevel = levelForXP(computeXP).
 */
import type { Habit, HabitEntry } from '../models';
import { TUNING } from '../config/tuning';
import { addDays, aboveFloorAmount, isExceptionSkip, metFloor } from './util';

/**
 * Consecutive done/over days walking BACKWARD from `today` over the calendar.
 * Blank days and exception skips are transparent; a non-exception skip breaks.
 */
export function computeStreak(entries: HabitEntry[], today: string): number {
  if (entries.length === 0) return 0;

  const map = new Map<string, HabitEntry>();
  let earliest = entries[0].date;
  for (const e of entries) {
    map.set(e.date, e);
    if (e.date < earliest) earliest = e.date;
  }

  let count = 0;
  let d = today;
  while (d >= earliest) {
    const e = map.get(d);
    if (!e) {
      // blank day — transparent
    } else if (isExceptionSkip(e)) {
      // exception skip — transparent
    } else if (e.state === 'skip') {
      break; // non-exception skip breaks the streak
    } else {
      count++; // done / over
    }
    d = addDays(d, -1);
  }
  return count;
}

/**
 * Longest run of done/over entries, iterating ascending by date, resetting on each
 * non-exception skip and ignoring exception skips. Blanks are naturally absent.
 */
function longestStreak(entries: HabitEntry[]): number {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let run = 0;
  let max = 0;
  for (const e of sorted) {
    if (isExceptionSkip(e)) continue; // transparent
    if (e.state === 'skip') {
      run = 0; // non-exception skip resets
      continue;
    }
    run++; // done / over
    if (run > max) max = run;
  }
  return max;
}

/**
 * Binary (yes/no) streak-milestone bonus XP with diminishing returns on re-achievement.
 *
 * A "run" is a maximal sequence of done/over days (blanks and exception skips are
 * transparent; a non-exception skip resets the run) — the same rules as longestStreak.
 * Each milestone M (binaryStreakMilestones key) fires once per run that climbs through it;
 * the k-th time M is reached anywhere in history awards round(base_M * decay^(k-1)), dropping
 * awards that round below milestoneBonusEpsilon. Purely a function of `entries` (no stored
 * claim-state) → idempotent under recomputation; merely-blank gaps are forgiven (one long run).
 */
export function milestoneBonusXP(entries: HabitEntry[]): number {
  const milestones = Object.keys(TUNING.binaryStreakMilestones)
    .map(Number)
    .sort((a, b) => a - b);
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const reached = new Map<number, number>();
  let run = 0;
  let total = 0;
  for (const e of sorted) {
    if (isExceptionSkip(e)) continue; // transparent
    if (e.state === 'skip') {
      run = 0; // non-exception skip resets the run
      continue;
    }
    run += 1; // done / over
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
 * additionally earn the over bonus, above-floor intensity, and once-only streak milestones,
 * while binary habits earn the decaying streak-milestone bonus instead (no magnitude).
 */
export function computeXP(entries: HabitEntry[], habit: Habit): number {
  const floorMetDays = entries.filter(metFloor).length;
  let xp = floorMetDays * TUNING.xpPerFloorCompletion;

  if (habit.kind === 'binary') {
    return xp + milestoneBonusXP(entries);
  }

  const overDays = entries.filter((e) => e.state === 'over').length;
  const aboveFloor = entries.reduce((sum, e) => sum + aboveFloorAmount(e, habit), 0);
  xp += overDays * TUNING.xpBonusTargetExceed + aboveFloor * TUNING.xpPerAboveFloorUnit;

  const longest = longestStreak(entries);
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
