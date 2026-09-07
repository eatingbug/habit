import type { Habit, HabitEntry, SkipReason } from '@/models';

import { TUNING } from '@/config/tuning';

import { dayStates } from './classify';
import { compareDates, dateOf, windowEndingAt } from './dates';

/**
 * Bulk backfill — ADR-0002's recover-first prompt (§6.4) plus the §6.3 row rules.
 *
 * ADR-0002: a run of `missed` days is not diagnosed, it is *asked about*. `missed`
 * conflates two opposite worlds — "doing it, not recording it" and "walked away" —
 * and no rule can tell them apart, so attaching a component to a `missed` day would
 * be a guess dressed as a diagnosis. The prompt collects the missing data instead;
 * once the days hold rows the existing four rules work as designed.
 *
 * This module is a pure query plus two row constructors. Persistence, ids and the
 * clock all belong to the caller.
 */

/** The §6.4 prompt as data. Deliberately carries no component/severity/flag: a
 *  `missed` day never produces a diagnosis flag or an attribution (§7.3). */
export interface BackfillPrompt {
  /** ADR-0002 trigger: a long enough `missed` run, or too high a `missed` rate. */
  shouldPrompt: boolean;
  /** The `missed` dates to offer, ascending. Only ever `missed` days in scope. */
  dates: string[];
  /** Longest consecutive `missed` run in the window (out-of-scope days transparent). */
  missedRun: number;
  /** `missed` share of the window's *decided* days — unclassified days are excluded
   *  from both sides of every rate (§7.3), and `pending` is excluded too, as it is
   *  from `successRate` (ADR-0001 §2): the day is not over yet. */
  missedRate: number;
  /** The prompt's own wording — ADR-0002's "이 5일, 하셨나요?". */
  question: string;
}

/**
 * Should reflection open with the recover-first question, and about which days?
 *
 * The window is `TUNING.windows.missedRate` days ending at `today`. Both the run and
 * the rate are measured over `dayStates`, so a paused habit's empty days are absent
 * from the walk entirely: they are neither listed nor counted, and a pause therefore
 * can never conjure this prompt (ADR-0003 §파급 5).
 */
export function backfillPrompt(
  habit: Habit,
  entries: HabitEntry[],
  today: string,
): BackfillPrompt {
  const window = windowEndingAt(today, TUNING.windows.missedRate);
  const days = dayStates(habit, entries, window[0], today, today);

  const dates: string[] = [];
  let missedRun = 0;
  let current = 0;
  for (const day of days) {
    if (day.state === 'missed') {
      dates.push(day.date);
      current += 1;
      missedRun = Math.max(missedRun, current);
    } else {
      current = 0;
    }
  }

  const decided = days.filter((day) => day.state !== 'pending').length;
  const missedRate = decided === 0 ? 0 : dates.length / decided;

  // ADR-0002 comparators: the run fires at the threshold (이상), the rate strictly
  // above it (초과).
  const shouldPrompt =
    missedRun >= TUNING.diagnosis.missedRunForBackfillPrompt ||
    missedRate > TUNING.diagnosis.missedRateForBackfillPrompt;

  return {
    shouldPrompt,
    dates,
    missedRun,
    missedRate,
    question: `이 ${dates.length}일, 하셨나요?`,
  };
}

/**
 * Is `date` a legal backfill target? (§6.3 allowed range)
 *
 * From the habit's `createdAt` date through `today`; pre-creation and future dates
 * are blocked.
 *
 * Note this is NOT `isDateInScope`: an empty day inside a `PauseInterval` is out of
 * *classification* scope but remains a legal backfill target, because filling a day
 * you actually did is always recovery (ADR-0003, "일시정지 구간에도 백필은 허용된다").
 * Scope decides what the prompt *lists*; this decides what the user may *write*.
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
 * "채우기" — the one-tap fill of a listed date (§6.4): appends a single activity row
 * at the habit's floor, so the day reclassifies to `done` and every quantity computed
 * through it recovers (ADR-0001). Binary habits have `floor === 1`, which is exactly
 * "mark done", so there is no branch.
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
 * "안 했어요" — the equally prominent other half of the prompt (ADR-0002 대칭성):
 * appends a skip row with the chosen reason. This is what turns an unattributable
 * `missed` day into a day that carries a reason, so Rule 5 can finally see it.
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
