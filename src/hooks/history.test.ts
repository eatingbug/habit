import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ComponentProps, type ReactNode } from 'react';

import { LOAD_FAILED_NOTE } from '@/config/copy';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository } from '@/data';
import type { Habit, HabitEntry } from '@/models';

import { useHistories, useHistory } from './history';

/**
 * 이력 로딩의 규칙 — 네 화면 훅이 공유하는 골격을 한 곳에서 검증한다 (#165).
 * 화면 훅 테스트는 이 규칙을 다시 단언하지 않는다.
 */

const TODAY = '2026-03-01';

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: '독서',
    statId: 'intellect',
    kind: 'count',
    floor: 5,
    floorUnit: '쪽',
    lifecycle: 'forming',
    createdAt: '2026-02-26T09:00:00.000Z',
    ...over,
  };
}

let seq = 0;
function entry(date: string, habitId = 'h1'): HabitEntry {
  return { id: `e${++seq}`, habitId, date, timestamp: `${date}T09:00:00.000Z`, actual: 5 };
}

function wrapperFor(repository: HabitRepository) {
  return function Wrapper({ children }: { children: ReactNode }) {
    // `children` goes in as the third argument; the cast covers the prop it fills at runtime.
    const props = { repository } as ComponentProps<typeof RepositoryProvider>;
    return createElement(RepositoryProvider, props, children);
  };
}

/**
 * `failing` 인 동안 모든 호출이 reject 한다. 끄면 안쪽의 진짜 저장소가 답한다.
 * `hold` 가 있으면 `getHabits` 는 그것이 풀릴 때까지 기다린다.
 */
function flaky(inner: HabitRepository) {
  const control = { failing: false, hold: null as Promise<void> | null };
  const repository = new Proxy(inner, {
    get(target, key: keyof HabitRepository) {
      const method = target[key] as (...args: unknown[]) => Promise<unknown>;
      return async (...args: unknown[]) => {
        if (key === 'getHabits' && control.hold != null) await control.hold;
        if (control.failing) throw new Error('network');
        return method.apply(target, args);
      };
    },
  });
  return { repository, control };
}

async function seed(habits: Habit[], entries: HabitEntry[] = []): Promise<LocalRepository> {
  const repository = new LocalRepository(new MemoryKV());
  for (const h of habits) await repository.upsertHabit(h);
  for (const e of entries) await repository.upsertEntry(e);
  return repository;
}

describe('useHistory', () => {
  it('reads the habit and its history from createdAt through today', async () => {
    // A row after today is outside the range. None can predate createdAt (`isBackfillableDate`).
    const rows = [entry('2026-02-26'), entry('2026-02-28'), entry(TODAY), entry('2026-03-02')];
    const repository = await seed([habit()], rows);
    const { result } = renderHook(() => useHistory('h1', TODAY), { wrapper: wrapperFor(repository) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.habit?.id).toBe('h1');
    expect(result.current.entries.map((e) => e.date).sort()).toEqual(['2026-02-26', '2026-02-28', TODAY]);
    expect(result.current.failure).toBeNull();
  });

  it('is null with no history for an id no habit answers to', async () => {
    const repository = await seed([habit()], [entry(TODAY)]);
    const { result } = renderHook(() => useHistory('nobody', TODAY), { wrapper: wrapperFor(repository) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.habit).toBeNull();
    expect(result.current.entries).toEqual([]);
    expect(result.current.failure).toBeNull();
  });
});

describe('useHistories', () => {
  it('reads every habit with its history, archived ones included', async () => {
    const habits = [habit(), habit({ id: 'h2', lifecycle: 'archived' })];
    const repository = await seed(habits, [entry(TODAY), entry(TODAY, 'h2')]);
    const { result } = renderHook(() => useHistories(TODAY), { wrapper: wrapperFor(repository) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const byId = Object.fromEntries(result.current.histories.map((h) => [h.habit.id, h.entries.length]));
    expect(byId).toEqual({ h1: 1, h2: 1 });
  });

  it('raises loading on the first load only, not on a reload', async () => {
    const repository = await seed([habit()]);
    const { result } = renderHook(() => useHistories(TODAY), { wrapper: wrapperFor(repository) });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await repository.upsertEntry(entry(TODAY));
    act(() => result.current.reload());

    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(result.current.histories[0].entries).toHaveLength(1));
  });

  it('keeps one `reload` across re-renders and reloads', async () => {
    const { result, rerender } = renderHook(() => useHistories(TODAY), {
      wrapper: wrapperFor(await seed([habit()])),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const first = result.current.reload;

    rerender({});
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.reload).toBe(first);
  });

  it('lowers loading and reports a failure with a retry when the read fails', async () => {
    const { repository, control } = flaky(await seed([habit()]));
    control.failing = true;
    const { result } = renderHook(() => useHistories(TODAY), { wrapper: wrapperFor(repository) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.histories).toEqual([]);
    expect(result.current.failure?.message).toBe(LOAD_FAILED_NOTE);
  });

  it('clears the failure once the retry succeeds', async () => {
    const { repository, control } = flaky(await seed([habit()]));
    control.failing = true;
    const { result } = renderHook(() => useHistories(TODAY), { wrapper: wrapperFor(repository) });
    await waitFor(() => expect(result.current.failure).not.toBeNull());

    control.failing = false;
    act(() => result.current.failure?.retry());

    await waitFor(() => expect(result.current.histories).toHaveLength(1));
    expect(result.current.failure).toBeNull();
  });

  it('drops a result that lands after `today` moved on', async () => {
    const yesterday = '2026-02-28';
    const { repository, control } = flaky(await seed([habit()], [entry(TODAY)]));
    let release = () => {};
    control.hold = new Promise((resolve) => (release = resolve));
    const { result, rerender } = renderHook(({ today }: { today: string }) => useHistories(today), {
      wrapper: wrapperFor(repository),
      initialProps: { today: yesterday },
    });

    control.hold = null;
    rerender({ today: TODAY });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => release());

    // The late read ended at yesterday, so it would hold no row.
    expect(result.current.histories[0].entries).toHaveLength(1);
  });
});
