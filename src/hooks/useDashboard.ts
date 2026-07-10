/**
 * useDashboard — character-sheet view-model for the Dashboard (SPEC §6.1).
 *
 * Loads every habit + its full entry history, then derives (never stores) per-stat
 * level/XP, per-habit streak/status-light/heatmap/today-state, and the aggregate "shaky
 * habits" count. One-tap logging (B1) and long-press skip (B5) write + reload. Reloads on
 * focus so a commit elsewhere is reflected when you return.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRepository } from '@/context/RepositoryContext';
import { TUNING } from '@/config/tuning';
import { classifyDay, compareEntries } from '@/domain/classify';
import { oneTapAction } from '@/domain/logging';
import { computeStreak, computeXP, levelForXP } from '@/domain/score';
import { aggregateStatusCount, deriveStatusLight } from '@/domain/statusLight';
import { addDays, dayRecordMap } from '@/domain/util';
import { heatLevel, type HeatState } from '@/theme/heatLevel';
import { newId } from '@/util/id';
import { nowTimestamp, todayLocal } from '@/util/date';
import type { Habit, HabitEntry, SkipReason } from '@/models';
import type { HabitRowData, StatCardData } from '@/components/types';
import type { QuickResult } from '@/hooks/useToday';

const EPOCH = '1970-01-01';
const HEAT_COLUMNS = 20;

function buildHeatCells(habit: Habit, entries: HabitEntry[], today: string): HeatState[] {
  const recs = dayRecordMap(entries, habit);
  const cells: HeatState[] = [];
  for (let col = 0; col < HEAT_COLUMNS; col += 1) {
    const date = addDays(today, -(HEAT_COLUMNS - 1 - col)); // oldest → most-recent-last
    cells.push(heatLevel(recs.get(date)));
  }
  return cells;
}

export interface DashboardData {
  loading: boolean;
  stats: StatCardData[];
  habits: HabitRowData[];
  shaky: { caution: number; intervention: number };
  quickLog: (habitId: string) => Promise<QuickResult | null>;
  quickSkip: (habitId: string, reason: SkipReason) => Promise<{ id: string } | null>;
  removeEntry: (id: string) => Promise<void>;
  reload: () => void;
}

export function useDashboard(): DashboardData {
  const repo = useRepository();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatCardData[]>([]);
  const [habitRows, setHabitRows] = useState<HabitRowData[]>([]);
  const [rawHabits, setRawHabits] = useState<Habit[]>([]);
  const [shaky, setShaky] = useState({ caution: 0, intervention: 0 });

  const load = useCallback(async () => {
    const today = todayLocal();
    const habits = await repo.getHabits();
    const entriesByHabit: Record<string, HabitEntry[]> = {};
    await Promise.all(
      habits.map(async (h) => {
        entriesByHabit[h.id] = await repo.getEntries(h.id, EPOCH, today);
      }),
    );

    const statCards: StatCardData[] = TUNING.stats.map((stat) => {
      const statHabits = habits.filter((h) => h.statId === stat.id);
      let xp = 0;
      for (const h of statHabits) {
        xp += computeXP(entriesByHabit[h.id] ?? [], h);
      }
      const level = levelForXP(xp);
      const thresholds = TUNING.statLevelThresholds;
      const isMax = level >= thresholds.length - 1;
      const base = thresholds[level];
      const next = isMax ? base : thresholds[level + 1];
      const progress = isMax || next === base ? 1 : (xp - base) / (next - base);
      const toNextLabel = isMax ? '최고 레벨' : `→ ${level + 1}레벨 · ${next - xp} 남음`;
      return { id: stat.id, icon: stat.icon, name: stat.name, level, xp, toNextLabel, progress };
    });

    const rows: HabitRowData[] = habits.map((h) => {
      const entries = entriesByHabit[h.id] ?? [];
      const target = h.kind === 'binary' ? undefined : h.target;
      const todayRows = entries.filter((e) => e.date === today);
      const activity = entries.filter((e) => e.actual > 0).sort(compareEntries);
      return {
        id: h.id,
        name: h.name,
        statName: TUNING.stats.find((s) => s.id === h.statId)?.name ?? h.statId,
        cue: h.cue,
        streak: computeStreak(entries, today, h),
        light: deriveStatusLight(h, entries, today),
        cells: buildHeatCells(h, entries, today),
        floor: h.floor,
        target: h.target,
        kind: h.kind,
        floorUnit: h.floorUnit,
        todayState: classifyDay(todayRows, h.floor, target),
        lastAmount: activity.length ? activity[activity.length - 1].actual : undefined,
      };
    });

    setStats(statCards);
    setHabitRows(rows);
    setRawHabits(habits);
    setShaky(aggregateStatusCount(habits, entriesByHabit, today));
    setLoading(false);
  }, [repo]);

  const quickLog = useCallback(
    async (habitId: string): Promise<QuickResult | null> => {
      const habit = rawHabits.find((h) => h.id === habitId);
      const row = habitRows.find((r) => r.id === habitId);
      if (!habit || !row) return null;
      const hasActivity =
        row.todayState === 'partial' || row.todayState === 'done' || row.todayState === 'over';
      const action = oneTapAction(habit, hasActivity);
      if (action.disabled) return null;
      const id = newId();
      await repo.upsertEntry({
        id,
        habitId,
        date: todayLocal(),
        timestamp: nowTimestamp(),
        actual: action.amount,
      });
      await load();
      return { id, amount: action.amount, unit: habit.floorUnit, isBinary: habit.kind === 'binary' };
    },
    [rawHabits, habitRows, repo, load],
  );

  const quickSkip = useCallback(
    async (habitId: string, reason: SkipReason): Promise<{ id: string } | null> => {
      const habit = rawHabits.find((h) => h.id === habitId);
      if (!habit) return null;
      const id = newId();
      await repo.upsertEntry({
        id,
        habitId,
        date: todayLocal(),
        timestamp: nowTimestamp(),
        actual: 0,
        skipReason: reason,
      });
      await load();
      return { id };
    },
    [rawHabits, repo, load],
  );

  const removeEntry = useCallback(
    async (id: string) => {
      await repo.deleteEntry(id);
      await load();
    },
    [repo, load],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { loading, stats, habits: habitRows, shaky, quickLog, quickSkip, removeEntry, reload: load };
}
