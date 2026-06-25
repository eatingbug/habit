/**
 * domain/classify.ts — entry classification + the miss predicate (SPEC §4.1).
 */
import type { EntryState, HabitEntry } from '../models';

/**
 * Classify a (non-skip) logged amount.
 *
 * Precedence is OVER → DONE: the SPEC §4.1 prose lists the floor check first, but taken
 * literally that makes `over` unreachable (anything >= target is also >= floor). We check
 * the target first.
 *
 * `actual < floor` (and target not met) is NOT representable — `EntryState` has no
 * `under` state. The floor is the can't-possibly-fail minimum (CONCEPT §3.1); a value
 * below it is not "done", and storing it as done would falsely keep streaks and poison
 * the floor rate. So we throw: the composer must route sub-floor input to a
 * skip-with-reason 'floor' instead of logging it as a real entry.
 */
export function classifyEntry(actual: number, floor: number, target?: number): EntryState {
  if (target !== undefined && actual >= target) return 'over';
  if (actual >= floor) return 'done';
  throw new RangeError(
    `actual ${actual} is below floor ${floor}; sub-floor amounts must be logged as skip(floor), not a real entry`,
  );
}

/**
 * Is this entry a diagnostic miss?
 *  - undefined (blank day) → false (unknown is never a miss — CONCEPT §3.2)
 *  - skip with a non-`exception` reason → true
 *  - everything else (done, over, exception skip) → false
 */
export function isMiss(entry: HabitEntry | undefined): boolean {
  if (!entry) return false;
  return entry.state === 'skip' && entry.skipReason !== 'exception';
}
