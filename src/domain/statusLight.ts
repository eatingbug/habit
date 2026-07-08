/**
 * domain/statusLight.ts — the per-habit status light + dashboard aggregate (SPEC §4.6).
 *
 * Pure: composes streak (intervention signal), diagnose (caution signal), and week
 * helpers (declining-trend / personal-best). No React, no I/O.
 */
import type { Habit, HabitEntry, StatusLight } from '../models';
import { TUNING } from '../config/tuning';
import { consecutiveMissCount } from './streak';
import { diagnose } from './diagnose';
import { entriesInWindow, nthWeekWindow } from './util';

/** Sum of `actual` across the entries inside a single 7-day week window. */
function weekTotalActual(entries: HabitEntry[], weeksAgo: number, asOfDate: string): number {
  const window = nthWeekWindow(asOfDate, weeksAgo, TUNING.weekStartsOn);
  return entriesInWindow(entries, window).reduce((sum, e) => sum + e.actual, 0);
}

/** Count of entries inside a single 7-day week window. */
function weekEntryCount(entries: HabitEntry[], weeksAgo: number, asOfDate: string): number {
  const window = nthWeekWindow(asOfDate, weeksAgo, TUNING.weekStartsOn);
  return entriesInWindow(entries, window).length;
}

/**
 * Declining trend for an established habit: weekly total actual is monotonically
 * non-increasing across the N most recent COMPLETE weeks (oldest→newest), and the
 * newest is strictly below the oldest. Requires the oldest week to have data, else
 * insufficient evidence → false.
 */
function isDecliningTrend(entries: HabitEntry[], asOfDate: string): boolean {
  const N = TUNING.statusLight.establishedDeclWeeks;

  // Oldest week must have at least one entry, else we can't claim a decline.
  if (weekEntryCount(entries, N, asOfDate) < 1) return false;

  // Totals oldest-first: weeksAgo N, N-1, ..., 1.
  const totals: number[] = [];
  for (let weeksAgo = N; weeksAgo >= 1; weeksAgo -= 1) {
    totals.push(weekTotalActual(entries, weeksAgo, asOfDate));
  }

  for (let i = 1; i < totals.length; i += 1) {
    if (totals[i] > totals[i - 1]) return false; // not monotonically non-increasing
  }
  return totals[totals.length - 1] < totals[0]; // newest strictly below oldest
}

/**
 * Personal best for an established habit: the current week's total actual is strictly
 * greater than every prior week that has data. Scans back to the week containing the
 * earliest entry; requires at least one prior week with data.
 */
function isPersonalBest(entries: HabitEntry[], asOfDate: string): boolean {
  if (entries.length === 0) return false;

  // Earliest entry bounds how far back prior weeks can have data.
  let earliest = entries[0].date;
  for (const e of entries) {
    if (e.date < earliest) earliest = e.date;
  }

  const currentTotal = weekTotalActual(entries, 0, asOfDate);

  let sawPriorWithData = false;
  for (let weeksAgo = 1; ; weeksAgo += 1) {
    const window = nthWeekWindow(asOfDate, weeksAgo, TUNING.weekStartsOn);
    // Stop once the entire week is before the earliest recorded entry.
    if (window.to < earliest) break;

    const priorEntries = entriesInWindow(entries, window);
    if (priorEntries.length === 0) continue;

    sawPriorWithData = true;
    const priorTotal = priorEntries.reduce((sum, e) => sum + e.actual, 0);
    if (currentTotal <= priorTotal) return false;
  }

  return sawPriorWithData;
}

/**
 * Derive a habit's status light. First match wins, evaluated in this order:
 * intervention > caution > personal_best > stable (SPEC §4.6).
 */
export function deriveStatusLight(habit: Habit, entries: HabitEntry[], today: string): StatusLight {
  // INTERVENTION
  if (
    habit.lifecycle === 'forming' &&
    consecutiveMissCount(entries, today, habit) >= TUNING.statusLight.interventionConsecMiss
  ) {
    return 'intervention';
  }
  if (habit.lifecycle === 'established' && isDecliningTrend(entries, today)) {
    return 'intervention';
  }

  // CAUTION
  if (diagnose(habit, entries, today).length >= TUNING.statusLight.cautionMinFlags) {
    return 'caution';
  }

  // PERSONAL_BEST
  if (habit.lifecycle === 'established' && isPersonalBest(entries, today)) {
    return 'personal_best';
  }

  return 'stable';
}

/**
 * Tally the dashboard counts of caution / intervention lights across a set of habits.
 * personal_best and stable are not counted.
 */
export function aggregateStatusCount(
  habits: Habit[],
  entriesByHabit: Record<string, HabitEntry[]>,
  today: string,
): { caution: number; intervention: number } {
  let caution = 0;
  let intervention = 0;
  for (const habit of habits) {
    const light = deriveStatusLight(habit, entriesByHabit[habit.id] ?? [], today);
    if (light === 'intervention') intervention += 1;
    else if (light === 'caution') caution += 1;
  }
  return { caution, intervention };
}
