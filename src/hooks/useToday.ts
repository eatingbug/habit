/**
 * useToday — the Today feed + tally + composer submit (SPEC §6.2, CONCEPT §9).
 *
 * Merges today's habit entries and free logs into one chronological feed, computes the
 * day's tally, and converts a ComposerSubmit into the right stored record (classifying
 * habit entries, routing skips). Free logs never touch XP/streak (CONCEPT §9.1).
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRepository } from '@/context/RepositoryContext';
import { TUNING } from '@/config/tuning';
import { classifyEntry, isMiss } from '@/domain/classify';
import { metFloor } from '@/domain/util';
import { newId } from '@/util/id';
import { formatClock, timestampFromLocalTime, todayLocal } from '@/util/date';
import type { Habit, HabitEntry } from '@/models';
import type { ComposerSubmit, FeedEntry, TallyData } from '@/components/types';

function entryXP(entry: HabitEntry): number {
  if (!metFloor(entry)) return 0;
  return TUNING.xpPerFloorCompletion + (entry.state === 'over' ? TUNING.xpBonusTargetExceed : 0);
}

export interface TodayData {
  loading: boolean;
  date: string;
  tally: TallyData;
  feed: FeedEntry[];
  habits: Habit[];
  submit: (submission: ComposerSubmit) => Promise<void>;
  update: (id: string, submission: ComposerSubmit) => Promise<void>;
  reload: () => void;
}

export function useToday(): TodayData {
  const repo = useRepository();
  const [loading, setLoading] = useState(true);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [tally, setTally] = useState<TallyData>({ quests: '0/0', logs: 0, xp: 0 });
  const date = todayLocal();

  const load = useCallback(async () => {
    const today = todayLocal();
    const allHabits = await repo.getHabits();
    const statName = (statId: string) =>
      TUNING.stats.find((s) => s.id === statId)?.name ?? statId;

    const todaysEntries: { habit: Habit; entry: HabitEntry }[] = [];
    await Promise.all(
      allHabits.map(async (h) => {
        const entries = await repo.getEntries(h.id, today, today);
        for (const e of entries) todaysEntries.push({ habit: h, entry: e });
      }),
    );
    const logs = await repo.getFreeLogs(today, today);

    const items: FeedEntry[] = [
      ...todaysEntries.map(({ habit, entry }): FeedEntry => {
        const xp = entryXP(entry);
        return {
          kind: 'habit',
          id: entry.id,
          habitId: habit.id,
          timestamp: entry.timestamp,
          time: formatClock(entry.timestamp),
          habitName: habit.name,
          statName: statName(habit.statId),
          state: entry.state,
          isMiss: isMiss(entry),
          actual: entry.actual,
          unit: habit.floorUnit,
          isBinary: habit.kind === 'binary',
          note: entry.note,
          skipReason: entry.skipReason,
          xp: xp > 0 ? xp : undefined,
        };
      }),
      ...logs.map(
        (l): FeedEntry => ({
          kind: 'log',
          id: l.id,
          timestamp: l.timestamp,
          time: formatClock(l.timestamp),
          type: l.type,
          text: l.text,
        }),
      ),
    ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const questsDone = todaysEntries.filter(({ entry }) => metFloor(entry)).length;
    const xpToday = todaysEntries.reduce((sum, { entry }) => sum + entryXP(entry), 0);

    setHabits(allHabits);
    setFeed(items);
    setTally({ quests: `${questsDone}/${allHabits.length}`, logs: logs.length, xp: xpToday });
    setLoading(false);
  }, [repo]);

  const submit = useCallback(
    async (s: ComposerSubmit) => {
      const today = todayLocal();
      const timestamp = timestampFromLocalTime(today, s.hour, s.minute);
      if (s.kind === 'log') {
        await repo.upsertFreeLog({ id: newId(), timestamp, type: s.type, text: s.text });
      } else if (s.kind === 'skip') {
        await repo.upsertEntry({
          id: newId(),
          habitId: s.habitId,
          date: today,
          timestamp,
          actual: 0,
          state: 'skip',
          skipReason: s.skipReason,
          note: s.note,
        });
      } else {
        const habit = habits.find((h) => h.id === s.habitId);
        if (!habit) return;
        const state = classifyEntry(s.actual, habit.floor, habit.target);
        await repo.upsertEntry({
          id: newId(),
          habitId: s.habitId,
          date: today,
          timestamp,
          actual: s.actual,
          state,
          note: s.note,
        });
      }
      await load();
    },
    [repo, habits, load],
  );

  const update = useCallback(
    async (id: string, s: ComposerSubmit) => {
      const today = todayLocal();
      const timestamp = timestampFromLocalTime(today, s.hour, s.minute);
      if (s.kind === 'log') {
        await repo.upsertFreeLog({ id, timestamp, type: s.type, text: s.text });
      } else if (s.kind === 'skip') {
        await repo.upsertEntry({
          id,
          habitId: s.habitId,
          date: today,
          timestamp,
          actual: 0,
          state: 'skip',
          skipReason: s.skipReason,
          note: s.note,
        });
      } else {
        const habit = habits.find((h) => h.id === s.habitId);
        if (!habit) return;
        const state = classifyEntry(s.actual, habit.floor, habit.target);
        await repo.upsertEntry({
          id,
          habitId: s.habitId,
          date: today,
          timestamp,
          actual: s.actual,
          state,
          note: s.note,
        });
      }
      await load();
    },
    [repo, habits, load],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { loading, date, tally, feed, habits, submit, update, reload: load };
}
