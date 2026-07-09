/**
 * useToday — the Today feed + tally + composer submit (SPEC §6.2, CONCEPT §9).
 *
 * Merges today's habit entries and free logs into one chronological feed, computes the
 * day's tally, and converts a ComposerSubmit into the right stored record (facts only —
 * the day-state is computed, never stored). Free logs never touch XP/streak (CONCEPT §9.1).
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRepository } from '@/context/RepositoryContext';
import { TUNING } from '@/config/tuning';
import { classifyDay, compareEntries, isMissDay } from '@/domain/classify';
import { dayXPContribution } from '@/domain/logging';
import { newId } from '@/util/id';
import { formatClock, timestampFromLocalTime, todayLocal } from '@/util/date';
import type { Habit } from '@/models';
import type { ComposerSubmit, FeedEntry, TallyData } from '@/components/types';

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

    const items: FeedEntry[] = [];
    let questsDone = 0;
    let xpToday = 0;

    await Promise.all(
      allHabits.map(async (h) => {
        const es = await repo.getEntries(h.id, today, today);
        if (es.length === 0) return;
        const target = h.kind === 'binary' ? undefined : h.target;
        const dayState = classifyDay(es, h.floor, target);
        const miss = isMissDay(es, h.floor, target);
        const dayXP = dayXPContribution(es, h);
        if (dayState === 'done' || dayState === 'over') questsDone += 1;
        xpToday += dayXP;
        // The day's XP contribution is attributed to its latest activity row (SPEC §4.1).
        const activity = es.filter((e) => e.actual > 0).sort(compareEntries);
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
    setTally({ quests: `${questsDone}/${allHabits.length}`, logs: logs.length, xp: xpToday });
    setLoading(false);
  }, [repo]);

  const submit = useCallback(
    async (s: ComposerSubmit) => {
      const today = todayLocal();
      const timestamp = timestampFromLocalTime(today, s.hour, s.minute);
      if (s.kind === 'log') {
        await repo.upsertFreeLog({ id: newId(), date: today, timestamp, type: s.type, text: s.text });
      } else if (s.kind === 'skip') {
        await repo.upsertEntry({
          id: newId(),
          habitId: s.habitId,
          date: today,
          timestamp,
          actual: 0,
          skipReason: s.skipReason,
          note: s.note,
        });
      } else {
        await repo.upsertEntry({
          id: newId(),
          habitId: s.habitId,
          date: today,
          timestamp,
          actual: s.actual,
          note: s.note,
        });
      }
      await load();
    },
    [repo, load],
  );

  const update = useCallback(
    async (id: string, s: ComposerSubmit) => {
      const today = todayLocal();
      const timestamp = timestampFromLocalTime(today, s.hour, s.minute);
      if (s.kind === 'log') {
        await repo.upsertFreeLog({ id, date: today, timestamp, type: s.type, text: s.text });
      } else if (s.kind === 'skip') {
        await repo.upsertEntry({
          id,
          habitId: s.habitId,
          date: today,
          timestamp,
          actual: 0,
          skipReason: s.skipReason,
          note: s.note,
        });
      } else {
        await repo.upsertEntry({
          id,
          habitId: s.habitId,
          date: today,
          timestamp,
          actual: s.actual,
          note: s.note,
        });
      }
      await load();
    },
    [repo, load],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { loading, date, tally, feed, habits, submit, update, reload: load };
}
