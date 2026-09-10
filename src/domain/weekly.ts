import type { Habit, HabitEntry } from '@/models';

import { dayStates } from './classify';
import { addDays, daysBetween, mondayOf } from './dates';

/**
 * Weekly aggregation — SPEC §4.6 C4.
 *
 * The §6.3 growth chart is the one surface that draws these numbers, and the §4.6
 * status light will read them too (#20). They live in their own module so the chart
 * does not have to import the diagnosis engine to draw a bar.
 */

/**
 * Day-summed actual per ISO week, most-recent last — SPEC §4.6 C4. The array is
 * **fixed length** (`weeks`), a fully unrecorded week reading `0` rather than a gap,
 * because the §6.3 growth chart draws one bar per week and needs the x-axis to be the
 * calendar, not the data.
 *
 * `habit` and `asOfDate` are ours to add, exactly as §4.4 adds them to the rate
 * functions: a week has to be located on a calendar, and a day's rows only sum through
 * `dayStates`, which needs the habit for its scope. Sub-floor days count — this is
 * *amount*, not achievement.
 */
export function weeklyActualTotals(
  entries: HabitEntry[],
  habit: Habit,
  asOfDate: string,
  weeks: number,
): number[] {
  const totals = new Array<number>(Math.max(0, weeks)).fill(0);
  if (weeks <= 0) return totals;

  const lastMonday = mondayOf(asOfDate);
  const firstMonday = addDays(lastMonday, -7 * (weeks - 1));
  for (const day of dayStates(habit, entries, firstMonday, asOfDate, asOfDate)) {
    const weeksBack = Math.floor(daysBetween(mondayOf(day.date), lastMonday) / 7);
    const index = weeks - 1 - weeksBack;
    if (index >= 0) totals[index] += day.sum;
  }
  return totals;
}
