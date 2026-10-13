import type { Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import {
  dayStateBadge,
  journalDateLabel,
  journalFreeLogLabel,
  JOURNAL_COPY,
  LOAD_FAILED_NOTE,
  longDateLabel,
} from '@/config/copy';
import { useRepository } from '@/context/RepositoryContext';
import { dayStates } from '@/domain/classify';
import { compareDates, weekdayOf } from '@/domain/dates';
import { sortByDomainOrder } from '@/domain/feed';
import { localClock, localToday } from '@/lib/device';
import type { DayState } from '@/models';

import { useFailure, type Failure } from './failure';
import { TODAY_HREF } from './useToday';
import { labelOf } from './recordSheet';

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
  /** The row's accessible name: its words in reading order. */
  accessibilityLabel: string;
  /** Where a tap goes: Today for the log's date (§6.4). */
  href: Href;
}

/** A note's row: a habit entry's 메모, with that day's state. */
export interface JournalNoteItem {
  kind: 'note';
  id: string;
  habitId: string;
  /** "📖 독서". */
  label: string;
  /**
   * That day's state for the habit (§6.0 Day-state marks), from every row of the day, as
   * a chip. `null` when the classifier gives the date none: the note shows with no chip.
   */
  stateChip: JournalStateChip | null;
  time: string;
  text: string;
  accessibilityLabel: string;
  /** Where a tap goes: the habit's Habit Detail at the note's date (§6.4). */
  href: Href;
}

export type JournalItem = JournalFreeItem | JournalNoteItem;

/**
 * The chip tones a state uses. Each is a `ChipTone` of `src/components/re`; the hook
 * names them here rather than importing from the component layer.
 */
export type JournalStateTone = 'done' | 'neutral' | 'crit';

/** A note's day-state chip (`.st.<state>` in `ReJournal`). */
export interface JournalStateChip {
  /** "✓ 했어요" — the state's mark and word. */
  label: string;
  tone: JournalStateTone;
}

/** `.st.<state>` — `done`, `over` and `partial` share the `done` tint (`_tokens.redesign.css`). */
const STATE_TONE: Record<DayState, JournalStateTone> = {
  done: 'done',
  over: 'done',
  partial: 'done',
  skip: 'neutral',
  missed: 'crit',
  pending: 'neutral',
};

/** One date, its head and its rows, newest first. */
export interface JournalGroup {
  date: string;
  /** "오늘 · 10월 10일" or "10월 9일". */
  label: string;
  items: JournalItem[];
}

/**
 * What the list is narrowed to: every row, the free logs (끄적이기), or one habit's
 * notes. A free log's kind is not a filter (§6.4).
 */
export type JournalFilter = { kind: 'all' } | { kind: 'free' } | { kind: 'habit'; habitId: string };

/** One filter chip: 전체, 끄적이기, then "📖 독서" per habit. */
export interface JournalChip {
  /** A stable React key: `all`, `free` or `habit:{id}`. */
  key: string;
  /** What `select` takes. */
  filter: JournalFilter;
  label: string;
  selected: boolean;
}

function keyOf(filter: JournalFilter): string {
  return filter.kind === 'habit' ? `habit:${filter.habitId}` : filter.kind;
}

const ALL: JournalFilter = { kind: 'all' };

export interface JournalView {
  /** "10월 10일 토요일" — the header above "글 모음". */
  dateLabel: string;
  title: string;
  chips: JournalChip[];
  /** Pick a chip by its `filter`. */
  select(filter: JournalFilter): void;
  /** The rows under the selected filter, newest date first. */
  groups: JournalGroup[];
  /** No free log and no note at all: the empty screen (`JOURNAL_COPY.empty*`). */
  empty: boolean;
  /** Where the empty screen's 끄적이기 goes: Today on today, with no date. */
  emptyActionHref: Href;
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
  habitChips: { filter: JournalFilter; label: string }[];
  /** Every row, newest first by the domain order. */
  rows: Row[];
}

const EMPTY: Loaded = { habitChips: [], rows: [] };

/**
 * The start of "all time" for a repository range read. The list hides nothing, so free
 * logs (which have no habit, §3.4) and notes are both read from here.
 */
const ALL_TIME_START = '1970-01-01';

export function useJournal({ today = localToday() }: { today?: string } = {}): JournalView {
  const repository = useRepository();
  const { failure, report, clear } = useFailure();
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const [selected, setSelected] = useState<JournalFilter>(ALL);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Every habit's notes show, an archived one's included. Only the chip is withheld.
      const habits = await repository.getHabits();

      const notes = await Promise.all(
        habits.map(async (habit) => {
          // From all time, not from `createdAt`: a row dated before the habit's birth is
          // still the user's note, and the list hides no note.
          const entries = await repository.getEntries(habit.id, ALL_TIME_START, today);
          const noted = entries.filter((entry) => (entry.note ?? '').trim().length > 0);
          if (noted.length === 0) return [];
          // From the earliest row, so every noted date is classified. A date with rows is
          // classified even outside the habit's scope (before birth, inside a pause).
          const first = entries.reduce(
            (lowest, entry) => (compareDates(entry.date, lowest) < 0 ? entry.date : lowest),
            today,
          );
          const days = dayStates(habit, entries, first, today, today);
          const stateOn = new Map(days.map((day) => [day.date, day.state]));
          return noted.map((entry): Row => {
            // `null` only if the classifier had no opinion on the date; the note still shows.
            const state = stateOn.get(entry.date);
            const stateChip =
              state == null ? null : { label: dayStateBadge(state), tone: STATE_TONE[state] };
            const time = localClock(entry.timestamp);
            const text = (entry.note ?? '').trim();
            return {
              date: entry.date,
              timestamp: entry.timestamp,
              id: entry.id,
              item: {
                kind: 'note',
                id: entry.id,
                habitId: habit.id,
                label: labelOf(habit),
                stateChip,
                time,
                text,
                accessibilityLabel: [labelOf(habit), stateChip?.label, time, text]
                  .filter((word) => word != null)
                  .join(' '),
                href: { pathname: '/habit/[id]', params: { id: habit.id, date: entry.date } },
              },
            };
          });
        }),
      );

      const logs = (await repository.getFreeLogs(ALL_TIME_START, today)).map((log): Row => {
        const label = journalFreeLogLabel(log.type);
        const time = localClock(log.timestamp);
        const text = log.text.trim().length > 0 ? log.text : null;
        return {
          date: log.date,
          timestamp: log.timestamp,
          id: log.id,
          item: {
            kind: 'free',
            id: log.id,
            label,
            time,
            text,
            accessibilityLabel: [label, time, text].filter((word) => word != null).join(' '),
            href: { pathname: '/today', params: { date: log.date } },
          },
        };
      });

      if (!cancelled) {
        setLoaded({
          habitChips: habits
            .filter((habit) => habit.lifecycle !== 'archived')
            .map((habit) => ({
              filter: { kind: 'habit' as const, habitId: habit.id },
              label: labelOf(habit),
            })),
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

  const options: { filter: JournalFilter; label: string }[] = [
    { filter: ALL, label: JOURNAL_COPY.all },
    { filter: { kind: 'free' }, label: JOURNAL_COPY.freeLogs },
    ...loaded.habitChips,
  ];
  // A habit archived since it was picked has no chip left, so the filter falls back to 전체.
  const filter = options.some((option) => keyOf(option.filter) === keyOf(selected)) ? selected : ALL;
  const chips: JournalChip[] = empty
    ? []
    : options.map((option) => ({
        ...option,
        key: keyOf(option.filter),
        selected: keyOf(option.filter) === keyOf(filter),
      }));

  const shown = loaded.rows.filter(({ item }) => {
    switch (filter.kind) {
      case 'all':
        return true;
      case 'free':
        return item.kind === 'free';
      case 'habit':
        return item.kind === 'note' && item.habitId === filter.habitId;
    }
  });

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
    emptyActionHref: TODAY_HREF,
    noMatch: loaded.rows.length > 0 && shown.length === 0,
    loading,
    failure,
    reload,
  };
}
