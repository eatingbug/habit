/**
 * domain/util.ts — pure date math + the shared floor-completion-rate helper.
 *
 * Used by classify/score/streak/diagnose/statusLight/lifecycle. No React, no I/O.
 *
 * Dates are ISO calendar strings 'YYYY-MM-DD'. Two rules make the math safe:
 *  1. ISO date strings sort lexicographically === chronologically, so we compare
 *     them as plain strings rather than constructing Date objects.
 *  2. When we DO need arithmetic, we parse as UTC midnight ('...T00:00:00Z') and use
 *     UTC getters. Parsing a bare 'YYYY-MM-DD' is UTC per spec, but constructing from
 *     local components is not — so we are explicit to avoid timezone drift (Hermes /
 *     Safari inconsistencies).
 */
import type { Habit, HabitEntry } from '../models';

export interface DateWindow {
  from: string; // inclusive 'YYYY-MM-DD'
  to: string; // inclusive 'YYYY-MM-DD'
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse an ISO calendar date as UTC midnight. */
function parseUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Format a Date back to an ISO calendar date. */
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add (or subtract, with a negative n) whole days to an ISO calendar date. */
export function addDays(iso: string, n: number): string {
  return fmt(new Date(parseUTC(iso).getTime() + n * MS_PER_DAY));
}

/** Whole-day difference a - b (positive when a is after b). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseUTC(a).getTime() - parseUTC(b).getTime()) / MS_PER_DAY);
}

/** Day of week, 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  return parseUTC(iso).getUTCDay();
}

/**
 * Trailing window of `days` calendar days ENDING on `asOfDate` (inclusive both ends).
 * windowFrom('2026-06-10', 28) → { from: '2026-05-14', to: '2026-06-10' } (28 days).
 */
export function windowFrom(asOfDate: string, days: number): DateWindow {
  return { from: addDays(asOfDate, -(days - 1)), to: asOfDate };
}

/** First day of the week containing `iso`, given the configured week start (0=Sun, 1=Mon). */
export function startOfWeek(iso: string, weekStartsOn: number): string {
  const offset = (dayOfWeek(iso) - weekStartsOn + 7) % 7;
  return addDays(iso, -offset);
}

/**
 * The 7-day window for the week that is `weeksAgo` weeks before the week containing
 * `asOfDate`. weeksAgo = 0 → the current (possibly partial) week.
 */
export function nthWeekWindow(asOfDate: string, weeksAgo: number, weekStartsOn: number): DateWindow {
  const currentStart = startOfWeek(asOfDate, weekStartsOn);
  const from = addDays(currentStart, -7 * weeksAgo);
  return { from, to: addDays(from, 6) };
}

/** True when an entry is an `exception` skip (excluded from miss / rate sampling). */
export function isExceptionSkip(entry: HabitEntry): boolean {
  return entry.state === 'skip' && entry.skipReason === 'exception';
}

/** True when the entry met the floor (done or over). */
export function metFloor(entry: HabitEntry): boolean {
  return entry.state === 'done' || entry.state === 'over';
}

/** Above-floor amount for an entry (0 unless actual strictly exceeds floor). */
export function aboveFloorAmount(entry: HabitEntry, habit: Pick<Habit, 'floor'>): number {
  return entry.actual > habit.floor ? entry.actual - habit.floor : 0;
}

/** Entries whose date falls within [window.from, window.to] (inclusive). */
export function entriesInWindow(entries: HabitEntry[], window: DateWindow): HabitEntry[] {
  return entries.filter((e) => e.date >= window.from && e.date <= window.to);
}

/**
 * Floor-completion rate over a window.
 *
 * Denominator = days that HAVE an entry in the window, EXCLUDING exception skips
 * (a sick day is removed from the sample, not counted as a miss — CONCEPT §3.2 / §13).
 * Blank days (no entry) are excluded entirely (unknown, never a miss).
 * Numerator   = entries that met the floor (done / over).
 *
 * Empty sample → 1.0 (a habit with no data reads as healthy, so the low-rate diagnosis
 * rules do not false-fire on a brand-new habit).
 */
export function floorCompletionRate(entries: HabitEntry[], window: DateWindow): number {
  const counted = entriesInWindow(entries, window).filter((e) => !isExceptionSkip(e));
  if (counted.length === 0) return 1;
  const met = counted.filter(metFloor).length;
  return met / counted.length;
}
