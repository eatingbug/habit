import { useEffect, useState } from 'react';

import { TUNING } from '@/config/tuning';
import { useRepository } from '@/context/RepositoryContext';
import { windowEndingAt } from '@/domain/dates';
import { heatCells, type HeatCell } from '@/domain/heatLevel';
import { localToday } from '@/lib/device';
import type { Habit, Stat } from '@/models';

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
}

export interface DashboardView {
  rows: DashboardRow[];
  loading: boolean;
}

function statFor(statId: string): Stat | undefined {
  return TUNING.stats.find((stat) => stat.id === statId);
}

export function useDashboard({ today = localToday() }: { today?: string } = {}): DashboardView {
  const repository = useRepository();
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);

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
        visible.map(async (habit) => ({
          habit,
          stat: statFor(habit.statId),
          cells: heatCells(habit, await repository.getEntries(habit.id, from, to), from, to, today),
        })),
      );

      if (!cancelled) {
        setRows(loaded);
        setLoading(false);
      }
    }

    setLoading(true);
    void load();

    return () => {
      cancelled = true;
    };
  }, [repository, today]);

  return { rows, loading };
}
