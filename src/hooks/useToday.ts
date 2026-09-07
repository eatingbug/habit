import { useEffect, useState } from 'react';

import { useRepository } from '@/context/RepositoryContext';
import { type ClassifiedDay, dayStates, isFloorMet, sortDayRows } from '@/domain/classify';
import { compareDates, dateOf } from '@/domain/dates';
import { computeXP } from '@/domain/score';
import { localToday, newId } from '@/lib/device';
import type { Habit, HabitEntry } from '@/models';

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
   */
  logActivity(habitId: string, actual: number): Promise<void>;
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
        rows: perHabit.map(({ habit, day }) => ({ habit, day })),
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

  async function logActivity(habitId: string, actual: number): Promise<void> {
    if (!(actual > 0)) {
      throw new RangeError('활동 기록의 양은 0보다 커야 합니다 — 0은 건너뛰기입니다 (§3.3).');
    }

    await repository.upsertEntry({
      id: newId(),
      habitId,
      // `date` is the authoritative day (§3.3); `timestamp` only orders within it.
      date: today,
      timestamp: now().toISOString(),
      actual,
    });

    setVersion((current) => current + 1);
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
  };
}
