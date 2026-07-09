/**
 * domain/logging.ts — pure helpers for the recording UI (SPEC §4.2 / §6.2).
 *
 * These sit between the domain engine and the hooks so the UI's logging arithmetic is
 * unit-testable in isolation. No React, no I/O. (One-tap amounts, smart defaults, the
 * log-time preview, and the delete guard join here in the B-tier UX phase.)
 */
import type { Habit, HabitEntry } from '../models';
import { classifyDay } from './classify';
import { TUNING } from '../config/tuning';

type HabitShape = Pick<Habit, 'floor' | 'target' | 'kind'>;

/**
 * XP that a single day's activity SUM contributes (SPEC §4.2 / §10), EXCLUDING the
 * lifetime streak-milestone bonuses (those are a whole-history quantity, not a per-day
 * reward). A day below the floor (`partial` / no activity) earns 0.
 *  - both kinds earn the floor-met base;
 *  - count additionally earns the over bonus + above-floor intensity.
 */
export function dayXPForSum(sum: number, habit: HabitShape): number {
  const target = habit.kind === 'binary' ? undefined : habit.target;
  const state = classifyDay([{ actual: sum } as HabitEntry], habit.floor, target);
  if (state !== 'done' && state !== 'over') return 0;
  let xp = TUNING.xpPerFloorCompletion;
  if (habit.kind === 'binary') return xp;
  if (state === 'over') xp += TUNING.xpBonusTargetExceed;
  xp += Math.max(0, sum - habit.floor) * TUNING.xpPerAboveFloorUnit;
  return xp;
}

/** XP contribution of one (habitId, date), summing that day's activity rows. */
export function dayXPContribution(dayEntries: HabitEntry[], habit: HabitShape): number {
  const sum = dayEntries.reduce((s, e) => (e.actual > 0 ? s + e.actual : s), 0);
  return dayXPForSum(sum, habit);
}

/**
 * Deterministic timestamp for a BACKFILLED (non-today) row (SPEC §6.3 / A4): local noon of
 * the target date plus a strictly increasing offset (1 ms per row already on that date), so
 * repeated same-day backfills keep a stable order under `compareEntries` instead of relying
 * on random UUID tiebreaks. Same local-wall-clock → UTC convention as `timestampFromLocalTime`.
 */
export function backfillTimestamp(date: string, existingCountOnDate: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const noonLocal = new Date(y, m - 1, d, 12, 0, 0, 0);
  return new Date(noonLocal.getTime() + existingCountOnDate).toISOString();
}
