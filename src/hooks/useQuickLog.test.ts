import { act, renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { TUNING } from '@/config/tuning';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository } from '@/data';
import { SKIP_REASON_LABELS } from '@/config/copy';
import { dayStates } from '@/domain/classify';
import { addDays } from '@/domain/dates';
import type { Habit, HabitEntry, SkipReason } from '@/models';

import { logAffordances, useQuickLog, type QuickLog } from './useQuickLog';

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

function quickLog(repository: HabitRepository, date?: string) {
  let reloads = 0;
  const { result } = renderHook(
    () =>
      useQuickLog({
        today: TODAY,
        date,
        now: stepClock(),
        onChange: () => {
          reloads += 1;
        },
      }),
    { wrapper: wrapperFor(repository) },
  );
  return { result, reloads: () => reloads };
}

async function log(
  result: { current: QuickLog },
  target: Habit,
  actual: number,
  opts?: { timestamp?: string },
): Promise<void> {
  await act(async () => {
    await result.current.logActivity(target, actual, opts);
  });
}

async function skip(
  result: { current: QuickLog },
  target: Habit,
  reason: SkipReason,
  opts?: { note?: string },
): Promise<void> {
  await act(async () => {
    await result.current.logSkip(target, reason, opts);
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

    await log(result, habit(), 3);

    const rows = await rowsIn(repository);
    expect(rows).toHaveLength(1);
    expect(result.current.toast?.entryId).toBe(rows[0].id);
    expect(result.current.toast?.message).toBe('기록됨');
    expect(result.current.toast?.detail).toBe('+3쪽');
    expect(reloads()).toBe(1);
  });

  it('reads ✓ 완료 on a binary habit rather than the floor unit', async () => {
    const binary = habit({ id: 'b1', kind: 'binary', floor: 1, floorUnit: 'time' });
    const { result } = quickLog(await repositoryWith([binary]));

    await log(result, binary, 1);

    expect(result.current.toast?.detail).toBe(`✓ 완료 · +${TUNING.xpPerFloorCompletion} XP`);
  });

  it('appends a second one-tap log instead of overwriting the first (§3.3)', async () => {
    const repository = await repositoryWith();
    const { result } = quickLog(repository);

    await log(result, habit(), 5);
    await log(result, habit(), 1);

    const rows = await rowsIn(repository);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
    expect(rows.reduce((sum, row) => sum + row.actual, 0)).toBe(6);
  });

  it('undoes only the row the toast named, leaving an older row of the day alone', async () => {
    const repository = await repositoryWith([habit()], [seededRow()]);
    const { result, reloads } = quickLog(repository);

    await log(result, habit(), 5);
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

    await log(result, habit(), 5);
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

    await log(result, habit(), 5);
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

    await log(result, habit(), 3);
    await act(async () => {
      result.current.dismissToast();
    });

    expect(result.current.toast).toBeNull();
    expect(await rowsIn(repository)).toHaveLength(1);
  });

  it('refuses a non-positive amount instead of writing a zero row (§3.3)', async () => {
    const repository = await repositoryWith();
    const { result } = quickLog(repository);

    await expect(result.current.logActivity(habit(), 0)).rejects.toThrow(RangeError);
    await expect(result.current.logActivity(habit(), -3)).rejects.toThrow(RangeError);

    expect(await rowsIn(repository)).toEqual([]);
    expect(result.current.toast).toBeNull();
  });

  it('stamps an overridden timestamp on the row but keeps the day (B3, §3.3)', async () => {
    const repository = await repositoryWith();
    const { result } = quickLog(repository);
    const at = new Date(`${TODAY}T02:34:00.000Z`).toISOString();

    await log(result, habit(), 3, { timestamp: at });

    const rows = await rowsIn(repository);
    expect(rows[0].timestamp).toBe(at);
    expect(rows[0].date).toBe(TODAY);
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

      await log(result, habit(), 5);
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

      await log(result, habit(), 5);
      await act(async () => {
        jest.advanceTimersByTime(TUNING.undoToastMs - 1);
      });
      await log(result, habit(), 1);

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

      await log(result, habit(), 5);
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
  describe('logSkip — the reason-tagged skip row (§6.2 B5)', () => {
    it('writes one zero-amount row carrying the reason', async () => {
      const repository = await repositoryWith();
      const { result, reloads } = quickLog(repository);

      await skip(result, habit(), 'cue');

      const rows = await rowsIn(repository);
      expect(rows).toHaveLength(1);
      expect(rows[0].actual).toBe(0);
      expect(rows[0].skipReason).toBe('cue');
      expect(rows[0].date).toBe(TODAY);
      expect(reloads()).toBe(1);
    });

    it('carries an optional note', async () => {
      const repository = await repositoryWith();
      const { result } = quickLog(repository);

      await skip(result, habit(), 'floor', { note: '허리가 아팠어요' });

      expect((await rowsIn(repository))[0].note).toBe('허리가 아팠어요');
    });

    it('omits the note field entirely for an empty or blank one', async () => {
      const repository = await repositoryWith();
      const { result } = quickLog(repository);

      await skip(result, habit(), 'exception', { note: '' });
      await skip(result, habit(), 'identity', { note: '   ' });
      await skip(result, habit(), 'cue');

      // A stored empty string would make "has a note" indistinguishable from "has none".
      for (const row of await rowsIn(repository)) {
        expect('note' in row).toBe(false);
      }
    });

    it('names the skip on the undo toast, and undoLast deletes that row', async () => {
      const repository = await repositoryWith([habit()], [seededRow()]);
      const { result } = quickLog(repository);

      await skip(result, habit(), 'floor');

      const appended = result.current.toast?.entryId;
      expect(appended).not.toBe('seeded');
      expect(result.current.toast?.message).toBe('못 한 날로 기록했어요');
      expect(result.current.toast?.detail).toBe(SKIP_REASON_LABELS.floor);

      await act(async () => {
        await result.current.undoLast();
      });

      // One undo path for both row kinds — it deletes by id, so it needs no discriminator.
      expect((await rowsIn(repository)).map((row) => row.id)).toEqual(['seeded']);
      expect(result.current.toast).toBeNull();
    });

    it('appends rather than overwriting an earlier skip of the same day (§3.3)', async () => {
      const repository = await repositoryWith();
      const { result } = quickLog(repository);

      await skip(result, habit(), 'cue');
      await skip(result, habit(), 'identity');

      const rows = await rowsIn(repository);
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((row) => row.id)).size).toBe(2);
    });
  });

  /**
   * The log-time reward (#17 AC 6, AC 7). The wording itself is asserted in
   * `src/config/copy.test.ts`; what this seam proves is that the hook feeds
   * `describeLogEffect` the right three snapshots — the habit's whole history before
   * and after the write, and its stat's other habits — so the attribution on the
   * toast describes the log that actually landed.
   */
  describe('the log-time reward on the toast (#17)', () => {
    it('attributes the XP and the crossing to the log that earned them', async () => {
      const { result } = quickLog(await repositoryWith());

      await log(result, habit(), 5);

      expect(result.current.toast?.message).toBe('기록됨');
      expect(result.current.toast?.detail).toBe(`+5쪽 · +${TUNING.xpPerFloorCompletion} XP`);
      expect(result.current.toast?.sub).toBe('최소만큼 했어요 💪');
    });

    it('acknowledges a sub-floor log rather than going silent (AC 7)', async () => {
      const { result } = quickLog(await repositoryWith());

      await log(result, habit(), 3);

      // No XP tail: a `partial` day earns nothing (§4.2), and the sub line is what
      // keeps the moment from passing unremarked.
      expect(result.current.toast?.detail).toBe('+3쪽');
      expect(result.current.toast?.sub).toBe('오늘 나타났어요');
    });

    it('does not call yesterday 오늘 when the row is a backfill', async () => {
      const yesterday = addDays(TODAY, -1);
      const { result } = quickLog(await repositoryWith(), yesterday);

      await log(result, habit(), 3);

      expect(result.current.toast?.sub).toBe('그 날 나타났어요');
    });

    it('reads the level off the stat, so a sibling habit\'s XP counts toward it', async () => {
      const statId = 'intelligence';
      const sibling = habit({
        id: 'h2',
        statId,
        createdAt: `${addDays(TODAY, -10)}T09:00:00.000Z`,
      });
      // Six floor-met days: enough that the sibling alone sits below the level-1
      // threshold and one more habit's first floor day carries the stat over it.
      const siblingDays = [1, 2, 3, 4, 5, 6].map((n) =>
        seededRow({
          id: `s${n}`,
          habitId: 'h2',
          date: addDays(TODAY, -n),
          timestamp: `${addDays(TODAY, -n)}T07:00:00.000Z`,
          actual: 5,
        }),
      );
      const logged = habit({ statId });
      const { result } = quickLog(await repositoryWith([logged, sibling], siblingDays));

      expect(TUNING.xpPerFloorCompletion * 6).toBeLessThan(TUNING.statLevelThresholds[1]);
      expect(TUNING.xpPerFloorCompletion * 7).toBeGreaterThanOrEqual(TUNING.statLevelThresholds[1]);

      await log(result, logged, 5);

      expect(result.current.toast?.sub).toBe('지능 레벨 1');
    });

    it('leaves the skip toast as it was — a miss has no reward to attribute', async () => {
      const { result } = quickLog(await repositoryWith());

      await skip(result, habit(), 'cue');

      expect(result.current.toast?.message).toBe('못 한 날로 기록했어요');
      expect(result.current.toast?.detail).toBe(SKIP_REASON_LABELS.cue);
      expect(result.current.toast?.sub).toBeUndefined();
    });
  });

  describe('editEntry and removeEntry — the row correction path (#13)', () => {
    async function edit(result: { current: QuickLog }, entry: HabitEntry): Promise<void> {
      await act(async () => {
        await result.current.editEntry(entry);
      });
    }

    it('rewrites the row in place and never adds a second one (AC 1)', async () => {
      const repository = await repositoryWith([habit()], [seededRow()]);
      const { result, reloads } = quickLog(repository);

      await edit(result, seededRow({ actual: 7, note: '한 챕터 더' }));

      const rows = await rowsIn(repository);
      // One row, same id — the repository upserts by id, so a correction can never
      // leave the original behind as a duplicate.
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('seeded');
      expect(rows[0].actual).toBe(7);
      expect(rows[0].note).toBe('한 챕터 더');
      expect(reloads()).toBe(1);
    });

    it('keeps date and timestamp when the caller passes them through', async () => {
      const repository = await repositoryWith([habit()], [seededRow()]);
      const { result } = quickLog(repository);

      await edit(result, seededRow({ actual: 4 }));

      // `upsertEntry` *replaces* the element, so this pins the caller contract: an
      // omitted `timestamp` would silently reorder the day (§3.3's ordering key).
      const rows = await rowsIn(repository);
      expect(rows[0].timestamp).toBe(`${TODAY}T07:00:00.000Z`);
      expect(rows[0].date).toBe(TODAY);
    });

    it('turns an activity row into a skip row, setting both fields (§3.3)', async () => {
      const repository = await repositoryWith([habit()], [seededRow()]);
      const { result } = quickLog(repository);

      await edit(result, seededRow({ actual: 0, skipReason: 'floor', note: '너무 피곤' }));

      const rows = await rowsIn(repository);
      expect(rows).toHaveLength(1);
      expect(rows[0].actual).toBe(0);
      expect(rows[0].skipReason).toBe('floor');
      expect(rows[0].note).toBe('너무 피곤');
    });

    it('turns a skip row back into an activity row, dropping the reason entirely', async () => {
      const repository = await repositoryWith(
        [habit()],
        [seededRow({ actual: 0, skipReason: 'cue', note: '깜빡' })],
      );
      const { result } = quickLog(repository);

      await edit(result, seededRow({ actual: 3 }));

      const rows = await rowsIn(repository);
      expect(rows).toHaveLength(1);
      expect(rows[0].actual).toBe(3);
      // Absent, not `''` and not a leftover key: §3.3's discriminator is the
      // *presence* of a reason, so a lingering one would keep classifying the day skip.
      expect('skipReason' in rows[0]).toBe(false);
      expect('note' in rows[0]).toBe(false);
    });

    it('drops a note the user cleared rather than storing an empty string', async () => {
      const repository = await repositoryWith([habit()], [seededRow({ note: '옛 메모' })]);
      const { result } = quickLog(repository);

      await edit(result, seededRow({ note: '   ' }));

      expect('note' in (await rowsIn(repository))[0]).toBe(false);
    });

    it('refuses both shapes §3.3 forbids, leaving the row as it was', async () => {
      const repository = await repositoryWith([habit()], [seededRow()]);
      const { result } = quickLog(repository);

      // A reason-less zero row — the same rejection `logActivity` makes.
      await expect(result.current.editEntry(seededRow({ actual: 0 }))).rejects.toThrow(RangeError);
      // A reason next to a positive amount: `classifyDay` would read this as `skip`
      // and silently discard the 5.
      await expect(
        result.current.editEntry(seededRow({ actual: 5, skipReason: 'floor' })),
      ).rejects.toThrow(RangeError);

      const rows = await rowsIn(repository);
      expect(rows).toHaveLength(1);
      expect(rows[0].actual).toBe(2);
      expect('skipReason' in rows[0]).toBe(false);
    });

    it('retires a live toast that names the row it just edited (D4)', async () => {
      const repository = await repositoryWith();
      const { result } = quickLog(repository);

      await log(result, habit(), 5);
      const appended = (await rowsIn(repository))[0];
      expect(result.current.toast?.entryId).toBe(appended.id);

      await edit(result, { ...appended, actual: 9 });

      // Otherwise 실행취소 stays armed on the row the user has just corrected, and one
      // press throws away both the correction and the original fact (§7.3).
      expect(result.current.toast).toBeNull();
      expect((await rowsIn(repository))[0].actual).toBe(9);
    });

    it('leaves a toast naming a different row armed when editing another one', async () => {
      const repository = await repositoryWith([habit()], [seededRow()]);
      const { result } = quickLog(repository);

      await log(result, habit(), 5);
      const appendedId = result.current.toast?.entryId;

      await edit(result, seededRow({ actual: 4 }));

      expect(result.current.toast?.entryId).toBe(appendedId);
    });

    it('deletes the named row and raises no toast (D5)', async () => {
      const repository = await repositoryWith(
        [habit()],
        [seededRow(), seededRow({ id: 'other', timestamp: `${TODAY}T08:00:00.000Z` })],
      );
      const { result, reloads } = quickLog(repository);

      await act(async () => {
        await result.current.removeEntry('seeded');
      });

      expect((await rowsIn(repository)).map((row) => row.id)).toEqual(['other']);
      // A toast presupposes 실행취소, and a delete has none to offer — the row is gone
      // and re-appending it would mint a different id.
      expect(result.current.toast).toBeNull();
      expect(reloads()).toBe(1);
    });

    it('retires a live toast that names the row it just deleted (D4)', async () => {
      const repository = await repositoryWith();
      const { result } = quickLog(repository);

      await log(result, habit(), 5);
      const appendedId = result.current.toast?.entryId as string;

      await act(async () => {
        await result.current.removeEntry(appendedId);
      });

      // Otherwise 실행취소 would try to delete a row that is already gone.
      expect(result.current.toast).toBeNull();
      expect(await rowsIn(repository)).toEqual([]);
    });
  });

  describe('logAffordances.skipReasonToday (D3 — the shared derivation)', () => {
    function dayOf(entries: HabitEntry[], target = habit()) {
      return dayStates(target, entries, TODAY, TODAY, TODAY)[0];
    }

    it('is the reason on a day holding only a skip', () => {
      const day = dayOf([seededRow({ actual: 0, skipReason: 'floor' })]);

      expect(day.state).toBe('skip');
      expect(logAffordances(habit(), day).skipReasonToday).toBe('floor');
    });

    it('is undefined on a day an activity row covers', () => {
      // §4.1 — activity overrides skip, so the day is no longer a skip day at all and
      // `dayStates` stops carrying a reason. The affordance follows the day's state.
      const day = dayOf([
        seededRow({ id: 's', actual: 0, skipReason: 'floor' }),
        seededRow({ id: 'a', actual: 5, timestamp: `${TODAY}T08:00:00.000Z` }),
      ]);

      expect(day.state).toBe('done');
      expect(logAffordances(habit(), day).skipReasonToday).toBeUndefined();
    });

    it('withholds the skip affordance once activity covers the day, and not before', () => {
      // The shared gate behind both screens' chips, note field and long-press (D7).
      expect(logAffordances(habit(), undefined).skippable).toBe(true);
      expect(logAffordances(habit(), dayOf([])).skippable).toBe(true);
      // A skip-only day is still skippable — it is still on its first record.
      expect(
        logAffordances(habit(), dayOf([seededRow({ actual: 0, skipReason: 'cue' })])).skippable,
      ).toBe(true);
      // A sub-floor `partial` day already holds activity, so it is not.
      expect(logAffordances(habit(), dayOf([seededRow({ actual: 2 })])).skippable).toBe(false);
      expect(logAffordances(habit(), dayOf([seededRow({ actual: 5 })])).skippable).toBe(false);
    });

    it('is undefined on a day with no rows at all', () => {
      expect(logAffordances(habit(), dayOf([])).skipReasonToday).toBeUndefined();
      expect(logAffordances(habit(), undefined).skipReasonToday).toBeUndefined();
    });

    it('is the last reason of the domain total order when the day holds several', () => {
      const rows = [
        seededRow({ id: 'b', actual: 0, skipReason: 'identity', timestamp: `${TODAY}T09:00:00.000Z` }),
        seededRow({ id: 'a', actual: 0, skipReason: 'cue', timestamp: `${TODAY}T07:00:00.000Z` }),
      ];

      expect(logAffordances(habit(), dayOf(rows)).skipReasonToday).toBe('identity');
      // Permutation-invariant, as §7.3's total order requires.
      expect(logAffordances(habit(), dayOf([...rows].reverse())).skipReasonToday).toBe('identity');
    });
  });
});
