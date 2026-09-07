import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { TUNING } from '@/config/tuning';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository, type KVStore } from '@/data';
import { addDays } from '@/domain/dates';
import type { Habit } from '@/models';

import { useToday, type TodayView } from './useToday';

/**
 * The hook seam (jest.config.js): a real `LocalRepository` over `MemoryKV`, so the
 * recording path is proven with no device and no component render.
 *
 * `today` and `now` are both injected. Day-state depends on the date (`pending` vs
 * `missed`, ADR-0001), and the feed's order is the domain total order
 * `(timestamp ASC, id ASC)` — with a real clock two appends in the same millisecond
 * would fall through to a random-UUID tiebreak, so the ordering assertion would be
 * deterministic but not insertion-ordered.
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
    target: 8,
    lifecycle: 'forming',
    createdAt: `${addDays(TODAY, -3)}T09:00:00.000Z`,
    ...over,
  };
}

function binary(over: Partial<Habit> = {}): Habit {
  return habit({
    id: 'b1',
    name: '명상',
    kind: 'binary',
    floor: 1,
    floorUnit: 'time',
    target: undefined,
    ...over,
  });
}

function wrapperFor(repository: HabitRepository) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(RepositoryProvider, { repository, children });
  };
}

async function seed(habits: Habit[]): Promise<KVStore> {
  const kv = new MemoryKV();
  const repository = new LocalRepository(kv);
  for (const h of habits) await repository.upsertHabit(h);
  return kv;
}

/** A clock the test drives: each read is one minute later than the last. */
function stepClock(startHour = 9) {
  let minute = 0;
  return () => {
    const at = new Date(`${TODAY}T0${startHour}:00:00.000Z`);
    at.setUTCMinutes(minute);
    minute += 1;
    return at;
  };
}

async function todayScreen(repository: HabitRepository, now = stepClock()) {
  const { result } = renderHook(() => useToday({ today: TODAY, now }), {
    wrapper: wrapperFor(repository),
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

function dayOf(view: TodayView, habitId: string) {
  const row = view.rows.find((r) => r.habit.id === habitId);
  if (row == null) throw new Error(`no row for ${habitId}`);
  return row.day;
}

async function log(
  result: { current: TodayView },
  habitId: string,
  actual: number,
): Promise<void> {
  await act(async () => {
    await result.current.logActivity(habitId, actual);
  });
}

describe('useToday', () => {
  it('settles empty with no habits', async () => {
    const { result } = renderHook(() => useToday({ today: TODAY, now: stepClock() }), {
      wrapper: wrapperFor(new LocalRepository(new MemoryKV())),
    });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([]);
    expect(result.current.feed).toEqual([]);
    expect(result.current.questsDone).toBe(0);
    expect(result.current.logCount).toBe(0);
    expect(result.current.xpToday).toBe(0);
  });

  it('starts the day pending and recomputes it to done on a floor-sized log', async () => {
    const result = await todayScreen(new LocalRepository(await seed([habit()])));
    expect(dayOf(result.current, 'h1')?.state).toBe('pending');

    await log(result, 'h1', 5);

    // Nothing rendered the screen — recording alone reclassified the day (§4.1).
    expect(dayOf(result.current, 'h1')?.state).toBe('done');
    expect(dayOf(result.current, 'h1')?.sum).toBe(5);
    expect(dayOf(result.current, 'h1')?.isMiss).toBe(false);
    expect(result.current.questsDone).toBe(1);
    expect(result.current.logCount).toBe(1);
    expect(result.current.xpToday).toBe(TUNING.xpPerFloorCompletion);
  });

  it('classifies a sub-floor amount as partial, which is not a miss', async () => {
    const result = await todayScreen(new LocalRepository(await seed([habit()])));

    await log(result, 'h1', 2);

    expect(dayOf(result.current, 'h1')?.state).toBe('partial');
    expect(dayOf(result.current, 'h1')?.isMiss).toBe(false);
    expect(result.current.questsDone).toBe(0);
    // A `partial` earns no XP (§4.1, effect 1) — and still beats silence on every
    // other measure, which is what makes it worth logging.
    expect(result.current.xpToday).toBe(0);
  });

  it('keeps both of two logs on one day and sums them to done (§7.3, sum 6)', async () => {
    const result = await todayScreen(new LocalRepository(await seed([habit()])));

    await log(result, 'h1', 2);
    expect(dayOf(result.current, 'h1')?.state).toBe('partial');
    await log(result, 'h1', 4);

    const day = dayOf(result.current, 'h1');
    expect(day?.entries).toHaveLength(2);
    expect(day?.entries.map((e) => e.actual)).toEqual([2, 4]);
    // Two rows, two ids — the second append never overwrote the first.
    expect(new Set(day?.entries.map((e) => e.id)).size).toBe(2);
    expect(day?.sum).toBe(6);
    expect(day?.state).toBe('done');
    expect(result.current.logCount).toBe(2);
    expect(result.current.xpToday).toBe(
      TUNING.xpPerFloorCompletion + 1 * TUNING.xpPerAboveFloorUnit,
    );
  });

  it('reaches over past the target, and an over day still counts as done', async () => {
    const result = await todayScreen(new LocalRepository(await seed([habit()])));

    await log(result, 'h1', 5);
    await log(result, 'h1', 4);

    expect(dayOf(result.current, 'h1')?.sum).toBe(9);
    expect(dayOf(result.current, 'h1')?.state).toBe('over');
    // `over` implies `done` (§4.1), so the tally must not lose the quest.
    expect(result.current.questsDone).toBe(1);
  });

  it('ignores a corrupt target <= floor rather than emitting a phantom over', async () => {
    const result = await todayScreen(
      new LocalRepository(await seed([habit({ floor: 5, target: 3 })])),
    );

    await log(result, 'h1', 4);

    expect(dayOf(result.current, 'h1')?.state).toBe('partial');
  });

  it('ignores any target on a binary habit', async () => {
    const result = await todayScreen(
      new LocalRepository(await seed([binary({ target: 1 })])),
    );

    await log(result, 'b1', 1);

    expect(dayOf(result.current, 'b1')?.state).toBe('done');
  });

  it('marks a binary habit done on one ✓, and stays idempotent on a second', async () => {
    const result = await todayScreen(new LocalRepository(await seed([binary()])));

    await log(result, 'b1', 1);
    expect(dayOf(result.current, 'b1')?.state).toBe('done');
    const once = result.current.xpToday;
    expect(once).toBe(TUNING.xpPerFloorCompletion);

    await log(result, 'b1', 1);

    // Two facts are kept, but the *day* is scored once (§4.1 / §4.2).
    expect(dayOf(result.current, 'b1')?.entries).toHaveLength(2);
    expect(dayOf(result.current, 'b1')?.state).toBe('done');
    expect(result.current.questsDone).toBe(1);
    expect(result.current.xpToday).toBe(once);
  });

  it('refuses a non-positive amount instead of writing a zero row (§3.3)', async () => {
    const repository = new LocalRepository(await seed([habit()]));
    const result = await todayScreen(repository);

    // No `act` here on purpose: the rejection happens before any state update, so
    // there is nothing to flush — and an `act` that throws corrupts its scope.
    await expect(result.current.logActivity('h1', 0)).rejects.toThrow(RangeError);
    await expect(result.current.logActivity('h1', -3)).rejects.toThrow(RangeError);

    expect(await repository.getEntries('h1', TODAY, TODAY)).toEqual([]);
    expect(dayOf(result.current, 'h1')?.state).toBe('pending');
  });

  it('lists today rows from every habit in chronological order', async () => {
    const result = await todayScreen(
      new LocalRepository(await seed([habit(), binary()])),
    );

    await log(result, 'h1', 2);
    await log(result, 'b1', 1);
    await log(result, 'h1', 3);

    expect(result.current.feed.map((item) => item.habit.id)).toEqual(['h1', 'b1', 'h1']);
    const stamps = result.current.feed.map((item) => item.entry.timestamp);
    expect([...stamps].sort()).toEqual(stamps);
    expect(result.current.feed.every((item) => item.entry.date === TODAY)).toBe(true);
    expect(result.current.logCount).toBe(3);
  });

  it('does not show yesterday in the feed, but scores only today in the XP tally', async () => {
    const repository = new LocalRepository(await seed([habit()]));
    await repository.upsertEntry({
      id: 'yesterday',
      habitId: 'h1',
      date: addDays(TODAY, -1),
      timestamp: `${addDays(TODAY, -1)}T09:00:00.000Z`,
      actual: 5,
    });
    const result = await todayScreen(repository);

    expect(result.current.feed).toEqual([]);
    expect(result.current.xpToday).toBe(0);

    await log(result, 'h1', 5);

    expect(result.current.feed).toHaveLength(1);
    // Yesterday's 60 XP is not re-counted; only what this day added is.
    expect(result.current.xpToday).toBe(TUNING.xpPerFloorCompletion);
  });

  it('hides an archived habit and keeps a paused one selectable (§3.2, ADR-0003)', async () => {
    const result = await todayScreen(
      new LocalRepository(
        await seed([
          habit({ id: 'archived', name: '접은 습관', lifecycle: 'archived' }),
          habit({
            id: 'paused',
            name: '쉬는 습관',
            lifecycle: 'paused',
            pauses: [{ from: addDays(TODAY, -1) }],
          }),
        ]),
      ),
    );

    expect(result.current.rows.map((row) => row.habit.id)).toEqual(['paused']);
    // An empty paused day has no state at all — the engine has no opinion (ADR-0003).
    expect(dayOf(result.current, 'paused')).toBeUndefined();

    await log(result, 'paused', 5);

    // …but a paused day that holds rows classifies normally and still earns.
    expect(dayOf(result.current, 'paused')?.state).toBe('done');
    expect(result.current.xpToday).toBe(TUNING.xpPerFloorCompletion);
  });
});
