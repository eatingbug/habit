import { act, renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { TUNING } from '@/config/tuning';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository } from '@/data';
import { addDays } from '@/domain/dates';
import type { Habit, HabitEntry } from '@/models';

import { useQuickLog, type QuickLog } from './useQuickLog';

/**
 * The hook seam (jest.config.js): a real `LocalRepository` over `MemoryKV`, so the
 * one-tap append and its undo are proven with no device and no component render.
 *
 * `today` and `now` are both injected — `timestamp` is the domain's ordering key
 * (§3.3), and with a real clock two appends in the same millisecond would fall
 * through to the random-UUID tiebreak.
 */

const TODAY = '2026-03-01';

/**
 * `LocalRepository.deleteEntry(id)` finds a row's bucket by enumerating the habits
 * that exist, so a fixture that seeds an entry without its habit is undeletable. Every
 * repository in this file therefore starts from a real habit.
 */
function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: '독서',
    statId: 'intellect',
    kind: 'count',
    floor: 5,
    floorUnit: '쪽',
    lifecycle: 'forming',
    createdAt: `${addDays(TODAY, -3)}T09:00:00.000Z`,
    ...over,
  };
}

async function repositoryWith(habits: Habit[] = [habit()], entries: HabitEntry[] = []) {
  const repository = new LocalRepository(new MemoryKV());
  for (const h of habits) await repository.upsertHabit(h);
  for (const e of entries) await repository.upsertEntry(e);
  return repository;
}

function wrapperFor(repository: HabitRepository) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(RepositoryProvider, { repository, children });
  };
}

/** A clock the test drives: each read is one minute later than the last. */
function stepClock() {
  let minute = 0;
  return () => {
    const at = new Date(`${TODAY}T09:00:00.000Z`);
    at.setUTCMinutes(minute);
    minute += 1;
    return at;
  };
}

/** `forToast: null` is the "habit vanished mid-render" fixture, not "use the default". */
function quickLog(repository: HabitRepository, forToast: Habit | null = habit()) {
  let reloads = 0;
  const { result } = renderHook(
    () =>
      useQuickLog({
        today: TODAY,
        now: stepClock(),
        onChange: () => {
          reloads += 1;
        },
        habitOf: () => forToast ?? undefined,
      }),
    { wrapper: wrapperFor(repository) },
  );
  return { result, reloads: () => reloads };
}

async function log(
  result: { current: QuickLog },
  habitId: string,
  actual: number,
  opts?: { timestamp?: string },
): Promise<void> {
  await act(async () => {
    await result.current.logActivity(habitId, actual, opts);
  });
}

function seededRow(over: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: 'seeded',
    habitId: 'h1',
    date: TODAY,
    timestamp: `${TODAY}T07:00:00.000Z`,
    actual: 2,
    ...over,
  };
}

async function rowsIn(repository: HabitRepository, from = addDays(TODAY, -5)) {
  return repository.getEntries('h1', from, TODAY);
}

describe('useQuickLog', () => {
  it('appends one activity row and names it on the undo toast', async () => {
    const repository = await repositoryWith();
    const { result, reloads } = quickLog(repository);

    expect(result.current.toast).toBeNull();

    await log(result, 'h1', 3);

    const rows = await rowsIn(repository);
    expect(rows).toHaveLength(1);
    expect(result.current.toast?.entryId).toBe(rows[0].id);
    expect(result.current.toast?.message).toBe('기록됨');
    expect(result.current.toast?.detail).toBe('+3쪽');
    expect(reloads()).toBe(1);
  });

  it('reads ✓ 완료 on a binary habit rather than the floor unit', async () => {
    const binary = habit({ id: 'b1', kind: 'binary', floor: 1, floorUnit: 'time' });
    const { result } = quickLog(await repositoryWith([binary]), binary);

    await log(result, 'b1', 1);

    expect(result.current.toast?.detail).toBe('✓ 완료');
  });

  it('appends a second one-tap log instead of overwriting the first (§3.3)', async () => {
    const repository = await repositoryWith();
    const { result } = quickLog(repository);

    await log(result, 'h1', 5);
    await log(result, 'h1', 1);

    const rows = await rowsIn(repository);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
    expect(rows.reduce((sum, row) => sum + row.actual, 0)).toBe(6);
  });

  it('undoes only the row the toast named, leaving an older row of the day alone', async () => {
    const repository = await repositoryWith([habit()], [seededRow()]);
    const { result, reloads } = quickLog(repository);

    await log(result, 'h1', 5);
    const appended = result.current.toast?.entryId;
    expect(appended).not.toBe('seeded');

    await act(async () => {
      await result.current.undoLast();
    });

    // Undo is by `id`, not "the newest row" — a concurrent append must survive it.
    const rows = await rowsIn(repository);
    expect(rows.map((row) => row.id)).toEqual(['seeded']);
    expect(result.current.toast).toBeNull();
    expect(reloads()).toBe(2);
  });

  it('leaves a row on an earlier date untouched when undoing today', async () => {
    const yesterday = addDays(TODAY, -1);
    const repository = await repositoryWith(
      [habit()],
      [seededRow({ id: 'yesterday', date: yesterday, timestamp: `${yesterday}T09:00:00.000Z` })],
    );
    const { result } = quickLog(repository);

    await log(result, 'h1', 5);
    await act(async () => {
      await result.current.undoLast();
    });

    expect((await rowsIn(repository)).map((row) => row.id)).toEqual(['yesterday']);
  });

  it('does nothing on undo with no toast, and never undoes twice', async () => {
    const repository = await repositoryWith([habit()], [seededRow()]);
    const { result, reloads } = quickLog(repository);

    await act(async () => {
      await result.current.undoLast();
    });
    expect(reloads()).toBe(0);

    await log(result, 'h1', 5);
    await act(async () => {
      await result.current.undoLast();
    });
    await act(async () => {
      await result.current.undoLast();
    });

    expect((await rowsIn(repository)).map((row) => row.id)).toEqual(['seeded']);
  });

  it('dismisses the toast without touching the row', async () => {
    const repository = await repositoryWith();
    const { result } = quickLog(repository);

    await log(result, 'h1', 3);
    await act(async () => {
      result.current.dismissToast();
    });

    expect(result.current.toast).toBeNull();
    expect(await rowsIn(repository)).toHaveLength(1);
  });

  it('refuses a non-positive amount instead of writing a zero row (§3.3)', async () => {
    const repository = await repositoryWith();
    const { result } = quickLog(repository);

    await expect(result.current.logActivity('h1', 0)).rejects.toThrow(RangeError);
    await expect(result.current.logActivity('h1', -3)).rejects.toThrow(RangeError);

    expect(await rowsIn(repository)).toEqual([]);
    expect(result.current.toast).toBeNull();
  });

  it('stamps an overridden timestamp on the row but keeps the day (B3, §3.3)', async () => {
    const repository = await repositoryWith();
    const { result } = quickLog(repository);
    const at = new Date(`${TODAY}T02:34:00.000Z`).toISOString();

    await log(result, 'h1', 3, { timestamp: at });

    const rows = await rowsIn(repository);
    expect(rows[0].timestamp).toBe(at);
    expect(rows[0].date).toBe(TODAY);
  });
  it('falls back to the bare amount when the habit cannot be resolved', async () => {
    const { result } = quickLog(await repositoryWith(), null);

    await log(result, 'h1', 3);

    // The row was written either way and undo still works — a toast is not the place
    // to surface a data defect.
    expect(result.current.toast?.detail).toBe('+3');
  });

  describe('the undo window (§6.2 B6)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('keeps the toast until TUNING.undoToastMs elapses, then retires it', async () => {
      const { result } = quickLog(await repositoryWith());

      await log(result, 'h1', 5);
      await act(async () => {
        jest.advanceTimersByTime(TUNING.undoToastMs - 1);
      });
      expect(result.current.toast).not.toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current.toast).toBeNull();
    });

    it('restarts the window on a second append instead of inheriting the first one', async () => {
      const { result } = quickLog(await repositoryWith());

      await log(result, 'h1', 5);
      await act(async () => {
        jest.advanceTimersByTime(TUNING.undoToastMs - 1);
      });
      await log(result, 'h1', 1);

      // The first toast's remaining millisecond must not retire the second toast.
      await act(async () => {
        jest.advanceTimersByTime(TUNING.undoToastMs - 1);
      });
      expect(result.current.toast).not.toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current.toast).toBeNull();
    });

    it('no-ops on undo once the window has elapsed, leaving the row in place', async () => {
      const repository = await repositoryWith();
      const { result } = quickLog(repository);

      await log(result, 'h1', 5);
      const written = (await rowsIn(repository))[0].id;

      await act(async () => {
        jest.advanceTimersByTime(TUNING.undoToastMs);
      });
      await act(async () => {
        await result.current.undoLast();
      });

      // The row the user long forgot recording must not vanish under a stale press.
      expect((await rowsIn(repository)).map((row) => row.id)).toEqual([written]);
    });
  });
});
