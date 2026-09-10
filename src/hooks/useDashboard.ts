import { useEffect, useState } from 'react';

import { TUNING } from '@/config/tuning';
import { useRepository } from '@/context/RepositoryContext';
import { dayStates } from '@/domain/classify';
import { compareDates, dateOf, windowEndingAt } from '@/domain/dates';
import { heatCells, type HeatCell } from '@/domain/heatLevel';
import { computeStreak } from '@/domain/streak';
import { localToday } from '@/lib/device';
import type { Habit, SkipReason, Stat } from '@/models';

import {
  logAffordances,
  useQuickLog,
  type LogAffordances,
  type QuickLogToast,
} from './useQuickLog';

/**
 * The Dashboard's data path — SPEC §6.1.
 *
 * The hook is the ticket's test seam (jest.config.js: hooks + an in-memory repository,
 * no component render tests), so two things are deliberate:
 *
 * - the repository arrives through `RepositoryProvider`, never constructed here;
 * - `today` is a parameter. Day-state depends on it (`pending` vs `missed`,
 *   ADR-0001), so a test must be able to pin it. `new Date()` is read only at the UI
 *   edge, in this file's default.
 */

export interface DashboardRow extends LogAffordances {
  habit: Habit;
  /** Absent when `habit.statId` names no configured stat — a data defect, not a state. */
  stat?: Stat;
  /** `TUNING.heatmapDays` cells, ascending, ending today. */
  cells: HeatCell[];
  /**
   * Consecutive floor-met days ending today (§4.2) — the canvas's `🔥 N`
   * (`design/parts/Dashboard.body.html:38`).
   *
   * Never stored, always recomputed from the rows, which is what makes backfill a pure
   * repair: filling a `missed` date re-joins the runs on either side of it (ADR-0001,
   * #14). Read from the whole history, not the heatmap window — a run longer than
   * `TUNING.heatmapDays` would otherwise be silently clipped.
   */
  streak: number;
}

export interface DashboardView {
  rows: DashboardRow[];
  loading: boolean;
  /**
   * One-tap logging on the row (§6.1 B1) with its 실행취소 toast (B6) — the same
   * primitive Today's composer uses, so there is only one append/undo implementation.
   *
   * Takes the habit itself: the row the screen is rendering already holds it, so
   * there is nothing to look up and no "habit not found" branch to write.
   */
  logActivity(habit: Habit, actual: number, opts?: { timestamp?: string }): Promise<void>;
  /**
   * Reason-tag today as a skip (§6.1 B5) — what the long-press chips call. The same
   * primitive Today's chip row uses, so there is one skip-write implementation.
   */
  logSkip(habit: Habit, reason: SkipReason, opts?: { note?: string }): Promise<void>;
  toast: QuickLogToast | null;
  undoLast(): Promise<void>;
}

function statFor(statId: string): Stat | undefined {
  return TUNING.stats.find((stat) => stat.id === statId);
}

export function useDashboard({ today = localToday() }: { today?: string } = {}): DashboardView {
  const repository = useRepository();
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * Bumped by a write, so the load effect is the single place that reads. `loading` is
   * raised only for the first load, never for a reload — matching `useToday`: a
   * one-tap log must not blank the row it just changed, and "loading" would describe a
   * row that is already on screen (§6.1: the row updates in place).
   */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const window = windowEndingAt(today, TUNING.heatmapDays);
    const from = window[0];
    const to = window[window.length - 1];

    async function load() {
      const habits = await repository.getHabits();
      // §3.2 — archived habits are hidden from the Dashboard. Paused ones are not:
      // pause is "later", not "over" (ADR-0003), and it stays visible to be resumed.
      const visible = habits.filter((habit) => habit.lifecycle !== 'archived');

      const loaded = await Promise.all(
        visible.map(async (habit) => {
          // `computeStreak` walks back to `createdAt`, so the fetch starts at whichever
          // of the two is earlier; `heatCells` is given its own window either way.
          const start = dateOf(habit.createdAt);
          const entries = await repository.getEntries(
            habit.id,
            compareDates(start, from) < 0 ? start : from,
            to,
          );

          return {
            habit,
            stat: statFor(habit.statId),
            cells: heatCells(habit, entries, from, to, today),
            streak: computeStreak(entries, habit, today),
            // The one-tap control reads a classified day, not a heat cell: a cell is a
            // *rendering* instruction, and deriving an affordance from one is how this
            // drifted away from Today's identical derivation once already.
            ...logAffordances(habit, dayStates(habit, entries, today, today, today)[0]),
          };
        }),
      );

      if (!cancelled) {
        setRows(loaded);
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [repository, today, version]);

  const quick = useQuickLog({
    today,
    onChange: () => setVersion((current) => current + 1),
  });

  return {
    rows,
    loading,
    logActivity: quick.logActivity,
    logSkip: quick.logSkip,
    toast: quick.toast,
    undoLast: quick.undoLast,
  };
}
