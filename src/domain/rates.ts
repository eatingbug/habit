import type { Habit, HabitEntry } from '@/models';

import { TUNING } from '@/config/tuning';

import { type ClassifiedDay, dayStates, isFloorMet } from './classify';
import { windowEndingAt } from './dates';

/**
 * The two rates of SPEC §4.4 — "deliberately different populations".
 *
 * Both read **day-states**, never rows, and they get those states from `dayStates` so
 * the ADR-0003 pause/scope asymmetry is expressed in exactly one place.
 *
 * The five-rule diagnosis engine reads `floorCompletionRate` and lands with #20; this
 * module holds only the two rates themselves, because backfill's recovery is measured
 * in them (ADR-0001) and that is what #14 needs.
 *
 * **Nothing renders these yet, and that is deliberate.** #14 plants the two functions
 * and proves the ADR-0001 trade through them (`rates.test.ts` — "backfilling a missed
 * day to done raises the user-facing success rate"); where a rate is *shown*, and in
 * what words, is decided by #15 (habit detail) and #20 (status light). So the absence
 * of a production caller on this branch is the assignment, not an oversight.
 */

/**
 * A reason-bearing non-completion: the *only* day-state that attributes a component
 * (CONTEXT glossary). `isMiss` already encodes "not an `exception` skip".
 */
function isReasonedSkip(day: ClassifiedDay): boolean {
  return day.state === 'skip' && day.isMiss;
}

/** The `window` days ending at `asOfDate`, classified once and shared by both rates. */
function windowDays(
  habit: Habit,
  entries: HabitEntry[],
  asOfDate: string,
  window: number,
): ClassifiedDay[] {
  const dates = windowEndingAt(asOfDate, window);
  return dayStates(habit, entries, dates[0], dates[dates.length - 1], asOfDate);
}

/**
 * A rate over a chosen population, with the §4.4 min-sample guard applied to that
 * population: below `minEngagedDaysForRate` denominator days the answer is "not enough
 * data" (`null`), which every consumer must read as healthy. Without the guard a single
 * honest `partial` would give 0/1 and trip the rules off one data point.
 */
function rateOver(
  days: ClassifiedDay[],
  inDenominator: (day: ClassifiedDay) => boolean,
): number | null {
  const denominator = days.filter(inDenominator);
  if (denominator.length < TUNING.diagnosis.minEngagedDaysForRate) return null;
  return denominator.filter((day) => isFloorMet(day.state)).length / denominator.length;
}

/**
 * The number the **user** sees ("성공률") — `done`/`over` ÷ (`done` + `over` +
 * `partial` + non-exception `skip` + **`missed`**). `pending` and exception skips are
 * excluded. An unrecorded day lowers it and backfilling raises it back (ADR-0001).
 */
export function successRate(
  entries: HabitEntry[],
  habit: Habit,
  asOfDate: string,
  window: number,
): number | null {
  const days = windowDays(habit, entries, asOfDate, window);
  return rateOver(
    days,
    (day) =>
      isFloorMet(day.state) ||
      day.state === 'partial' ||
      day.state === 'missed' ||
      isReasonedSkip(day),
  );
}

/**
 * The number the **diagnosis** reads — `missed` excluded from **both** sides.
 *
 * Rule 1 asks *"when you tried, could you reach the floor?"*, and a `missed` day says
 * nothing about the floor; letting it into that denominator would make forgotten
 * logging read as "your floor is too high" (§4.4).
 *
 * `excludePartial` serves the Established→Forming demotion (§4.7), the one consumer
 * where a low rate **costs** the user status: there `partial` sits in neither the
 * numerator nor the denominator (and `missed` returns to it), so an honest
 * partial-logger is never evicted while a silent non-logger is.
 */
export function floorCompletionRate(
  entries: HabitEntry[],
  habit: Habit,
  asOfDate: string,
  window: number,
  opts?: { excludePartial?: boolean },
): number | null {
  const days = windowDays(habit, entries, asOfDate, window);
  if (opts?.excludePartial) {
    return rateOver(
      days,
      (day) => isFloorMet(day.state) || day.state === 'missed' || isReasonedSkip(day),
    );
  }
  return rateOver(
    days,
    (day) => isFloorMet(day.state) || day.state === 'partial' || isReasonedSkip(day),
  );
}
