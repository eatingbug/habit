import { useEffect, useState } from 'react';

import { useRepository } from '@/context/RepositoryContext';
import {
  type ClassifiedDay,
  classifyDay,
  dayStates,
  isFloorMet,
  sortDayRows,
} from '@/domain/classify';
import { compareDates, dateOf } from '@/domain/dates';
import { computeXP } from '@/domain/score';
import { localToday } from '@/lib/device';
import type { DayState, Habit, HabitEntry } from '@/models';

import { logAffordances, useQuickLog, type QuickLogToast } from './useQuickLog';

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

export interface TodayHabitRow {
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
  /** True once the day holds at least one **activity** row — the control reads `+1 더`. */
  hasActivityToday: boolean;
  /**
   * What one tap appends (B1): the `floor` on the day's first record, otherwise 1 —
   * the second tap is "+1 더", not a second whole minimum. Binary is always 1.
   */
  oneTapAmount: number;
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
   * What the day would become if `staged` were appended now (C7a) — the composer's
   * "→ 5/5 성공" preview. `null` only when `habitId` names no visible habit.
   *
   * The state comes from the real `classifyDay` over the day's rows plus a synthetic
   * one, never from a local `sum >= floor` comparison: a second copy of that rule is
   * how `over` and the defensive `target <= floor` read eventually drift apart (§4.1).
   */
  previewOf(habitId: string, staged: number): { sum: number; state: DayState } | null;
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
    if (row == null) throw new Error(`기록할 습관을 찾지 못했습니다: ${habitId}`);

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
      sum: (row.day?.sum ?? 0) + staged,
      state: classifyDay([...entries, synthetic], row.habit, today, today),
    };
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
    previewOf,
    toast: quick.toast,
    undoLast: quick.undoLast,
  };
}
