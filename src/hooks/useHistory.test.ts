import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ComponentProps, type ReactNode } from 'react';

import { LOAD_FAILED_NOTE } from '@/config/copy';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository } from '@/data';
import type { Habit, HabitEntry } from '@/models';

import { useHistories, useHistory } from './useHistory';

/**
 * 이력 module — 네 화면 훅이 각자 쓰던 로딩 골격(#165)을 여기서 한 번 검증한다.
 * 화면 훅의 테스트는 화면이 보이는 것만 단언하고, 로딩 규칙은 이 파일이 맡는다.
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

function entry(date: string, over: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: `e-${date}`,
    habitId: 'h1',
    date,
    timestamp: `${date}T09:00:00.000Z`,
    actual: 5,
    ...over,
  };
}

async function seeded(habits: Habit[], entries: HabitEntry[] = []): Promise<LocalRepository> {
  const repository = new LocalRepository(new MemoryKV());
  for (const h of habits) await repository.upsertHabit(h);
  for (const e of entries) await repository.upsertEntry(e);
  return repository;
}

/**
 * `failing` 인 동안 모든 메서드가 reject 한다. 끄면 안쪽의 진짜 저장소가 답한다.
 * `failure.test.ts` 의 `Flaky` 와 같은 더블을 Proxy 로 줄였다.
 */
function flaky(inner: HabitRepository): { repository: HabitRepository; state: { failing: boolean } } {
  const state = { failing: true };
  const repository = new Proxy(inner, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) =>
        state.failing ? Promise.reject(new Error('network')) : value.apply(target, args);
    },
  });
  return { repository, state };
}

function wrapperFor(repository: HabitRepository) {
  return function Wrapper({ children }: { children: ReactNode }) {
    // `children` goes in as the third argument; the cast covers the prop it fills at runtime.
    const props = { repository } as ComponentProps<typeof RepositoryProvider>;
    return createElement(RepositoryProvider, props, children);
  };
}

describe('useHistory — 습관 하나의 이력', () => {
  it('습관과 생긴 날부터 오늘까지의 기록 행을 돌려준다', async () => {
    const repository = await seeded(
      [habit()],
      // 범위 밖의 두 행은 앱이 만들 수 없는 행이다. 범위가 넓어지면 이 테스트가 깨진다.
      [
        entry('2026-02-25'),
        entry('2026-02-26'),
        entry('2026-02-28'),
        entry('2026-03-01'),
        entry('2026-03-02'),
      ],
    );
    const { result } = renderHook(() => useHistory('h1', { today: TODAY }), {
      wrapper: wrapperFor(repository),
    });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.habit?.id).toBe('h1');
    expect(result.current.entries.map((e) => e.date)).toEqual([
      '2026-02-26',
      '2026-02-28',
      '2026-03-01',
    ]);
  });

  it('없는 습관은 실패 없이 null 이다', async () => {
    const repository = await seeded([habit()]);
    const { result } = renderHook(() => useHistory('nope', { today: TODAY }), {
      wrapper: wrapperFor(repository),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.habit).toBeNull();
    expect(result.current.entries).toEqual([]);
    expect(result.current.failure).toBeNull();
  });

  it('today 가 바뀐 뒤 늦게 도착한 옛 결과는 버린다', async () => {
    const inner = await seeded([habit()], [entry('2026-02-28'), entry('2026-03-02')]);
    // 첫 `today` 의 getEntries 만 붙잡아 두고, 새 `today` 의 응답이 먼저 오게 한다.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const repository = new Proxy(inner, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (key !== 'getEntries') return typeof value === 'function' ? value.bind(target) : value;
        return async (habitId: string, from: string, to: string) => {
          if (to === TODAY) await held;
          return target.getEntries(habitId, from, to);
        };
      },
    });
    const { result, rerender } = renderHook(
      ({ today }: { today: string }) => useHistory('h1', { today }),
      { wrapper: wrapperFor(repository), initialProps: { today: TODAY } },
    );

    rerender({ today: '2026-03-02' });
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    await act(async () => {
      release();
      await held;
    });

    expect(result.current.entries.map((e) => e.date)).toEqual(['2026-02-28', '2026-03-02']);
  });

  it('reload 는 쓰기를 반영하되 loading 을 올리지 않고, 참조가 그대로다', async () => {
    const repository = await seeded([habit()]);
    const { result } = renderHook(() => useHistory('h1', { today: TODAY }), {
      wrapper: wrapperFor(repository),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const firstReload = result.current.reload;
    const loadingSeen: boolean[] = [];

    await act(() => repository.upsertEntry(entry('2026-03-01')));
    act(() => result.current.reload());
    loadingSeen.push(result.current.loading);

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    loadingSeen.push(result.current.loading);
    expect(loadingSeen).toEqual([false, false]);
    expect(result.current.reload).toBe(firstReload);
  });

  it('불러오기가 실패하면 loading 은 내려가고 실패가 남는다', async () => {
    const { repository } = flaky(await seeded([habit()]));
    const { result } = renderHook(() => useHistory('h1', { today: TODAY }), {
      wrapper: wrapperFor(repository),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.habit).toBeNull();
    expect(result.current.failure?.message).toBe(LOAD_FAILED_NOTE);
  });

  it('다시 시도가 통하면 이력이 오고 실패는 사라진다', async () => {
    const { repository, state } = flaky(await seeded([habit()], [entry('2026-02-27')]));
    const { result } = renderHook(() => useHistory('h1', { today: TODAY }), {
      wrapper: wrapperFor(repository),
    });
    await waitFor(() => expect(result.current.failure).not.toBeNull());

    state.failing = false;
    act(() => result.current.failure?.retry());

    await waitFor(() => expect(result.current.habit?.id).toBe('h1'));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.failure).toBeNull();
  });
});

describe('useHistories — 모든 습관의 이력', () => {
  it('보관된 습관까지 모든 습관을 각자의 이력과 함께 돌려준다', async () => {
    const repository = await seeded(
      [habit(), habit({ id: 'h2', lifecycle: 'archived', createdAt: '2026-02-28T09:00:00.000Z' })],
      [entry('2026-02-27'), entry('2026-02-28', { id: 'e2', habitId: 'h2' })],
    );
    const { result } = renderHook(() => useHistories({ today: TODAY }), {
      wrapper: wrapperFor(repository),
    });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    const byId = Object.fromEntries(
      result.current.histories.map(({ habit: h, entries }) => [h.id, entries.map((e) => e.id)]),
    );
    expect(byId).toEqual({ h1: ['e-2026-02-27'], h2: ['e2'] });
    expect(result.current.failure).toBeNull();
  });

  it('불러오기가 실패하면 loading 은 내려가고, 다시 시도가 통하면 실패가 사라진다', async () => {
    const { repository, state } = flaky(await seeded([habit()]));
    const { result } = renderHook(() => useHistories({ today: TODAY }), {
      wrapper: wrapperFor(repository),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.histories).toEqual([]);
    expect(result.current.failure?.message).toBe(LOAD_FAILED_NOTE);

    state.failing = false;
    act(() => result.current.failure?.retry());

    await waitFor(() => expect(result.current.histories).toHaveLength(1));
    expect(result.current.failure).toBeNull();
  });
});
