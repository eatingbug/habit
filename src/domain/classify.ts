import type { DayState, Habit, HabitEntry, SkipReason } from '@/models';

import { compareDates, dateOf, dateRange } from './dates';
import { sortByDomainOrder } from './feed';

/**
 * Day-level classification — SPEC §4.1.
 *
 * Day-state is computed from all of a day's entries and never stored. That is what
 * makes backfill repair free (ADR-0001): appending a row to a past date reclassifies
 * it, and every quantity that ran through that day recovers with it.
 */

/** An activity row: positive amount, no reason. */
function isActivityRow(entry: HabitEntry): boolean {
  return entry.actual > 0 && entry.skipReason == null;
}

/** A skip row: zero amount, a reason. */
function isSkipRow(entry: HabitEntry): boolean {
  return entry.skipReason != null;
}

/**
 * The domain's total order over a day's rows: `(timestamp ASC, then id ASC)`
 * (§7.3 invariant), as it applies to habit rows.
 *
 * The comparator itself lives in `./feed`, because the Today feed orders free logs by
 * the same pair and a `FreeLog` is not a `HabitEntry` (§3.4). The signature stays
 * narrow deliberately: every caller here passes `HabitEntry[]`, and the type is what
 * says these are a habit's rows rather than anything carrying a stamp.
 */
export function sortDayRows(entries: HabitEntry[]): HabitEntry[] {
  return sortByDomainOrder(entries);
}

/**
 * Is this a date the engine is allowed to have an opinion about? (ADR-0003)
 *
 * False before `habit.createdAt` and inside a `PauseInterval`. Scope lives in this one
 * predicate rather than in `classifyDay`'s return type — `classifyDay` stays total.
 *
 * Note the asymmetry consumers must honour: being out of scope only suppresses the
 * *empty-day* `missed` default. An out-of-scope date that holds rows still classifies
 * normally, so pausing never claws back XP or a streak already earned. Use
 * `dayStates` rather than re-deriving that rule.
 */
export function isDateInScope(habit: Habit, date: string): boolean {
  if (compareDates(date, dateOf(habit.createdAt)) < 0) return false;

  for (const pause of habit.pauses ?? []) {
    if (compareDates(date, pause.from) < 0) continue;
    // Half-open [from, to): the resume date is active again. An absent `to` is open.
    if (pause.to == null || compareDates(date, pause.to) < 0) return false;
  }
  return true;
}

/**
 * The single authoritative classifier (SPEC §4.1). Total: it always returns a
 * `DayState`. `entries` are the rows for one `(habitId, date)`.
 */
export function classifyDay(
  entries: HabitEntry[],
  habit: Habit,
  date: string,
  today: string,
): DayState {
  const activity = entries.filter(isActivityRow);

  if (activity.length === 0) {
    if (entries.some(isSkipRow)) return 'skip';
    return date === today ? 'pending' : 'missed';
  }

  const sum = activity.reduce((total, entry) => total + entry.actual, 0);
  if (sum < habit.floor) return 'partial';

  // `done` is decided first; `over` is only ever an upgrade of a floor-met day, so a
  // corrupt record can never emit a phantom `over` from below the floor.
  return sum >= effectiveTarget(habit) ? 'over' : 'done';
}

/**
 * The target the engine will actually honour: count habits only, strictly above the
 * floor. A `target <= floor` is meaningless, and any target on a binary habit is
 * corrupt — both read as "no target" (§3.2, §4.1 defensive target read).
 */
function effectiveTarget(habit: Habit): number {
  if (habit.kind !== 'count') return Infinity;
  if (habit.target == null || habit.target <= habit.floor) return Infinity;
  return habit.target;
}

/**
 * For an only-skip day with differing reasons, the most recent skip row's reason
 * represents the day — "latest intent wins" under the total order (§4.1).
 */
export function effectiveSkipReason(entries: HabitEntry[]): SkipReason | undefined {
  const skips = sortDayRows(entries.filter(isSkipRow));
  return skips.length === 0 ? undefined : skips[skips.length - 1].skipReason;
}

/**
 * Does this day count as a miss? (SPEC §4.1)
 *
 * `missed` is a miss with no reason (ADR-0001) — it attributes no component. A `skip`
 * is a miss only when its effective reason is not `exception`.
 */
export function isMissDay(state: DayState, entries: HabitEntry[]): boolean {
  if (state === 'missed') return true;
  if (state === 'skip') return effectiveSkipReason(entries) !== 'exception';
  return false;
}

/**
 * Did this day meet its floor? `done`, or its `over` upgrade — `over ⇒ done` (§4.1).
 *
 * Defined here, beside `isMissDay`, because five call sites across the domain, the
 * hooks and the screens need it: duplicating the comparison is how `over` eventually
 * gets forgotten at one of them and a target-beating day stops counting as done.
 * Takes the state (not a `ClassifiedDay`) so a caller holding an optional day — a
 * paused day has no state at all, ADR-0003 — can ask directly.
 */
export function isFloorMet(state: DayState | undefined): boolean {
  return state === 'done' || state === 'over';
}

/** One classified day, as produced by `dayStates`. */
export interface ClassifiedDay {
  date: string;
  state: DayState;
  /** Sum of the day's activity rows. */
  sum: number;
  isMiss: boolean;
  /** Present only on an only-skip day. */
  skipReason?: SkipReason;
  /** The day's rows, in the domain total order. */
  entries: HabitEntry[];
}

/**
 * The one shared walk over a date range — SPEC §4.1's transparency rule, in a single
 * place.
 *
 * Every consumer that spans dates (`computeStreak`, `engagementStreak`,
 * `milestoneBonusXP`, `successRate`, `floorCompletionRate`, `consecutiveMissCount`,
 * `atRiskToday`, the heatmap, the §6.4 backfill prompt) walks this rather than
 * re-deriving the scope rule. A date is omitted only when it is **both** out of scope
 * **and** holds no rows — the ADR-0003 asymmetry, expressed once.
 *
 * `from`/`to` are inclusive and the result is ascending by date.
 */
export function dayStates(
  habit: Habit,
  entries: HabitEntry[],
  from: string,
  to: string,
  today: string,
): ClassifiedDay[] {
  const byDate = new Map<string, HabitEntry[]>();
  for (const entry of entries) {
    const bucket = byDate.get(entry.date);
    if (bucket) bucket.push(entry);
    else byDate.set(entry.date, [entry]);
  }

  const out: ClassifiedDay[] = [];
  for (const date of dateRange(from, to)) {
    const rows = byDate.get(date) ?? [];
    if (rows.length === 0 && !isDateInScope(habit, date)) continue;

    const state = classifyDay(rows, habit, date, today);
    out.push({
      date,
      state,
      sum: rows.filter(isActivityRow).reduce((total, entry) => total + entry.actual, 0),
      isMiss: isMissDay(state, rows),
      // Only an only-skip day carries a reason. A day whose activity overrode its skip
      // rows (§4.1 step 3) must not surface one: `ClassifiedDay` is the shared walk
      // every consumer reads, and §4.4 Rule 5 attributes a component from a skip
      // reason — a `done` day handing out an earlier skip's reason would attribute a
      // failure to a day the user actually completed.
      skipReason: state === 'skip' ? effectiveSkipReason(rows) : undefined,
      entries: sortDayRows(rows),
    });
  }
  return out;
}
