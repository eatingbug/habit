import { useCallback, useEffect, useState } from 'react';

import {
  dayStateBadge,
  habitIcon,
  journalDateLabel,
  journalFreeLogLabel,
  JOURNAL_COPY,
  LOAD_FAILED_NOTE,
  longDateLabel,
} from '@/config/copy';
import { useRepository } from '@/context/RepositoryContext';
import { dayStates } from '@/domain/classify';
import { compareDates, dateOf, weekdayOf } from '@/domain/dates';
import { sortByDomainOrder } from '@/domain/feed';
import { localClock, localToday } from '@/lib/device';
import type { DayState, Habit } from '@/models';

import { useFailure, type Failure } from './failure';

/**
 * 글 모음 — SPEC §6.4, the `ReJournal` artboard (#132). Free logs and notes, read back.
 *
 * The hook is the test seam (jest.config.js: hooks + an in-memory repository, no
 * component render tests), so every word, every group, the filter and where a row goes
 * are decided here. The screen renders them.
 *
 * Read-only by design (§6.4 "The list is read-only"): the view exposes no write. A row
 * is a link to the screen that edits it.
 *
 * `today` is a parameter so a test can pin it: the group head names 오늘, and a note's
 * day-state depends on it (`pending` vs `missed`, ADR-0001).
 */

/** A free log's row. */
export interface JournalFreeItem {
  kind: 'free';
  id: string;
  /** "✏️ 끄적이기 · 떠오른 생각". */
  label: string;
  /** "14:05" — the log's local wall-clock time. */
  time: string;
  /** The log's text, or `null` when the user wrote none. */
  text: string | null;
  /** Where a tap goes: Today (§6.4). */
  href: string;
}

/** A note's row: a habit entry's 메모, with that day's state. */
export interface JournalNoteItem {
  kind: 'note';
  id: string;
  habitId: string;
  /** "📖 독서". */
  label: string;
  /** That day's state for the habit (§6.0 Day-state marks), from every row of the day. */
  state: DayState;
  /** "✓ 했어요" — the state's mark and word. */
  stateLabel: string;
  time: string;
  text: string;
  /** Where a tap goes: the habit's Habit Detail (§6.4). */
  href: string;
}

export type JournalItem = JournalFreeItem | JournalNoteItem;

/** One date, its head and its rows, newest first. */
export interface JournalGroup {
  date: string;
  /** "오늘 · 10월 10일" or "10월 9일". */
  label: string;
  items: JournalItem[];
}

/**
 * One filter chip: 전체, 끄적이기, then "📖 독서" per habit. A free log's kind is not a
 * filter (§6.4).
 */
export interface JournalChip {
  /** What `select` takes: `'all'`, `'free'` (free logs) or a habit's id (its notes). */
  id: string;
  label: string;
  selected: boolean;
}

export interface JournalView {
  /** "10월 10일 토요일" — the header above "글 모음". */
  dateLabel: string;
  title: string;
  chips: JournalChip[];
  /** Pick a chip by its `id`. */
  select(id: string): void;
  /** The rows under the selected filter, newest date first. */
  groups: JournalGroup[];
  /** No free log and no note at all: the empty screen (`JOURNAL_COPY.empty*`). */
  empty: boolean;
  /** Rows exist, but none under the selected filter (`JOURNAL_COPY.noMatch`). */
  noMatch: boolean;
  loading: boolean;
  /** 읽기가 실패했을 때의 문구와 다시 시도. `null` 이면 실패가 없다. */
  failure: Failure | null;
  /** Re-read, e.g. on a return to the tab. */
  reload(): void;
}

/** A row before the filter, with what the domain order needs. */
interface Row {
  date: string;
  timestamp: string;
  id: string;
  item: JournalItem;
}

interface Loaded {
  /** The habit chips, in the repository's habit order. */
  habitChips: { id: string; label: string }[];
  /** Every row, newest first by the domain order. */
  rows: Row[];
}

const EMPTY: Loaded = { habitChips: [], rows: [] };

/**
 * The earliest date a free log is read from. A free log has no habit (§3.4), so no
 * `createdAt` bounds it; the repository takes a range, and this one holds every log.
 */
const FREE_LOGS_FROM = '1970-01-01';

/** "📖 독서" — a habit's chip and its notes' head. */
function labelOf(habit: Habit): string {
  return `${habitIcon(habit)} ${habit.name}`;
}

export function useJournal({ today = localToday() }: { today?: string } = {}): JournalView {
  const repository = useRepository();
  const { failure, report, clear } = useFailure();
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const [selected, setSelected] = useState('all');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const habits = (await repository.getHabits()).filter((habit) => habit.lifecycle !== 'archived');

      const notes = await Promise.all(
        habits.map(async (habit) => {
          const entries = await repository.getEntries(habit.id, dateOf(habit.createdAt), today);
          const noted = entries.filter((entry) => (entry.note ?? '').trim().length > 0);
          if (noted.length === 0) return [];
          const days = dayStates(habit, entries, dateOf(habit.createdAt), today, today);
          const stateOn = new Map(days.map((day) => [day.date, day.state]));
          return noted.map((entry): Row => {
            const state = stateOn.get(entry.date) as DayState;
            return {
              date: entry.date,
              timestamp: entry.timestamp,
              id: entry.id,
              item: {
                kind: 'note',
                id: entry.id,
                habitId: habit.id,
                label: labelOf(habit),
                state,
                stateLabel: dayStateBadge(state),
                time: localClock(entry.timestamp),
                text: (entry.note ?? '').trim(),
                href: `/habit/${habit.id}`,
              },
            };
          });
        }),
      );

      const logs = (await repository.getFreeLogs(FREE_LOGS_FROM, today)).map(
        (log): Row => ({
          date: log.date,
          timestamp: log.timestamp,
          id: log.id,
          item: {
            kind: 'free',
            id: log.id,
            label: journalFreeLogLabel(log.type),
            time: localClock(log.timestamp),
            text: log.text.trim().length > 0 ? log.text : null,
            href: '/today',
          },
        }),
      );

      if (!cancelled) {
        setLoaded({
          habitChips: habits.map((habit) => ({ id: habit.id, label: labelOf(habit) })),
          rows: sortByDomainOrder([...notes.flat(), ...logs]).reverse(),
        });
        clear();
        setLoading(false);
      }
    }

    load().catch(() => {
      if (cancelled) return;
      setLoading(false);
      report(LOAD_FAILED_NOTE, reload);
    });

    return () => {
      cancelled = true;
    };
  }, [repository, today, version]);

  // Nothing written at all: the empty screen, with no chips over it (§6.0 Icons). Not
  // while loading, and not after a failed read, which would claim the user has no rows.
  const empty = !loading && failure == null && loaded.rows.length === 0;

  const options = [
    { id: 'all', label: JOURNAL_COPY.all },
    { id: 'free', label: JOURNAL_COPY.freeLogs },
    ...loaded.habitChips,
  ];
  // A habit archived since it was picked has no chip left, so the filter falls back to 전체.
  const filter = options.some((option) => option.id === selected) ? selected : 'all';
  const chips: JournalChip[] = empty
    ? []
    : options.map((option) => ({ ...option, selected: option.id === filter }));

  const shown = loaded.rows.filter(({ item }) =>
    filter === 'all'
      ? true
      : filter === 'free'
        ? item.kind === 'free'
        : item.kind === 'note' && item.habitId === filter,
  );

  const groups: JournalGroup[] = [];
  for (const row of [...shown].sort((a, b) => compareDates(b.date, a.date))) {
    const last = groups[groups.length - 1];
    if (last?.date === row.date) last.items.push(row.item);
    else groups.push({ date: row.date, label: journalDateLabel(row.date, today), items: [row.item] });
  }

  return {
    dateLabel: longDateLabel(today, weekdayOf(today)),
    title: JOURNAL_COPY.title,
    chips,
    select: setSelected,
    groups,
    empty,
    noMatch: loaded.rows.length > 0 && shown.length === 0,
    loading,
    failure,
    reload,
  };
}
