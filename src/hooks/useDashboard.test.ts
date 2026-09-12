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
  target: Habit,
  actual: number,
): Promise<void> {
  await act(async () => {
    await result.current.logActivity(target, actual);
  });
}

async function logSkip(
  result: { current: DashboardView },
  target: Habit,
  reason: SkipReason,
): Promise<void> {
  await act(async () => {
    await result.current.logSkip(target, reason);
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

      await log(result, result.current.rows[0].habit, result.current.rows[0].oneTapAmount);

      expect(result.current.rows[0].hasActivityToday).toBe(true);
      expect(result.current.rows[0].oneTapAmount).toBe(1);
    });

    it('turns today\u2019s cell done in place, without ever raising loading again', async () => {
      const { result, seen } = await dashboardWatchingLoading(
        new LocalRepository(await seed([habit()])),
      );
      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('pending');
      const settledAt = seen.length;

      await log(result, result.current.rows[0].habit, 5);

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

      await log(result, result.current.rows[0].habit, 5);
      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('done');
      await log(result, result.current.rows[0].habit, 1);

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

      await log(result, result.current.rows[0].habit, 1);

      // Binary's floor is 1, so one row is the whole day: the control is completed.
      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('done');
      expect(result.current.rows[0].hasActivityToday).toBe(true);
      expect(result.current.toast?.detail).toBe(`✓ 완료 · +${TUNING.xpPerFloorCompletion} XP`);
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

      await log(result, result.current.rows[0].habit, 5);
      expect(result.current.toast?.detail).toBe(`+5reps · +${TUNING.xpPerFloorCompletion} XP`);

      await act(async () => {
        await result.current.undoLast();
      });

      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('pending');
      expect(result.current.rows[0].hasActivityToday).toBe(false);
      expect(result.current.toast).toBeNull();
    });
  });
  describe('the long-press skip path (§6.1 B5)', () => {
    it('turns today into a skip day, fills the cell and reports the reason', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));
      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('pending');

      await logSkip(result, result.current.rows[0].habit, 'cue');

      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('skip');
      // The miss hue **filled** — "I said I wouldn't", as against `missed`'s outline.
      expect(tupleOn(result.current.rows[0].cells, TODAY)).toBe('miss:filled');
      expect(result.current.rows[0].skipReasonToday).toBe('cue');
      expect(result.current.toast?.detail).toBe('깜빡함');
    });

    it('does not count an exception skip as a miss', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));

      await logSkip(result, result.current.rows[0].habit, 'exception');

      // The domain owns that rule; this asserts it survives the trip to the screen.
      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('skip');
      expect(result.current.rows[0].skipReasonToday).toBe('exception');
    });

    it('lets an activity log override the skip it recorded first (§4.1)', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));

      await logSkip(result, result.current.rows[0].habit, 'floor');
      await log(result, result.current.rows[0].habit, 5);

      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('done');
      // The chip row is withdrawn once activity covers the day (D7), so no reason
      // is offered up as the day's answer either.
      expect(result.current.rows[0].skipReasonToday).toBeUndefined();
      expect(result.current.rows[0].hasActivityToday).toBe(true);
    });

    it('undoes the skip it just recorded and puts the day back to pending', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));

      await logSkip(result, result.current.rows[0].habit, 'identity');
      await act(async () => {
        await result.current.undoLast();
      });

      expect(stateOn(result.current.rows[0].cells, TODAY)).toBe('pending');
      expect(result.current.rows[0].skipReasonToday).toBeUndefined();
      expect(result.current.toast).toBeNull();
    });
  });

  /**
   * #14 D9 — the row's 연속 날수. The number itself is `computeStreak`'s and is proven
   * in `src/domain/streak.test.ts`; what belongs here is that the Dashboard reads it
   * over the whole history and that a backfill repairs it in place (ADR-0001).
   */
  describe('the streak count (#14)', () => {
    it('counts consecutive floor-met days ending today', async () => {
      const dates = [3, 2, 1, 0].map((n) => addDays(TODAY, -n));
      const result = await dashboard(
        new LocalRepository(
          await seed([habit()], dates.map((date) => activity('h1', date, 5))),
        ),
      );

      expect(result.current.rows[0].streak).toBe(4);
    });

    it('reads past the heatmap window rather than clipping at it', async () => {
      const created = addDays(TODAY, -(TUNING.heatmapDays + 5));
      const dates = Array.from({ length: TUNING.heatmapDays + 6 }, (_, i) => addDays(created, i));
      const result = await dashboard(
        new LocalRepository(
          await seed(
            [habit({ createdAt: `${created}T09:00:00.000Z` })],
            dates.map((date) => activity('h1', date, 5)),
          ),
        ),
      );

      expect(result.current.rows[0].streak).toBe(dates.length);
      expect(dates.length).toBeGreaterThan(TUNING.heatmapDays);
    });

    it('breaks on an unrecorded day and re-joins both runs once it is backfilled (AC 8a)', async () => {
      const gap = addDays(TODAY, -2);
      const entries = [3, 1, 0]
        .map((n) => addDays(TODAY, -n))
        .map((date) => activity('h1', date, 5));
      const repository = new LocalRepository(await seed([habit()], entries));

      expect((await dashboard(repository)).current.rows[0].streak).toBe(2);

      // One appended row on the missed date — the same repair the date control writes.
      await repository.upsertEntry(activity('h1', gap, 5));

      expect((await dashboard(repository)).current.rows[0].streak).toBe(4);
    });
  });
  /**
   * The stat cards (#17 AC 1, AC 5) — `design/parts/Dashboard.body.html:10–26`.
   *
   * Every figure the card shows is asserted here rather than in the screen, because
   * `jest.config.js` matches `src/**` and there are no render tests: a division written
   * in JSX is arithmetic nothing checks.
   *
   * The fixtures reach a threshold through **intensity**, not through hundreds of days:
   * `TUNING.xpPerAboveFloorUnit` per unit above the floor makes one row worth any
   * amount, and days are spaced so that `TUNING.xpStreakBonus` never fires and turns an
   * exact figure into an approximate one.
   */
  describe('the stat cards (#17)', () => {
    /** The amount whose single floor-met day is worth exactly `xp`. */
    function amountWorth(xp: number): number {
      return 5 + (xp - TUNING.xpPerFloorCompletion) / TUNING.xpPerAboveFloorUnit;
    }

    function cardFor(view: DashboardView, statId: string) {
      const card = view.stats.find((entry) => entry.stat.id === statId);
      if (card == null) throw new Error(`no stat card for ${statId}`);
      return card;
    }

    it('draws one card per configured stat even with no habits at all', async () => {
      const view = (await dashboard(new LocalRepository(new MemoryKV()))).current;

      expect(view.stats.map((entry) => entry.stat.id)).toEqual(TUNING.stats.map((s) => s.id));
      expect(view.stats.every((entry) => entry.level === 0 && entry.xp === 0)).toBe(true);
      expect(view.stats[0].xpToNextLevel).toBe(TUNING.statLevelThresholds[1]);
      expect(view.stats[0].barFraction).toBe(0);
      expect(view.characterLevel).toBe(0);
    });

    it('fills the bar by the current level band, not by the stat\'s whole XP', async () => {
      const halfway = TUNING.statLevelThresholds[1] / 2;
      const repository = new LocalRepository(
        await seed([habit()], [activity('h1', addDays(TODAY, -1), amountWorth(halfway))]),
      );

      const card = cardFor((await dashboard(repository)).current, 'strength');
      expect(card.xp).toBe(halfway);
      expect(card.level).toBe(0);
      expect(card.xpToNextLevel).toBe(halfway);
      expect(card.barFraction).toBeCloseTo(0.5);
    });

    it('levels up exactly at the threshold and restarts the bar on the next band', async () => {
      const [, first, second] = TUNING.statLevelThresholds;
      const repository = new LocalRepository(
        await seed([habit()], [activity('h1', addDays(TODAY, -1), amountWorth(first))]),
      );

      const card = cardFor((await dashboard(repository)).current, 'strength');
      expect(card.level).toBe(1);
      expect(card.barFraction).toBe(0);
      expect(card.xpToNextLevel).toBe(second - first);
    });

    it('sums every habit mapped to the stat, neither one reaching the level alone', async () => {
      const first = TUNING.statLevelThresholds[1];
      const repository = new LocalRepository(
        await seed(
          [habit(), habit({ id: 'h2', name: '스쿼트' })],
          [
            activity('h1', addDays(TODAY, -1), amountWorth(first / 2)),
            activity('h2', addDays(TODAY, -1), amountWorth(first / 2)),
          ],
        ),
      );

      expect(cardFor((await dashboard(repository)).current, 'strength').level).toBe(1);
    });

    it('keeps an archived habit\'s XP — archiving must not undo a level', async () => {
      const first = TUNING.statLevelThresholds[1];
      const repository = new LocalRepository(
        await seed(
          [habit({ id: 'h2', name: '스쿼트', lifecycle: 'archived' }), habit()],
          [
            activity('h2', addDays(TODAY, -1), amountWorth(first / 2)),
            activity('h1', addDays(TODAY, -1), amountWorth(first / 2)),
          ],
        ),
      );

      const view = (await dashboard(repository)).current;
      // The row list still hides it (§3.2); only the stat's cumulative XP counts it.
      expect(view.rows.map((row) => row.habit.id)).toEqual(['h1']);
      expect(cardFor(view, 'strength').xp).toBe(first);
      expect(cardFor(view, 'strength').level).toBe(1);
    });

    it('names no next level at the top, where there is no further threshold', async () => {
      const top = TUNING.statLevelThresholds[TUNING.statLevelThresholds.length - 1];
      const repository = new LocalRepository(
        await seed([habit()], [activity('h1', addDays(TODAY, -1), amountWorth(top))]),
      );

      const card = cardFor((await dashboard(repository)).current, 'strength');
      expect(card.level).toBe(TUNING.statLevelThresholds.length - 1);
      // Not NaN and not a negative "다음 레벨까지": the band has no width up here.
      expect(card.xpToNextLevel).toBeNull();
      expect(card.barFraction).toBe(1);
    });

    it('reads the character level as the highest stat, not the first and not the sum', async () => {
      const [, first, second] = TUNING.statLevelThresholds;
      const repository = new LocalRepository(
        await seed(
          [habit(), habit({ id: 'h2', name: '독서', statId: 'intelligence' })],
          [
            activity('h1', addDays(TODAY, -1), amountWorth(first)),
            activity('h2', addDays(TODAY, -1), amountWorth(second)),
          ],
        ),
      );

      const view = (await dashboard(repository)).current;
      expect(cardFor(view, 'strength').level).toBe(1);
      expect(cardFor(view, 'intelligence').level).toBe(2);
      expect(view.characterLevel).toBe(2);
    });

    it('moves the bar as soon as the log lands (AC 1)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await dashboard(repository);
      expect(cardFor(result.current, 'strength').xp).toBe(0);

      await log(result, result.current.rows[0].habit, 5);

      expect(cardFor(result.current, 'strength').xp).toBe(TUNING.xpPerFloorCompletion);
      expect(cardFor(result.current, 'strength').barFraction).toBeGreaterThan(0);
    });
  });
});
