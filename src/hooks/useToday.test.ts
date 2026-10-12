import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ComponentProps, type ReactNode } from 'react';

import { FREE_LOG_NO_TEXT_NOTE } from '@/config/copy';
import { TUNING } from '@/config/tuning';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository, type KVStore } from '@/data';
import { addDays } from '@/domain/dates';
import { localClock } from '@/lib/device';
import type { FreeLog, Habit, HabitEntry, SkipReason } from '@/models';

import {
  feedItemId,
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
    // `children` goes in as the third argument; the cast covers the prop it fills at runtime.
    const props = { repository } as ComponentProps<typeof RepositoryProvider>;
    return createElement(RepositoryProvider, props, children);
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
  opts?: { note?: string },
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

/** Habit cards whose floor is met — what the count chip counts. */
function floorMetCount(view: TodayView): number {
  return view.rows.filter((row) => row.floorMet).length;
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
    expect(floorMetCount(result.current)).toBe(0);
    expect(result.current.feed.length).toBe(0);
  });

  it('starts the day pending and recomputes it to done on a floor-sized log', async () => {
    const result = await todayScreen(new LocalRepository(await seed([habit()])));
    expect(dayOf(result.current, 'h1')?.state).toBe('pending');

    await log(result, 'h1', 5);

    // Nothing rendered the screen — recording alone reclassified the day (§4.1).
    expect(dayOf(result.current, 'h1')?.state).toBe('done');
    expect(dayOf(result.current, 'h1')?.sum).toBe(5);
    expect(dayOf(result.current, 'h1')?.isMiss).toBe(false);
    expect(floorMetCount(result.current)).toBe(1);
    expect(result.current.feed.length).toBe(1);
  });

  it('picks up a write made on another screen when reloaded (the tab stays mounted)', async () => {
    const repository = new LocalRepository(await seed([habit()]));
    const result = await todayScreen(repository);
    expect(dayOf(result.current, 'h1')?.state).toBe('pending');

    await repository.upsertEntry({
      id: 'elsewhere',
      habitId: 'h1',
      date: TODAY,
      timestamp: `${TODAY}T09:00:00.000Z`,
      actual: 5,
    });
    act(() => result.current.reload());

    await waitFor(() => expect(dayOf(result.current, 'h1')?.state).toBe('done'));
  });

  it('classifies a sub-floor amount as partial, which is not a miss', async () => {
    const result = await todayScreen(new LocalRepository(await seed([habit()])));

    await log(result, 'h1', 2);

    expect(dayOf(result.current, 'h1')?.state).toBe('partial');
    expect(dayOf(result.current, 'h1')?.isMiss).toBe(false);
    expect(floorMetCount(result.current)).toBe(0);
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
    expect(result.current.feed.length).toBe(2);
  });

  it('reaches over past the target, and an over day still counts as done', async () => {
    const result = await todayScreen(new LocalRepository(await seed([habit()])));

    await log(result, 'h1', 5);
    await log(result, 'h1', 4);

    expect(dayOf(result.current, 'h1')?.sum).toBe(9);
    expect(dayOf(result.current, 'h1')?.state).toBe('over');
    // `over` implies `done` (§4.1), so the tally must not lose the quest.
    expect(floorMetCount(result.current)).toBe(1);
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

    await log(result, 'b1', 1);

    // Two facts are kept, but the *day* is scored once (§4.1 / §4.2).
    expect(dayOf(result.current, 'b1')?.entries).toHaveLength(2);
    expect(dayOf(result.current, 'b1')?.state).toBe('done');
    expect(floorMetCount(result.current)).toBe(1);
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
    expect(result.current.feed.length).toBe(3);
  });

  it('does not show yesterday in the feed', async () => {
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

    await log(result, 'h1', 5);

    expect(result.current.feed).toHaveLength(1);
  });

  it('leaves archived and paused habits off the cards and the count chip (#127)', async () => {
    const repository = new LocalRepository(
      await seed([
        habit({ id: 'h1', name: '팔굽혀펴기' }),
        habit({ id: 'archived', name: '접은 습관', lifecycle: 'archived' }),
        habit({
          id: 'paused',
          name: '쉬는 습관',
          lifecycle: 'paused',
          pauses: [{ from: addDays(TODAY, -1) }],
        }),
      ]),
    );
    const result = await todayScreen(repository);

    expect(result.current.rows.map((row) => row.habit.id)).toEqual(['h1']);
    expect(result.current.countChip).toBe('✅ 1개 중 0개 했어요');

    // A row made for the paused habit elsewhere (Habit Detail) is still a record of today.
    await repository.upsertEntry({
      id: 'rested',
      habitId: 'paused',
      date: TODAY,
      timestamp: `${TODAY}T08:00:00.000Z`,
      actual: 5,
    });
    await act(async () => {
      result.current.reload();
    });

    await waitFor(() => expect(result.current.feed).toHaveLength(1));
    expect(result.current.rows.map((row) => row.habit.id)).toEqual(['h1']);
    expect(result.current.countChip).toBe('✅ 1개 중 0개 했어요');
  });
  describe('one-tap logging and undo (#11)', () => {
    it('undoes the row it just appended and reverts the day to pending', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await todayScreen(repository);

      await log(result, 'h1', 5);
      expect(dayOf(result.current, 'h1')?.state).toBe('done');
      expect(result.current.toast?.detail).toBe(`+5reps · 별 +${TUNING.xpPerFloorCompletion}`);

      await act(async () => {
        await result.current.undoLast();
      });

      expect(dayOf(result.current, 'h1')?.state).toBe('pending');
      expect(result.current.feed.length).toBe(0);
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

    it('appends a second record rather than overwriting the first (§3.3)', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await log(result, 'h1', rowOf(result.current, 'h1').defaultAmount);
      await log(result, 'h1', rowOf(result.current, 'h1').defaultAmount);

      const day = dayOf(result.current, 'h1');
      expect(day?.entries).toHaveLength(2);
      expect(day?.entries.map((e) => e.actual)).toEqual([5, 5]);
      expect(day?.sum).toBe(10);
      expect(result.current.feed.length).toBe(2);
    });

    it('flips hasActivityToday after the day\u2019s first record', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      expect(rowOf(result.current, 'h1').hasActivityToday).toBe(false);

      await log(result, 'h1', 5);

      expect(rowOf(result.current, 'h1').hasActivityToday).toBe(true);
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
      // `actual: 0` is not a legal staged amount, so it must never become the default.
      expect(rowOf(result.current, 'h1').defaultAmount).toBe(5);
    });

    it('keeps a binary habit at an amount of 1', async () => {
      const result = await todayScreen(new LocalRepository(await seed([binary()])));

      expect(rowOf(result.current, 'b1').defaultAmount).toBe(1);

      await log(result, 'b1', 1);

      expect(result.current.toast?.detail).toBe(`✓ 했어요 · 별 +${TUNING.xpPerFloorCompletion}`);
      expect(rowOf(result.current, 'b1').defaultAmount).toBe(1);
    });
  });

  describe('smart defaults and progress (#11)', () => {
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
      expect(result.current.feed.length).toBe(1);
      expect(habitFeed(result.current)[0].entry.skipReason).toBe('cue');
      expect(floorMetCount(result.current)).toBe(0);
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

    it('carries the note typed beside an activity amount (#77)', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await log(result, 'h1', 3, { note: '아침에 읽음' });

      expect(habitFeed(result.current)[0].entry.note).toBe('아침에 읽음');
    });

    it('leaves the composer offering the whole minimum, since a skip is not activity', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await logSkip(result, rowOf(result.current, 'h1').habit, 'identity');

      const row = rowOf(result.current, 'h1');
      expect(row.hasActivityToday).toBe(false);
      // `actual: 0` is not a legal staged amount and must never become a default.
      expect(row.defaultAmount).toBe(5);
      expect(row.progress.sum).toBe(0);
    });

    it('lets an activity log override a skip already recorded today (§4.1)', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await logSkip(result, rowOf(result.current, 'h1').habit, 'floor');
      await log(result, 'h1', 5);

      expect(dayOf(result.current, 'h1')?.state).toBe('done');
      expect(rowOf(result.current, 'h1').skipReasonToday).toBeUndefined();
      expect(floorMetCount(result.current)).toBe(1);
      // Both rows are facts and both stay (§3.3, append-only).
      expect(result.current.feed.length).toBe(2);
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
      expect(result.current.feed.length).toBe(1);
      expect(dayOf(result.current, 'h1')?.state).toBe('done');
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

    it('recovers a missed day: one backfilled log reclassifies it to done (AC 8a)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await screenOn(repository, YESTERDAY);

      expect(dayOf(result.current, 'h1')?.state).toBe('missed');
      expect(dayOf(result.current, 'h1')?.isMiss).toBe(true);

      await log(result, 'h1', 5);

      expect(dayOf(result.current, 'h1')?.state).toBe('done');
      expect(dayOf(result.current, 'h1')?.isMiss).toBe(false);
      expect(floorMetCount(result.current)).toBe(1);
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
   * `FreeLog` is not a `HabitEntry`, so "write a free log, expect the day unchanged"
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
      // The habit rows take the hook's clock, the free logs their own stamp.
      let clock = '09:00';
      const result = await todayScreen(repository, () => new Date(`${TODAY}T${clock}:00.000Z`));

      // Written out of order, and all four stamps are `Z` literals so the order under
      // test is the domain's and not the runner's timezone.
      await log(result, 'h1', 5);
      await act(async () => {
        await result.current.logFree('mood', '점심 먹고 나른함', {
          timestamp: `${TODAY}T13:00:00.000Z`,
        });
      });
      await act(async () => {
        await result.current.logFree('note', '아침 메모', { timestamp: `${TODAY}T07:00:00.000Z` });
      });
      clock = '11:00';
      await log(result, 'h1', 2);

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

    it('counts as a record while touching no floor and no day state (AC 4)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await todayScreen(repository);
      expect(dayOf(result.current, 'h1')?.state).toBe('pending');

      await act(async () => {
        await result.current.logFree('win', '엘리베이터 대신 계단');
      });

      // It landed — without this half the assertions below pass with the whole
      // feature deleted.
      expect(freeFeed(result.current)).toHaveLength(1);
      // A free log is a record, so it counts in "오늘 기록 N개".
      expect(result.current.foldLabel).toBe('오늘 기록 1개');

      expect(dayOf(result.current, 'h1')?.state).toBe('pending');
      expect(dayOf(result.current, 'h1')?.isMiss).toBe(false);
      expect(floorMetCount(result.current)).toBe(0);
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
      expect(result.current.feed.length).toBe(1);

      // ADR-0001 — a day with no habit rows is `missed`, and a free log is not a
      // habit row. It repairs nothing.
      expect(dayOf(result.current, 'h1')?.state).toBe('missed');
      expect(dayOf(result.current, 'h1')?.isMiss).toBe(true);
      expect(dayOf(result.current, 'h1')?.entries).toEqual([]);
      expect(floorMetCount(result.current)).toBe(0);
    });

    it('refuses a write on a past date while its existing free logs still read', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      await seedFree(repository, { id: 'past', date: YESTERDAY });

      const onYesterday = await screenOn(repository, YESTERDAY);
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
      expect(result.current.feed.length).toBe(0);
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

  /** A screen whose date the test can step, on **one** hook instance. */
  async function steppableScreen(repository: HabitRepository, now = stepClock()) {
    const view = renderHook(({ date }: { date: string }) => useToday({ today: TODAY, date, now }), {
      wrapper: wrapperFor(repository),
      initialProps: { date: TODAY },
    });
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    return view;
  }

  async function act$(fn: () => Promise<void> | void): Promise<void> {
    await act(async () => {
      await fn();
    });
  }

  /** Waits until the reload a write triggers has settled on `expected`. */
  async function settle(check: () => void): Promise<void> {
    await waitFor(check);
  }

  /** The redesigned Today header (§6.2 On screen). */
  describe('the header and the count chip (§6.2)', () => {
    it('reads the date as 3월 1일 일요일', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      expect(result.current.dateLabel).toBe('3월 1일 일요일');
    });

    it('has no count chip with no habits', async () => {
      const result = await todayScreen(new LocalRepository(await seed([])));

      expect(result.current.countChip).toBeNull();
    });

    it('counts the habits whose floor is met against all of them', async () => {
      const third = binary({ id: 'b2', name: '스트레칭' });
      const result = await todayScreen(new LocalRepository(await seed([habit(), binary(), third])));

      expect(result.current.countChip).toBe('✅ 3개 중 0개 했어요');

      await log(result, 'h1', 5);

      await settle(() => expect(result.current.countChip).toBe('✅ 3개 중 1개 했어요'));
    });
  });

  /** The habit card (§6.2 Habit card, C7a). Words and the bar's ratio are the hook's. */
  describe('the habit card', () => {
    it('shows the icon, the 언제·어디서 value with no label, and the progress line', async () => {
      const result = await todayScreen(
        new LocalRepository(await seed([habit({ cue: '아침 커피 후' }), binary()])),
      );

      expect(rowOf(result.current, 'h1')).toMatchObject({
        icon: '💪',
        cueLine: '🕐 아침 커피 후',
        badge: null,
        progressLine: '0 / 5reps',
        progressRatio: 0,
        floorMet: false,
        canLog: true,
      });
      expect(rowOf(result.current, 'b1').cueLine).toBeNull();
    });

    it("shows the habit's own icon when one was picked, and the stat's icon otherwise", async () => {
      const result = await todayScreen(
        new LocalRepository(await seed([habit({ icon: '🏃' }), binary({ statId: 'willpower' })])),
      );

      expect(rowOf(result.current, 'h1').icon).toBe('🏃');
      expect(rowOf(result.current, 'b1').icon).toBe('🧘');
    });

    it('fills the bar toward the floor and marks the card once the floor is met', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await log(result, 'h1', 3);
      await settle(() => expect(rowOf(result.current, 'h1').progressLine).toBe('3 / 5reps'));
      expect(rowOf(result.current, 'h1').progressRatio).toBe(0.6);

      await log(result, 'h1', 2);
      await settle(() => expect(rowOf(result.current, 'h1').badge).toBe('✓ 했어요'));
      expect(rowOf(result.current, 'h1')).toMatchObject({
        progressLine: '5 / 5reps',
        progressRatio: 1,
        floorMet: true,
        // A count habit whose floor is met keeps its button pressable (§6.2 yes/no path).
        canLog: true,
      });
    });

    it('reads ★ 목표까지 했어요 and the target line past the target', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await log(result, 'h1', 8);

      await settle(() => expect(rowOf(result.current, 'h1').badge).toBe('★ 목표까지 했어요'));
      expect(rowOf(result.current, 'h1').progressLine).toBe('8reps · 목표 8reps');
    });

    it('reads 아직이에요 with no bar on a yes/no habit, and disables it once done', async () => {
      const result = await todayScreen(new LocalRepository(await seed([binary()])));

      expect(rowOf(result.current, 'b1')).toMatchObject({
        progressLine: '아직이에요',
        progressRatio: null,
        canLog: true,
      });

      await log(result, 'b1', 1);

      await settle(() => expect(rowOf(result.current, 'b1').badge).toBe('✓ 했어요'));
      expect(rowOf(result.current, 'b1')).toMatchObject({ progressLine: null, canLog: false });
    });

    it('marks a card skipped today with the skip word', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await logSkip(result, habit(), 'cue');

      await settle(() => expect(rowOf(result.current, 'h1').badge).toBe('− 못 했어요'));
    });
  });

  /**
   * The yesterday banner (#135, §6.2). One banner groups every habit whose yesterday is
   * `missed`, and it is repaired where it shows (B4).
   */
  describe('the yesterday banner (#135)', () => {
    const YESTERDAY = addDays(TODAY, -1);

    function yesterdayRow(habitId: string, over: Partial<HabitEntry> = {}): HabitEntry {
      return {
        id: `y-${habitId}`,
        habitId,
        date: YESTERDAY,
        timestamp: `${YESTERDAY}T09:00:00.000Z`,
        actual: 5,
        ...over,
      };
    }

    async function seedWith(habits: Habit[], entries: HabitEntry[] = []) {
      const repository = new LocalRepository(await seed(habits));
      for (const entry of entries) await repository.upsertEntry(entry);
      return repository;
    }

    const three = () => [habit(), binary(), binary({ id: 'b2', name: '스트레칭', statId: 'willpower' })];

    it('stays down when no habit is blank yesterday (0)', async () => {
      const result = await todayScreen(await seedWith([habit()], [yesterdayRow('h1')]));

      expect(result.current.yesterdayBanner).toBeNull();
    });

    it('names the one blank habit and offers 했어요 and 못 했어요 in the banner (1)', async () => {
      const result = await todayScreen(await seedWith([habit()]));

      expect(result.current.yesterdayBanner).toMatchObject({
        count: 1,
        title: '🌙 어제 팔굽혀펴기 기록이 비어 있어요.',
        single: { id: 'h1' },
      });
    });

    it('counts several blank habits and leaves the rows to the list sheet (3)', async () => {
      const result = await todayScreen(await seedWith(three()));

      expect(result.current.yesterdayBanner).toMatchObject({
        count: 3,
        title: '🌙 어제 기록이 빈 습관 3개',
        single: null,
      });
      expect(result.current.yesterdayBanner?.blanks.map((blank) => blank.label)).toEqual([
        '💪 팔굽혀펴기',
        '💪 명상',
        '🧘 스트레칭',
      ]);
    });

    it('does not count a skip, a paused habit or a habit created today', async () => {
      const result = await todayScreen(
        await seedWith(
          [
            habit(),
            binary({ lifecycle: 'paused', pauses: [{ from: addDays(TODAY, -2) }] }),
            binary({ id: 'b2', name: '새 습관', createdAt: `${TODAY}T08:00:00.000Z` }),
          ],
          [yesterdayRow('h1', { actual: 0, skipReason: 'exception' })],
        ),
      );

      expect(result.current.yesterdayBanner).toBeNull();
    });

    it('is withheld on a past date', async () => {
      const view = await steppableScreen(await seedWith([habit()]));
      expect(view.result.current.yesterdayBanner).not.toBeNull();

      await act$(() => view.rerender({ date: YESTERDAY }));
      await settle(() => expect(view.result.current.date).toBe(YESTERDAY));

      expect(view.result.current.yesterdayBanner).toBeNull();
    });

    it('opens the list sheet on 채우기, with the date and one row per blank habit', async () => {
      const result = await todayScreen(await seedWith(three()));

      await act$(() => result.current.openYesterdayList());

      expect(result.current.sheet).toMatchObject({
        kind: 'yesterdayList',
        eyebrow: '2월 28일 토요일',
        title: '어제 기록이 빈 습관',
      });
      const sheet = result.current.sheet;
      expect(sheet?.kind === 'yesterdayList' && sheet.blanks.map((b) => b.habit.id)).toEqual([
        'h1',
        'b1',
        'b2',
      ]);
    });

    it('counts down as the list is filled one by one, and hides at 0', async () => {
      const repository = await seedWith(three());
      const result = await todayScreen(repository);

      await act$(() => result.current.openYesterdayList());

      // 했어요 → the record sheet for yesterday → 기록하기.
      await act$(() => result.current.openRecord('h1', 'yesterday'));
      expect(result.current.sheet).toMatchObject({ kind: 'record', day: 'yesterday' });
      await act$(() => result.current.recordFromSheet(5));
      await settle(() => expect(result.current.yesterdayBanner?.count).toBe(2));
      expect(result.current.sheet?.kind).toBe('yesterdayList');

      // 못 했어요 → the skip reason sheet for yesterday → a reason chip.
      await act$(() => result.current.openSkip('b1', 'yesterday'));
      await act$(() => result.current.skipFromSheet('cue'));
      await settle(() => expect(result.current.yesterdayBanner?.count).toBe(1));
      expect(result.current.yesterdayBanner?.title).toBe('🌙 어제 스트레칭 기록이 비어 있어요.');
      expect(result.current.sheet?.kind).toBe('yesterdayList');

      await act$(() => result.current.openRecord('b2', 'yesterday'));
      await act$(() => result.current.recordFromSheet(1));
      await settle(() => expect(result.current.yesterdayBanner).toBeNull());
      expect(result.current.sheet).toBeNull();

      const written = await repository.getEntries('h1', YESTERDAY, YESTERDAY);
      expect(written).toHaveLength(1);
    });

    it('writes 했어요 to yesterday at local noon, from the record sheet', async () => {
      const repository = await seedWith([habit()]);
      const result = await todayScreen(repository);

      await act$(() => result.current.openRecord('h1', 'yesterday'));

      expect(result.current.sheet).toMatchObject({
        kind: 'record',
        day: 'yesterday',
        title: '💪 팔굽혀펴기',
        sumLabel: null,
        timeLabel: '어제 12:00',
        skipLabel: '어제 못 했어요 · 왜?',
        defaultAmount: 5,
      });
      const sheet = result.current.sheet;
      expect(sheet?.kind === 'record' && sheet.resultLine(5)).toBe('이걸로 어제 몫을 채워요 ✓');

      await act$(() => result.current.recordFromSheet(5, '늦게 기록'));

      const [row] = await repository.getEntries('h1', YESTERDAY, YESTERDAY);
      expect(row).toMatchObject({ date: YESTERDAY, actual: 5, note: '늦게 기록' });
      expect(new Date(row.timestamp).getHours()).toBe(12);
      await settle(() => expect(result.current.yesterdayBanner).toBeNull());
      expect(result.current.sheet).toBeNull();
    });

    it('records a skip for yesterday from 못 했어요, under the yesterday head', async () => {
      const repository = await seedWith([habit()]);
      const result = await todayScreen(repository);

      await act$(() => result.current.openSkip('h1', 'yesterday'));

      expect(result.current.sheet).toMatchObject({
        kind: 'skip',
        day: 'yesterday',
        eyebrow: '💪 팔굽혀펴기',
        title: '어제 못 했어요 · 왜?',
      });

      await act$(() => result.current.skipFromSheet('floor', '피곤'));

      const [row] = await repository.getEntries('h1', YESTERDAY, YESTERDAY);
      expect(row).toMatchObject({ date: YESTERDAY, actual: 0, skipReason: 'floor', note: '피곤' });
      expect(new Date(row.timestamp).getHours()).toBe(12);
      await settle(() => expect(result.current.yesterdayBanner).toBeNull());
      expect(result.current.sheet).toBeNull();
    });

    it('goes back to the list when a sheet opened from it is closed', async () => {
      const result = await todayScreen(await seedWith(three()));

      await act$(() => result.current.openYesterdayList());
      await act$(() => result.current.openRecord('h1', 'yesterday'));
      await act$(() => result.current.closeSheet());
      expect(result.current.sheet?.kind).toBe('yesterdayList');

      await act$(() => result.current.closeSheet());
      expect(result.current.sheet).toBeNull();
    });
  });

  /** The record sheet (§6.2 Record sheet, B2, B3, C7a). */
  describe('the record sheet', () => {
    async function openOn(result: { current: TodayView }, habitId: string) {
      await act(async () => {
        result.current.openRecord(habitId);
      });
      const sheet = result.current.sheet;
      if (sheet?.kind !== 'record') throw new Error('no record sheet');
      return sheet;
    }

    it('heads with the habit and today’s sum, and shows the time as a plain label', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      const sheet = await openOn(result, 'h1');

      expect(sheet).toMatchObject({
        day: 'today',
        title: '💪 팔굽혀펴기',
        sumLabel: '지금 0reps',
        isCount: true,
        unit: 'reps',
        defaultAmount: 5,
        skipLabel: '오늘 못 했어요 · 왜?',
      });
      expect(sheet.timeLabel).toMatch(/^지금 \d{2}:\d{2}$/);
    });

    it('says what the staged amount does in one result line', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      let sheet = await openOn(result, 'h1');
      expect(sheet.resultLine(5)).toBe('이걸로 오늘 몫을 채워요 ✓');
      expect(sheet.resultLine(3)).toBe('최소량까지 2reps 남아요');
      expect(sheet.resultLine(8)).toBe('이걸로 목표까지 넘겨요 ★');

      await act$(() => result.current.recordFromSheet(5));
      await settle(() => expect(rowOf(result.current, 'h1').progress.sum).toBe(5));

      sheet = await openOn(result, 'h1');
      expect(sheet.sumLabel).toBe('지금 5reps');
      expect(sheet.resultLine(1)).toBe('오늘 몫은 이미 채웠어요');
      expect(sheet.resultLine(3)).toBe('이걸로 목표까지 넘겨요 ★');
    });

    it('writes the staged amount and the note, then closes', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await todayScreen(repository);

      await openOn(result, 'h1');
      await act$(() => result.current.recordFromSheet(4, '저녁에'));

      expect(result.current.sheet).toBeNull();
      const [row] = await repository.getEntries('h1', TODAY, TODAY);
      expect(row).toMatchObject({ actual: 4, note: '저녁에' });
    });

    it('opens the skip reason sheet from its link, and a reason chip records the skip at once', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await todayScreen(repository);

      await openOn(result, 'h1');
      await act$(() => result.current.openSkip('h1'));
      expect(result.current.sheet).toMatchObject({ kind: 'skip', title: '오늘 못 했어요 · 왜?' });

      await act$(() => result.current.skipFromSheet('identity'));

      expect(result.current.sheet).toBeNull();
      const [row] = await repository.getEntries('h1', TODAY, TODAY);
      expect(row).toMatchObject({ date: TODAY, actual: 0, skipReason: 'identity' });
    });

    it('drops the skip link once the day holds activity', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await log(result, 'h1', 2);
      await settle(() => expect(rowOf(result.current, 'h1').hasActivityToday).toBe(true));

      expect((await openOn(result, 'h1')).skipLabel).toBeNull();
    });
  });

  /** The 끄적이기 sheet, the fold and the feed rows (§6.2). */
  describe('the 끄적이기 sheet and the fold', () => {
    it('opens the 끄적이기 sheet with now and the time button, and closes it', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await act$(() => result.current.openFreeLog());
      const sheet = result.current.sheet;
      expect(sheet?.kind).toBe('freeLog');
      expect(sheet?.kind === 'freeLog' && sheet.timeLabel).toMatch(/^지금 \d{2}:\d{2} · 시간 바꾸기$/);

      await act$(() => result.current.closeSheet());
      expect(result.current.sheet).toBeNull();
    });

    it('writes a free log stamped now, or at the typed time, and closes (#16, #127)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await todayScreen(repository);

      await act$(() => result.current.openFreeLog());
      await act$(() => result.current.submitFreeFromSheet({ type: 'idea', text: ' 산책 ', time: null }));
      expect(result.current.sheet).toBeNull();

      await act$(() => result.current.openFreeLog());
      await act$(() =>
        result.current.submitFreeFromSheet({ type: 'mood', text: '맑음', time: { hour: '07', minute: '05' } }),
      );
      expect(result.current.sheet).toBeNull();

      const logs = await repository.getFreeLogs(TODAY, TODAY);
      expect(logs.map((log) => [log.type, log.text, log.date])).toEqual(
        expect.arrayContaining([
          ['idea', '산책', TODAY],
          ['mood', '맑음', TODAY],
        ]),
      );
      const typed = logs.find((log) => log.type === 'mood');
      expect(localClock(typed?.timestamp ?? '')).toBe('07:05');
    });

    it('refuses a typed time that is not a time of day', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await act$(() => result.current.openFreeLog());

      expect(result.current.freeTimeUsable(null)).toBe(true);
      expect(result.current.freeTimeUsable({ hour: '25', minute: '00' })).toBe(false);
      await expect(
        result.current.submitFreeFromSheet({ type: 'idea', text: 'x', time: { hour: '', minute: '' } }),
      ).rejects.toThrow(RangeError);
      expect(result.current.sheet?.kind).toBe('freeLog');
    });

    it('edits a free log in place keeping its time, and deletes it, closing each time', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await todayScreen(repository);
      await act$(() => result.current.logFree('idea', '산책'));
      await settle(() => expect(result.current.feed).toHaveLength(1));
      const [free] = result.current.feed;
      if (free.kind !== 'free') throw new Error('expected a free log');

      await act$(() => result.current.openFeedItem(free.log.id));
      expect(result.current.sheet).toMatchObject({
        kind: 'editFree',
        clock: free.time,
        timeLabel: `${free.time} · 시간 바꾸기`,
      });
      await act$(() => result.current.submitFreeFromSheet({ type: 'win', text: '계단', time: null }));
      expect(result.current.sheet).toBeNull();
      const [edited] = await repository.getFreeLogs(TODAY, TODAY);
      expect(edited).toMatchObject({ id: free.log.id, type: 'win', text: '계단', timestamp: free.log.timestamp });

      await settle(() => expect(result.current.feed[0]?.summary).toBe('계단'));
      await act$(() => result.current.openFeedItem(free.log.id));
      await act$(() => result.current.removeFreeFromSheet());
      expect(result.current.sheet).toBeNull();
      expect(await repository.getFreeLogs(TODAY, TODAY)).toEqual([]);
    });

    it('labels the fold with the day’s record count', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));
      expect(result.current.foldLabel).toBe('오늘 기록 0개');

      await log(result, 'h1', 2);
      await act$(() => result.current.logFree('idea', '산책'));

      await settle(() => expect(result.current.foldLabel).toBe('오늘 기록 2개'));
    });

    it('gives each feed row its time, its title and one summary line', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit(), binary()])));

      await log(result, 'h1', 3, { note: '쉬엄쉬엄' });
      await log(result, 'b1', 1);
      await logSkip(result, habit({ id: 'h1' }), 'cue');
      await act$(() => result.current.logFree('win', ''));

      await settle(() => expect(result.current.feed).toHaveLength(4));
      const [first, second, third, fourth] = result.current.feed;
      expect(first).toMatchObject({ title: '💪 팔굽혀펴기', summary: '3reps' });
      expect(first.time).toMatch(/^\d{2}:\d{2}$/);
      expect(second).toMatchObject({ title: '💪 명상', summary: '✓ 했어요' });
      expect(third).toMatchObject({ summary: '못 했어요 · 깜빡함' });
      expect(fourth).toMatchObject({ title: '✏️ 잘한 일', summary: FREE_LOG_NO_TEXT_NOTE });
    });

    it('opens a feed row in its edit sheet', async () => {
      const result = await todayScreen(new LocalRepository(await seed([habit()])));

      await log(result, 'h1', 3);
      await act$(() => result.current.logFree('idea', '산책'));
      await settle(() => expect(result.current.feed).toHaveLength(2));

      const [entry, free] = result.current.feed;
      await act$(() => result.current.openFeedItem(feedItemId(entry)));
      expect(result.current.sheet).toMatchObject({
        kind: 'editEntry',
        item: { kind: 'habit' },
        clock: entry.time,
        timeLabel: `${entry.time} · 시간 바꾸기`,
        timeEditable: true,
      });

      await act$(() => result.current.openFeedItem(feedItemId(free)));
      expect(result.current.sheet).toMatchObject({ kind: 'editFree', item: { kind: 'free' } });
    });
  });

  /** The edit sheet's row is built and checked in the hook (#13, §3.3, B3). */
  describe('the edit sheet', () => {
    async function openedOn(repository: HabitRepository) {
      const result = await todayScreen(repository);
      await log(result, 'h1', 3, { note: '처음' });
      await settle(() => expect(result.current.feed).toHaveLength(1));
      const [item] = habitFeed(result.current);
      await act$(() => result.current.openFeedItem(item.entry.id));
      return { result, entry: item.entry };
    }

    const draft = { kind: 'activity' as const, amount: '4', note: '', time: null };

    it('keeps the id, the date and the time unless the time fields change (#127 decision)', async () => {
      const { result, entry } = await openedOn(new LocalRepository(await seed([habit()])));

      expect(result.current.editedEntry({ ...draft, note: ' 고침 ' })).toEqual({
        ...entry,
        actual: 4,
        note: '고침',
        skipReason: undefined,
      });

      const moved = result.current.editedEntry({ ...draft, time: { hour: '07', minute: '30' } });
      expect(moved?.id).toBe(entry.id);
      expect(moved?.date).toBe(entry.date);
      expect(localClock(moved?.timestamp ?? '')).toBe('07:30');
    });

    it('moves the amount and the reason together across the row kinds (§3.3)', async () => {
      const { result } = await openedOn(new LocalRepository(await seed([habit()])));

      expect(result.current.editedEntry({ ...draft, kind: 'skip', reason: 'floor' })).toMatchObject({
        actual: 0,
        skipReason: 'floor',
      });
    });

    it('cannot store a skip with no reason, a count with no positive amount, or a bad time', async () => {
      const { result } = await openedOn(new LocalRepository(await seed([habit()])));

      expect(result.current.editedEntry({ ...draft, kind: 'skip' })).toBeNull();
      expect(result.current.editedEntry({ ...draft, amount: '0' })).toBeNull();
      expect(result.current.editedEntry({ ...draft, amount: '' })).toBeNull();
      expect(result.current.editedEntry({ ...draft, time: { hour: '24', minute: '00' } })).toBeNull();
      await expect(result.current.saveEntryFromSheet({ ...draft, kind: 'skip' })).rejects.toThrow(RangeError);
    });

    it('rewrites the one row on 저장 and closes', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const { result, entry } = await openedOn(repository);

      await act$(() => result.current.saveEntryFromSheet({ ...draft, amount: '6', note: '고침' }));

      expect(result.current.sheet).toBeNull();
      const rows = await repository.getEntries('h1', TODAY, TODAY);
      expect(rows).toEqual([{ ...entry, actual: 6, note: '고침' }]);
    });

    it('carries the delete consequence, and deletes the row on 삭제 and closes', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const { result } = await openedOn(repository);

      // The day's only row: deleting it empties the day (D2).
      const sheet = result.current.sheet;
      expect(sheet?.kind === 'editEntry' && sheet.deleteEffect?.emptiesDay).toBe(true);

      await act$(() => result.current.removeEntryFromSheet());

      expect(result.current.sheet).toBeNull();
      expect(await repository.getEntries('h1', TODAY, TODAY)).toEqual([]);
    });

    it('shows a backfilled row’s noon pin instead of offering its time (§6.3)', async () => {
      const view = await steppableScreen(new LocalRepository(await seed([habit()])));
      await act$(() => view.rerender({ date: addDays(TODAY, -1) }));
      await settle(() => expect(view.result.current.date).toBe(addDays(TODAY, -1)));
      await log(view.result, 'h1', 5);
      await settle(() => expect(view.result.current.feed).toHaveLength(1));

      await act$(() => view.result.current.openFeedItem(feedItemId(view.result.current.feed[0])));

      expect(view.result.current.sheet).toMatchObject({
        kind: 'editEntry',
        timeEditable: false,
        timeLabel: '낮 12:00으로 남아요',
      });
    });
  });
});
