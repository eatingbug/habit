import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ComponentProps, type ReactNode } from 'react';

import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository, type KVStore } from '@/data';
import type { Habit } from '@/models';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { useSettings } from './useSettings';

/**
 * The hook seam (jest.config.js): a real `LocalRepository` over `MemoryKV` for the
 * habits, and a second `MemoryKV` as the device storage `ThemeProvider` keeps the theme
 * choice in.
 */

const TODAY = '2026-03-01';

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: '팔굽혀펴기',
    statId: 'strength',
    kind: 'count',
    floor: 5,
    floorUnit: 'reps',
    lifecycle: 'forming',
    createdAt: '2026-02-01T09:00:00.000Z',
    ...over,
  };
}

function archived(over: Partial<Habit>): Habit {
  return habit({
    lifecycle: 'archived',
    pauses: [{ from: '2026-02-20', resumeTo: 'forming' }],
    ...over,
  });
}

async function seed(habits: Habit[]): Promise<HabitRepository> {
  const repository = new LocalRepository(new MemoryKV());
  for (const h of habits) await repository.upsertHabit(h);
  return repository;
}

function wrapperFor(repository: HabitRepository, storage: KVStore) {
  return function Wrapper({ children }: { children: ReactNode }) {
    // `children` goes in as the third argument; the casts cover the prop it fills at runtime.
    const repo = { repository } as ComponentProps<typeof RepositoryProvider>;
    const theme = { storage } as ComponentProps<typeof ThemeProvider>;
    return createElement(ThemeProvider, theme, createElement(RepositoryProvider, repo, children));
  };
}

async function settings(repository: HabitRepository, storage: KVStore = new MemoryKV()) {
  const { result } = renderHook(() => useSettings({ today: TODAY }), {
    wrapper: wrapperFor(repository, storage),
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

describe('useSettings — 보관한 습관', () => {
  it('lists only the archived habits and labels the row with their count', async () => {
    const repository = await seed([
      habit({ id: 'active', name: '팔굽혀펴기' }),
      habit({ id: 'paused', name: '독서', lifecycle: 'paused', pauses: [{ from: '2026-02-25' }] }),
      archived({ id: 'a1', name: '스쿼트' }),
      archived({ id: 'a2', name: '명상' }),
    ]);

    const result = await settings(repository);

    expect(result.current.archived.map((h) => h.name).sort()).toEqual(['명상', '스쿼트']);
    expect(result.current.archived).toHaveLength(2);
    expect(result.current.archivedLabel).toBe('보관한 습관 2개');
    expect(result.current.archivedCountLabel).toBe('2개');
  });

  it('says 0개 when nothing is archived', async () => {
    const result = await settings(await seed([habit()]));

    expect(result.current.archivedLabel).toBe('보관한 습관 0개');
  });

  it('drops the number while loading and after a failed read, rather than saying 0개', async () => {
    const repository = await seed([archived({ id: 'a1' })]);
    jest.spyOn(repository, 'getHabits').mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useSettings({ today: TODAY }), {
      wrapper: wrapperFor(repository, new MemoryKV()),
    });

    expect(result.current.archivedLabel).toBe('보관한 습관');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failure?.message).toBe(
      '불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    );
    expect(result.current.archivedLabel).toBe('보관한 습관');
    expect(result.current.archivedCountLabel).toBe('');
  });

  it('drops a restored habit from the list and makes it active again', async () => {
    const repository = await seed([
      archived({ id: 'a1', name: '스쿼트' }),
      archived({ id: 'a2', name: '명상' }),
    ]);
    const result = await settings(repository);
    const squat = result.current.archived.find((h) => h.id === 'a1')!;

    await act(async () => {
      await result.current.restore(squat);
    });

    await waitFor(() => expect(result.current.archived.map((h) => h.name)).toEqual(['명상']));
    expect(result.current.archivedLabel).toBe('보관한 습관 1개');
    expect((await repository.getHabit('a1'))?.lifecycle).toBe('forming');
  });

  it('keeps the list and reports a failure when the restore cannot be saved', async () => {
    const repository = await seed([archived({ id: 'a1', name: '스쿼트' })]);
    jest.spyOn(repository, 'upsertHabit').mockRejectedValueOnce(new Error('offline'));
    const result = await settings(repository);

    await act(async () => {
      await result.current.restore(result.current.archived[0]);
    });

    expect(result.current.failure?.message).toBe(
      '저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    );
    expect(result.current.archived.map((h) => h.name)).toEqual(['스쿼트']);
  });
});

describe('useSettings — 테마', () => {
  it('starts on 자동 when the device has no stored choice', async () => {
    const result = await settings(await seed([]));

    expect(result.current.theme).toBe('system');
  });

  it('keeps the chosen theme on the device, so the next launch starts on it', async () => {
    const storage = new MemoryKV();
    const first = await settings(await seed([]), storage);

    act(() => first.current.setTheme('dark'));
    expect(first.current.theme).toBe('dark');

    const next = await settings(await seed([]), storage);
    await waitFor(() => expect(next.current.theme).toBe('dark'));
  });

  it('starts on the stored theme from the first render when storage can read synchronously', async () => {
    const storage = Object.assign(new MemoryKV(), { getSync: () => 'light' });
    const { result } = renderHook(() => useSettings({ today: TODAY }), {
      wrapper: wrapperFor(await seed([]), storage),
    });

    // Before any effect or promise settles: no frame on the OS theme.
    expect(result.current.theme).toBe('light');
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
