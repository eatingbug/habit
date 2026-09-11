import type { DayState, Habit, HabitEntry } from '@/models';

import { dayStates, isMissDay } from './classify';
import { computeStreak } from './streak';

/**
 * What deleting one row costs — the whole basis of the result-aware delete confirm
 * (#13 AC 5–6, #15 AC 9).
 *
 * A pure function rather than a hook's private helper, because two screens ask the
 * same question of different days: Today's feed only ever holds `date === today`,
 * where an emptied day falls back to `pending` and nothing breaks (ADR-0001), while
 * the habit journal holds past dates, where the same delete can restore a `missed`
 * day and cut a streak. One derivation, two callers — a second copy is how the two
 * confirms eventually disagree about the same delete.
 *
 * Whether the answer is worth a confirm at all is the **caller's** gate, not this
 * function's: Today warns on `emptiesDay || carriesMiss`, the journal also warns when
 * the streak actually changes. This module reports; it does not decide what to say.
 */
export interface DeleteOutcome {
  /**
   * This delete leaves **no row at all** for that `(habit, date)`. Per habit, not per
   * date across habits: the day's state — the thing the user loses — only exists per
   * habit (§4.1).
   */
  emptiesDay: boolean;
  /**
   * This delete **erases a recorded miss**: the day counts as a miss now and does not
   * once the row is gone. `isMissDay` decides both halves, so `exception` — a skip
   * that is no miss at all (ADR-0001) — raises no warning, and neither does deleting
   * one of two skip rows, which leaves the day a miss regardless.
   *
   * The question is whether the delete *erases* the miss, not whether the day is one:
   * a date can hold two skip rows, and warning there would contradict `stateAfter`
   * inside the same paragraph of confirm copy.
   *
   * No test that the deleted row is itself a skip: a day carrying a miss through
   * `skip` holds no activity row (§4.1), and `missed` means it holds nothing at all —
   * so any row that can be deleted off a miss-carrying day *is* a skip.
   */
  carriesMiss: boolean;
  /**
   * What that `(habit, date)` becomes once the row is gone. `undefined` when the date
   * is paused and would be left empty — the engine has no opinion about such a day at
   * all (ADR-0003), so the screen must say nothing about its state.
   */
  stateAfter: DayState | undefined;
  /**
   * The floor streak ending at `today` as it stands, and as it would stand after the
   * delete. **Two fields, not one difference**: `연속 20일 → 4일` is what the user can
   * check, while a single delta hides which side is which.
   *
   * Both are recomputed from the rows by `computeStreak`, never stored and never
   * patched — the same rule that makes backfill a pure repair makes its inverse
   * honest (ADR-0001).
   */
  streakBefore: number;
  streakAfter: number;
}

/**
 * `history` is that habit's rows from its birth through `today` — the range
 * `computeStreak` walks. A shorter range would silently clip a run and report a
 * streak the user never had.
 */
export function deleteOutcome(
  habit: Habit,
  history: HabitEntry[],
  entry: HabitEntry,
  today: string,
): DeleteOutcome {
  const rowsOnDate = history.filter((row) => row.date === entry.date);
  const remaining = rowsOnDate.filter((row) => row.id !== entry.id);

  // The shared walk, not `classifyDay` plus a scope test of our own: it returns no day
  // at all for a paused date left empty, which is precisely `undefined` for
  // `stateAfter` (ADR-0003, and `classify.ts`'s own instruction to use `dayStates`).
  const before = dayStates(habit, rowsOnDate, entry.date, entry.date, today)[0];
  const stateAfter = dayStates(habit, remaining, entry.date, entry.date, today)[0]?.state;

  const missBefore = before != null && isMissDay(before.state, rowsOnDate);
  // An unclassified day carries no miss, so `stateAfter === undefined` (a paused date
  // left empty) is the not-a-miss side.
  const missAfter = stateAfter != null && isMissDay(stateAfter, remaining);

  return {
    emptiesDay: remaining.length === 0,
    carriesMiss: missBefore && !missAfter,
    stateAfter,
    streakBefore: computeStreak(history, habit, today),
    streakAfter: computeStreak(
      history.filter((row) => row.id !== entry.id),
      habit,
      today,
    ),
  };
}
