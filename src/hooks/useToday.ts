/**
 * useToday — the Today feed + tally + composer submit + one-tap logging (SPEC §6.2).
 *
 * Merges today's habit entries and free logs into one chronological feed, computes the
 * day's tally, and turns composer submissions / one-tap actions into stored records (facts
 * only — the day-state is computed, never stored). Writes reload the local repository (fast,
 * local-only); the B6 undo toast is wired by the screen via the returned ids.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRepository } from '@/context/RepositoryContext';
import { TUNING } from '@/config/tuning';
import { classifyDay, compareEntries, isMissDay } from '@/domain/classify';
import { backfillTimestamp, dayXPContribution, describeDeleteConsequence, oneTapAction } from '@/domain/logging';
import { newId } from '@/util/id';
import { formatClock, nowTimestamp, timestampFromLocalTime, todayLocal } from '@/util/date';
import type { Habit, HabitEntry, SkipReason } from '@/models';
import type { ComposerSubmit, FeedEntry, TallyData } from '@/components/types';

const EPOCH = '1970-01-01';

/** Result of a one-tap append — the screen uses it to show the B6 undo toast. */
export interface QuickResult {
  id: string;
  amount: number;
  unit: string;
  isBinary: boolean;
}

export interface DeleteRequest {
  message: string | null; // null → delete immediately; else show a confirm with this text
  confirm: () => Promise<void>;
}

export interface TodayData {
  loading: boolean;
  date: string;
  tally: TallyData;
  feed: FeedEntry[];
  habits: Habit[];
  todaySumByHabit: Record<string, number>;
  lastAmountByHabit: Record<string, number>;
  submit: (submission: ComposerSubmit) => Promise<void>;
  update: (id: string, submission: ComposerSubmit) => Promise<void>;
  quickLog: (habitId: string) => Promise<QuickResult | null>;
  quickSkip: (habitId: string, reason: SkipReason) => Promise<{ id: string } | null>;
  removeEntry: (id: string) => Promise<void>;
  requestDelete: (id: string) => Promise<DeleteRequest>;
  reload: () => void;
}

export function useToday(): TodayData {
  const repo = useRepository();
  const [loading, setLoading] = useState(true);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [tally, setTally] = useState<TallyData>({ quests: '0/0', logs: 0, xp: 0 });
  const [todaySumByHabit, setTodaySumByHabit] = useState<Record<string, number>>({});
  const [lastAmountByHabit, setLastAmountByHabit] = useState<Record<string, number>>({});
  const date = todayLocal();

  const load = useCallback(async () => {
    const today = todayLocal();
    const allHabits = await repo.getHabits();
    const statName = (statId: string) =>
      TUNING.stats.find((s) => s.id === statId)?.name ?? statId;

    const items: FeedEntry[] = [];
    const daySum: Record<string, number> = {};
    const lastAmount: Record<string, number> = {};
    let questsDone = 0;
    let xpToday = 0;

    await Promise.all(
      allHabits.map(async (h) => {
        const es = await repo.getEntries(h.id, today, today);
        const target = h.kind === 'binary' ? undefined : h.target;
        const activity = es.filter((e) => e.actual > 0).sort(compareEntries);
        daySum[h.id] = activity.reduce((s, e) => s + e.actual, 0);
        if (activity.length) lastAmount[h.id] = activity[activity.length - 1].actual;
        if (es.length === 0) return;
        const dayState = classifyDay(es, h.floor, target);
        const miss = isMissDay(es, h.floor, target);
        const dayXP = dayXPContribution(es, h);
        if (dayState === 'done' || dayState === 'over') questsDone += 1;
        xpToday += dayXP;
        const latestActivityId = activity.length ? activity[activity.length - 1].id : null;
        for (const e of es) {
          items.push({
            kind: 'habit',
            id: e.id,
            habitId: h.id,
            timestamp: e.timestamp,
            time: formatClock(e.timestamp),
            habitName: h.name,
            statName: statName(h.statId),
            dayState,
            isSkip: e.actual === 0,
            isMiss: miss,
            actual: e.actual,
            unit: h.floorUnit,
            isBinary: h.kind === 'binary',
            note: e.note,
            skipReason: e.skipReason,
            xp: e.id === latestActivityId && dayXP > 0 ? dayXP : undefined,
          });
        }
      }),
    );

    const logs = await repo.getFreeLogs(today, today);
    for (const l of logs) {
      items.push({
        kind: 'log',
        id: l.id,
        timestamp: l.timestamp,
        time: formatClock(l.timestamp),
        type: l.type,
        text: l.text,
      });
    }
    items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    setHabits(allHabits);
    setFeed(items);
    setTodaySumByHabit(daySum);
    setLastAmountByHabit(lastAmount);
    setTally({ quests: `${questsDone}/${allHabits.length}`, logs: logs.length, xp: xpToday });
    setLoading(false);
  }, [repo]);

  /** Timestamp for a composer record: real "now" on today, deterministic noon on a backfill date. */
  const timestampForDate = useCallback(
    async (habitId: string | null, dateStr: string, hour: string, minute: string) => {
      const today = todayLocal();
      if (dateStr === today) return timestampFromLocalTime(dateStr, hour, minute);
      const existing = habitId
        ? (await repo.getEntries(habitId, dateStr, dateStr)).length
        : (await repo.getFreeLogs(dateStr, dateStr)).length;
      return backfillTimestamp(dateStr, existing);
    },
    [repo],
  );

  const submit = useCallback(
    async (s: ComposerSubmit) => {
      if (s.kind === 'log') {
        const timestamp = await timestampForDate(null, s.date, s.hour, s.minute);
        await repo.upsertFreeLog({ id: newId(), date: s.date, timestamp, type: s.type, text: s.text });
      } else if (s.kind === 'skip') {
        const timestamp = await timestampForDate(s.habitId, s.date, s.hour, s.minute);
        await repo.upsertEntry({
          id: newId(),
          habitId: s.habitId,
          date: s.date,
          timestamp,
          actual: 0,
          skipReason: s.skipReason,
          note: s.note,
        });
      } else {
        const timestamp = await timestampForDate(s.habitId, s.date, s.hour, s.minute);
        await repo.upsertEntry({
          id: newId(),
          habitId: s.habitId,
          date: s.date,
          timestamp,
          actual: s.actual,
          note: s.note,
        });
      }
      await load();
    },
    [repo, load, timestampForDate],
  );

  const update = useCallback(
    async (id: string, s: ComposerSubmit) => {
      const timestamp = await timestampForDate(s.kind === 'log' ? null : s.habitId, s.date, s.hour, s.minute);
      if (s.kind === 'log') {
        await repo.upsertFreeLog({ id, date: s.date, timestamp, type: s.type, text: s.text });
      } else if (s.kind === 'skip') {
        await repo.upsertEntry({
          id,
          habitId: s.habitId,
          date: s.date,
          timestamp,
          actual: 0,
          skipReason: s.skipReason,
          note: s.note,
        });
      } else {
        await repo.upsertEntry({
          id,
          habitId: s.habitId,
          date: s.date,
          timestamp,
          actual: s.actual,
          note: s.note,
        });
      }
      await load();
    },
    [repo, load, timestampForDate],
  );

  const quickLog = useCallback(
    async (habitId: string): Promise<QuickResult | null> => {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return null;
      const action = oneTapAction(habit, (todaySumByHabit[habitId] ?? 0) > 0);
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
    [habits, todaySumByHabit, repo, load],
  );

  const quickSkip = useCallback(
    async (habitId: string, reason: SkipReason): Promise<{ id: string } | null> => {
      const habit = habits.find((h) => h.id === habitId);
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
    [habits, repo, load],
  );

  const removeEntry = useCallback(
    async (id: string) => {
      await repo.deleteEntry(id);
      await load();
    },
    [repo, load],
  );

  const requestDelete = useCallback(
    async (id: string): Promise<DeleteRequest> => {
      const item = feed.find((f) => f.id === id);
      if (item && item.kind === 'log') {
        return { message: null, confirm: async () => { await repo.deleteLog(id); await load(); } };
      }
      const habit = item && item.kind === 'habit' ? habits.find((h) => h.id === item.habitId) : undefined;
      const confirm = async () => {
        await repo.deleteEntry(id);
        await load();
      };
      if (!habit) return { message: null, confirm };
      const history = await repo.getEntries(habit.id, EPOCH, todayLocal());
      return { message: describeDeleteConsequence(history, id, habit, todayLocal()), confirm };
    },
    [feed, habits, repo, load],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return {
    loading,
    date,
    tally,
    feed,
    habits,
    todaySumByHabit,
    lastAmountByHabit,
    submit,
    update,
    quickLog,
    quickSkip,
    removeEntry,
    requestDelete,
    reload: load,
  };
}
