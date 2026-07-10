/**
 * useHabitDetail — a single habit's design + stats + journal, with backfill (SPEC §6.3).
 *
 * Derives streak, 28-day floor-rate, this-week XP, the journal timeline, and a tappable
 * heatmap (each cell maps to a date for retroactive logging). Entries are FACTS ONLY; the
 * day-state shown per cell/journal row is COMPUTED (dayRecordMap). Design edits and
 * backfilled entries write straight through the repository, then reload.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRepository } from '@/context/RepositoryContext';
import { TUNING } from '@/config/tuning';
import { computeStreak } from '@/domain/score';
import {
  addDays,
  dayRecordMap,
  entriesInWindow,
  floorCompletionRate,
  groupByDate,
  nthWeekWindow,
  windowFrom,
  type DayRecord,
} from '@/domain/util';
import { backfillTimestamp, dayXPContribution, describeDeleteConsequence } from '@/domain/logging';
import { heatLevel, type HeatState } from '@/theme/heatLevel';
import { newId } from '@/util/id';
import { formatShortDate, nowTimestamp, todayLocal } from '@/util/date';
import type { Habit, HabitEntry, SkipReason } from '@/models';
import type { JournalItem } from '@/components/types';
import type { DeleteRequest } from '@/hooks/useToday';

const EPOCH = '1970-01-01';
const HEAT_COLUMNS = 20;

/** This week's XP = the sum of each day's XP contribution (SPEC §4.2; excludes lifetime milestones). */
function weekXP(entries: HabitEntry[], today: string, habit: Habit): number {
  const week = entriesInWindow(entries, nthWeekWindow(today, 0, TUNING.weekStartsOn));
  let xp = 0;
  for (const dayEntries of groupByDate(week).values()) xp += dayXPContribution(dayEntries, habit);
  return xp;
}

export interface HabitDetailData {
  loading: boolean;
  habit: Habit | null;
  statName: string;
  streak: number;
  floorRatePct: number;
  xpWeek: number;
  journal: JournalItem[];
  cells: HeatState[];
  cellDates: string[];
  updateDesign: (patch: Partial<Habit>) => Promise<void>;
  logEntry: (date: string, actual: number, note?: string) => Promise<void>;
  logSkip: (date: string, skipReason: HabitEntry['skipReason'], note?: string) => Promise<void>;
  editEntry: (id: string, fields: EditEntryFields) => Promise<void>;
  requestDelete: (id: string) => Promise<DeleteRequest>;
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

  /** Backfilled rows get a deterministic noon timestamp; today's get the real now (SPEC §6.3 / A4). */
  const timestampFor = useCallback(
    (date: string) => {
      const today = todayLocal();
      if (date === today) return nowTimestamp();
      return backfillTimestamp(date, entries.filter((e) => e.date === date).length);
    },
    [entries],
  );

  const logEntry = useCallback(
    async (date: string, actual: number, note?: string) => {
      if (!habit) return;
      await repo.upsertEntry({
        id: newId(),
        habitId: habit.id,
        date,
        timestamp: timestampFor(date),
        actual,
        note,
      });
      await load();
    },
    [repo, habit, timestampFor, load],
  );

  const logSkip = useCallback(
    async (date: string, skipReason: HabitEntry['skipReason'], note?: string) => {
      if (!habit) return;
      await repo.upsertEntry({
        id: newId(),
        habitId: habit.id,
        date,
        timestamp: timestampFor(date),
        actual: 0,
        skipReason,
        note,
      });
      await load();
    },
    [repo, habit, timestampFor, load],
  );

  const editEntry = useCallback(
    async (id: string, fields: EditEntryFields) => {
      if (!habit) return;
      const orig = entries.find((e) => e.id === id);
      if (!orig) return;
      const updated: HabitEntry = fields.skip
        ? { ...orig, actual: 0, skipReason: fields.skipReason, note: fields.note }
        : {
            ...orig,
            actual: fields.actual ?? orig.actual,
            skipReason: undefined,
            note: fields.note,
          };
      await repo.upsertEntry(updated);
      await load();
    },
    [repo, habit, entries, load],
  );

  const requestDelete = useCallback(
    async (entryId: string): Promise<DeleteRequest> => {
      const confirm = async () => {
        await repo.deleteEntry(entryId);
        await load();
      };
      if (!habit) return { message: null, confirm };
      return { message: describeDeleteConsequence(entries, entryId, habit, todayLocal()), confirm };
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
  const streak = habit ? computeStreak(entries, today, habit) : 0;
  const floorRatePct = habit
    ? Math.round(floorCompletionRate(entries, windowFrom(today, TUNING.diagnosis.floorRateWindowDays), habit) * 100)
    : 0;
  const xpWeek = habit ? weekXP(entries, today, habit) : 0;

  const recs = habit ? dayRecordMap(entries, habit) : new Map<string, DayRecord>();

  const cells: HeatState[] = [];
  const cellDates: string[] = [];
  if (habit) {
    for (let col = 0; col < HEAT_COLUMNS; col += 1) {
      const date = addDays(today, -(HEAT_COLUMNS - 1 - col));
      cellDates.push(date);
      cells.push(heatLevel(recs.get(date)));
    }
  }

  const journal: JournalItem[] = habit
    ? [...entries]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.timestamp.localeCompare(a.timestamp)))
        .map((e) => {
          const rec = recs.get(e.date)!;
          return {
            id: e.id,
            date: e.date,
            dateLabel: formatShortDate(e.date),
            dayState: rec.state,
            isSkip: e.actual === 0,
            actual: e.actual,
            unit: habit.floorUnit,
            isBinary: habit.kind === 'binary',
            note: e.note,
            skipReason: e.skipReason,
            isMiss: rec.state === 'skip' && rec.effectiveSkipReason !== 'exception',
          };
        })
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
    requestDelete,
    reload: load,
  };
}
