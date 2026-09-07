import type { Habit, HabitEntry } from '@/models';

import { TUNING } from '@/config/tuning';

import { dayStates } from './classify';
import { addDays } from './dates';
import { floorCompletionRate } from './diagnose';

/**
 * Lifecycle transitions — SPEC §4.7.
 *
 * The asymmetry between the two automatic transitions is the whole content of this
 * module (§4.4 "rate role split"):
 *
 * - **Promotion** reads the standard, **partial-inclusive** rate. A `partial`-lowered
 *   rate only keeps the user in Forming longer, which is *more* scaffolding — not a
 *   penalty — so letting `partial` count against it is safe.
 * - **Demotion** must read the **partial-excluded** rate (`{ excludePartial: true }`).
 *   This is the one consumer where a low rate *costs* the user status, and the scoped
 *   fairness rule (§3.2, principle 11) forbids evicting an honest `partial`-logger from
 *   Established when a silent non-logger would not be. `missed` stays in that rate, so
 *   backfilling an unrecorded day can only ever help (ADR-0001, §7.3).
 *
 * Both rates return `null` for "not enough data", which every consumer must read as
 * **healthy**: no promotion, and — more importantly — no demotion. Otherwise every
 * habit would be demoted the week it was created.
 *
 * `paused` and `archived` are explicit user actions (they append a `PauseInterval`,
 * ADR-0003) and are never produced here; this function returns the habit's current
 * lifecycle unchanged for them.
 */
export function evaluateLifecycle(
  habit: Habit,
  entries: HabitEntry[],
  today: string,
): Habit['lifecycle'] {
  if (habit.lifecycle === 'paused' || habit.lifecycle === 'archived') return habit.lifecycle;

  const window = TUNING.formingToEstablishedDays;

  if (habit.lifecycle === 'forming') {
    // "…for `formingToEstablishedDays` consecutive days": the window has to have
    // actually elapsed. Without this, the min-sample guard (5 engaged days) is the only
    // floor and a six-day-old habit with a perfect record would be promoted out of
    // Forming — against TUNING's own "30d@80% as the mode switch" note. Classified
    // in-scope days are counted rather than calendar age, so the ADR-0003 rule that a
    // paused stretch is transparent holds here too (staying in Forming is scaffolding).
    const classified = dayStates(habit, entries, addDays(today, -(window - 1)), today, today);
    if (classified.length < window) return 'forming';

    const rate = floorCompletionRate(entries, habit, today, window);
    return rate != null && rate >= TUNING.formingToEstablishedRate ? 'established' : 'forming';
  }

  const rate = floorCompletionRate(entries, habit, today, window, { excludePartial: true });
  return rate != null && rate < TUNING.formingToEstablishedRate ? 'forming' : 'established';
}
