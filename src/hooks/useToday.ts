import { useEffect, useState } from 'react';

import { useRepository } from '@/context/RepositoryContext';
import {
  type ClassifiedDay,
  classifyDay,
  dayStates,
  isFloorMet,
  isMissDay,
  sortDayRows,
} from '@/domain/classify';
import { compareDates, dateOf } from '@/domain/dates';
import { computeXP } from '@/domain/score';
import { localToday } from '@/lib/device';
import type { DayState, Habit, HabitEntry, SkipReason } from '@/models';

import {
  logAffordances,
  useQuickLog,
  type LogAffordances,
  type QuickLogToast,
} from './useQuickLog';

/**
 * Today's recording path — SPEC §6.2.
 *
 * The hook is the ticket's test seam (jest.config.js: hooks + an in-memory repository,
 * no component render tests), so three things are deliberate:
 *
 * - the repository arrives through `RepositoryProvider`, never constructed here;
 * - `today` is a parameter. Day-state depends on it (`pending` vs `missed`,
 *   ADR-0001), so a test must be able to pin it;
 * - `now` is a parameter too. It stamps the row's `timestamp`, which is the domain's
 *   ordering key (§3.3), so pinning it is what makes the feed's order assertable.
 *
 * `new Date()` is therefore read only at the UI edge, in this file's defaults.
 *
 * **Nothing here stores a day's state.** Every state on screen is recomputed from the
 * rows by `dayStates` on each load, which is why appending a row is the whole of
 * recording — and why a later backfill repairs a past day for free (ADR-0001).
 */

export interface TodayHabitRow extends LogAffordances {
  habit: Habit;
  /**
   * Today for this habit, classified. **Absent** only when today is out of
   * classification scope *and* holds no rows — an empty paused day, on which the
   * engine has no opinion at all (ADR-0003). The habit is still selectable: logging
   * into a paused day is legitimate and still earns (§7.3).
   */
  day?: ClassifiedDay;
  /**
   * What the amount field starts prefilled with (B2). The day's first record gets the
   * habit's `floor` — "I did my minimum" is the dominant case; from the second record
   * on it gets the day's last amount, because a second log is usually another helping
   * of the same size.
   */
  defaultAmount: number;
  /**
   * The quick-add chips (B2): `+1` / `+최소량` / `직전값`, in that order and deduped —
   * `직전값` is absent on the day's first record because there is no previous amount.
   */
  quickChips: number[];
  /** The day's progress-to-floor line (C7a). `remaining` clamps at 0. */
  progress: { sum: number; floor: number; remaining: number };
  /**
   * True when the day is floor-met and the habit has no **effective** target, so the
   * screen can suggest setting one (C7a: "최소량을 넘기면 … 목표를 넌지시 권한다").
   * A `target <= floor` counts as no target, mirroring §4.1's defensive read.
   */
  suggestTarget: boolean;
}

/** One line of the chronological feed (§6.2). Free logs interleave here in #16. */
export interface TodayFeedItem {
  habit: Habit;
  entry: HabitEntry;
}

/**
 * Why deleting one row deserves a confirm — the whole basis of the warning, derived so
 * that nothing is left for the JSX to judge (#13 D2). This repo has no component render
 * tests (jest.config.js), so a condition written in a screen is a condition nothing
 * asserts.
 *
 * Deliberately **not** a per-feed-item field: it is computed when the delete control is
 * pressed, because there is no reason to run the classifier once per visible row
 * (CLAUDE.md §2).
 */
export interface DeleteEffect {
  habit: Habit;
  /**
   * This delete leaves **no row at all** for that `(habit, date)` (AC 5). Per habit,
   * not per date across habits: the day's state — the thing the user loses — only
   * exists per habit (§4.1).
   *
   * Note what this does *not* claim. On **today** the emptied day falls back to
   * `pending`, not `missed`: ADR-0001 makes an empty *past* day a miss, and today is
   * still open (`streak.test.ts` — "keeps a pending today transparent"). So no streak
   * breaks and no miss appears. The `missed` reversal and the broken streak belong to a
   * screen that holds past-dated rows (#15).
   */
  emptiesDay: boolean;
  /**
   * This delete **erases a recorded miss** (AC 6): the day counts as a miss now and
   * does not once the row is gone. `isMissDay` decides both halves, so `exception` — a
   * skip that is no miss at all (ADR-0001) — raises no warning, and neither does
   * deleting one of two skip rows, which leaves the day a miss regardless.
   */
  carriesMiss: boolean;
  /**
   * What that `(habit, date)` becomes once the row is gone. `undefined` when the date
   * is paused and would be left empty — the engine has no opinion about such a day at
   * all (ADR-0003), so the screen must say nothing about its state.
   */
  stateAfter: DayState | undefined;
}

export interface TodayView {
  /** The day being recorded — 'YYYY-MM-DD'. */
  date: string;
  loading: boolean;
  /** Every non-archived habit, in repository order — the target selector's options. */
  rows: TodayHabitRow[];
  /** Today's rows across all habits, in the domain total order (§7.3). */
  feed: TodayFeedItem[];
  /** Habits whose day is floor-met. `over` implies `done`, so both count (§4.1). */
  questsDone: number;
  /** Rows recorded today — many per habit are expected (§3.3). */
  logCount: number;
  /**
   * XP today's rows added, from the domain: `computeXP` with them minus `computeXP`
   * without them. Never a stored or invented figure — the same before/after delta
   * `describeLogEffect` takes (§4.2), summed over the day instead of over one log.
   */
  xpToday: number;
  /**
   * Append one activity row (§6.2). Always a fresh `id`: multiple rows per
   * `(habit, day)` are expected and must never be merged or overwritten.
   *
   * Rejects `actual <= 0` — §3.3's invariant. A zero amount is not an activity row;
   * the state that means "didn't do it" is a skip row, which carries a reason.
   *
   * `opts.timestamp` is the B3 time reveal: it overrides the default "now" for
   * ordering only — `date` is still today (§3.3).
   */
  logActivity(habitId: string, actual: number, opts?: { timestamp?: string }): Promise<void>;
  /**
   * Append one skip row for today — a reason chip's whole action (§6.2 B5), with the
   * note the user may have typed above the chips.
   *
   * Takes the **habit**, not a `habitId`, unlike `logActivity` above. That asymmetry
   * is deliberate: `logActivity(habitId, …)` is #10's published signature and is kept
   * as-is, whereas this is a new API, and the screen's chip row already holds the row
   * it is rendering — so there is no lookup and no "unknown habitId" branch to write.
   */
  logSkip(habit: Habit, reason: SkipReason, opts?: { note?: string }): Promise<void>;
  /**
   * What the day would become if `staged` were appended now (C7a) — the composer's
   * "→ 5/5 성공" preview. `null` only when `habitId` names no visible habit.
   *
   * The state comes from the real `classifyDay` over the day's rows plus a synthetic
   * one, never from a local `sum >= floor` comparison: a second copy of that rule is
   * how `over` and the defensive `target <= floor` read eventually drift apart (§4.1).
   */
  previewOf(habitId: string, staged: number): { sum: number; state: DayState } | null;
  /**
   * Rewrite one existing row of the feed (#13, AC 1–3). Keyed on `entry.id`, so the
   * row count never grows; the caller passes the **whole** row, because the write
   * replaces the stored element — an omitted `timestamp` would silently reorder the
   * feed (§3.3).
   *
   * Rejects a row that breaks §3.3's discriminator, which is what makes the
   * activity ↔ skip transition safe. See `useQuickLog.editEntry`.
   */
  editEntry(entry: HabitEntry): Promise<void>;
  /**
   * Delete one row of the feed by id (#13, AC 4–6). Immediate and untoasted; whether
   * the screen should confirm first is `deletePreview`'s answer, not this function's —
   * so a caller that skips the check still deletes, exactly as AC 4 requires of the
   * ordinary case.
   */
  removeEntry(entryId: string): Promise<void>;
  /**
   * Does deleting this row need a result-aware confirm, and on what basis? `null`
   * means **no** — delete it immediately (AC 4), which is also the answer for an id
   * the feed does not hold.
   *
   * Computed the same way `previewOf` is: the remaining row set is run back through the
   * domain (`dayStates`, the shared walk that owns ADR-0003's scope rule) rather than
   * compared against a local rule of our own.
   */
  deletePreview(entryId: string): DeleteEffect | null;
  /** The live 실행취소 toast for a one-tap/quick-chip append (B6). */
  toast: QuickLogToast | null;
  undoLast(): Promise<void>;
}

/**
 * A day's **activity** rows only, in the domain total order (§7.3) — skip rows carry
 * `actual: 0`, which is not a legal staged amount and must never become a default or
 * a chip. Order comes from `sortDayRows`, never from the repository's array order.
 */
function activityRows(entries: HabitEntry[]): HabitEntry[] {
  return sortDayRows(entries.filter((entry) => entry.actual > 0 && entry.skipReason == null));
}

/**
 * Everything the composer reads off one habit's day — the prefilled amount, the quick
 * chips, the progress line and the target nudge — plus the shared one-tap affordances.
 */
function composerReadings(habit: Habit, day: ClassifiedDay | undefined) {
  const activity = activityRows(day?.entries ?? []);
  // The day's sum is the domain's (`dayStates`), never a second reduce of our own: two
  // sums drift, and the visible failure is one line contradicting the next.
  const sum = day?.sum ?? 0;
  const previous = activity[activity.length - 1]?.actual;

  return {
    ...logAffordances(habit, day),
    defaultAmount: previous ?? habit.floor,
    // Binary has no amount to stage, so it has no chips.
    quickChips:
      habit.kind === 'count'
        ? [...new Set([1, habit.floor, ...(previous == null ? [] : [previous])])]
        : [],
    progress: { sum, floor: habit.floor, remaining: Math.max(0, habit.floor - sum) },
    // C7a's second half. `target != null && target > floor` mirrors `effectiveTarget`
    // in `src/domain/classify.ts` — the same defensive read, not a new rule; a
    // `target <= floor` is meaningless and reads as no target at all (§3.2 / §4.1).
    //
    // The 최고기록 half of the nudge is deliberately **not** here: `personal_best`
    // already exists in the parked `statusLight.ts` and lands with #20. A second
    // implementation would be the duplication that module was written to prevent.
    suggestTarget:
      habit.kind === 'count' &&
      !(habit.target != null && habit.target > habit.floor) &&
      isFloorMet(day?.state),
  };
}

interface Loaded {
  rows: TodayHabitRow[];
  feed: TodayFeedItem[];
  xpToday: number;
}

const EMPTY: Loaded = { rows: [], feed: [], xpToday: 0 };

export function useToday({
  today = localToday(),
  now = () => new Date(),
}: { today?: string; now?: () => Date } = {}): TodayView {
  const repository = useRepository();
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const [loading, setLoading] = useState(true);
  /**
   * Bumped by a write, so the load effect is the single place that reads.
   *
   * Note the deliberate difference from `useDashboard`: `loading` is raised only for
   * the first load, never for a reload. A log must not blank the tallies it just
   * changed, and "loading" here would describe a screen that is already on screen.
   */
  const [version, setVersion] = useState(0);

  function reload() {
    setVersion((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const habits = await repository.getHabits();
      // §3.2 — archived habits are gone from the logging surfaces. Paused ones are
      // not: pause is "later", not "over" (ADR-0003), and a paused day still records.
      const visible = habits.filter((habit) => habit.lifecycle !== 'archived');

      const perHabit = await Promise.all(
        visible.map(async (habit) => {
          // The XP delta is run-keyed (streak bonuses, milestones), so it needs the
          // habit's whole history, not just today. V1 keeps entry volume small and
          // §7.3 makes performance a non-criterion.
          const start = dateOf(habit.createdAt);
          const from = compareDates(start, today) < 0 ? start : today;
          const history = await repository.getEntries(habit.id, from, today);
          const rowsToday = history.filter((entry) => entry.date === today);
          const before = history.filter((entry) => entry.date !== today);

          return {
            habit,
            day: dayStates(habit, rowsToday, today, today, today)[0],
            rowsToday,
            xp: computeXP(history, habit) - computeXP(before, habit),
          };
        }),
      );

      const byId = new Map(visible.map((habit) => [habit.id, habit]));
      const allRows = perHabit.flatMap((entry) => entry.rowsToday);

      const next: Loaded = {
        rows: perHabit.map(({ habit, day }) => ({
          habit,
          day,
          ...composerReadings(habit, day),
        })),
        // One sort over the merged rows, so the feed's order is the domain's total
        // order across habits and not a per-habit concatenation.
        feed: sortDayRows(allRows).map((entry) => ({
          habit: byId.get(entry.habitId) as Habit,
          entry,
        })),
        xpToday: perHabit.reduce((total, entry) => total + entry.xp, 0),
      };

      if (!cancelled) {
        setLoaded(next);
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [repository, today, version]);

  function rowFor(habitId: string): TodayHabitRow | undefined {
    return loaded.rows.find((row) => row.habit.id === habitId);
  }

  const quick = useQuickLog({ today, now, onChange: reload });

  /**
   * #10's public signature, kept: the screen names a habit by id and this resolves it
   * from the loaded rows. A miss is a programmer error — the selector's options *are*
   * `rows` — so it throws rather than dropping the write on the floor.
   */
  async function logActivity(
    habitId: string,
    actual: number,
    opts?: { timestamp?: string },
  ): Promise<void> {
    const row = rowFor(habitId);
    // Deliberately not user-facing Korean: the selector's options *are* `rows`, so a
    // miss is a bug in the caller, and `Composer`'s catch would otherwise show the
    // user "기록하지 못했어요" for a state that cannot occur. The one assertion string
    // in this file that should read as a defect report.
    if (row == null) throw new Error(`useToday.logActivity: unknown habitId ${habitId}`);

    await quick.logActivity(row.habit, actual, opts);
  }

  function previewOf(habitId: string, staged: number): { sum: number; state: DayState } | null {
    const row = rowFor(habitId);
    if (row == null) return null;

    // A paused day holds no `ClassifiedDay` at all (ADR-0003), but it is still
    // loggable — so the rows come from `day?.entries ?? []`, not from a `day != null`
    // gate that would leave the composer with no preview.
    const entries = row.day?.entries ?? [];
    const synthetic: HabitEntry = {
      id: 'preview',
      habitId,
      date: today,
      timestamp: now().toISOString(),
      actual: staged,
    };

    return {
      // The one sum, from `progress` — which takes it from the domain's `day.sum`.
      sum: row.progress.sum + staged,
      state: classifyDay([...entries, synthetic], row.habit, today, today),
    };
  }

  function deletePreview(entryId: string): DeleteEffect | null {
    const item = loaded.feed.find((entry) => entry.entry.id === entryId);
    if (item == null) return null;

    const row = rowFor(item.habit.id);
    const rowsOnDate = row?.day?.entries ?? [];
    const remaining = rowsOnDate.filter((entry) => entry.id !== entryId);

    const emptiesDay = remaining.length === 0;

    // The shared walk, not `classifyDay` plus a scope test of our own: it returns no
    // day at all for a paused date left empty, which is precisely `undefined` here
    // (ADR-0003, and `classify.ts`'s own instruction to use `dayStates`).
    const stateAfter = dayStates(
      item.habit,
      remaining,
      item.entry.date,
      item.entry.date,
      today,
    )[0]?.state;

    /**
     * "Does this delete **erase** the recorded miss?" — not "is the day a miss?". Both
     * halves are needed: a date can hold two skip rows (`skippable` only withholds a
     * skip once an *activity* row exists), and deleting one of them leaves the day a
     * miss all the same. Warning there would contradict `stateAfter` inside the same
     * paragraph of confirm copy.
     *
     * An unclassified day carries no miss, so `stateAfter === undefined` (a paused
     * date left empty, ADR-0003) is the not-a-miss side of the second half.
     *
     * No test that the deleted row is itself a skip: a day carrying a miss through
     * `skip` holds no activity row (§4.1), and `missed` means it holds nothing at all —
     * so any row that can be deleted off a miss-carrying day *is* a skip. `isMissDay`
     * is what keeps `exception` out of the warning (ADR-0001).
     */
    const missBefore = row?.day != null && isMissDay(row.day.state, rowsOnDate);
    const missAfter = stateAfter != null && isMissDay(stateAfter, remaining);
    const carriesMiss = missBefore && !missAfter;

    if (!emptiesDay && !carriesMiss) return null;

    return { habit: item.habit, emptiesDay, carriesMiss, stateAfter };
  }

  return {
    date: today,
    loading,
    rows: loaded.rows,
    feed: loaded.feed,
    questsDone: loaded.rows.filter(
      (row) => isFloorMet(row.day?.state),
    ).length,
    logCount: loaded.feed.length,
    xpToday: loaded.xpToday,
    logActivity,
    logSkip: quick.logSkip,
    editEntry: quick.editEntry,
    removeEntry: quick.removeEntry,
    previewOf,
    deletePreview,
    toast: quick.toast,
    undoLast: quick.undoLast,
  };
}
