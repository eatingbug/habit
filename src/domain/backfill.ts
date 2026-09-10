import type { Habit, HabitEntry, SkipReason } from '@/models';

import { compareDates, dateOf } from './dates';

/**
 * Backfill's write rules — SPEC §6.3.
 *
 * A pure range query plus two row constructors. Persistence, ids and the clock all
 * belong to the caller.
 *
 * ADR-0002's bulk prompt (`backfillPrompt`) is deliberately **not** here: it is the
 * reflection surface's question, and it lands with #22. This module is only what the
 * §6.2 B4 date stepper needs to write a row on a past day.
 */

/**
 * Is `date` a legal backfill target? (§6.3 allowed range)
 *
 * From the habit's `createdAt` date through `today`; pre-creation and future dates
 * are blocked.
 *
 * Note this is NOT `isDateInScope`: an empty day inside a `PauseInterval` is out of
 * *classification* scope but remains a legal backfill target, because filling a day
 * you actually did is always recovery (ADR-0003, "일시정지 구간에도 백필은 허용된다").
 * Scope decides what a prompt *lists*; this decides what the user may *write*.
 */
export function isBackfillableDate(habit: Habit, date: string, today: string): boolean {
  return (
    compareDates(date, dateOf(habit.createdAt)) >= 0 && compareDates(date, today) <= 0
  );
}

const NOON = 'T12:00:00.000Z';
const AFTER_NOON_MINUTE = 'T12:01:00.000Z';

/**
 * The `timestamp` the next backfilled row on `date` must carry (§6.3).
 *
 * Noon-pinned — the target date at `T12:00`, not the moment of entry — so the row
 * groups onto the right day and orders sanely between a morning and an evening log.
 * Repeated same-day backfills get strictly increasing sub-noon offsets
 * (`T12:00:00`, `T12:00:01`, …) so the domain total order `(timestamp ASC, id ASC)`
 * (§7.3) is well defined and `effectiveSkipReason` is deterministic — plain
 * "creation sequence" is unimplementable because UUIDs are not monotonic.
 *
 * Only the noon *minute* is scanned, so an ordinary same-day log (09:00, 21:00)
 * cannot drag the pin off noon. `rowsOnDate` may be passed in any order. Past the
 * 60th backfill of one date the minute overflows and the sequence restarts at noon —
 * harmless, because the `id` tiebreak keeps the §7.3 total order well-defined.
 */
export function nextBackfillTimestamp(date: string, rowsOnDate: HabitEntry[]): string {
  const noon = `${date}${NOON}`;
  const band = rowsOnDate
    .filter((row) => row.timestamp >= noon && row.timestamp < `${date}${AFTER_NOON_MINUTE}`)
    .map((row) => row.timestamp);

  if (band.length === 0) return noon;
  return new Date(Date.parse(band.reduce((a, b) => (a >= b ? a : b))) + 1_000).toISOString();
}

/**
 * "채우기" — filling a past date: appends a single activity row at the habit's floor,
 * so the day reclassifies to `done` and every quantity computed through it recovers
 * (ADR-0001). Binary habits have `floor === 1`, which is exactly "mark done", so
 * there is no branch.
 *
 * Appends; never overwrites (§6.3). `rowsOnDate` is read only to place the timestamp.
 */
export function buildBackfillActivity(
  habit: Habit,
  date: string,
  rowsOnDate: HabitEntry[],
  id: string,
  today: string,
): HabitEntry {
  assertBackfillable(habit, date, today);
  return {
    id,
    habitId: habit.id,
    date,
    timestamp: nextBackfillTimestamp(date, rowsOnDate),
    actual: habit.floor,
  };
}

/**
 * "안 했어요" — the other half: appends a skip row with the chosen reason. This is
 * what turns an unattributable `missed` day into a day that carries a reason, so
 * Rule 5 can finally see it.
 */
export function buildBackfillSkip(
  habit: Habit,
  date: string,
  rowsOnDate: HabitEntry[],
  id: string,
  skipReason: SkipReason,
  today: string,
): HabitEntry {
  assertBackfillable(habit, date, today);
  return {
    id,
    habitId: habit.id,
    date,
    timestamp: nextBackfillTimestamp(date, rowsOnDate),
    actual: 0,
    skipReason,
  };
}

/** The §6.3 range is enforced here, at the one place rows are constructed. */
function assertBackfillable(habit: Habit, date: string, today: string): void {
  if (!isBackfillableDate(habit, date, today)) {
    throw new Error(`백필할 수 없는 날짜입니다: ${date}`);
  }
}
