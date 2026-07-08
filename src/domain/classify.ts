/**
 * domain/classify.ts — day-state classification + the miss predicate (SPEC §4.1).
 *
 * The domain computes a day's outcome from that day's FACTS (rows), never a stored
 * per-row state. `classifyDay` / `effectiveSkipReason` / `isMissDay` are the day-level
 * API. `classifyEntry` / `isMiss` below are the legacy per-row helpers kept only for the
 * not-yet-migrated UI layer.
 */
import type { DayState, EntryState, HabitEntry, SkipReason } from '../models';

/**
 * Total order over a day's rows: `timestamp` ASC, then `id` ASC (SPEC §4.1 / A4).
 * Makes day classification, scoring, and `effectiveSkipReason` permutation-invariant,
 * and deterministic even when rows share a timestamp (e.g. same-day backfill).
 */
export function compareEntries(a: HabitEntry, b: HabitEntry): number {
  if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Classify a single (habitId, date) from its rows (SPEC §4.1).
 *  - no rows → `unknown`.
 *  - only skip rows → `skip`.
 *  - activity rows (actual > 0): sum them, then
 *      sum >= floor → `done`, upgraded to `over` when a valid target (strictly > floor)
 *      is also met; 0 < sum < floor → `partial`.
 *
 * A1: `done` is decided before the `over` upgrade (so `over ⇒ done`). A target that is
 * not strictly above the floor — or any target on a binary habit — is treated as absent,
 * so a corrupt record can never emit a phantom `over`.
 */
export function classifyDay(dayEntries: HabitEntry[], floor: number, target?: number): DayState {
  if (dayEntries.length === 0) return 'unknown';
  const activity = dayEntries.filter((e) => e.actual > 0);
  if (activity.length === 0) {
    return dayEntries.some((e) => e.skipReason !== undefined) ? 'skip' : 'unknown';
  }
  const sum = activity.reduce((s, e) => s + e.actual, 0);
  const hasTarget = target !== undefined && target > floor;
  if (sum >= floor) {
    return hasTarget && sum >= target ? 'over' : 'done';
  }
  return 'partial';
}

/**
 * The reason of the LATEST skip row of a day under the total order (SPEC §4.1 / A4).
 * `undefined` when the day has no skip rows. Deterministic under equal timestamps and
 * invariant to input order.
 */
export function effectiveSkipReason(dayEntries: HabitEntry[]): SkipReason | undefined {
  const skips = dayEntries.filter((e) => e.actual === 0 && e.skipReason !== undefined);
  if (skips.length === 0) return undefined;
  return skips.slice().sort(compareEntries)[skips.length - 1].skipReason;
}

/**
 * Is this day a diagnostic miss? A `skip` day whose effective reason is non-`exception`.
 * `unknown` (blank), `partial`, `done`, `over`, and exception-skip days are NOT misses.
 */
export function isMissDay(dayEntries: HabitEntry[], floor: number, target?: number): boolean {
  if (classifyDay(dayEntries, floor, target) !== 'skip') return false;
  return effectiveSkipReason(dayEntries) !== 'exception';
}

/**
 * @deprecated Legacy per-row classifier kept only for the not-yet-migrated UI composer.
 * Throws on sub-floor input (the old `EntryState` has no `partial`). New code classifies
 * whole days via `classifyDay`.
 */
export function classifyEntry(actual: number, floor: number, target?: number): EntryState {
  if (target !== undefined && actual >= target) return 'over';
  if (actual >= floor) return 'done';
  throw new RangeError(
    `actual ${actual} is below floor ${floor}; sub-floor amounts must be logged as skip(floor), not a real entry`,
  );
}

/**
 * @deprecated Legacy per-row miss predicate (reads the vestigial `state`) kept for the UI.
 * New code uses `isMissDay`.
 */
export function isMiss(entry: HabitEntry | undefined): boolean {
  if (!entry) return false;
  return entry.state === 'skip' && entry.skipReason !== 'exception';
}
