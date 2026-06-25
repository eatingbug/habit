/**
 * domain/lifecycle.ts — Forming ⇄ Established lifecycle evaluation (SPEC §4.7).
 *
 * Pure: no React, no I/O. Operates on a habit + its entries as of a calendar date.
 */
import type { Habit, HabitEntry } from '../models';
import { TUNING } from '../config/tuning';
import { daysBetween, entriesInWindow, floorCompletionRate, isExceptionSkip, windowFrom } from './util';

/**
 * Compute the lifecycle a habit SHOULD be in as of `today`.
 *
 * - `paused` is STICKY: only an explicit user action toggles it. The engine never
 *   auto-pauses or auto-resumes, so a paused habit short-circuits to "paused".
 * - Otherwise (forming / established) we run ONE symmetric trailing-window verdict that
 *   drives both promotion and demotion (no hysteresis in V1 — SPEC §12.4):
 *     established ⇔ age ≥ 30d AND there is real (non-exception) data in the window
 *                  AND floor-completion rate ≥ 80%.
 *
 * The `sample.length > 0` guard is load-bearing: floorCompletionRate returns 1.0 for an
 * empty sample, which would otherwise spuriously promote a habit that has no data.
 */
export function evaluateLifecycle(
  habit: Habit,
  entries: HabitEntry[],
  today: string,
): Habit['lifecycle'] {
  if (habit.lifecycle === 'paused') return 'paused';

  const w = windowFrom(today, TUNING.formingToEstablishedDays);
  const sample = entriesInWindow(entries, w).filter((e) => !isExceptionSkip(e));
  const rate = floorCompletionRate(entries, w);
  const age = daysBetween(today, habit.createdAt.slice(0, 10));

  const established =
    age >= TUNING.formingToEstablishedDays &&
    sample.length > 0 &&
    rate >= TUNING.formingToEstablishedRate;

  return established ? 'established' : 'forming';
}
