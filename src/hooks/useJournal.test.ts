import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ComponentProps, type ReactNode } from 'react';

import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository } from '@/data';
import { addDays } from '@/domain/dates';
import type { FreeLog, Habit, HabitEntry, LogType, SkipReason } from '@/models';

import { useJournal, type JournalView } from './useJournal';

/**
 * The hook seam (jest.config.js): a real `LocalRepository` over `MemoryKV`, so the
 * 글 모음 tab's reading path is proven with no device and no component render.
 *
 * Every fixture date is derived from `TODAY` with `addDays`.
 */

const TODAY = '2026-10-10';
const YESTERDAY = addDays(TODAY, -1);
const TWO_AGO = addDays(TODAY, -2);

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'read',
    name: '독서',
    statId: 'intelligence',
    kind: 'count',
    floor: 10,
    floorUnit: '쪽',
    lifecycle: 'forming',
    createdAt: `${addDays(TODAY, -10)}T09:00:00.000Z`,
    ...over,
  };
}

const READ = habit();
const PULL = habit({ id: 'pull', name: '턱걸이', statId: 'strength', floor: 3, floorUnit: '개' });
const MEDITATE = habit({
  id: 'med',
  name: '명상',
  statId: 'willpower',
  kind: 'binary',
  floor: 1,
  floorUnit: 'time',
});

let seq = 0;
function activity(h: Habit, date: string, actual: number, hour: string, note?: string): HabitEntry {
  return { id: `a${++seq}`, habitId: h.id, date, timestamp: `${date}T${hour}:00.000Z`, actual, note };
}
function skip(h: Habit, date: string, reason: SkipReason, hour: string, note?: string): HabitEntry {
  return {
    id: `s${++seq}`,
    habitId: h.id,
    date,
    timestamp: `${date}T${hour}:00.000Z`,
    actual: 0,
    skipReason: reason,
    note,
  };
}
function freeLog(date: string, type: LogType, text: string, hour: string): FreeLog {
  return { id: `f${++seq}`, date, timestamp: `${date}T${hour}:00.000Z`, type, text };
}

function wrapperFor(repository: HabitRepository) {
  return function Wrapper({ children }: { children: ReactNode }) {
    // `children` goes in as the third argument; the cast covers the prop it fills at runtime.
    const props = { repository } as ComponentProps<typeof RepositoryProvider>;
    return createElement(RepositoryProvider, props, children);
  };
}

async function seed({
  habits = [READ, PULL, MEDITATE],
  entries = [],
  logs = [],
}: { habits?: Habit[]; entries?: HabitEntry[]; logs?: FreeLog[] }): Promise<HabitRepository> {
  const repository = new LocalRepository(new MemoryKV());
  for (const h of habits) await repository.upsertHabit(h);
  for (const e of entries) await repository.upsertEntry(e);
  for (const l of logs) await repository.upsertFreeLog(l);
  return repository;
}

async function journal(repository: HabitRepository) {
  const { result } = renderHook(() => useJournal({ today: TODAY }), {
    wrapper: wrapperFor(repository),
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

/** Each group as its header and its rows' texts, top to bottom. */
function outline(view: JournalView) {
  return view.groups.map((group) => [group.label, group.items.map((item) => item.text)]);
}

describe('useJournal — dates and order', () => {
  it('groups free logs and notes by date, newest date on top and newest row first', async () => {
    const repository = await seed({
      entries: [
        activity(READ, TWO_AGO, 12, '23:05', '출근길에 조금'),
        activity(PULL, TODAY, 3, '07:10', '손목이 좀 아팠다.'),
        activity(READ, YESTERDAY, 15, '22:40', '3장 끝.'),
      ],
      logs: [
        freeLog(YESTERDAY, 'win', '야근 안 하고 정시 퇴근.', '19:30'),
        freeLog(TODAY, 'idea', '점심 먹고 10분 걸었다.', '14:05'),
      ],
    });

    const result = await journal(repository);

    expect(outline(result.current)).toEqual([
      ['오늘 · 10월 10일', ['점심 먹고 10분 걸었다.', '손목이 좀 아팠다.']],
      ['10월 9일', ['3장 끝.', '야근 안 하고 정시 퇴근.']],
      ['10월 8일', ['출근길에 조금']],
    ]);
  });
});

describe('useJournal — a note and its day', () => {
  /** Each note row as its head, the day's mark and its text. */
  function notes(view: JournalView) {
    return view.groups.flatMap((group) =>
      group.items.flatMap((item) => (item.kind === 'note' ? [[item.label, item.stateLabel, item.text]] : [])),
    );
  }

  it('shows the habit and that whole day’s state, not the noted row’s alone', async () => {
    const repository = await seed({
      entries: [
        // Today: 4 of 10 with a note, then 6 more without one. The day is done.
        activity(READ, TODAY, 4, '08:00', '출근길에 조금'),
        activity(READ, TODAY, 6, '22:00'),
        // Yesterday: 4 of 10 and nothing more. The day is partial.
        activity(READ, YESTERDAY, 4, '22:40', '졸려서 조금만'),
        skip(MEDITATE, TWO_AGO, 'exception', '21:00', '회식이라 못 했다.'),
      ],
    });

    const result = await journal(repository);

    expect(notes(result.current)).toEqual([
      ['📖 독서', '✓ 했어요', '출근길에 조금'],
      ['📖 독서', '½ 조금 했어요', '졸려서 조금만'],
      ['🧘 명상', '− 못 했어요', '회식이라 못 했다.'],
    ]);
  });

  it('leaves out habit rows with no note, and the habits that are archived', async () => {
    const archived = habit({ id: 'old', name: '달리기', lifecycle: 'archived' });
    const repository = await seed({
      habits: [READ, archived],
      entries: [
        activity(READ, TODAY, 10, '08:00'),
        activity(READ, TODAY, 2, '09:00', '   '),
        activity(archived, TODAY, 5, '07:00', '보관한 습관의 메모'),
      ],
      logs: [freeLog(TODAY, 'mood', '', '12:00')],
    });

    const result = await journal(repository);

    expect(result.current.chips.map((chip) => chip.label)).toEqual(['전체', '끄적이기', '📖 독서']);
    // A free log with no text still shows: it has a kind and a time.
    expect(result.current.groups.flatMap((group) => group.items)).toEqual([
      expect.objectContaining({ kind: 'free', label: '✏️ 끄적이기 · 기분', text: null }),
    ]);
  });
});

describe('useJournal — filters', () => {
  const entries = () => [
    activity(PULL, TODAY, 3, '07:10', '손목이 좀 아팠다.'),
    activity(READ, YESTERDAY, 15, '22:40', '3장 끝.'),
    skip(MEDITATE, TWO_AGO, 'exception', '21:00', '회식이라 못 했다.'),
  ];
  const logs = () => [
    freeLog(TODAY, 'idea', '점심 먹고 10분 걸었다.', '14:05'),
    freeLog(YESTERDAY, 'win', '야근 안 하고 정시 퇴근.', '19:30'),
  ];

  it('offers 전체, 끄적이기, then one chip per habit, with 전체 selected', async () => {
    const result = await journal(await seed({ entries: entries(), logs: logs() }));

    expect(result.current.chips.map((chip) => [chip.label, chip.selected])).toEqual([
      ['전체', true],
      ['끄적이기', false],
      ['📖 독서', false],
      ['💪 턱걸이', false],
      ['🧘 명상', false],
    ]);
  });

  it('끄적이기 keeps every free log, whatever its kind, and drops the notes', async () => {
    const result = await journal(await seed({ entries: entries(), logs: logs() }));

    act(() => result.current.select('free'));

    expect(result.current.chips.find((chip) => chip.selected)?.label).toBe('끄적이기');
    expect(outline(result.current)).toEqual([
      ['오늘 · 10월 10일', ['점심 먹고 10분 걸었다.']],
      ['10월 9일', ['야근 안 하고 정시 퇴근.']],
    ]);
  });

  it('a habit chip keeps only that habit’s notes', async () => {
    const result = await journal(await seed({ entries: entries(), logs: logs() }));

    act(() => result.current.select(READ.id));

    expect(outline(result.current)).toEqual([['10월 9일', ['3장 끝.']]]);
  });

  it('falls back to 전체 when the picked habit is archived meanwhile', async () => {
    const repository = await seed({ entries: entries(), logs: logs() });
    const result = await journal(repository);
    act(() => result.current.select(READ.id));

    await repository.upsertHabit({ ...READ, lifecycle: 'archived' });
    act(() => result.current.reload());

    await waitFor(() =>
      expect(result.current.chips.map((chip) => chip.label)).not.toContain('📖 독서'),
    );
    expect(result.current.chips.find((chip) => chip.selected)?.label).toBe('전체');
    expect(result.current.groups.flatMap((group) => group.items)).toHaveLength(4);
  });

  it('전체 brings every row back', async () => {
    const result = await journal(await seed({ entries: entries(), logs: logs() }));

    act(() => result.current.select(MEDITATE.id));
    act(() => result.current.select('all'));

    expect(outline(result.current)).toEqual([
      ['오늘 · 10월 10일', ['점심 먹고 10분 걸었다.', '손목이 좀 아팠다.']],
      ['10월 9일', ['3장 끝.', '야근 안 하고 정시 퇴근.']],
      ['10월 8일', ['회식이라 못 했다.']],
    ]);
  });
});

describe('useJournal — empty', () => {
  it('is empty with no free log and no note, and offers no chips', async () => {
    const result = await journal(
      await seed({ entries: [activity(READ, TODAY, 10, '08:00')] }),
    );

    expect(result.current.empty).toBe(true);
    expect(result.current.groups).toEqual([]);
    expect(result.current.chips).toEqual([]);
  });

  it('under a filter with nothing in it, is not empty but has no match', async () => {
    const result = await journal(
      await seed({ entries: [activity(READ, TODAY, 10, '08:00', '술술 읽혔다.')] }),
    );

    act(() => result.current.select('free'));

    expect(result.current.empty).toBe(false);
    expect(result.current.noMatch).toBe(true);
    expect(result.current.groups).toEqual([]);
  });
});

describe('useJournal — where a tap goes', () => {
  it('a free log goes to Today, a note to its habit’s Habit Detail', async () => {
    const repository = await seed({
      entries: [activity(PULL, YESTERDAY, 3, '07:10', '그립을 바꿔 봐야겠다.')],
      logs: [freeLog(YESTERDAY, 'idea', '점심 먹고 10분 걸었다.', '14:05')],
    });

    const result = await journal(repository);

    expect(result.current.groups[0].items.map((item) => [item.kind, item.href])).toEqual([
      ['free', '/today'],
      ['note', '/habit/pull'],
    ]);
  });
});
