/**
 * theme/heatLevel.ts — UI helper mapping a HabitEntry to a heatmap bucket.
 *
 * This is a PRESENTATION concern, not domain logic, so it lives in theme/ (not src/domain).
 * Buckets mirror the demo's green ramp (green0..green4) plus a distinct `miss` cell.
 *
 *   0      — blank / exception skip (neutral, never a miss)
 *   1..4   — floor met, shaded by how far above the floor toward the target
 *   'miss' — a diagnostic miss (non-exception skip), rendered red-tinted
 *
 * Binary (yes/no) habits have no magnitude, so a "done" day is always a full cell (4).
 */
import type { Habit, HabitEntry } from '../models';

export type HeatLevel = 0 | 1 | 2 | 3 | 4 | 'miss';

export function heatLevel(
  entry: HabitEntry | undefined,
  habit: Pick<Habit, 'kind' | 'floor' | 'target'>,
): HeatLevel {
  if (!entry) return 0; // blank day

  if (entry.state === 'skip') {
    // Exception skips are excluded from misses (CONCEPT §3.2) → render as neutral.
    return entry.skipReason === 'exception' ? 0 : 'miss';
  }

  // Binary: no above-floor magnitude — a done day reads as a full cell.
  if (habit.kind === 'binary') return 4;

  // done / over: floor is met. Shade by progress above the floor.
  if (entry.actual <= habit.floor) return 1;

  // Scale the above-floor amount against the target band when a target exists,
  // otherwise treat any above-floor work as the top of the ramp.
  const target = habit.target;
  if (target === undefined || target <= habit.floor) return 4;

  const progress = (entry.actual - habit.floor) / (target - habit.floor);
  if (progress >= 1) return 4;
  if (progress >= 0.66) return 3;
  return 2;
}
