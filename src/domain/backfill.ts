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

/** How long the offsets run before the noon minute is used up. */
const NOON_MINUTE_MS = 60_000;

/**
 * The `timestamp` the next backfilled row on a date must carry (§6.3).
 *
 * Noon-pinned — the target day's **local** noon, not the moment of entry — so the row
 * groups onto the right day and orders sanely between a morning and an evening log.
 * Repeated backfills of one date get strictly increasing sub-noon offsets (noon,
 * noon + 1s, …) so the domain total order `(timestamp ASC, id ASC)` (§7.3) is well
 * defined and `effectiveSkipReason` is deterministic — plain "creation sequence" is
 * unimplementable because UUIDs are not monotonic.
 *
 * `localNoon` is passed in rather than built here: noon is a wall clock, the timezone
 * is ambient environment, and SPEC §2.2 keeps this layer free of it. `src/lib/device`
 * `localNoonOn` is the one place that reading is made. Building `${date}T12:00:00Z`
 * here instead would pin every row to UTC noon, which the user's feed reads back as
 * whatever their offset makes of it — 21:00 in Seoul, under a banner promising 낮 12시.
 *
 * Comparison is on instants, not on strings: two stamps for the same moment can be
 * written differently, and only the noon *minute* is scanned, so an ordinary log at
 * 09:00 or 21:00 local cannot drag the pin off noon. `rowsOnDate` may be passed in any
 * order. Past the 60th backfill of one date the minute is used up and the sequence
 * restarts at noon — harmless, because the `id` tiebreak keeps the §7.3 total order
 * well-defined.
 */
export function nextBackfillTimestamp(localNoon: string, rowsOnDate: HabitEntry[]): string {
  const noon = Date.parse(localNoon);
  const band = rowsOnDate
    .map((row) => Date.parse(row.timestamp))
    .filter((at) => at >= noon && at < noon + NOON_MINUTE_MS);

  return new Date(band.length === 0 ? noon : Math.max(...band) + 1_000).toISOString();
}

/**
 * "채우기" — filling a past date: appends a single activity row at the habit's floor,
 * so the day reclassifies to `done` and every quantity computed through it recovers
 * (ADR-0001). Binary habits have `floor === 1`, which is exactly "mark done", so
 * there is no branch.
 *
 * Appends; never overwrites (§6.3). `rowsOnDate` is read only to place the timestamp,
 * and `localNoon` is the day's local-noon stamp (see `nextBackfillTimestamp`).
 *
 * `actual` is the floor because that is what the one-tap fill writes. A caller with a
 * staged amount — the composer, on any amount the user typed — overrides it on the
 * returned row; what the builder contributes in that case is the noon pin and the §6.3
 * range assertion, which is why it is called either way.
 */
export function buildBackfillActivity(
  habit: Habit,
  date: string,
  localNoon: string,
  rowsOnDate: HabitEntry[],
  id: string,
  today: string,
): HabitEntry {
  assertBackfillable(habit, date, today);
  return {
    id,
    habitId: habit.id,
    date,
    timestamp: nextBackfillTimestamp(localNoon, rowsOnDate),
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
  localNoon: string,
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
    timestamp: nextBackfillTimestamp(localNoon, rowsOnDate),
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
