/**
 * domain/logging.ts — pure helpers for the recording UI (SPEC §4.2 / §6.2).
 *
 * These sit between the domain engine and the hooks so the UI's logging arithmetic is
 * unit-testable in isolation. No React, no I/O. (One-tap amounts, smart defaults, the
 * log-time preview, and the delete guard join here in the B-tier UX phase.)
 */
import type { DayState, Habit, HabitEntry } from '../models';
import { classifyDay, isMissDay } from './classify';
import { computeStreak } from './score';
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

// ── B-tier one-tap logging helpers (SPEC §6.1 / §6.2) ────────────────────────────

export interface OneTapAction {
  amount: number; // the actual to append
  label: string; // Korean button label
  disabled: boolean; // binary habits already done today have nothing to add
}

/**
 * The one-tap log control for a habit row (B1). Count → append one floor-sized chunk
 * (`+{floor}`, or `+1 더` once the day already has activity — always a full chunk, only the
 * label changes). Binary → `✓`, becoming a disabled `완료 ✓` once the day is done.
 */
export function oneTapAction(habit: HabitShape, hasActivityToday: boolean): OneTapAction {
  if (habit.kind === 'binary') {
    return hasActivityToday
      ? { amount: 1, label: '완료 ✓', disabled: true }
      : { amount: 1, label: '✓', disabled: false };
  }
  return hasActivityToday
    ? { amount: habit.floor, label: '+1 더', disabled: false }
    : { amount: habit.floor, label: `+${habit.floor}`, disabled: false };
}

/** Composer prefill (B2): the floor for the day's first entry, else the last-used amount. */
export function smartDefaultAmount(daySum: number, floor: number, lastAmount?: number): number {
  return daySum > 0 ? (lastAmount ?? floor) : floor;
}

export interface LogPreview {
  sum: number; // running day sum if the staged amount is logged
  floor: number;
  remaining: number; // to the floor (0 once met)
  state: DayState; // resulting day state (partial / done / over)
  xpDelta: number; // XP the staged amount would add
}

/** Progress-to-floor preview for the composer (C7a): running sum, remaining, staged result. */
export function previewLog(currentSum: number, staged: number, habit: HabitShape): LogPreview {
  const sum = currentSum + staged;
  const target = habit.kind === 'binary' ? undefined : habit.target;
  return {
    sum,
    floor: habit.floor,
    remaining: Math.max(0, habit.floor - sum),
    state: classifyDay([{ actual: sum } as HabitEntry], habit.floor, target),
    xpDelta: dayXPForSum(sum, habit) - dayXPForSum(currentSum, habit),
  };
}

/**
 * Consequence of a DELIBERATE delete (B6). Returns a confirm message when the delete is
 * consequential — the last row of a date (the day goes blank), a delete that erases a
 * miss on a miss-day, or one that drops the current streak — else null (delete now).
 *
 * The miss note is gated on the DAY's computed state (isMissDay), not the deleted row's
 * own skipReason: a skip row on a day that also has activity is not a miss (activity wins),
 * so deleting it must not claim a "놓침" is being erased. The streak diff is ALWAYS checked
 * (even for a non-last activity row), so a delete that flips a day done → partial and
 * shortens the streak still warns.
 */
export function describeDeleteConsequence(
  entries: HabitEntry[],
  entryId: string,
  habit: Habit,
  today: string,
): string | null {
  const target = entries.find((e) => e.id === entryId);
  if (!target) return null;
  const t = habit.kind === 'binary' ? undefined : habit.target;
  const dayRows = entries.filter((e) => e.date === target.date);
  const isLastRowOfDay = dayRows.length === 1;
  const dayIsMiss = isMissDay(dayRows, habit.floor, t);

  const parts: string[] = [];
  if (isLastRowOfDay) parts.push('이 날의 기록이 비워집니다');
  else if (dayIsMiss && target.actual === 0) parts.push("이 날의 '놓침' 기록이 지워집니다");

  const before = computeStreak(entries, today, habit);
  const after = computeStreak(
    entries.filter((e) => e.id !== entryId),
    today,
    habit,
  );
  if (after < before) {
    parts.push(after === 0 ? `${before}일 스트릭이 끊깁니다` : `스트릭이 ${before}→${after}일로 줄어듭니다`);
  }
  return parts.length ? parts.join(' · ') : null;
}
