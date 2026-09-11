import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { FREE_LOG_NO_TEXT_NOTE } from '@/config/copy';
import { TUNING } from '@/config/tuning';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository, type KVStore } from '@/data';
import { addDays } from '@/domain/dates';
import type { FreeLog, Habit, HabitEntry, SkipReason } from '@/models';

import {
  feedItemId,
  FREE_TARGET,
  useToday,
  type TodayFreeFeedItem,
  type TodayHabitFeedItem,
  type TodayHabitRow,
  type TodayView,
} from './useToday';

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
  opts?: { timestamp?: string },
): Promise<void> {
  await act(async () => {
    await result.current.logActivity(habitId, actual, opts);
  });
}

async function logSkip(
  result: { current: TodayView },
  target: Habit,
  reason: SkipReason,
  opts?: { note?: string },
): Promise<void> {
  await act(async () => {
    await result.current.logSkip(target, reason, opts);
  });
}

/**
 * The feed's **habit** lines (#16). The feed is a discriminated union now — free logs
 * interleave into it — so a test that reads `entry` narrows through this rather than
 * asserting a field the union does not have.
 */
function habitFeed(view: TodayView): TodayHabitFeedItem[] {
  return view.feed.filter((item): item is TodayHabitFeedItem => item.kind === 'habit');
}

function rowOf(view: TodayView, habitId: string): TodayHabitRow {
  const row = view.rows.find((r) => r.habit.id === habitId);
  if (row == null) throw new Error(`no row for ${habitId}`);
  return row;
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

    expect(habitFeed(result.current).map((item) => item.habit.id)).toEqual(['h1', 'b1', 'h1']);
    const stamps = habitFeed(result.current).map((item) => item.entry.timestamp);
    expect([...stamps].sort()).toEqual(stamps);
    expect(habitFeed(result.current).every((item) => item.entry.date === TODAY)).toBe(true);
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
  describe('one-tap logging and undo (#11)', () => {
    it('undoes the row it just appended and reverts the day to pending', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await todayScreen(repository);

      await log(result, 'h1', 5);
      expect(dayOf(result.current, 'h1')?.state).toBe('done');
      expect(result.current.toast?.detail).toBe('+5reps');

      await act(async () => {
        await result.current.undoLast();
      });

      expect(dayOf(result.current, 'h1')?.state).toBe('pending');
      expect(result.current.logCount).toBe(0);
      expect(result.current.xpToday).toBe(0);
      expect(result.current.toast).toBeNull();
    });

    it('undoes only the named row, leaving an earlier row of the same day alone', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      await repository.upsertEntry({
        id: 'earlier',
        habitId: 'h1',
        date: TODAY,
        timestamp: `${TODAY}T07:00:00.000Z`,
        actual: 2,
      });
      const result = await todayScreen(repository);

      await log(result, 'h1', 5);
      expect(dayOf(result.current, 'h1')?.state).toBe('done');

      await act(async () => {
        await result.current.undoLast();
      });

      // By `id`, not "the newest row": the seeded fact survives and the day falls
      // back to what that one row alone says.
      expect(dayOf(result.current, 'h1')?.entries.map((e) => e.id)).toEqual(['earlier']);
      expect(dayOf(result.current, 'h1')?.state).toBe('partial');
    });

    it('appends on a second one-tap rather than overwriting the first (§3.3)', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await log(result, 'h1', rowOf(result.current, 'h1').oneTapAmount);
      await log(result, 'h1', rowOf(result.current, 'h1').oneTapAmount);

      const day = dayOf(result.current, 'h1');
      expect(day?.entries).toHaveLength(2);
      expect(day?.entries.map((e) => e.actual)).toEqual([5, 1]);
      expect(day?.sum).toBe(6);
      expect(result.current.logCount).toBe(2);
    });

    it('flips hasActivityToday and oneTapAmount after the day\u2019s first record', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      expect(rowOf(result.current, 'h1').hasActivityToday).toBe(false);
      expect(rowOf(result.current, 'h1').oneTapAmount).toBe(5);

      await log(result, 'h1', 5);

      expect(rowOf(result.current, 'h1').hasActivityToday).toBe(true);
      expect(rowOf(result.current, 'h1').oneTapAmount).toBe(1);
    });

    it('leaves a skip-only day reading as its first record (a skip row is not activity)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      await repository.upsertEntry({
        id: 'skipped',
        habitId: 'h1',
        date: TODAY,
        timestamp: `${TODAY}T07:00:00.000Z`,
        actual: 0,
        skipReason: 'cue',
      });
      const result = await todayScreen(repository);

      expect(dayOf(result.current, 'h1')?.state).toBe('skip');
      expect(rowOf(result.current, 'h1').hasActivityToday).toBe(false);
      expect(rowOf(result.current, 'h1').oneTapAmount).toBe(5);
      // `actual: 0` is not a legal staged amount, so it must never become the default.
      expect(rowOf(result.current, 'h1').defaultAmount).toBe(5);
    });

    it('keeps a binary habit at one tap with no amount chips', async () => {
      const result = await todayScreen(new LocalRepository(await seed([binary()])));

      expect(rowOf(result.current, 'b1').oneTapAmount).toBe(1);
      expect(rowOf(result.current, 'b1').quickChips).toEqual([]);
      expect(result.current.previewOf('b1', 1)?.state).toBe('done');

      await log(result, 'b1', 1);

      expect(result.current.toast?.detail).toBe('✓ 완료');
      expect(rowOf(result.current, 'b1').oneTapAmount).toBe(1);
    });
  });

  describe('smart defaults, quick chips and progress (#11)', () => {
    it('prefills the floor on the first record and the previous amount afterwards', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      expect(rowOf(result.current, 'h1').defaultAmount).toBe(5);

      await log(result, 'h1', 2);
      expect(rowOf(result.current, 'h1').defaultAmount).toBe(2);

      await log(result, 'h1', 3);
      expect(rowOf(result.current, 'h1').defaultAmount).toBe(3);
    });

    it('takes 직전값 from the last row under the domain total order, not repository order', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      // Written newest-first, so a naive "last element" read would answer 2.
      for (const [id, at, actual] of [
        ['late', '11:00', 4],
        ['early', '08:00', 2],
      ] as const) {
        await repository.upsertEntry({
          id,
          habitId: 'h1',
          date: TODAY,
          timestamp: `${TODAY}T${at}:00.000Z`,
          actual,
        });
      }
      const result = await todayScreen(repository);

      expect(rowOf(result.current, 'h1').defaultAmount).toBe(4);
      expect(rowOf(result.current, 'h1').quickChips).toEqual([1, 5, 4]);
    });

    it('orders the chips +1 / 최소량 / 직전값 and omits 직전값 on the first record', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      expect(rowOf(result.current, 'h1').quickChips).toEqual([1, 5]);

      await log(result, 'h1', 2);
      expect(rowOf(result.current, 'h1').quickChips).toEqual([1, 5, 2]);

      // A 직전값 that repeats the floor is deduped rather than shown twice.
      await log(result, 'h1', 5);
      expect(rowOf(result.current, 'h1').quickChips).toEqual([1, 5]);
    });

    it('counts remaining down to 0 at the floor and never below it', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      expect(rowOf(result.current, 'h1').progress).toEqual({ sum: 0, floor: 5, remaining: 5 });

      await log(result, 'h1', 2);
      expect(rowOf(result.current, 'h1').progress).toEqual({ sum: 2, floor: 5, remaining: 3 });

      await log(result, 'h1', 3);
      expect(rowOf(result.current, 'h1').progress).toEqual({ sum: 5, floor: 5, remaining: 0 });

      await log(result, 'h1', 4);
      expect(rowOf(result.current, 'h1').progress).toEqual({ sum: 9, floor: 5, remaining: 0 });
    });

    it('previews the staged amount through the real classifier', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      expect(result.current.previewOf('h1', 2)).toEqual({ sum: 2, state: 'partial' });
      expect(result.current.previewOf('h1', 5)).toEqual({ sum: 5, state: 'done' });
      expect(result.current.previewOf('h1', 8)).toEqual({ sum: 8, state: 'over' });
      expect(result.current.previewOf('nobody', 5)).toBeNull();

      await log(result, 'h1', 3);

      // The preview adds to what the day already holds, not to nothing.
      expect(result.current.previewOf('h1', 2)).toEqual({ sum: 5, state: 'done' });
      expect(result.current.previewOf('h1', 1)).toEqual({ sum: 4, state: 'partial' });
    });

    it('previews and progresses an empty paused day, which has no state at all', async () => {
      const result = await todayScreen(
        new LocalRepository(
          await seed([habit({ id: 'paused', lifecycle: 'paused', pauses: [{ from: TODAY }] })]),
        ),
      );

      // ADR-0003: no `ClassifiedDay`, but the composer still has to work.
      expect(dayOf(result.current, 'paused')).toBeUndefined();
      expect(rowOf(result.current, 'paused').progress).toEqual({
        sum: 0,
        floor: 5,
        remaining: 5,
      });
      expect(result.current.previewOf('paused', 5)).toEqual({ sum: 5, state: 'done' });
    });

    it('orders a time-overridden row by the time the user typed (B3)', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await log(result, 'h1', 3);
      await log(result, 'h1', 4, { timestamp: `${TODAY}T02:00:00.000Z` });

      const stamps = habitFeed(result.current).map((item) => item.entry.timestamp);
      expect(stamps[0]).toBe(`${TODAY}T02:00:00.000Z`);
      expect([...stamps].sort()).toEqual(stamps);
      // `date` is unchanged by the override — the row is still today's (§3.3).
      expect(habitFeed(result.current).every((item) => item.entry.date === TODAY)).toBe(true);
      expect(dayOf(result.current, 'h1')?.sum).toBe(7);
    });
  });
  describe('the target nudge (C7a)', () => {
    it('stays silent below the floor and fires once the day is floor-met', async () => {
      // No target at all — the habit that C7a is nudging.
      const result = await todayScreen(
        new LocalRepository(await seed([habit({ target: undefined })])),
      );

      expect(rowOf(result.current, 'h1').suggestTarget).toBe(false);

      await log(result, 'h1', 2);
      expect(dayOf(result.current, 'h1')?.state).toBe('partial');
      expect(rowOf(result.current, 'h1').suggestTarget).toBe(false);

      await log(result, 'h1', 3);
      expect(dayOf(result.current, 'h1')?.state).toBe('done');
      expect(rowOf(result.current, 'h1').suggestTarget).toBe(true);
    });

    it('stays silent when a valid target already exists', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await log(result, 'h1', 5);

      expect(dayOf(result.current, 'h1')?.state).toBe('done');
      expect(rowOf(result.current, 'h1').suggestTarget).toBe(false);
    });

    it('treats a corrupt target <= floor as no target, mirroring §4.1', async () => {
      const result = await todayScreen(
        new LocalRepository(await seed([habit({ floor: 5, target: 3 })])),
      );

      await log(result, 'h1', 5);

      // `classifyDay` ignores that target, so the nudge must read it the same way.
      expect(dayOf(result.current, 'h1')?.state).toBe('done');
      expect(rowOf(result.current, 'h1').suggestTarget).toBe(true);
    });

    it('never nudges a binary habit, which has no amount to target', async () => {
      const result = await todayScreen(new LocalRepository(await seed([binary()])));

      await log(result, 'b1', 1);

      expect(dayOf(result.current, 'b1')?.state).toBe('done');
      expect(rowOf(result.current, 'b1').suggestTarget).toBe(false);
    });
  });

  it('throws rather than dropping a log for a habit it cannot resolve', async () => {
    const result = await todayScreen(new LocalRepository(await seed([habit()])));

    await expect(result.current.logActivity('nobody', 5)).rejects.toThrow(/nobody/);
  });
  describe('the skip path (§6.2 B5)', () => {
    it('makes the day a skip, carries the reason and shows the row in the feed', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await logSkip(result, rowOf(result.current, 'h1').habit, 'cue');

      expect(dayOf(result.current, 'h1')?.state).toBe('skip');
      expect(rowOf(result.current, 'h1').skipReasonToday).toBe('cue');
      // A skip is a record, so it belongs in the day's log — but it completed nothing.
      expect(result.current.logCount).toBe(1);
      expect(habitFeed(result.current)[0].entry.skipReason).toBe('cue');
      expect(result.current.questsDone).toBe(0);
    });

    it('does not count an exception skip as a miss', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await logSkip(result, rowOf(result.current, 'h1').habit, 'exception');

      // The domain owns that rule; this asserts it survives the trip to the screen.
      expect(dayOf(result.current, 'h1')?.isMiss).toBe(false);
    });

    it('does count a cue skip as a miss', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await logSkip(result, rowOf(result.current, 'h1').habit, 'cue');

      expect(dayOf(result.current, 'h1')?.isMiss).toBe(true);
    });

    it('carries an optional note without changing the day', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await logSkip(result, rowOf(result.current, 'h1').habit, 'floor', { note: '너무 피곤했어요' });

      expect(habitFeed(result.current)[0].entry.note).toBe('너무 피곤했어요');
      expect(dayOf(result.current, 'h1')?.state).toBe('skip');
    });

    it('leaves the composer offering the whole minimum, since a skip is not activity', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await logSkip(result, rowOf(result.current, 'h1').habit, 'identity');

      const row = rowOf(result.current, 'h1');
      expect(row.hasActivityToday).toBe(false);
      expect(row.oneTapAmount).toBe(5);
      // `actual: 0` is not a legal staged amount and must never become a default.
      expect(row.defaultAmount).toBe(5);
      expect(row.quickChips).toEqual([1, 5]);
      expect(row.progress.sum).toBe(0);
    });

    it('lets an activity log override a skip already recorded today (§4.1)', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await logSkip(result, rowOf(result.current, 'h1').habit, 'floor');
      await log(result, 'h1', 5);

      expect(dayOf(result.current, 'h1')?.state).toBe('done');
      expect(rowOf(result.current, 'h1').skipReasonToday).toBeUndefined();
      expect(result.current.questsDone).toBe(1);
      // Both rows are facts and both stay (§3.3, append-only).
      expect(result.current.logCount).toBe(2);
    });
  });

  describe('row edit and delete (#13)', () => {
    async function seedRow(
      repository: HabitRepository,
      over: Partial<HabitEntry> = {},
    ): Promise<HabitEntry> {
      const row: HabitEntry = {
        id: 'r1',
        habitId: 'h1',
        date: TODAY,
        timestamp: `${TODAY}T07:00:00.000Z`,
        actual: 2,
        ...over,
      };
      await repository.upsertEntry(row);
      return row;
    }

    it('edits the tapped row in place and reclassifies the day (AC 1)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const row = await seedRow(repository);
      const result = await todayScreen(repository);

      expect(dayOf(result.current, 'h1')?.state).toBe('partial');

      await act(async () => {
        await result.current.editEntry({ ...row, actual: 5 });
      });

      // One row still, and the day recomputed from it — nothing stored a state.
      expect(result.current.feed).toHaveLength(1);
      expect(result.current.logCount).toBe(1);
      expect(dayOf(result.current, 'h1')?.state).toBe('done');
      expect(result.current.xpToday).toBe(TUNING.xpPerFloorCompletion);
    });

    it('turns that row into a skip and back, on the same row (AC 2)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const row = await seedRow(repository);
      const result = await todayScreen(repository);

      await act(async () => {
        await result.current.editEntry({ ...row, actual: 0, skipReason: 'cue', note: '깜빡' });
      });

      expect(result.current.feed).toHaveLength(1);
      expect(dayOf(result.current, 'h1')?.state).toBe('skip');
      expect(rowOf(result.current, 'h1').skipReasonToday).toBe('cue');
      expect(habitFeed(result.current)[0].entry.note).toBe('깜빡');

      await act(async () => {
        await result.current.editEntry({ ...row, actual: 3 });
      });

      expect(result.current.feed).toHaveLength(1);
      expect(dayOf(result.current, 'h1')?.state).toBe('partial');
      expect(habitFeed(result.current)[0].entry.skipReason).toBeUndefined();
    });

    it('deletes a row and reverts the day, with no undo toast (AC 4, D5)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const row = await seedRow(repository);
      const result = await todayScreen(repository);

      await act(async () => {
        await result.current.removeEntry(row.id);
      });

      expect(result.current.feed).toEqual([]);
      expect(dayOf(result.current, 'h1')?.state).toBe('pending');
      expect(result.current.toast).toBeNull();
    });

    describe('deletePreview — when the delete needs a confirm (D2)', () => {
      it('is null while another row of that habit\u2019s day survives (AC 4)', async () => {
        const repository = new LocalRepository(await seed([habit()]));
        await seedRow(repository);
        await seedRow(repository, { id: 'r2', timestamp: `${TODAY}T08:00:00.000Z` });
        const result = await todayScreen(repository);

        expect(result.current.deletePreview('r1')).toBeNull();
        expect(result.current.deletePreview('r2')).toBeNull();
      });

      it('is null for an id the feed does not hold', async () => {
        const result = await todayScreen(new LocalRepository(await seed([habit()])));

        expect(result.current.deletePreview('nobody')).toBeNull();
      });

      it('warns on the day\u2019s last row, and says today falls back to pending (AC 5)', async () => {
        const repository = new LocalRepository(await seed([habit()]));
        await seedRow(repository);
        const result = await todayScreen(repository);

        const effect = result.current.deletePreview('r1');
        expect(effect?.emptiesDay).toBe(true);
        expect(effect?.carriesMiss).toBe(false);
        expect(effect?.habit.id).toBe('h1');
        // Not `missed`, and no broken streak: today is still open (ADR-0001). The
        // `missed` reversal belongs to a screen holding past-dated rows (#15).
        expect(effect?.stateAfter).toBe('pending');
      });

      it('counts rows per habit, so another habit\u2019s row is no company (AC 5)', async () => {
        const repository = new LocalRepository(await seed([habit(), binary()]));
        await seedRow(repository);
        await seedRow(repository, { id: 'r2', habitId: 'b1', actual: 1 });
        const result = await todayScreen(repository);

        // Two rows in the feed, but each is the last row of *its* habit's day.
        expect(result.current.feed).toHaveLength(2);
        expect(result.current.deletePreview('r1')?.emptiesDay).toBe(true);
        expect(result.current.deletePreview('r2')?.emptiesDay).toBe(true);
        expect(result.current.deletePreview('r2')?.habit.id).toBe('b1');
      });

      it('warns when the delete erases the day\u2019s recorded miss (AC 6)', async () => {
        const repository = new LocalRepository(await seed([habit()]));
        await seedRow(repository, { actual: 0, skipReason: 'cue' });
        const result = await todayScreen(repository);

        const effect = result.current.deletePreview('r1');
        expect(effect?.carriesMiss).toBe(true);
        expect(effect?.stateAfter).toBe('pending');
      });

      it('warns on a miss-carrying skip even when another row survives (AC 6)', async () => {
        const repository = new LocalRepository(await seed([habit()]));
        // Latest intent wins (§4.1), so the day reads `cue` — a miss. Deleting that row
        // leaves the `exception` skip, which is no miss: the miss really is erased, and
        // this is AC 6 firing with `emptiesDay` false.
        await seedRow(repository, { actual: 0, skipReason: 'exception' });
        await seedRow(repository, {
          id: 'r2',
          actual: 0,
          skipReason: 'cue',
          timestamp: `${TODAY}T08:00:00.000Z`,
        });
        const result = await todayScreen(repository);

        expect(dayOf(result.current, 'h1')?.isMiss).toBe(true);
        const effect = result.current.deletePreview('r2');
        expect(effect?.emptiesDay).toBe(false);
        expect(effect?.carriesMiss).toBe(true);
        expect(effect?.stateAfter).toBe('skip');
      });

      it('stays silent when the surviving skip keeps the day a miss', async () => {
        const repository = new LocalRepository(await seed([habit()]));
        await seedRow(repository, { actual: 0, skipReason: 'cue' });
        await seedRow(repository, {
          id: 'r2',
          actual: 0,
          skipReason: 'floor',
          timestamp: `${TODAY}T08:00:00.000Z`,
        });
        const result = await todayScreen(repository);

        // The question is whether the delete *erases* the miss, not whether the day is
        // one. Warning here would claim a loss the very next line ("지운 뒤 오늘: 못 함")
        // contradicts.
        expect(dayOf(result.current, 'h1')?.isMiss).toBe(true);
        expect(result.current.deletePreview('r1')).toBeNull();
        expect(result.current.deletePreview('r2')).toBeNull();
      });

      it('does not warn for an exception skip, which is no miss at all (ADR-0001)', async () => {
        const repository = new LocalRepository(await seed([habit()]));
        await seedRow(repository, { actual: 0, skipReason: 'exception' });
        await seedRow(repository, {
          id: 'r2',
          actual: 0,
          skipReason: 'exception',
          timestamp: `${TODAY}T08:00:00.000Z`,
        });
        const result = await todayScreen(repository);

        // `isMissDay` owns that rule; re-testing the reason here is what would lose it.
        expect(result.current.deletePreview('r1')).toBeNull();
      });

      it('still warns on the last row of an exception-skip day, on emptiesDay alone', async () => {
        const repository = new LocalRepository(await seed([habit()]));
        await seedRow(repository, { actual: 0, skipReason: 'exception' });
        const result = await todayScreen(repository);

        const effect = result.current.deletePreview('r1');
        expect(effect?.emptiesDay).toBe(true);
        expect(effect?.carriesMiss).toBe(false);
      });

      it('leaves stateAfter undefined when the emptied day is paused (ADR-0003)', async () => {
        const repository = new LocalRepository(
          await seed([habit({ id: 'h1', lifecycle: 'paused', pauses: [{ from: TODAY }] })]),
        );
        await seedRow(repository);
        const result = await todayScreen(repository);

        const effect = result.current.deletePreview('r1');
        expect(effect?.emptiesDay).toBe(true);
        // The engine has no opinion about an empty paused day, so the screen must not
        // claim one either.
        expect(effect?.stateAfter).toBeUndefined();
      });
    });
  });

  /**
   * #14 — the date control (§6.2 B4) and the §6.3 backfill write rules.
   *
   * Every judgment the stepper makes is asserted here rather than on the screen: no
   * component render tests exist and `testMatch` is `<rootDir>/src/**`, so anything
   * decided in `app/today.tsx` is decided where nothing can reach it (D2).
   */
  describe('the date control and backfill (#14)', () => {
    const YESTERDAY = addDays(TODAY, -1);
    /** The habit fixture's own creation date — the stepper's lower bound (D3). */
    const CREATED = addDays(TODAY, -3);

    async function screenOn(repository: HabitRepository, date: string, now = stepClock()) {
      const { result } = renderHook(() => useToday({ today: TODAY, date, now }), {
        wrapper: wrapperFor(repository),
      });
      await waitFor(() => expect(result.current.loading).toBe(false));
      return result;
    }

    async function rowsFor(repository: HabitRepository, date: string): Promise<HabitEntry[]> {
      return repository.getEntries('h1', date, date);
    }

    /**
     * A **local** wall-clock stamp on `date`. The backfill pin is local noon, so an
     * assertion written as a `Z` literal would hold only where the offset is zero.
     */
    function atLocal(date: string, hour: number, minute = 0): string {
      const [year, month, day] = date.split('-').map(Number);
      return new Date(year, month - 1, day, hour, minute).toISOString();
    }
    const noonOn = (date: string) => atLocal(date, 12);

    it('reads the chosen date while today still decides pending vs missed (D1, ADR-0001)', async () => {
      const repository = new LocalRepository(await seed([habit()]));

      // The same empty habit, seen from two dates: today is still open, yesterday is a
      // recorded failure. Passing `date` as the classifier's "today" would make both
      // pending and repeal ADR-0001 silently.
      expect(dayOf((await screenOn(repository, TODAY)).current, 'h1')?.state).toBe('pending');
      expect(dayOf((await screenOn(repository, YESTERDAY)).current, 'h1')?.state).toBe('missed');
    });

    it('defaults to today, with the forward step dead and 어제 one tap away (AC 1, AC 2)', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));
      const control = result.current.dateControl;

      expect(result.current.date).toBe(TODAY);
      expect(control).toMatchObject({
        kind: 'today',
        isBackfill: false,
        // §6.3 — the future is blocked, so there is nowhere forward to go.
        nextDate: null,
        prevDate: YESTERDAY,
        yesterdayDate: YESTERDAY,
        earliest: CREATED,
      });
    });

    it('steps back to createdAt and no further, and names yesterday as yesterday (AC 2)', async () => {
      const repository = new LocalRepository(await seed([habit()]));

      const onYesterday = (await screenOn(repository, YESTERDAY)).current.dateControl;
      expect(onYesterday).toMatchObject({
        kind: 'yesterday',
        isBackfill: true,
        prevDate: addDays(TODAY, -2),
        nextDate: TODAY,
      });

      const onCreated = (await screenOn(repository, CREATED)).current.dateControl;
      // The lower bound is the habit's creation date: `‹` is dead on it.
      expect(onCreated).toMatchObject({ kind: 'other', prevDate: null, nextDate: addDays(CREATED, 1) });
    });

    it('takes the earliest createdAt on screen as the lower bound and hides habits younger than the date (D3)', async () => {
      const young = binary({ createdAt: `${YESTERDAY}T09:00:00.000Z` });
      const repository = new LocalRepository(await seed([habit(), young]));

      const onYesterday = await screenOn(repository, YESTERDAY);
      expect(onYesterday.current.rows.map((row) => row.habit.id)).toEqual(['h1', 'b1']);
      // The union, not the per-habit bound: the older habit is still steppable past the
      // younger one's creation date.
      expect(onYesterday.current.dateControl.earliest).toBe(CREATED);

      const onCreated = await screenOn(repository, CREATED);
      // `b1` did not exist yet, so it is absent rather than shown inert
      // (`design/parts/Backfill.body.html:90` is the copy that explains the absence).
      expect(onCreated.current.rows.map((row) => row.habit.id)).toEqual(['h1']);
    });

    it('leaves the whole stepper dead on a habit created today — day one of an install (D3)', async () => {
      const repository = new LocalRepository(
        await seed([habit({ createdAt: `${TODAY}T09:00:00.000Z` })]),
      );
      const result = await screenOn(repository, TODAY);

      // AC 1's one-tap 어제 is unavailable here, and correctly so: there is no yesterday
      // to write into. The chip is dead rather than a no-op (§6.3 blocks it either way).
      expect(result.current.dateControl).toMatchObject({
        earliest: TODAY,
        prevDate: null,
        nextDate: null,
        yesterdayDate: null,
      });
    });

    it('measures the day’s XP against the whole run, so a backfill is worth something (D1)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await screenOn(repository, YESTERDAY);

      expect(result.current.xpToday).toBe(0);

      await log(result, 'h1', 5);

      // The figure is `computeXP`'s (proven in `score.test.ts`); what is asserted here
      // is that the delta is taken over the *selected* day's rows, not silently over
      // today's — a backfilled day would otherwise always read +0 XP.
      expect(result.current.xpToday).toBeGreaterThan(0);
    });

    it('pins the stepper to today when there are no habits at all (D3)', async () => {
      const result = await todayScreen(new LocalRepository(new MemoryKV()));

      expect(result.current.dateControl).toMatchObject({
        earliest: TODAY,
        prevDate: null,
        nextDate: null,
        yesterdayDate: null,
      });
    });

    it('stamps a past-date log at noon and appends beside the day’s existing rows (AC 3, AC 4)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const existing: HabitEntry = {
        id: 'old',
        habitId: 'h1',
        date: YESTERDAY,
        timestamp: atLocal(YESTERDAY, 9),
        actual: 2,
      };
      await repository.upsertEntry(existing);

      const result = await screenOn(repository, YESTERDAY);
      await log(result, 'h1', 5);

      const stored = await rowsFor(repository, YESTERDAY);
      expect(stored).toHaveLength(2);
      // The pre-existing row is untouched — backfill appends, never overwrites (§6.3).
      expect(stored.find((row) => row.id === 'old')).toEqual(existing);
      const added = stored.find((row) => row.id !== 'old');
      expect(added?.date).toBe(YESTERDAY);
      // Local noon, not the clock the user is sitting at: the 09:00 row above must not
      // be outranked by the hour of the backfill (§7.3's total order), and the feed
      // reads the stamp back with `getHours()`.
      expect(added?.timestamp).toBe(noonOn(YESTERDAY));
      expect(new Date(added!.timestamp).getHours()).toBe(12);
      expect(added?.actual).toBe(5);
    });

    it('gives repeated backfills of one date strictly increasing sub-noon offsets (AC 3)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await screenOn(repository, YESTERDAY);

      await log(result, 'h1', 1);
      await log(result, 'h1', 1);

      const stamps = (await rowsFor(repository, YESTERDAY)).map((row) => row.timestamp).sort();
      expect(stamps).toEqual([
        noonOn(YESTERDAY),
        new Date(Date.parse(noonOn(YESTERDAY)) + 1_000).toISOString(),
      ]);
    });

    it('ignores the B3 time override on a backfill and keeps using the clock on today (D4)', async () => {
      const repository = new LocalRepository(await seed([habit()]));

      const past = await screenOn(repository, YESTERDAY);
      await log(past, 'h1', 5, { timestamp: atLocal(YESTERDAY, 21) });
      // The noon pin is the sole basis of the day's total order, so a wall clock cannot
      // override it — the canvas puts the same sentence on the control
      // (`design/parts/Backfill.logic.js:81`).
      expect((await rowsFor(repository, YESTERDAY))[0].timestamp).toBe(noonOn(YESTERDAY));

      const present = await screenOn(repository, TODAY, stepClock());
      await log(present, 'h1', 5);
      expect((await rowsFor(repository, TODAY))[0].timestamp).toBe(`${TODAY}T09:00:00.000Z`);
    });

    it('recovers a missed day: one backfilled log reclassifies it to done (AC 8a)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await screenOn(repository, YESTERDAY);

      expect(dayOf(result.current, 'h1')?.state).toBe('missed');
      expect(dayOf(result.current, 'h1')?.isMiss).toBe(true);

      await log(result, 'h1', 5);

      expect(dayOf(result.current, 'h1')?.state).toBe('done');
      expect(dayOf(result.current, 'h1')?.isMiss).toBe(false);
      expect(result.current.questsDone).toBe(1);
    });

    it('reason-tags a past day with a noon-pinned skip row (AC 4)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await screenOn(repository, YESTERDAY);

      await logSkip(result, habit(), 'cue', { note: '깜빡' });

      const [row] = await rowsFor(repository, YESTERDAY);
      expect(row).toMatchObject({
        date: YESTERDAY,
        timestamp: noonOn(YESTERDAY),
        actual: 0,
        skipReason: 'cue',
        note: '깜빡',
      });
      expect(dayOf(result.current, 'h1')?.state).toBe('skip');
    });

    it('flags only the rows that actually carry the noon pin, row by row (AC 4)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      // A real 09:00 log on the same past day. Its time column reads 09:00, so the
      // 「낮 12시로 남음」 note must not appear beside it.
      await repository.upsertEntry({
        id: 'morning',
        habitId: 'h1',
        date: YESTERDAY,
        timestamp: atLocal(YESTERDAY, 9),
        actual: 2,
      });
      const result = await screenOn(repository, YESTERDAY);
      await log(result, 'h1', 5);

      const byId = new Map(habitFeed(result.current).map((item) => [item.entry.id, item]));
      expect(byId.get('morning')?.backfilled).toBe(false);
      expect([...byId.values()].filter((item) => item.backfilled)).toHaveLength(1);
    });

    it('never flags a row on today, even one logged at noon sharp', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      await repository.upsertEntry({
        id: 'noon',
        habitId: 'h1',
        date: TODAY,
        timestamp: noonOn(TODAY),
        actual: 5,
      });
      const result = await screenOn(repository, TODAY);

      // Today holds nothing to have backfilled, so the stamp says nothing about how the
      // row was written.
      expect(habitFeed(result.current)[0].backfilled).toBe(false);
    });

    it('keeps a backfilled row’s noon pin through an edit of its amount and note', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await screenOn(repository, YESTERDAY);
      await log(result, 'h1', 5);

      const before = habitFeed(result.current)[0].entry;
      await act(async () => {
        await result.current.editEntry({ ...before, actual: 9, note: '고침' });
      });

      const after = habitFeed(result.current)[0];
      expect(after.entry.actual).toBe(9);
      expect(after.entry.note).toBe('고침');
      // The stamp is the day's total order (§7.3), not an editable field of the row —
      // `EntryEditor` withholds the time reveal on such a row for this reason.
      expect(after.entry.timestamp).toBe(noonOn(YESTERDAY));
      expect(after.backfilled).toBe(true);
    });

    /**
     * AC 9 — the composer must not carry one day's staged answer onto another. The
     * screen remounts it on `${habit.id}:${date}`, which no test can see; what a test
     * *can* see is that the values the composer prefills itself from are the chosen
     * day's, so a stale note or amount has nothing to be seeded from.
     */
    it('derives the composer’s prefill and skip reason from the chosen date, not from today (AC 9)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      await repository.upsertEntry({
        id: 's1',
        habitId: 'h1',
        date: YESTERDAY,
        timestamp: noonOn(YESTERDAY),
        actual: 0,
        skipReason: 'cue',
      });
      await repository.upsertEntry({
        id: 'a1',
        habitId: 'h1',
        date: TODAY,
        timestamp: `${TODAY}T09:00:00.000Z`,
        actual: 3,
      });

      const onYesterday = rowOf((await screenOn(repository, YESTERDAY)).current, 'h1');
      expect(onYesterday.skipReasonToday).toBe('cue');
      expect(onYesterday.defaultAmount).toBe(5);

      const onToday = rowOf((await screenOn(repository, TODAY)).current, 'h1');
      expect(onToday.skipReasonToday).toBeUndefined();
      expect(onToday.defaultAmount).toBe(3);
    });
  });
  /**
   * Free logs (#16). Every negative assertion here is paired with a positive one: a
   * `FreeLog` is not a `HabitEntry`, so "write a free log, expect `xpToday` unchanged"
   * would pass with the whole feature deleted. Each test therefore also asserts that
   * the log **landed** in the feed.
   */
  describe('free logs (#16)', () => {
    const YESTERDAY = addDays(TODAY, -1);

    async function screenOn(repository: HabitRepository, date: string, now = stepClock()) {
      const { result } = renderHook(() => useToday({ today: TODAY, date, now }), {
        wrapper: wrapperFor(repository),
      });
      await waitFor(() => expect(result.current.loading).toBe(false));
      return result;
    }

    /**
     * The feed's free lines. Keyed by `id` rather than read by position wherever the
     * two kinds' order is what is under test — a `Z` stamp and a local-noon pin sort
     * differently under `TZ=Asia/Seoul`.
     */
    function freeFeed(view: TodayView): TodayFreeFeedItem[] {
      return view.feed.filter((item): item is TodayFreeFeedItem => item.kind === 'free');
    }

    /** A stored free log, written straight through the repository. */
    async function seedFree(
      repository: HabitRepository,
      over: Partial<FreeLog> = {},
    ): Promise<FreeLog> {
      const log: FreeLog = {
        id: 'f1',
        date: TODAY,
        // An explicit UTC stamp, never `localNoonOn`: the §6.3 noon pin is
        // `HabitEntry`-typed, so free logs have no such convention, and borrowing one
        // is how the row's day drifts off the `date` the assertion is about.
        timestamp: `${TODAY}T08:00:00.000Z`,
        type: 'mood',
        text: '아침 공기가 좋았다',
        ...over,
      };
      await repository.upsertFreeLog(log);
      return log;
    }

    it('writes a free log on today, unlinked to any habit, with its type label (AC 1, AC 2)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await todayScreen(repository);

      await act(async () => {
        await result.current.logFree('idea', '  러닝 앱을 만들어 볼까  ');
      });

      const free = freeFeed(result.current);
      expect(free).toHaveLength(1);
      expect(free[0].log.type).toBe('idea');
      expect(free[0].log.text).toBe('러닝 앱을 만들어 볼까');
      // §3.4 — `date` is stated at creation and is what groups the day.
      expect(free[0].log.date).toBe(TODAY);
      expect(free[0].label).toBe('떠오른 생각');
      // AC 2 — there is no habit link to have set, on the row or on the feed item.
      expect(Object.keys(free[0].log).sort()).toEqual(['date', 'id', 'text', 'timestamp', 'type']);
      expect(free[0]).not.toHaveProperty('habit');
    });

    it('interleaves free logs and habit rows in one chronological list (AC 3)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await todayScreen(repository);

      // Written out of order, and all four stamps are `Z` literals so the order under
      // test is the domain's and not the runner's timezone.
      await log(result, 'h1', 5, { timestamp: `${TODAY}T09:00:00.000Z` });
      await act(async () => {
        await result.current.logFree('mood', '점심 먹고 나른함', {
          timestamp: `${TODAY}T13:00:00.000Z`,
        });
      });
      await act(async () => {
        await result.current.logFree('note', '아침 메모', { timestamp: `${TODAY}T07:00:00.000Z` });
      });
      await log(result, 'h1', 2, { timestamp: `${TODAY}T11:00:00.000Z` });

      expect(result.current.feed.map((item) => item.kind)).toEqual([
        'free',
        'habit',
        'habit',
        'free',
      ]);
      expect(
        result.current.feed.map((item) =>
          item.kind === 'free' ? item.log.timestamp : item.entry.timestamp,
        ),
      ).toEqual([
        `${TODAY}T07:00:00.000Z`,
        `${TODAY}T09:00:00.000Z`,
        `${TODAY}T11:00:00.000Z`,
        `${TODAY}T13:00:00.000Z`,
      ]);
    });

    it('breaks a tie between a habit row and a free log by id, not by kind (§7.3)', async () => {
      // The same instant for both rows, so the `id` half of `(timestamp ASC, id ASC)`
      // is the only thing deciding the order. Run twice with the ids swapped: a merge
      // that always put one kind first would satisfy exactly one of the two.
      const at = `${TODAY}T10:00:00.000Z`;

      async function feedIdsWith(entryId: string, logId: string): Promise<string[]> {
        const repository = new LocalRepository(await seed([habit()]));
        await repository.upsertEntry({
          id: entryId,
          habitId: 'h1',
          date: TODAY,
          timestamp: at,
          actual: 5,
        });
        await seedFree(repository, { id: logId, timestamp: at });
        const result = await screenOn(repository, TODAY);
        return result.current.feed.map(feedItemId);
      }

      expect(await feedIdsWith('a-row', 'z-log')).toEqual(['a-row', 'z-log']);
      expect(await feedIdsWith('z-row', 'a-log')).toEqual(['a-log', 'z-row']);
    });

    it('counts as a log while touching no XP, no quest and no day state (AC 4)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await todayScreen(repository);
      expect(dayOf(result.current, 'h1')?.state).toBe('pending');

      await act(async () => {
        await result.current.logFree('win', '엘리베이터 대신 계단');
      });

      // It landed — without this half the assertions below pass with the whole
      // feature deleted.
      expect(freeFeed(result.current)).toHaveLength(1);
      // §6.2's tally is "quests done / **logs** / XP earned today", and a free log is
      // a log. The AC-4 exclusion list is XP·연속·하루 상태, none of which a count is.
      expect(result.current.logCount).toBe(1);

      expect(dayOf(result.current, 'h1')?.state).toBe('pending');
      expect(dayOf(result.current, 'h1')?.isMiss).toBe(false);
      expect(result.current.questsDone).toBe(0);
      expect(result.current.xpToday).toBe(0);
    });

    it('shows in a past day\u2019s feed without repairing it: a missed day stays missed (AC 4)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      await seedFree(repository, {
        id: 'past',
        date: YESTERDAY,
        timestamp: `${YESTERDAY}T21:00:00.000Z`,
        type: 'note',
        text: '어제 그냥 쉬었다',
      });
      const result = await screenOn(repository, YESTERDAY);

      // Reading a past day's free logs is unrestricted — only writing is
      // (`freeLogAvailable`).
      expect(freeFeed(result.current).map((item) => item.log.id)).toEqual(['past']);
      expect(result.current.logCount).toBe(1);

      // ADR-0001 — a day with no habit rows is `missed`, and a free log is not a
      // habit row. It repairs nothing.
      expect(dayOf(result.current, 'h1')?.state).toBe('missed');
      expect(dayOf(result.current, 'h1')?.isMiss).toBe(true);
      expect(dayOf(result.current, 'h1')?.entries).toEqual([]);
      expect(result.current.questsDone).toBe(0);
      expect(result.current.xpToday).toBe(0);
    });

    it('offers the free path on today only, while still reading a past day', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      await seedFree(repository, { id: 'past', date: YESTERDAY });

      const onToday = await todayScreen(repository);
      expect(onToday.current.freeLogAvailable).toBe(true);

      const onYesterday = await screenOn(repository, YESTERDAY);
      expect(onYesterday.current.freeLogAvailable).toBe(false);
      // The read is unaffected — the day's own free log is in its feed.
      expect(freeFeed(onYesterday.current).map((item) => item.log.id)).toEqual(['past']);

      await expect(onYesterday.current.logFree('note', '안 됨')).rejects.toThrow(
        /today-only/,
      );
      expect(await repository.getFreeLogs(YESTERDAY, YESTERDAY)).toHaveLength(1);
    });

    it('edits text, type and timestamp on the same row, keyed on id (AC 5, AC 7)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const stored = await seedFree(repository);
      const result = await screenOn(repository, TODAY);

      await act(async () => {
        await result.current.editFreeLog({
          ...stored,
          type: 'win',
          text: '  사실 오늘 잘한 일이었다  ',
          timestamp: `${TODAY}T18:00:00.000Z`,
        });
      });

      const free = freeFeed(result.current);
      // One row still — the upsert replaced it rather than spawning a duplicate.
      expect(free).toHaveLength(1);
      expect(free[0].log.id).toBe('f1');
      expect(free[0].log.type).toBe('win');
      // Trimmed on the edit path too, as on the write path — `useQuickLog`'s
      // "absent, not empty" convention, applied to the one field this row has.
      expect(free[0].log.text).toBe('사실 오늘 잘한 일이었다');
      expect(free[0].log.timestamp).toBe(`${TODAY}T18:00:00.000Z`);
      // The label is re-derived from the new type, not carried over from the old one.
      expect(free[0].label).toBe('잘한 일');
    });

    it('has nothing to confirm on a free log, while the day\u2019s last habit row still warns (AC 6)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      await seedFree(repository);
      await repository.upsertEntry({
        id: 'r1',
        habitId: 'h1',
        date: TODAY,
        timestamp: `${TODAY}T09:00:00.000Z`,
        actual: 5,
      });
      const result = await screenOn(repository, TODAY);

      // The free log is a live feed id, so `null` here is not merely the answer for an
      // id the feed does not hold — and the habit row proves the same day *does*
      // produce a warning, so the `null` is about the kind of row and nothing else.
      expect(freeFeed(result.current).map((item) => item.log.id)).toEqual(['f1']);
      expect(result.current.deletePreview('f1')).toBeNull();
      expect(result.current.deletePreview('r1')).not.toBeNull();
    });

    it('deletes immediately through removeFreeLog, which removeEntry refuses (AC 6)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      await seedFree(repository);
      const result = await screenOn(repository, TODAY);

      // `deleteEntry` scans the per-habit collections and no-ops on a miss, so a free
      // id sent down that path would silently do nothing. It throws instead.
      await expect(result.current.removeEntry('f1')).rejects.toThrow(/removeFreeLog/);
      expect(freeFeed(result.current)).toHaveLength(1);

      await act(async () => {
        await result.current.removeFreeLog('f1');
      });

      expect(result.current.feed).toEqual([]);
      expect(result.current.logCount).toBe(0);
      // No confirm to satisfy and no undo toast to press (AC 6).
      expect(result.current.toast).toBeNull();
      expect(await repository.getFreeLogs(TODAY, TODAY)).toEqual([]);
    });

    it('puts the user\u2019s text on the row\u2019s one note line, or the no-score note when there is none', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      await seedFree(repository, { id: 'said', text: '아침 공기가 좋았다' });
      await seedFree(repository, {
        id: 'silent',
        text: '',
        timestamp: `${TODAY}T08:30:00.000Z`,
      });
      const result = await screenOn(repository, TODAY);

      const notes = new Map(freeFeed(result.current).map((item) => [item.log.id, item.note]));
      // The canvas's feed row has one such slot (`design/parts/Today.body.html:88`),
      // filled with the text on one instance (`Today.logic.js:20`) and with the
      // no-score sentence on the other (`:196`) — alternatives, not two lines.
      expect(notes.get('said')).toBe('아침 공기가 좋았다');
      expect(notes.get('silent')).toBe(FREE_LOG_NO_TEXT_NOTE);
    });
  });

  /**
   * The composer's target selector (#16). What the options **are** and whether
   * a selection resolves to the free path are the hook's; which one is selected is the
   * screen's own UI state.
   */
  describe('the target selector', () => {
    const YESTERDAY = addDays(TODAY, -1);

    async function optionsOn(repository: HabitRepository, date: string) {
      const { result } = renderHook(() => useToday({ today: TODAY, date, now: stepClock() }), {
        wrapper: wrapperFor(repository),
      });
      await waitFor(() => expect(result.current.loading).toBe(false));
      return result;
    }

    it('offers the free tab first, then the habits, on a one-habit install', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await optionsOn(repository, TODAY);

      // Two options on the commonest screen there is: gating the selector on the
      // habits alone would hide the free path here (`Today.logic.js:135` puts it
      // first).
      expect(result.current.targetOptions).toEqual([
        { value: FREE_TARGET, label: '오늘 일기' },
        { value: 'h1', label: '팔굽혀펴기' },
      ]);
    });

    it('offers the free tab alone when there are no habits yet', async () => {
      const repository = new LocalRepository(await seed([]));
      const result = await optionsOn(repository, TODAY);

      expect(result.current.targetOptions).toEqual([
        { value: FREE_TARGET, label: '오늘 일기' },
      ]);
      // Nothing selected, and the free path is the only one there is.
      expect(result.current.resolvesToFree(null)).toBe(true);
    });

    it('withdraws the free tab on a past date, leaving the habits', async () => {
      const repository = new LocalRepository(await seed([habit(), binary()]));
      const result = await optionsOn(repository, YESTERDAY);

      expect(result.current.freeLogAvailable).toBe(false);
      expect(result.current.targetOptions.map((option) => option.value)).toEqual([
        'h1',
        'b1',
      ]);
    });

    it('refuses to resolve a free selection held across a step back to a past date', async () => {
      const repository = new LocalRepository(await seed([habit()]));

      const onToday = await optionsOn(repository, TODAY);
      expect(onToday.current.resolvesToFree(FREE_TARGET)).toBe(true);

      // The same selection the screen is still holding, on the day after the step: it
      // must not resolve to a composer the date has withdrawn, or the screen would
      // show no composer at all.
      const onYesterday = await optionsOn(repository, YESTERDAY);
      expect(onYesterday.current.resolvesToFree(FREE_TARGET)).toBe(false);
      // …and a habit that does exist on that date still resolves to its own composer.
      expect(onYesterday.current.resolvesToFree('h1')).toBe(false);
      expect(onYesterday.current.targetOptions.map((option) => option.value)).toEqual(['h1']);
    });

    it('resolves a habit selection to the habit path while free logs are available', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await optionsOn(repository, TODAY);

      // The positive half: `resolvesToFree` returning `false` for everything would
      // satisfy the two cases above on its own.
      expect(result.current.resolvesToFree('h1')).toBe(false);
      expect(result.current.resolvesToFree(FREE_TARGET)).toBe(true);
    });
  });
});
