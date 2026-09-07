import type { Habit, HabitEntry } from '@/models';

import { TUNING } from '@/config/tuning';

import type { ClassifiedDay } from './classify';
import { dayStates } from './classify';
import { addDays, dateOf, daysBetween, mondayOf, weekdayOf } from './dates';
import { diagnose } from './diagnose';
import { needsNeverMissTwiceIntervention } from './streak';

/**
 * Status-light derivation — SPEC §4.6.
 *
 * The light is the whole diagnosis surfaced as one glyph, so what it *demands* matters
 * more than what it reports: 🔴 is the only value that asks the user to stop and
 * reflect. Two rules follow from that and both are load-bearing here:
 *
 * - **The decline floor-guard (C5).** An Established habit that merely settled back
 *   from an unsustainable peak is not failing. Reproaching it is the "requirements rise
 *   as you improve → churn" anti-pattern §10 forbids, so a decline only turns 🔴 once
 *   the latest week has fallen to the target the user themselves set.
 * - **A paused or archived habit demands nothing.** ADR-0003 exists so that pausing is
 *   a real exit rather than the harshest choice in the system; a 🔴 on a habit the user
 *   deliberately set down would undo that (issue #20 AC).
 *
 * Every date walk goes through `dayStates`, which owns the ADR-0003 scope asymmetry (a
 * date is dropped only when it is out of scope *and* holds no rows). This module never
 * re-derives it.
 */

export type StatusLight = 'stable' | 'caution' | 'intervention' | 'personal_best';

function isFloorMet(day: ClassifiedDay): boolean {
  return day.state === 'done' || day.state === 'over';
}

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

/** Floor-met days per ISO week, most-recent last — the Forming consistency best. */
function weeklyFloorMetDays(
  entries: HabitEntry[],
  habit: Habit,
  asOfDate: string,
  weeks: number,
): number[] {
  const counts = new Array<number>(Math.max(0, weeks)).fill(0);
  if (weeks <= 0) return counts;

  const lastMonday = mondayOf(asOfDate);
  const firstMonday = addDays(lastMonday, -7 * (weeks - 1));
  for (const day of dayStates(habit, entries, firstMonday, asOfDate, asOfDate)) {
    if (!isFloorMet(day)) continue;
    const index = weeks - 1 - Math.floor(daysBetween(mondayOf(day.date), lastMonday) / 7);
    if (index >= 0) counts[index] += 1;
  }
  return counts;
}

/** How many ISO weeks the habit has existed for, including the current one. */
function weeksSinceBirth(habit: Habit, today: string): number {
  const born = mondayOf(dateOf(habit.createdAt));
  return Math.floor(daysBetween(born, mondayOf(today)) / 7) + 1;
}

/**
 * The level the C5 guard compares the latest week against. §7.3's own scenarios read
 * the (daily) target directly against a weekly total — `12,11,10,9` with target 8 —
 * so that is what we implement rather than a per-day normalisation.
 *
 * A habit with no honoured target (binary, or a corrupt `target <= floor`, §4.1) falls
 * back to the floor: the guard's question is "has it fallen to the level the user
 * committed to?", and for those habits the floor *is* that level.
 */
function guardLevel(habit: Habit): number {
  if (habit.kind === 'count' && habit.target != null && habit.target > habit.floor) {
    return habit.target;
  }
  return habit.floor;
}

/**
 * The last ISO week that has actually finished. The decline check must never read the
 * in-progress week: on a Wednesday a habit doing 20/week reports a partial total, and
 * `20, 18, 6` would turn 🔴 on a habit that is fine — precisely what C5 exists to stop.
 * `weeklyActualTotals` still includes the current week, because the growth chart wants
 * to draw it.
 */
function lastCompletedWeekEnd(today: string): string {
  return weekdayOf(today) === 0 ? today : addDays(mondayOf(today), -1);
}

/**
 * Established 🔴 — a declining weekly actual trend **and** the absolute-level guard
 * (§4.6 C5). `establishedDeclWeeks` is read as the number of weekly totals examined.
 *
 * The comparison is **strictly** decreasing, never "non-increasing". A resumed habit's
 * paused weeks read 0, so a non-strict test would fire 🔴 on every resume — ADR-0003's
 * "pause never costs" would fail at the light.
 */
function hasDecliningTrend(habit: Habit, entries: HabitEntry[], today: string): boolean {
  const weeks = TUNING.statusLight.establishedDeclWeeks;
  const totals = weeklyActualTotals(entries, habit, lastCompletedWeekEnd(today), weeks);
  for (let i = 1; i < totals.length; i += 1) {
    if (totals[i] >= totals[i - 1]) return false;
  }
  const latest = totals[totals.length - 1];
  if (!TUNING.statusLight.establishedDeclineFloorGuard) return true;
  return latest <= guardLevel(habit);
}

/**
 * Established ⭐ — an **intensity** best: this week's total actual beats every prior
 * week's (§4.6 C6). The in-progress week counts, deliberately: beating every previous
 * week on a Wednesday is a real best, and unlike the decline check a partial week can
 * only *understate* it, so there is no false-positive risk.
 */
function isIntensityBest(habit: Habit, entries: HabitEntry[], today: string): boolean {
  const totals = weeklyActualTotals(entries, habit, today, weeksSinceBirth(habit, today));
  if (totals.length < 2) return false;
  const current = totals[totals.length - 1];
  return current > 0 && totals.slice(0, -1).every((prior) => current > prior);
}

/**
 * Floor-met runs over the habit's whole life, oldest first. A miss ends a run;
 * everything else is transparent — the same rule `computeStreak` walks, so the last
 * element is the current streak.
 */
function floorMetRuns(habit: Habit, entries: HabitEntry[], today: string): number[] {
  const runs: number[] = [];
  let current = 0;
  for (const day of dayStates(habit, entries, dateOf(habit.createdAt), today, today)) {
    if (isFloorMet(day)) current += 1;
    else if (day.isMiss) {
      runs.push(current);
      current = 0;
    }
  }
  runs.push(current);
  return runs;
}

/**
 * Forming ⭐ — a **consistency** best: the best floor-completion week yet, or a new
 * longest streak (§4.6 C6). Forming foregrounds the floor, not volume, so the
 * encouraging light has to be earned by showing up rather than by pushing harder —
 * CONCEPT §7.1 wants positive lighting for exactly this cohort.
 */
function isConsistencyBest(habit: Habit, entries: HabitEntry[], today: string): boolean {
  const weeks = weeksSinceBirth(habit, today);
  const counts = weeklyFloorMetDays(entries, habit, today, weeks);
  const currentWeek = counts[counts.length - 1];
  if (currentWeek > 0 && counts.slice(0, -1).every((prior) => currentWeek > prior)) return true;

  const runs = floorMetRuns(habit, entries, today);
  const streak = runs[runs.length - 1];
  return streak > 0 && runs.slice(0, -1).every((prior) => streak > prior);
}

/**
 * SPEC §4.6. Precedence follows the section's own listing order: `intervention`,
 * then `caution`, then `personal_best`, then `stable` — a habit that needs attention
 * says so even in the week it set a record.
 *
 * The Forming 🔴 arm reuses `needsNeverMissTwiceIntervention` (§4.3 C1) rather than
 * re-reading its threshold. §4.3 states that rule without a lifecycle condition while
 * §4.6 gates it to Forming; §4.6 governs the light (and §7.2 step 3 corroborates), so
 * an Established habit reaches 🔴 only through the trend arm.
 */
export function deriveStatusLight(habit: Habit, entries: HabitEntry[], today: string): StatusLight {
  // ADR-0003: a habit the user has set down is not allowed to demand anything.
  if (habit.lifecycle === 'paused' || habit.lifecycle === 'archived') return 'stable';

  const intervention =
    habit.lifecycle === 'forming'
      ? needsNeverMissTwiceIntervention(entries, habit, today)
      : hasDecliningTrend(habit, entries, today);
  if (intervention) return 'intervention';

  // Flag-driven: a Rule 1 caution is an intended *opportunity* (§7.4), which is why it
  // may be raised by a `partial`-lowered rate while the demotion (§4.7) may not.
  if (diagnose(habit, entries, today).length >= TUNING.statusLight.cautionMinFlags) {
    return 'caution';
  }

  const best =
    habit.lifecycle === 'forming'
      ? isConsistencyBest(habit, entries, today)
      : isIntensityBest(habit, entries, today);
  return best ? 'personal_best' : 'stable';
}

/**
 * SPEC §4.6 — powers the Dashboard "shaky habits · N" aggregate (CONCEPT §7.3).
 * Paused and archived habits contribute nothing by construction, since their light is
 * always `stable`.
 */
export function aggregateStatusCount(
  habits: Habit[],
  entriesByHabit: Record<string, HabitEntry[]>,
  today: string,
): { caution: number; intervention: number } {
  const count = { caution: 0, intervention: 0 };
  for (const habit of habits) {
    const light = deriveStatusLight(habit, entriesByHabit[habit.id] ?? [], today);
    if (light === 'caution') count.caution += 1;
    else if (light === 'intervention') count.intervention += 1;
  }
  return count;
}
