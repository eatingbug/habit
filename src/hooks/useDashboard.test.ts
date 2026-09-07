import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { TUNING } from '@/config/tuning';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository, type KVStore } from '@/data';
import { addDays } from '@/domain/dates';
import type { Habit, HabitEntry, SkipReason } from '@/models';

import { useDashboard, type DashboardView } from './useDashboard';

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

/**
 * Same as `dashboard`, but keeps every `loading` value the hook has rendered — the
 * §6.1 "the row updates in place" criterion is a claim about the reloads, not just
 * about the value that happens to be current at the end.
 */
async function dashboardWatchingLoading(repository: HabitRepository) {
  const seen: boolean[] = [];
  const { result } = renderHook(
    () => {
      const view = useDashboard({ today: TODAY });
      seen.push(view.loading);
      return view;
    },
    { wrapper: wrapperFor(repository) },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  return { result, seen };
}

async function log(
  result: { current: DashboardView },
  habitId: string,
  actual: number,
): Promise<void> {
  await act(async () => {
    await result.current.logActivity(habitId, actual);
  });
}

function stateOn(cells: { date: string; state?: string }[], date: string): string | undefined {
  return cells.find((cell) => cell.date === date)?.state;
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
  describe('one-tap logging on the row (#11)', () => {
    it('offers the floor as the first tap and reads +1 더 afterwards', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));

      expect(result.current.rows[0].hasActivityToday).toBe(false);
      expect(result.current.rows[0].oneTapAmount).toBe(5);

      await log(result, 'h1', result.current.rows[0].oneTapAmount);

      expect(result.current.rows[0].hasActivityToday).toBe(true);
      expect(result.current.rows[0].oneTapAmount).toBe(1);
    });

    it('turns today\u2019s cell done in place, without ever raising loading again', async () => {
      const { result, seen } = await dashboardWatchingLoading(
        new LocalRepository(await seed([habit()])),
      );
      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('pending');
      const settledAt = seen.length;

      await log(result, 'h1', 5);

      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('done');
      expect(result.current.rows[0].cells).toHaveLength(TUNING.heatmapDays);
      // Not one render in the reload said "loading" — the row the user just logged
      // into must never blank out (§6.1).
      expect(seen.slice(settledAt)).not.toContain(true);
      expect(result.current.loading).toBe(false);
    });

    it('appends a second tap instead of overwriting, and sums to over', async () => {
      const result = await dashboard(
        new LocalRepository(await seed([habit({ target: 6 })])),
      );

      await log(result, 'h1', 5);
      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('done');
      await log(result, 'h1', 1);

      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('over');
    });

    it('shows a binary habit as already complete after one ✓', async () => {
      const result = await dashboard(
        new LocalRepository(
          await seed([habit({ id: 'b1', kind: 'binary', floor: 1, floorUnit: 'time' })]),
        ),
      );

      expect(result.current.rows[0].hasActivityToday).toBe(false);
      expect(result.current.rows[0].oneTapAmount).toBe(1);

      await log(result, 'b1', 1);

      // Binary's floor is 1, so one row is the whole day: the control is completed.
      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('done');
      expect(result.current.rows[0].hasActivityToday).toBe(true);
      expect(result.current.toast?.detail).toBe('✓ 완료');
    });

    it('still offers the full floor on a day that holds only a reason-tagged skip', async () => {
      const result = await dashboard(
        new LocalRepository(await seed([habit()], [skip('h1', TODAY, 'cue')])),
      );

      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('skip');
      // A skip row is `actual: 0` — not activity, so this is still today's first record.
      expect(result.current.rows[0].hasActivityToday).toBe(false);
      expect(result.current.rows[0].oneTapAmount).toBe(5);
    });

    it('undoes the tap it just made and puts the day back to pending', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));

      await log(result, 'h1', 5);
      expect(result.current.toast?.detail).toBe('+5reps');

      await act(async () => {
        await result.current.undoLast();
      });

      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('pending');
      expect(result.current.rows[0].hasActivityToday).toBe(false);
      expect(result.current.toast).toBeNull();
    });
  });
});
