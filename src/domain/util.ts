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
import type { DayState, Habit, HabitEntry, SkipReason } from '../models';
import { classifyDay, compareEntries, effectiveSkipReason } from './classify';

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
  // Facts-only: a skip row carries a skipReason; only skip rows can be `exception`.
  return entry.skipReason === 'exception';
}

/** Entries whose date falls within [window.from, window.to] (inclusive). */
export function entriesInWindow(entries: HabitEntry[], window: DateWindow): HabitEntry[] {
  return entries.filter((e) => e.date >= window.from && e.date <= window.to);
}

// ── Day grouping (the multi-entry primitive, SPEC §4.1) ──────────────────────

/** Computed outcome of one (habitId, date) — see model `DayState`. */
export interface DayRecord {
  date: string;
  state: DayState;
  sumActual: number; // sum of the day's activity rows
  effectiveSkipReason?: SkipReason;
}

type HabitShape = Pick<Habit, 'floor' | 'target' | 'kind'>;

/** Group entries by calendar date; each day's rows are sorted by the total order (A4). */
export function groupByDate(entries: HabitEntry[]): Map<string, HabitEntry[]> {
  const byDate = new Map<string, HabitEntry[]>();
  for (const e of entries) {
    const arr = byDate.get(e.date);
    if (arr) arr.push(e);
    else byDate.set(e.date, [e]);
  }
  for (const arr of byDate.values()) arr.sort(compareEntries);
  return byDate;
}

/** Computed day records (one per date that has rows), ascending by date. */
export function toDayRecords(entries: HabitEntry[], habit: HabitShape): DayRecord[] {
  const target = habit.kind === 'binary' ? undefined : habit.target;
  const records: DayRecord[] = [];
  for (const [date, dayEntries] of groupByDate(entries)) {
    records.push({
      date,
      state: classifyDay(dayEntries, habit.floor, target),
      sumActual: dayEntries.reduce((s, e) => (e.actual > 0 ? s + e.actual : s), 0),
      effectiveSkipReason: effectiveSkipReason(dayEntries),
    });
  }
  return records.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Day records keyed by date, for backward calendar walks (streak / miss counting). */
export function dayRecordMap(entries: HabitEntry[], habit: HabitShape): Map<string, DayRecord> {
  const map = new Map<string, DayRecord>();
  for (const r of toDayRecords(entries, habit)) map.set(r.date, r);
  return map;
}

/**
 * Days that count toward the floor-completion rate (SPEC §4.4).
 * Always: `done` / `over` / non-exception `skip`. When `countPartial`, `partial` too.
 * Excludes blank (`unknown`) and `exception` skips (the sick day is removed, not a miss).
 */
function engagedRecords(records: DayRecord[], countPartial: boolean): DayRecord[] {
  return records.filter(
    (r) =>
      r.state === 'done' ||
      r.state === 'over' ||
      (r.state === 'skip' && r.effectiveSkipReason !== 'exception') ||
      (countPartial && r.state === 'partial'),
  );
}

export interface RateOptions {
  /**
   * Whether `partial` days count as engaged (SPEC §4.4 rate-role split, A2/A5).
   * Default true: diagnosis Rule 1/3/4 let an honest `partial` lower the rate (the
   * intended "floor too high" signal). The lifecycle DEMOTION passes `false` so a
   * `partial`-logger is never evicted from Established.
   */
  countPartialAsEngaged?: boolean;
}

/**
 * Floor-completion rate over a window, computed per DAY.
 *
 * Denominator = engaged days (see `engagedRecords`); numerator = `done`/`over` days.
 * Empty sample → 1.0 (a habit with no data reads as healthy; callers apply the
 * `minEngagedDaysForRate` guard where a low-rate diagnosis could false-fire — A3).
 */
export function floorCompletionRate(
  entries: HabitEntry[],
  window: DateWindow,
  habit: HabitShape,
  opts: RateOptions = {},
): number {
  const countPartial = opts.countPartialAsEngaged ?? true;
  const engaged = engagedRecords(toDayRecords(entriesInWindow(entries, window), habit), countPartial);
  if (engaged.length === 0) return 1;
  const met = engaged.filter((r) => r.state === 'done' || r.state === 'over').length;
  return met / engaged.length;
}

/** Count of engaged days in a window (the sample size behind `floorCompletionRate`). */
export function countEngagedDays(
  entries: HabitEntry[],
  window: DateWindow,
  habit: HabitShape,
  opts: RateOptions = {},
): number {
  const countPartial = opts.countPartialAsEngaged ?? true;
  return engagedRecords(toDayRecords(entriesInWindow(entries, window), habit), countPartial).length;
}
