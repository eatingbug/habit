import { TUNING } from '@/config/tuning';
import type { Habit, HabitEntry } from '@/models';

import { type ClassifiedDay, dayStates, isDateInScope, isFloorMet } from './classify';
import { addDays, compareDates, dateOf } from './dates';

/**
 * Never-miss-twice, the floor streak and engagement — SPEC §4.2 (`computeStreak`)
 * and §4.3.
 *
 * `computeStreak` is declared under §4.2 but defined here and re-exported from
 * `score.ts`: `describeLogEffect` needs `atRiskToday`, so putting the streak walk in
 * `score.ts` would make the two modules import each other. One definition, one file,
 * no cycle. `historyDays` and `floorRuns` sit here for the same reason — scoring and
 * `longestStreak` both read them, and `score.ts` already imports this file, so this is
 * the end of the arrow that can hold them.
 *
 * Every function takes `habit` — a day's state depends on the floor, the target and
 * the habit's scope (`createdAt`, `pauses`), which the SPEC signatures predate
 * (ADR-0003; §4.4 adds `habit` to the rate functions for the same reason).
 */

/**
 * The one shared walk. `dayStates` already encodes the ADR-0003 asymmetry — a date is
 * omitted only when it is out of scope *and* holds no rows — so a paused stretch is
 * transparent here without any of these functions knowing what a pause is. We only
 * clamp the start: a window may reach back past `createdAt`, and dates before the
 * habit existed have no opinion to offer (ADR-0001).
 */
function classifiedDays(
  habit: Habit,
  entries: HabitEntry[],
  from: string,
  to: string,
  today: string,
): ClassifiedDay[] {
  const birth = dateOf(habit.createdAt);
  return dayStates(habit, entries, compareDates(from, birth) < 0 ? birth : from, to, today);
}

/** Engagement = a day that holds real activity, floor met or not (§4.3 C3). */
function isEngaged(day: ClassifiedDay): boolean {
  return isFloorMet(day.state) || day.state === 'partial';
}

/**
 * Walks backward from the end of `days`, counting while `extend` holds. A miss stops
 * the walk; anything else is transparent — that single rule covers `pending`,
 * `partial`, exception skips and (by their absence from `days`) out-of-scope dates.
 */
function runEndingLast(days: ClassifiedDay[], extend: (day: ClassifiedDay) => boolean): number {
  let length = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (extend(days[i])) length += 1;
    else if (days[i].isMiss) break;
  }
  return length;
}

/**
 * Consecutive floor-met days working backward from `today` — SPEC §4.2.
 *
 * Never stored, always recomputed, which is what makes backfill a pure repair: adding
 * a row to a `missed` date re-joins the runs on either side of it (ADR-0001).
 */
export function computeStreak(entries: HabitEntry[], habit: Habit, today: string): number {
  return runEndingLast(
    classifiedDays(habit, entries, dateOf(habit.createdAt), today, today),
    (day) => isFloorMet(day.state),
  );
}

/**
 * The habit's whole classified history, ending on its last recorded date.
 *
 * Scoring needs no `today` because of that end date. XP only ever reads `done`/`over`
 * days, and the one place the `pending`/`missed` distinction would matter — a run
 * reset — cannot arise inside the range: the last date holds rows by construction, so
 * every empty date strictly inside the range is genuinely past, hence `missed`. Any
 * empty date at or beyond the end has no later `done` day to cut off. Keeping `today`
 * out is what lets `computeStatXP(statId, all)` keep its SPEC signature.
 */
export function historyDays(habit: Habit, entries: HabitEntry[]): ClassifiedDay[] {
  if (entries.length === 0) return [];

  // A real max, not the last element — scoring must survive any row permutation.
  const last = entries.reduce(
    (latest, entry) => (compareDates(entry.date, latest) > 0 ? entry.date : latest),
    entries[0].date,
  );
  return dayStates(habit, entries, dateOf(habit.createdAt), last, last);
}

/**
 * Lengths of the maximal runs of floor-met days, oldest first.
 *
 * One walker serves both run-keyed bonuses (`milestoneBonusXP` and the count habit's
 * longest-run bonus, which SPEC §4.2 spells out only for the former) and the 최고 연속
 * pill's `longestStreak`. A miss resets the run — a `missed` day or a reasoned `skip`
 * (ADR-0001); `pending`, `partial` and exception skips are transparent, as are
 * out-of-scope dates by never appearing.
 */
export function floorRuns(days: ClassifiedDay[]): number[] {
  const runs: number[] = [];
  let current = 0;

  for (const day of days) {
    if (isFloorMet(day.state)) current += 1;
    else if (day.isMiss) {
      if (current > 0) runs.push(current);
      current = 0;
    }
  }
  if (current > 0) runs.push(current);
  return runs;
}

/**
 * The longest floor run in the **whole** history — the 최고 연속 pill
 * (`design/parts/YesNo.body.html:12`). `docs/SPEC.md` §6.3's pill list
 * (`docs/SPEC.md:964–965`) does not name this pill; the canvas is the layout
 * authority for this screen, and it replaces 빠짐없이 here because a binary habit's
 * engagement streak is its floor streak (see `DetailPills.showEngagement`).
 *
 * The same `floorRuns` walk the XP ladder reads, so the pill and the bonuses can never
 * disagree about how long a run was. No `today`: `historyDays` ends at the last
 * recorded date, and no date after it can hold a floor-met day. Never stored — a
 * backfill onto a `missed` date joins the runs on either side of it and raises this
 * figure on the next read (ADR-0001).
 */
export function longestStreak(entries: HabitEntry[], habit: Habit): number {
  return floorRuns(historyDays(habit, entries)).reduce((a, b) => Math.max(a, b), 0);
}

/**
 * Consecutive days with any real engagement — `done`/`over`/**`partial`** (§4.3 C3).
 *
 * A superset of `computeStreak` by construction: every day that extends the floor
 * streak extends this one, and the two share their breaking and transparent sets. That
 * is what makes an honest `partial` strictly better than silence without paying XP.
 */
export function engagementStreak(entries: HabitEntry[], habit: Habit, today: string): number {
  return runEndingLast(
    classifiedDays(habit, entries, dateOf(habit.createdAt), today, today),
    isEngaged,
  );
}

/**
 * Consecutive miss days working backward from `asOfDate` — SPEC §4.3.
 *
 * `asOfDate` is passed as "today" so that an empty `asOfDate` reads as `pending` and
 * stays transparent: this counts *resolved* days. Otherwise the day the user is still
 * living in would be counted as a miss and `needsNeverMissTwiceIntervention` (which
 * fires *after* two misses) would collide with `atRiskToday` (which fires *before* the
 * second one completes).
 */
export function consecutiveMissCount(
  entries: HabitEntry[],
  habit: Habit,
  asOfDate: string,
): number {
  const days = classifiedDays(habit, entries, dateOf(habit.createdAt), asOfDate, asOfDate);

  let count = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].isMiss) count += 1;
    else if (isFloorMet(days[i].state)) break;
    // `pending`, `partial` and exception skips are transparent, as everywhere else.
  }
  return count;
}

/** SPEC §4.3 — the 🔴 status light and the "don't miss twice" nudge read this. */
export function needsNeverMissTwiceIntervention(
  entries: HabitEntry[],
  habit: Habit,
  asOfDate: string,
): boolean {
  return (
    consecutiveMissCount(entries, habit, asOfDate) >= TUNING.statusLight.interventionConsecMiss
  );
}

/**
 * The open save window — SPEC §4.3 C2. True when the last resolved day (`today − 1`)
 * was a miss and today is still winnable (`pending`/`partial`).
 *
 * The scope check is explicit rather than incidental: ADR-0003 ¶4 is unconditional
 * ("정지 중인 습관에는 저장 배너를 띄우지 않는다"), and logging inside a pause is
 * allowed — so a reasoned skip recorded during a pause would otherwise raise a banner
 * for a habit the user has deliberately set down.
 */
export function atRiskToday(entries: HabitEntry[], habit: Habit, today: string): boolean {
  if (!isDateInScope(habit, today)) return false;

  const yesterday = addDays(today, -1);
  const days = classifiedDays(habit, entries, yesterday, today, today);

  // Literally `today − 1`, not "the most recent classified day": a transparent day
  // before today means nothing was resolved, so there is nothing to save.
  const previous = days.find((day) => day.date === yesterday);
  if (previous == null || !previous.isMiss) return false;

  const current = days.find((day) => day.date === today);
  return current != null && (current.state === 'pending' || current.state === 'partial');
}

/**
 * Engaged days in the `window` days ending at `asOfDate` — SPEC §4.3 C3. Cumulative,
 * not consecutive: Forming reads it as "나타남 · N일", the count of repetitions in
 * context that actually moves the automaticity curve.
 *
 * `asOfDate` is ours to add: the SPEC signature is `(entries, window)`, and a
 * window with no end date cannot be located on a calendar.
 */
export function showedUpDays(
  entries: HabitEntry[],
  habit: Habit,
  asOfDate: string,
  window: number,
): number {
  const from = addDays(asOfDate, -(window - 1));
  return classifiedDays(habit, entries, from, asOfDate, asOfDate).filter(isEngaged).length;
}
