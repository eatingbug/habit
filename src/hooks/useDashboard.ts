import { useEffect, useState } from 'react';

import { TUNING } from '@/config/tuning';
import { useRepository } from '@/context/RepositoryContext';
import { isFloorMet } from '@/domain/classify';
import { windowEndingAt } from '@/domain/dates';
import { heatCells, type HeatCell } from '@/domain/heatLevel';
import { localToday } from '@/lib/device';
import type { Habit, Stat } from '@/models';

import { useQuickLog, type QuickLogToast } from './useQuickLog';

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

export interface DashboardRow {
  habit: Habit;
  /** Absent when `habit.statId` names no configured stat — a data defect, not a state. */
  stat?: Stat;
  /** `TUNING.heatmapDays` cells, ascending, ending today. */
  cells: HeatCell[];
  /**
   * True once today holds at least one activity row — the one-tap control reads
   * `+1 더` instead of `+최소` (§6.1 B1). Derived here rather than in the screen
   * because there are no component render tests (jest.config.js).
   *
   * On a **binary** habit this is also the "already done" reading: its floor is 1, so
   * any activity row makes the day `done` and the control is shown completed and
   * disabled.
   */
  hasActivityToday: boolean;
  /** What one tap appends: the `floor` on today's first record, otherwise 1. */
  oneTapAmount: number;
}

export interface DashboardView {
  rows: DashboardRow[];
  loading: boolean;
  /**
   * One-tap logging on the row (§6.1 B1) with its 실행취소 toast (B6) — the same
   * primitive Today's composer uses, so there is only one append/undo implementation.
   */
  logActivity(habitId: string, actual: number): Promise<void>;
  toast: QuickLogToast | null;
  undoLast(): Promise<void>;
  dismissToast(): void;
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
          const cells = heatCells(
            habit,
            await repository.getEntries(habit.id, from, to),
            from,
            to,
            today,
          );
          // Today is the strip's last cell. `partial` and floor-met are exactly the
          // states an activity row produces; `skip` and `missed` are not, so a
          // reason-tagged day still offers the full `+최소`.
          const state = cells[cells.length - 1]?.state;
          const hasActivityToday = state === 'partial' || isFloorMet(state);

          return {
            habit,
            stat: statFor(habit.statId),
            cells,
            hasActivityToday,
            oneTapAmount: habit.kind === 'count' && !hasActivityToday ? habit.floor : 1,
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
    habitOf: (habitId) => rows.find((row) => row.habit.id === habitId)?.habit,
  });

  return {
    rows,
    loading,
    logActivity: quick.logActivity,
    toast: quick.toast,
    undoLast: quick.undoLast,
    dismissToast: quick.dismissToast,
  };
}
