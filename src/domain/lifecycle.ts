import type { Habit, HabitEntry, PauseInterval } from '@/models';

import { TUNING } from '@/config/tuning';

import { dayStates } from './classify';
import { addDays } from './dates';
import { floorCompletionRate } from './rates';

/**
 * Lifecycle transitions — SPEC §4.7 (`docs/SPEC.md:776–782`), ADR-0003.
 *
 * Two paths change `habit.lifecycle`, and both live here so that "what changes this
 * field?" is answered by one file: the **user's** 정지·보관·재개 below, and the
 * **automatic** forming↔established judgment in `evaluateLifecycle` at the bottom. They
 * share no names and never produce each other's values — `evaluateLifecycle` never
 * returns `paused`/`archived`, and the three write functions never judge a record.
 *
 * Those three are pure. Each returns a **new** `Habit` and stores nothing: persistence
 * is the existing `upsertHabit` seam (SPEC §5.1), so there is no new repository method
 * and the caller decides when the write happens.
 *
 * The invariant every function here keeps is ADR-0003's
 * (`docs/adr/0003-paused-days-are-not-classified.md:97` for `'paused'`, `:42–46` for
 * `'archived'`, which 같은 기계장치를 탄다): `lifecycle` is `'paused'` or
 * `'archived'` **⟺** the last `PauseInterval` has no `to`. The open interval is what
 * `isDateInScope` reads (`src/domain/classify.ts:48`), so the lifecycle field alone
 * never decides whether a day is classified — which is why these two must be written
 * together, in one place.
 *
 * `pauses` is non-overlapping, `from` ASC and **append-only** (§3.2): nothing here ever
 * rewrites or drops a closed interval. The only mutation a closed interval could ever
 * receive is the `to` that closes it, and that is written exactly once, by `resumeHabit`.
 *
 * `deriveStatusLight` is deliberately *not* here (`src/domain/statusLight.ts`): it reads
 * the lifecycle, it never sets it.
 */

/** The open interval — the last one, and only when it has no `to`. */
function openInterval(habit: Habit): PauseInterval | undefined {
  const last = habit.pauses?.[habit.pauses.length - 1];
  return last != null && last.to == null ? last : undefined;
}

/** Stopped either way — both lifecycles ride the same open interval (ADR-0003). */
function isStopped(habit: Habit): boolean {
  return habit.lifecycle === 'paused' || habit.lifecycle === 'archived';
}

/**
 * The lifecycle a resume returns to, captured at the moment the habit stops being
 * active. Only `forming` and `established` are active values, so the fallback is the
 * one a habit that was somehow neither would land on anyway.
 */
function resumeTarget(habit: Habit): 'forming' | 'established' {
  return habit.lifecycle === 'established' ? 'established' : 'forming';
}

/**
 * Stop classifying this habit's empty days from `today` on — 잠깐 쉬기.
 *
 * On an already-open habit (paused **or** archived) this **flips the lifecycle and
 * keeps the interval**, rather than appending a second one. Appending would put two
 * open intervals in the list, breaking the ⟺ invariant, and the standing interval
 * already carries the `resumeTo` captured when the habit was last active — the value
 * that says what 다시 시작 must restore. So archive→pause keeps the right destination
 * instead of re-reading it from `'archived'`.
 */
export function pauseHabit(habit: Habit, today: string): Habit {
  return stopAt(habit, today, 'paused');
}

/**
 * 보관하기 — the same mechanism as a pause (ADR-0003: an open interval either way), so
 * an archived habit accrues no 미스 and its records stay. Only the *reading* differs:
 * the Dashboard and Today hide it, and it reads as "done with" rather than "later".
 */
export function archiveHabit(habit: Habit, today: string): Habit {
  return stopAt(habit, today, 'archived');
}

function stopAt(habit: Habit, today: string, lifecycle: 'paused' | 'archived'): Habit {
  if (habit.lifecycle === lifecycle) return habit;
  if (openInterval(habit) != null) return { ...habit, lifecycle };

  return {
    ...habit,
    lifecycle,
    pauses: [...(habit.pauses ?? []), { from: today, resumeTo: resumeTarget(habit) }],
  };
}

/**
 * 다시 시작 / 다시 꺼내기 — close the open interval with `to: today`, so **today is
 * active again**: the interval is half-open `[from, to)` (ADR-0003).
 *
 * The lifecycle returns to the interval's `resumeTo`, or to `forming` when it carries
 * none — data written before that field existed. Resuming an **active** habit is a
 * no-op: there is nothing to close, and appending or rewriting anything would corrupt
 * a history the user never asked to change.
 *
 * A stopped habit with no open interval breaks the ⟺ invariant and nothing in this
 * module can produce one, but the shape is constructible (a habit stored with
 * `lifecycle: 'archived'` and no `pauses` at all). It is still made active here rather
 * than returned untouched, because the alternative is a 다시 꺼내기 button that writes
 * an identical habit and leaves the user with no way out — the dead end #19's
 * *"보관된 습관은 대시보드에서 숨지만 기록이 보존되고 되돌릴 수 있다"* asks us to
 * remove.
 */
export function resumeHabit(habit: Habit, today: string): Habit {
  const open = openInterval(habit);
  if (open == null) {
    return isStopped(habit) ? { ...habit, lifecycle: 'forming' } : habit;
  }

  const pauses = habit.pauses!;
  return {
    ...habit,
    lifecycle: open.resumeTo ?? 'forming',
    pauses: [...pauses.slice(0, -1), { ...open, to: today }],
  };
}

/**
 * The automatic forming↔established judgment — SPEC §4.7.
 *
 * The asymmetry between the two automatic transitions is the whole content of this
 * function (§4.4 "rate role split"):
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
