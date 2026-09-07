import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { TUNING } from '@/config/tuning';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository, type KVStore } from '@/data';
import { addDays } from '@/domain/dates';
import type { Habit, HabitEntry, SkipReason } from '@/models';

import { useDashboard } from './useDashboard';

/**
 * The hook seam (jest.config.js): a real `LocalRepository` over `MemoryKV`, so the
 * Dashboard's data path is proven with no device and no component render.
 *
 * Every fixture date is derived from `TODAY` with `addDays` — a literal `createdAt`
 * would drift outside the `TUNING.heatmapDays` strip and make the assertions vacuous.
 */

const TODAY = '2026-03-01';
const FROM = addDays(TODAY, -(TUNING.heatmapDays - 1));

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: '팔굽혀펴기',
    statId: 'strength',
    kind: 'count',
    floor: 5,
    floorUnit: 'reps',
    lifecycle: 'forming',
    createdAt: `${addDays(TODAY, -5)}T09:00:00.000Z`,
    ...over,
  };
}

let seq = 0;
function activity(habitId: string, date: string, actual: number): HabitEntry {
  return { id: `a${++seq}`, habitId, date, timestamp: `${date}T09:00:00.000Z`, actual };
}
function skip(habitId: string, date: string, skipReason: SkipReason): HabitEntry {
  return {
    id: `s${++seq}`,
    habitId,
    date,
    timestamp: `${date}T09:00:00.000Z`,
    actual: 0,
    skipReason,
  };
}

function wrapperFor(repository: HabitRepository) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(RepositoryProvider, { repository, children });
  };
}

async function dashboard(repository: HabitRepository, today = TODAY) {
  const { result } = renderHook(() => useDashboard({ today }), {
    wrapper: wrapperFor(repository),
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

async function seed(habits: Habit[], entries: HabitEntry[] = []): Promise<KVStore> {
  const kv = new MemoryKV();
  const repository = new LocalRepository(kv);
  for (const h of habits) await repository.upsertHabit(h);
  for (const e of entries) await repository.upsertEntry(e);
  return kv;
}

/** `${tone}:${fill}` — the render instruction, without asserting a hex value. */
function tupleOn(cells: { date: string; tone: string; fill: string }[], date: string): string {
  const cell = cells.find((c) => c.date === date);
  if (cell == null) throw new Error(`no cell for ${date}`);
  return `${cell.tone}:${cell.fill}`;
}

describe('useDashboard', () => {
  it('starts loading and settles on an empty row list with no habits', async () => {
    const { result } = renderHook(() => useDashboard({ today: TODAY }), {
      wrapper: wrapperFor(new LocalRepository(new MemoryKV())),
    });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([]);
  });

  it('shows a created habit as a row, with its stat and a full-width strip', async () => {
    const kv = await seed([habit()]);
    const result = await dashboard(new LocalRepository(kv));

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].habit.name).toBe('팔굽혀펴기');
    expect(result.current.rows[0].stat?.name).toBe('힘');
    expect(result.current.rows[0].cells).toHaveLength(TUNING.heatmapDays);
  });

  it('still shows the habit through a fresh LocalRepository over the same store', async () => {
    // The "survives an app restart" criterion: same KV, a repository that has never
    // seen the write.
    const kv = await seed([habit()]);
    const result = await dashboard(new LocalRepository(kv));

    expect(result.current.rows.map((row) => row.habit.id)).toEqual(['h1']);
  });

  it('paints today as pending and every past day since createdAt as missed (ADR-0001)', async () => {
    const kv = await seed([habit()]);
    const result = await dashboard(new LocalRepository(kv));
    const { cells } = result.current.rows[0];

    expect(tupleOn(cells, TODAY)).toBe('neutral:none');
    expect(cells.find((c) => c.date === TODAY)?.state).toBe('pending');
    for (let back = 1; back <= 5; back += 1) {
      const date = addDays(TODAY, -back);
      expect(cells.find((c) => c.date === date)?.state).toBe('missed');
      expect(tupleOn(cells, date)).toBe('miss:outline');
    }
  });

  it('does not paint dates before createdAt', async () => {
    const kv = await seed([habit()]);
    const result = await dashboard(new LocalRepository(kv));
    const { cells } = result.current.rows[0];

    const before = cells.filter((c) => c.date < addDays(TODAY, -5));
    expect(before).toHaveLength(TUNING.heatmapDays - 6);
    for (const cell of before) {
      expect(cell.state).toBeUndefined();
      expect(`${cell.tone}:${cell.fill}`).toBe('empty:none');
    }
  });

  it('leaves an empty paused day unpainted but classifies a paused day that holds rows (ADR-0003)', async () => {
    const pauseFrom = addDays(TODAY, -4);
    const logged = addDays(TODAY, -3);
    const pauseTo = addDays(TODAY, -2);
    const kv = await seed(
      [habit({ createdAt: `${FROM}T09:00:00.000Z`, pauses: [{ from: pauseFrom, to: pauseTo }] })],
      [activity('h1', logged, 5)],
    );
    const result = await dashboard(new LocalRepository(kv));
    const { cells } = result.current.rows[0];

    expect(cells.find((c) => c.date === pauseFrom)?.state).toBeUndefined();
    expect(tupleOn(cells, pauseFrom)).toBe('empty:none');
    expect(cells.find((c) => c.date === logged)?.state).toBe('done');
    // The resume date is active again — half-open [from, to).
    expect(cells.find((c) => c.date === pauseTo)?.state).toBe('missed');
  });

  it('hides an archived habit and keeps a paused one (§3.2)', async () => {
    const kv = await seed([
      habit({ id: 'archived', name: '접은 습관', lifecycle: 'archived' }),
      habit({
        id: 'paused',
        name: '쉬는 습관',
        lifecycle: 'paused',
        pauses: [{ from: addDays(TODAY, -3) }],
      }),
    ]);
    const result = await dashboard(new LocalRepository(kv));

    expect(result.current.rows.map((row) => row.habit.id)).toEqual(['paused']);
  });

  it('gives missed, skip, partial and pending distinguishable render instructions', async () => {
    const missed = addDays(TODAY, -4);
    const skipped = addDays(TODAY, -3);
    const partial = addDays(TODAY, -2);
    const kv = await seed(
      // Created one day into the strip, so `FROM` is the out-of-scope reading.
      [habit({ createdAt: `${addDays(FROM, 1)}T09:00:00.000Z` })],
      [skip('h1', skipped, 'cue'), activity('h1', partial, 2)],
    );
    const result = await dashboard(new LocalRepository(kv));
    const { cells } = result.current.rows[0];

    expect(cells.find((c) => c.date === skipped)?.state).toBe('skip');
    expect(cells.find((c) => c.date === partial)?.state).toBe('partial');

    const tuples = [missed, skipped, partial, TODAY].map((date) => tupleOn(cells, date));
    expect(new Set(tuples).size).toBe(4);
    // …and the unpainted cell is a fifth reading, not a re-use of pending's.
    expect(new Set([...tuples, tupleOn(cells, FROM)]).size).toBe(5);
  });
});
