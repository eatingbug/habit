import { useEffect, useState } from 'react';

import { TUNING } from '@/config/tuning';
import { useRepository } from '@/context/RepositoryContext';
import { dayStates } from '@/domain/classify';
import { compareDates, dateOf, windowEndingAt } from '@/domain/dates';
import { heatCells, type HeatCell } from '@/domain/heatLevel';
import { computeStatXP, levelForXP, type HabitWithEntries } from '@/domain/score';
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

/**
 * One stat card (§6.1, canvas `design/parts/Dashboard.body.html:11–15`) — #17 AC 1, AC 5.
 *
 * Every figure is resolved here and not in the screen: `jest.config.js` matches
 * `src/**` and there are no render tests, so a division written in JSX is arithmetic
 * nothing asserts. The screen applies words to these numbers.
 */
export interface StatProgress {
  stat: Stat;
  /** `levelForXP(computeStatXP(...))` — §4.2's one level definition (`.lv`). */
  level: number;
  /** The stat's cumulative XP, summed over every habit mapped to it. */
  xp: number;
  /**
   * XP still owed to the next level, or `null` at the **top** level, where there is no
   * next threshold — `levelForXP` stops at the last index of
   * `TUNING.statLevelThresholds`. Naively subtracting there would ship a negative
   * "다음 레벨까지", so the state is named instead of computed around.
   */
  xpToNextLevel: number | null;
  /**
   * The bar's fill, 0–1 — the share of the **current level's band** that is done, not
   * of the stat's whole XP. The canvas measures it the same way
   * (`design/parts/Dashboard.logic.js:66–68` divides by the band's own `span`). Full at
   * the top level, where the band has no width.
   */
  barFraction: number;
}

export interface DashboardView {
  rows: DashboardRow[];
  /**
   * The stat cards, one per `TUNING.stats` in its declared order — a stat with no
   * habits at all is still drawn, at level 0, because the canvas draws all three and a
   * card appearing only once a habit exists would read as a missing stat.
   */
  stats: StatProgress[];
  /**
   * The character header's `Lv.N` (canvas `design/parts/Dashboard.body.html:5`).
   * SPEC §4.2 defines the character level as the **highest** stat level; deriving it in
   * the screen would be a judgment no test can reach.
   */
  characterLevel: number;
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

/** The card's four numbers, from the stat's XP. See `StatProgress` for each. */
function statProgress(stat: Stat, all: HabitWithEntries[]): StatProgress {
  const xp = computeStatXP(stat.id, all);
  const level = levelForXP(xp);
  const thresholds = TUNING.statLevelThresholds;
  const next = thresholds[level + 1];

  if (next == null) return { stat, level, xp, xpToNextLevel: null, barFraction: 1 };

  const base = thresholds[level];
  return {
    stat,
    level,
    xp,
    xpToNextLevel: next - xp,
    barFraction: (xp - base) / (next - base),
  };
}

export function useDashboard({ today = localToday() }: { today?: string } = {}): DashboardView {
  const repository = useRepository();
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [stats, setStats] = useState<StatProgress[]>(() =>
    TUNING.stats.map((stat) => statProgress(stat, [])),
  );
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

      const loaded = await Promise.all(
        habits.map(async (habit) => {
          // `computeStreak` walks back to `createdAt`, so the fetch starts at whichever
          // of the two is earlier; `heatCells` is given its own window either way.
          const start = dateOf(habit.createdAt);
          const entries = await repository.getEntries(
            habit.id,
            compareDates(start, from) < 0 ? start : from,
            to,
          );

          // The rows and the stat cards read the same fetch, from two angles: the row
          // is what the habit shows, `entries` is what its stat is owed.
          return {
            habit,
            entries,
            row: {
              habit,
              stat: statFor(habit.statId),
              cells: heatCells(habit, entries, from, to, today),
              streak: computeStreak(entries, habit, today),
              // The one-tap control reads a classified day, not a heat cell: a cell is
              // a *rendering* instruction, and deriving an affordance from one is how
              // this drifted away from Today's identical derivation once already.
              ...logAffordances(habit, dayStates(habit, entries, today, today, today)[0]),
            },
          };
        }),
      );

      if (!cancelled) {
        // §3.2 — archived habits are hidden from the Dashboard. Paused ones are not:
        // pause is "later", not "over" (ADR-0003), and it stays visible to be resumed.
        setRows(
          loaded.filter(({ habit }) => habit.lifecycle !== 'archived').map(({ row }) => row),
        );
        // The stat cards read **every** habit, archived included. AC 5 calls the figure
        // cumulative XP, and ADR-0003's rule that a recorded day's earnings are never
        // clawed back applies here too: filtering the same list the rows use would drop
        // a user's stat level the moment they tidied a finished habit away.
        setStats(
          TUNING.stats.map((stat) =>
            statProgress(
              stat,
              loaded.map(({ habit, entries }) => ({ habit, entries })),
            ),
          ),
        );
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
    stats,
    characterLevel: stats.reduce((highest, stat) => Math.max(highest, stat.level), 0),
    loading,
    logActivity: quick.logActivity,
    logSkip: quick.logSkip,
    toast: quick.toast,
    undoLast: quick.undoLast,
  };
}
