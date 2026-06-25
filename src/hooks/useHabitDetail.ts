/**
 * useHabitDetail — a single habit's design + stats + journal, with backfill (SPEC §6.3).
 *
 * Derives streak, 28-day floor-rate, this-week XP, the journal timeline, and a tappable
 * heatmap (each cell maps to a date for retroactive logging). Design edits and backfilled
 * entries write straight through the repository, then reload.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRepository } from '@/context/RepositoryContext';
import { TUNING } from '@/config/tuning';
import { classifyEntry, isMiss } from '@/domain/classify';
import { computeStreak } from '@/domain/score';
import {
  addDays,
  entriesInWindow,
  floorCompletionRate,
  metFloor,
  nthWeekWindow,
  windowFrom,
} from '@/domain/util';
import { heatLevel, type HeatLevel } from '@/theme/heatLevel';
import { newId } from '@/util/id';
import { formatShortDate, nowTimestamp, todayLocal } from '@/util/date';
import type { Habit, HabitEntry, SkipReason } from '@/models';
import type { JournalItem } from '@/components/types';

const EPOCH = '1970-01-01';
const HEAT_COLUMNS = 20;

function weekXP(entries: HabitEntry[], today: string): number {
  const week = entriesInWindow(entries, nthWeekWindow(today, 0, TUNING.weekStartsOn));
  return week.reduce((sum, e) => {
    if (!metFloor(e)) return sum;
    return sum + TUNING.xpPerFloorCompletion + (e.state === 'over' ? TUNING.xpBonusTargetExceed : 0);
  }, 0);
}

export interface HabitDetailData {
  loading: boolean;
  habit: Habit | null;
  statName: string;
  streak: number;
  floorRatePct: number;
  xpWeek: number;
  journal: JournalItem[];
  cells: HeatLevel[];
  cellDates: string[];
  updateDesign: (patch: Partial<Habit>) => Promise<void>;
  logEntry: (date: string, actual: number, note?: string) => Promise<void>;
  logSkip: (date: string, skipReason: HabitEntry['skipReason'], note?: string) => Promise<void>;
  editEntry: (id: string, fields: EditEntryFields) => Promise<void>;
  reload: () => void;
}

/** Mutable fields when editing an existing journal entry (id/habitId/date/timestamp stay put). */
export interface EditEntryFields {
  skip: boolean;
  actual?: number; // required when !skip
  note?: string;
  skipReason?: SkipReason; // required when skip
}

export function useHabitDetail(id: string): HabitDetailData {
  const repo = useRepository();
  const [loading, setLoading] = useState(true);
  const [habit, setHabit] = useState<Habit | null>(null);
  const [entries, setEntries] = useState<HabitEntry[]>([]);

  const load = useCallback(async () => {
    const today = todayLocal();
    const h = await repo.getHabit(id);
    const es = h ? await repo.getEntries(id, EPOCH, today) : [];
    setHabit(h);
    setEntries(es);
    setLoading(false);
  }, [repo, id]);

  const updateDesign = useCallback(
    async (patch: Partial<Habit>) => {
      if (!habit) return;
      await repo.upsertHabit({ ...habit, ...patch });
      await load();
    },
    [repo, habit, load],
  );

  const logEntry = useCallback(
    async (date: string, actual: number, note?: string) => {
      if (!habit) return;
      const state = classifyEntry(actual, habit.floor, habit.target);
      await repo.upsertEntry({
        id: newId(),
        habitId: habit.id,
        date,
        timestamp: nowTimestamp(),
        actual,
        state,
        note,
      });
      await load();
    },
    [repo, habit, load],
  );

  const logSkip = useCallback(
    async (date: string, skipReason: HabitEntry['skipReason'], note?: string) => {
      if (!habit) return;
      await repo.upsertEntry({
        id: newId(),
        habitId: habit.id,
        date,
        timestamp: nowTimestamp(),
        actual: 0,
        state: 'skip',
        skipReason,
        note,
      });
      await load();
    },
    [repo, habit, load],
  );

  const editEntry = useCallback(
    async (id: string, fields: EditEntryFields) => {
      if (!habit) return;
      const orig = entries.find((e) => e.id === id);
      if (!orig) return;
      const updated: HabitEntry = fields.skip
        ? { ...orig, actual: 0, state: 'skip', skipReason: fields.skipReason, note: fields.note }
        : {
            ...orig,
            actual: fields.actual ?? orig.actual,
            state: classifyEntry(fields.actual ?? orig.actual, habit.floor, habit.target),
            skipReason: undefined,
            note: fields.note,
          };
      await repo.upsertEntry(updated);
      await load();
    },
    [repo, habit, entries, load],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const today = todayLocal();
  const statName = habit
    ? (TUNING.stats.find((s) => s.id === habit.statId)?.name ?? habit.statId)
    : '';
  const streak = habit ? computeStreak(entries, today) : 0;
  const floorRatePct = habit
    ? Math.round(floorCompletionRate(entries, windowFrom(today, TUNING.diagnosis.floorRateWindowDays)) * 100)
    : 0;
  const xpWeek = habit ? weekXP(entries, today) : 0;

  const byDate = new Map<string, HabitEntry>();
  for (const e of entries) byDate.set(e.date, e);

  const cells: HeatLevel[] = [];
  const cellDates: string[] = [];
  if (habit) {
    for (let col = 0; col < HEAT_COLUMNS; col += 1) {
      const date = addDays(today, -(HEAT_COLUMNS - 1 - col));
      cellDates.push(date);
      cells.push(heatLevel(byDate.get(date), habit));
    }
  }

  const journal: JournalItem[] = habit
    ? [...entries]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.timestamp.localeCompare(a.timestamp)))
        .map((e) => ({
          id: e.id,
          date: e.date,
          dateLabel: formatShortDate(e.date),
          state: e.state,
          actual: e.actual,
          unit: habit.floorUnit,
          isBinary: habit.kind === 'binary',
          note: e.note,
          skipReason: e.skipReason,
          isMiss: isMiss(e),
        }))
    : [];

  return {
    loading,
    habit,
    statName,
    streak,
    floorRatePct,
    xpWeek,
    journal,
    cells,
    cellDates,
    updateDesign,
    logEntry,
    logSkip,
    editEntry,
    reload: load,
  };
}
