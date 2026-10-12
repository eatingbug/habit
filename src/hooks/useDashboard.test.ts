import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ComponentProps, type ReactNode } from 'react';

import { TUNING } from '@/config/tuning';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository, type KVStore } from '@/data';
import { addDays } from '@/domain/dates';
import type { Habit, HabitEntry, SkipReason } from '@/models';

import { useDashboard, type DashboardDay, type DashboardView } from './useDashboard';

/**
 * The hook seam (jest.config.js): a real `LocalRepository` over `MemoryKV`, so the
 * Dashboard's data path is proven with no device and no component render.
 *
 * Every fixture date is derived from `TODAY` with `addDays`. `TODAY` is a Sunday, so
 * the 7-day dots run 월 … 토, 오늘.
 */

const TODAY = '2026-03-01';
const YESTERDAY = addDays(TODAY, -1);
/** 14:20 local — the record sheet's "지금 14:20". */
const NOW = new Date(2026, 2, 1, 14, 20);

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
    // `children` goes in as the third argument; the cast covers the prop it fills at runtime.
    const props = { repository } as ComponentProps<typeof RepositoryProvider>;
    return createElement(RepositoryProvider, props, children);
  };
}

async function dashboard(repository: HabitRepository, today = TODAY) {
  const { result } = renderHook(() => useDashboard({ today, now: () => NOW }), {
    wrapper: wrapperFor(repository),
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

/**
 * Same as `dashboard`, but keeps every `loading` value the hook has rendered — "the row
 * updates in place" is a claim about the reloads, not just about the final value.
 */
async function dashboardWatchingLoading(repository: HabitRepository) {
  const seen: boolean[] = [];
  const { result } = renderHook(
    () => {
      const view = useDashboard({ today: TODAY, now: () => NOW });
      seen.push(view.loading);
      return view;
    },
    { wrapper: wrapperFor(repository) },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  return { result, seen };
}

type Result = { current: DashboardView };

function rowOf(result: Result, habitId = 'h1') {
  const row = result.current.rows.find((r) => r.habit.id === habitId);
  if (row == null) throw new Error(`no row for ${habitId}`);
  return row;
}

function dayOf(week: DashboardDay[], date: string): DashboardDay {
  const day = week.find((d) => d.date === date);
  if (day == null) throw new Error(`no dot for ${date}`);
  return day;
}

function stateOn(result: Result, date: string, habitId = 'h1') {
  return dayOf(rowOf(result, habitId).week, date).state;
}

/** Tap a 7-day dot, then 기록하기 on the sheet it opens. */
async function record(result: Result, date: string, amount: number, note = '', habitId = 'h1') {
  act(() => result.current.openRecord(habitId, date));
  await act(async () => {
    await result.current.recordFromSheet(amount, note);
  });
}

/** Tap a 7-day dot, follow the sheet's skip link, then a reason chip. */
async function recordSkip(result: Result, date: string, reason: SkipReason, note = '') {
  act(() => result.current.openRecord('h1', date));
  act(() => result.current.openSkip('h1', date));
  await act(async () => {
    await result.current.skipFromSheet(reason, note);
  });
}

async function seed(habits: Habit[], entries: HabitEntry[] = []): Promise<KVStore> {
  const kv = new MemoryKV();
  const repository = new LocalRepository(kv);
  for (const h of habits) await repository.upsertHabit(h);
  for (const e of entries) await repository.upsertEntry(e);
  return kv;
}

/** Floor-met every day the habit has existed, ending yesterday. */
function everyDayDone(habitId: string): HabitEntry[] {
  return [1, 2, 3, 4, 5].map((back) => activity(habitId, addDays(TODAY, -back), 5));
}

/**
 * Nine recorded days: five at the floor, four sub-floor. The floor-completion rate is
 * 5/9 ≈ 56% — under `lowFloorRateThreshold`, so Rule 1 raises one flag — while `partial`
 * is transparent to the miss run, so there is no 🔴.
 */
function cautionFixture(id: string, name: string, statId = 'strength') {
  const dates = [9, 8, 7, 6, 5, 4, 3, 2, 1].map((back) => addDays(TODAY, -back));
  return {
    habit: habit({ id, name, statId, createdAt: `${addDays(TODAY, -9)}T09:00:00.000Z` }),
    entries: dates.map((date, i) => activity(id, date, i < 5 ? 5 : 2)),
  };
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

  it('heads the screen with the date', async () => {
    const result = await dashboard(new LocalRepository(new MemoryKV()));

    expect(result.current.dateLabel).toBe('3월 1일 일요일');
  });

  it('shows a created habit as a row with its icon, name and stat', async () => {
    const result = await dashboard(new LocalRepository(await seed([habit()])));

    expect(result.current.rows).toHaveLength(1);
    expect(rowOf(result).label).toBe('💪 팔굽혀펴기');
    expect(rowOf(result).stat?.name).toBe('힘');
  });

  it('still shows the habit through a fresh LocalRepository over the same store', async () => {
    // The "survives an app restart" criterion: same KV, a repository that has never
    // seen the write.
    const kv = await seed([habit()]);
    const result = await dashboard(new LocalRepository(kv));

    expect(result.current.rows.map((row) => row.habit.id)).toEqual(['h1']);
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

  describe('the order of the rows (§6.3: 🔴 on top)', () => {
    it('puts 손봐야 해요 first, then 살펴보세요, then 괜찮아요', async () => {
      const caution = cautionFixture('reading', '독서', 'intelligence');
      const kv = await seed(
        [
          habit({ id: 'fine', name: '턱걸이' }),
          caution.habit,
          habit({ id: 'red', name: '명상', statId: 'willpower' }),
        ],
        [...everyDayDone('fine'), ...caution.entries],
      );
      const result = await dashboard(new LocalRepository(kv));

      expect(result.current.rows.map((row) => row.statusLight)).toEqual([
        'intervention',
        'caution',
        expect.stringMatching(/^(stable|personal_best)$/),
      ]);
      expect(result.current.rows.map((row) => row.habit.name)).toEqual(['명상', '독서', '턱걸이']);
    });

    it('keeps the stored order among habits under the same light', async () => {
      const kv = await seed([
        habit({ id: 'a', name: '하나' }),
        habit({ id: 'b', name: '둘' }),
        habit({ id: 'c', name: '셋' }),
      ]);
      const result = await dashboard(new LocalRepository(kv));
      const stored = (await new LocalRepository(kv).getHabits()).map((h) => h.id);

      expect(result.current.rows.map((row) => row.habit.id)).toEqual(stored);
    });

    it('moves a row down as soon as a log clears its 🔴', async () => {
      const kv = await seed(
        [habit({ id: 'fine', name: '턱걸이' }), habit({ id: 'red', name: '명상' })],
        everyDayDone('fine'),
      );
      const result = await dashboard(new LocalRepository(kv));
      expect(result.current.rows[0].habit.id).toBe('red');

      // A floor-met today ends the miss run that ends at today (§4.3).
      await record(result, TODAY, 5, '', 'red');

      expect(rowOf(result, 'red').statusLight).not.toBe('intervention');
      expect(result.current.rows[0].habit.id).toBe('fine');
    });
  });

  describe('the row', () => {
    it('reads its streak as "🔥 N"', async () => {
      const dates = [3, 2, 1, 0].map((n) => addDays(TODAY, -n));
      const result = await dashboard(
        new LocalRepository(await seed([habit()], dates.map((date) => activity('h1', date, 5)))),
      );

      expect(rowOf(result).streak).toBe(4);
      expect(rowOf(result).streakLabel).toBe('🔥 4');
    });

    it('offers 회고하기 on a 🔴 row only, not on 🟡 or 🟢', async () => {
      const caution = cautionFixture('reading', '독서');
      const kv = await seed(
        [habit({ id: 'red' }), caution.habit, habit({ id: 'fine' })],
        [...caution.entries, ...everyDayDone('fine')],
      );
      const result = await dashboard(new LocalRepository(kv));

      expect(rowOf(result, 'red').reflectable).toBe(true);
      expect(rowOf(result, 'reading').statusLight).toBe('caution');
      expect(rowOf(result, 'reading').reflectable).toBe(false);
      expect(rowOf(result, 'fine').reflectable).toBe(false);
    });
  });

  describe('the 7-day dots', () => {
    it('shows the last seven days, each with its weekday, the last one 오늘', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));
      const { week } = rowOf(result);

      expect(week.map((day) => day.date)).toEqual(
        [6, 5, 4, 3, 2, 1, 0].map((back) => addDays(TODAY, -back)),
      );
      expect(week.map((day) => day.label)).toEqual(['월', '화', '수', '목', '금', '토', '오늘']);
    });

    it('marks today pending and every past day since createdAt missed (ADR-0001)', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));

      expect(stateOn(result, TODAY)).toBe('pending');
      for (let back = 1; back <= 5; back += 1) {
        expect(stateOn(result, addDays(TODAY, -back))).toBe('missed');
      }
    });

    it('draws no mark before createdAt, and that dot opens nothing', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));
      const before = dayOf(rowOf(result).week, addDays(TODAY, -6));

      expect(before.state).toBeNull();
      expect(before.tappable).toBe(false);
      expect(dayOf(rowOf(result).week, addDays(TODAY, -5)).tappable).toBe(true);
    });

    it('leaves an empty paused day unmarked but marks a paused day that holds rows (ADR-0003)', async () => {
      const pauseFrom = addDays(TODAY, -4);
      const logged = addDays(TODAY, -3);
      const pauseTo = addDays(TODAY, -2);
      const kv = await seed(
        [habit({ pauses: [{ from: pauseFrom, to: pauseTo }] })],
        [activity('h1', logged, 5)],
      );
      const result = await dashboard(new LocalRepository(kv));

      expect(stateOn(result, pauseFrom)).toBeNull();
      expect(stateOn(result, logged)).toBe('done');
      // The resume date is active again — half-open [from, to).
      expect(stateOn(result, pauseTo)).toBe('missed');
    });

    it('marks skip, partial and over days as the shared day-states', async () => {
      const kv = await seed(
        [habit({ target: 8 })],
        [
          skip('h1', addDays(TODAY, -3), 'cue'),
          activity('h1', addDays(TODAY, -2), 2),
          activity('h1', addDays(TODAY, -1), 9),
        ],
      );
      const result = await dashboard(new LocalRepository(kv));

      expect(stateOn(result, addDays(TODAY, -3))).toBe('skip');
      expect(stateOn(result, addDays(TODAY, -2))).toBe('partial');
      expect(stateOn(result, addDays(TODAY, -1))).toBe('over');
    });

    it('names each dot by its date and day-state', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));

      expect(dayOf(rowOf(result).week, YESTERDAY).accessibilityLabel).toBe('2월 28일 토요일 기록 없음');
      expect(dayOf(rowOf(result).week, TODAY).accessibilityLabel).toBe('3월 1일 일요일 아직이에요');
    });
  });

  describe('the record sheet from a dot (§6.3 B1)', () => {
    it('heads a past day’s sheet with the date in large type and the habit above it', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));
      const date = addDays(TODAY, -3);

      act(() => result.current.openRecord('h1', date));

      expect(result.current.sheet).toMatchObject({
        kind: 'record',
        eyebrow: '💪 팔굽혀펴기',
        title: '2월 26일 목요일',
        sumLabel: null,
        isCount: true,
        unit: 'reps',
        defaultAmount: 5,
        timeLabel: '2월 26일 12:00',
        skipLabel: '2월 26일 못 했어요 · 왜?',
      });
      if (result.current.sheet?.kind !== 'record') throw new Error('no record sheet');
      expect(result.current.sheet.resultLine(5)).toBe('이걸로 2월 26일 몫을 채워요 ✓');
    });

    it('says 어제 for yesterday and 오늘 for today, with today’s sum and time', async () => {
      const result = await dashboard(
        new LocalRepository(await seed([habit()], [activity('h1', TODAY, 2)])),
      );

      act(() => result.current.openRecord('h1', YESTERDAY));
      expect(result.current.sheet).toMatchObject({
        title: '2월 28일 토요일',
        timeLabel: '어제 12:00',
        skipLabel: '어제 못 했어요 · 왜?',
      });

      act(() => result.current.openRecord('h1', TODAY));
      expect(result.current.sheet).toMatchObject({
        title: '3월 1일 일요일',
        sumLabel: '지금 2reps',
        timeLabel: '지금 14:20',
        defaultAmount: 2,
        // Activity already covers today, so the skip link is withdrawn (§4.1).
        skipLabel: null,
      });
      if (result.current.sheet?.kind !== 'record') throw new Error('no record sheet');
      expect(result.current.sheet.resultLine(3)).toBe('이걸로 오늘 몫을 채워요 ✓');
    });

    it('changes no data on a stray tap: opening and closing writes nothing (#109)', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await dashboard(repository);

      act(() => result.current.openRecord('h1', YESTERDAY));
      act(() => result.current.closeSheet());

      expect(result.current.sheet).toBeNull();
      expect(await repository.getEntries('h1', addDays(TODAY, -6), TODAY)).toEqual([]);
      expect(stateOn(result, YESTERDAY)).toBe('missed');
      expect(result.current.toast).toBeNull();
    });

    it('does not open on a dot before createdAt', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));

      act(() => result.current.openRecord('h1', addDays(TODAY, -6)));

      expect(result.current.sheet).toBeNull();
    });

    it('saves on 기록하기, closes, and updates the dot, streak and light in place', async () => {
      const entries = [5, 4, 3, 2].map((back) => activity('h1', addDays(TODAY, -back), 5));
      const repository = new LocalRepository(await seed([habit()], entries));
      const { result, seen } = await dashboardWatchingLoading(repository);
      expect(stateOn(result, YESTERDAY)).toBe('missed');
      expect(rowOf(result).streak).toBe(0);
      const settledAt = seen.length;

      await record(result, YESTERDAY, 5, '  밤에  ');

      expect(result.current.sheet).toBeNull();
      expect(stateOn(result, YESTERDAY)).toBe('done');
      expect(rowOf(result).streak).toBe(5);
      expect(result.current.toast).toMatchObject({ message: '기록됨' });
      // The row never blanked out while it reloaded.
      expect(seen.slice(settledAt)).not.toContain(true);

      const rows = await repository.getEntries('h1', YESTERDAY, YESTERDAY);
      expect(rows).toHaveLength(1);
      // A backfill: noon-pinned, with the trimmed note (§6.3).
      expect(rows[0]).toMatchObject({ actual: 5, note: '밤에' });
      expect(new Date(rows[0].timestamp).getHours()).toBe(12);
    });

    it('celebrates a backfill that raises the streak', async () => {
      const entries = [3, 2].map((back) => activity('h1', addDays(TODAY, -back), 5));
      const result = await dashboard(
        new LocalRepository(await seed([habit()], [...entries, activity('h1', TODAY, 5)])),
      );
      expect(rowOf(result).streak).toBe(1);

      await record(result, YESTERDAY, 5);

      expect(rowOf(result).streak).toBe(4);
      expect(result.current.celebration).toMatchObject({
        kind: 'banner',
        streak: 4,
        line: '💪 팔굽혀펴기 어제를 채워서 4일 연속이 됐어요',
      });
    });

    it('undoes the saved row and puts the dot back', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await dashboard(repository);

      await record(result, YESTERDAY, 5);
      await act(async () => {
        await result.current.undoLast();
      });

      expect(stateOn(result, YESTERDAY)).toBe('missed');
      expect(await repository.getEntries('h1', YESTERDAY, YESTERDAY)).toHaveLength(0);
      expect(result.current.toast).toBeNull();
    });

    it('appends a second log instead of overwriting, and sums to over', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit({ target: 6 })])));

      await record(result, TODAY, 5);
      expect(stateOn(result, TODAY)).toBe('done');
      await record(result, TODAY, 1);

      expect(stateOn(result, TODAY)).toBe('over');
    });

    it('records a yes/no habit as one ✓ with no amount', async () => {
      const result = await dashboard(
        new LocalRepository(
          await seed([habit({ kind: 'binary', floor: 1, floorUnit: 'time' })]),
        ),
      );

      act(() => result.current.openRecord('h1', TODAY));
      expect(result.current.sheet).toMatchObject({ isCount: false, defaultAmount: 1, sumLabel: null });
      await act(async () => {
        await result.current.recordFromSheet(1, '');
      });

      expect(stateOn(result, TODAY)).toBe('done');
      expect(result.current.toast?.detail).toBe(`✓ 했어요 · 별 +${TUNING.xpPerFloorCompletion}`);
    });

    it('keeps the sheet open when the write fails', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await dashboard(repository);
      jest.spyOn(repository, 'upsertEntry').mockRejectedValueOnce(new Error('offline'));

      act(() => result.current.openRecord('h1', YESTERDAY));
      await act(async () => {
        await expect(result.current.recordFromSheet(5, '')).rejects.toThrow('offline');
      });

      expect(result.current.sheet).toMatchObject({ kind: 'record', title: '2월 28일 토요일' });
    });
  });

  describe('the skip reason sheet from a dot (§6.3 B1, B5)', () => {
    it('heads the sheet with the habit and the day', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));

      act(() => result.current.openSkip('h1', addDays(TODAY, -3)));

      expect(result.current.sheet).toEqual({
        kind: 'skip',
        habit: expect.objectContaining({ id: 'h1' }),
        date: addDays(TODAY, -3),
        eyebrow: '💪 팔굽혀펴기',
        title: '2월 26일 못 했어요 · 왜?',
      });
    });

    it('records the skip on that day with its note, then closes', async () => {
      const repository = new LocalRepository(await seed([habit()]));
      const result = await dashboard(repository);

      await recordSkip(result, YESTERDAY, 'cue', '야근');

      expect(result.current.sheet).toBeNull();
      expect(stateOn(result, YESTERDAY)).toBe('skip');
      expect(result.current.toast?.detail).toBe('깜빡함');
      const rows = await repository.getEntries('h1', YESTERDAY, YESTERDAY);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actual: 0, skipReason: 'cue', note: '야근' });
    });

    it('lets an activity log override the skip it recorded first (§4.1)', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));

      await recordSkip(result, TODAY, 'floor');
      await record(result, TODAY, 5);

      expect(stateOn(result, TODAY)).toBe('done');
    });
  });

  describe('the head over the rows', () => {
    it('counts 🟡 and 🔴 as "손볼 습관 N개" and leaves the healthy habit out', async () => {
      const caution = cautionFixture('reading', '독서', 'intelligence');
      const kv = await seed(
        [habit(), caution.habit, habit({ id: 'fine', name: '턱걸이' })],
        [...caution.entries, ...everyDayDone('fine')],
      );
      const result = await dashboard(new LocalRepository(kv));

      expect(result.current.shaky).toBe(2);
      expect(result.current.shakyLabel).toBe('손볼 습관 2개');
    });

    it('reads "손볼 습관 0개" when nothing needs attention', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()], everyDayDone('h1'))));

      expect(result.current.shakyLabel).toBe('손볼 습관 0개');
    });

    it('a paused habit demands nothing, however bare its record (ADR-0003)', async () => {
      const kv = await seed([habit({ lifecycle: 'paused', pauses: [{ from: addDays(TODAY, -5) }] })]);
      const result = await dashboard(new LocalRepository(kv));

      expect(result.current.rows).toHaveLength(1);
      expect(rowOf(result).statusLight).toBe('stable');
      expect(result.current.shaky).toBe(0);
    });

    it('an archived habit is neither a row nor a number in the head', async () => {
      const kv = await seed([
        habit(),
        habit({ id: 'h2', lifecycle: 'archived', pauses: [{ from: addDays(TODAY, -5) }] }),
      ]);
      const result = await dashboard(new LocalRepository(kv));

      expect(result.current.rows.map((row) => row.habit.id)).toEqual(['h1']);
      expect(result.current.shaky).toBe(1);
    });

    it('recomputes the light and the count as soon as a log lands', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));
      expect(rowOf(result).statusLight).toBe('intervention');
      expect(result.current.shaky).toBe(1);

      await record(result, TODAY, 5);

      expect(rowOf(result).statusLight).not.toBe('intervention');
      expect(result.current.shakyLabel).toBe('손볼 습관 0개');
    });
  });

  /**
   * The level card and the stat sheet (§6.3, #17). Every figure is asserted here, not in
   * the screen: there are no render tests, so arithmetic in JSX is arithmetic nothing
   * checks.
   *
   * The fixtures reach a threshold through **intensity**: `TUNING.xpPerAboveFloorUnit`
   * per unit above the floor makes one row worth any amount, and a single day never
   * fires `TUNING.xpStreakBonus`.
   */
  describe('the level card and the stat sheet', () => {
    /** The amount whose single floor-met day is worth exactly `xp`. */
    function amountWorth(xp: number): number {
      return 5 + (xp - TUNING.xpPerFloorCompletion) / TUNING.xpPerAboveFloorUnit;
    }

    function statOf(view: DashboardView, statId: string) {
      const card = view.stats.find((entry) => entry.stat.id === statId);
      if (card == null) throw new Error(`no stat for ${statId}`);
      return card;
    }

    const [, FIRST, SECOND, THIRD] = TUNING.statLevelThresholds;

    /** 💪 at level 1, 📖 at level 2, 🧘 at level 3 and halfway to level 4 — one habit each. */
    async function threeStats() {
      const kv = await seed(
        [
          habit({ id: 'pull', name: '턱걸이' }),
          habit({ id: 'read', name: '독서', statId: 'intelligence' }),
          habit({ id: 'sit', name: '명상', statId: 'willpower' }),
        ],
        [
          activity('pull', YESTERDAY, amountWorth(FIRST)),
          activity('read', YESTERDAY, amountWorth(SECOND)),
          activity('sit', YESTERDAY, amountWorth((THIRD + TUNING.statLevelThresholds[4]) / 2)),
        ],
      );
      return dashboard(new LocalRepository(kv));
    }

    it('heads the card with the character level, one stat line and the 별 to the next level', async () => {
      const result = await threeStats();
      const toNext = TUNING.statLevelThresholds[4] - (THIRD + TUNING.statLevelThresholds[4]) / 2;

      expect(result.current.characterLevel).toBe(3);
      expect(result.current.level).toEqual({
        title: '캐릭터 레벨 3',
        statLine: '💪 1 · 📖 2 · 🧘 3',
        barFraction: 0.5,
        nextLine: `다음 레벨까지 별 ${toNext}개`,
      });
    });

    it('shows no stat line with no habits, and starts at the first threshold', async () => {
      const result = await dashboard(new LocalRepository(new MemoryKV()));

      expect(result.current.level).toEqual({
        title: '캐릭터 레벨 0',
        statLine: null,
        barFraction: 0,
        nextLine: `다음 레벨까지 별 ${FIRST}개`,
      });
    });

    it('measures the bar on the top stat closest to its next level when two share the top', async () => {
      const kv = await seed(
        [habit({ id: 'pull' }), habit({ id: 'read', statId: 'intelligence' })],
        [
          activity('pull', YESTERDAY, amountWorth(FIRST + 60)),
          activity('read', YESTERDAY, amountWorth(SECOND - 60)),
        ],
      );
      const result = await dashboard(new LocalRepository(kv));

      expect(result.current.characterLevel).toBe(1);
      expect(result.current.level.nextLine).toBe('다음 레벨까지 별 60개');
    });

    it('says 최고 레벨이에요 at the top, where there is no further threshold', async () => {
      const top = TUNING.statLevelThresholds[TUNING.statLevelThresholds.length - 1];
      const result = await dashboard(
        new LocalRepository(await seed([habit()], [activity('h1', YESTERDAY, amountWorth(top))])),
      );

      expect(statOf(result.current, 'strength').xpToNextLevel).toBeNull();
      expect(result.current.level).toMatchObject({ barFraction: 1, nextLine: '최고 레벨이에요' });
    });

    it('opens the stat sheet: one bar per stat with its level, habits and 별 left', async () => {
      const result = await threeStats();

      act(() => result.current.openStats());

      expect(result.current.sheet).toEqual({
        kind: 'stats',
        title: '캐릭터 레벨 3',
        subtitle: result.current.level.nextLine,
        rows: [
          {
            id: 'strength',
            title: '💪 힘',
            levelLabel: '레벨 1',
            barFraction: 0,
            habits: '턱걸이',
            nextLine: `다음 레벨까지 별 ${SECOND - FIRST}개`,
          },
          {
            id: 'intelligence',
            title: '📖 지능',
            levelLabel: '레벨 2',
            barFraction: 0,
            habits: '독서',
            nextLine: `다음 레벨까지 별 ${THIRD - SECOND}개`,
          },
          {
            id: 'willpower',
            title: '🧘 의지',
            levelLabel: '레벨 3',
            barFraction: 0.5,
            habits: '명상',
            nextLine: result.current.level.nextLine,
          },
        ],
      });

      act(() => result.current.closeSheet());
      expect(result.current.sheet).toBeNull();
    });

    it('lists every shown habit under its stat, and no archived one', async () => {
      const kv = await seed([
        habit({ id: 'pull', name: '턱걸이' }),
        habit({ id: 'squat', name: '스쿼트' }),
        habit({ id: 'old', name: '접은 습관', lifecycle: 'archived' }),
      ]);
      const result = await dashboard(new LocalRepository(kv));

      act(() => result.current.openStats());

      if (result.current.sheet?.kind !== 'stats') throw new Error('no stat sheet');
      expect(result.current.sheet.rows.map((row) => row.habits)).toEqual(['턱걸이 · 스쿼트', '', '']);
    });

    it('fills the bar by the current level band, not by the stat\'s whole XP', async () => {
      const result = await dashboard(
        new LocalRepository(await seed([habit()], [activity('h1', YESTERDAY, amountWorth(FIRST / 2))])),
      );

      const card = statOf(result.current, 'strength');
      expect(card.level).toBe(0);
      expect(card.xpToNextLevel).toBe(FIRST / 2);
      expect(card.barFraction).toBeCloseTo(0.5);
    });

    it('sums every habit mapped to the stat, neither one reaching the level alone', async () => {
      const kv = await seed(
        [habit(), habit({ id: 'h2', name: '스쿼트' })],
        [activity('h1', YESTERDAY, amountWorth(FIRST / 2)), activity('h2', YESTERDAY, amountWorth(FIRST / 2))],
      );

      expect(statOf((await dashboard(new LocalRepository(kv))).current, 'strength').level).toBe(1);
    });

    it('keeps an archived habit\'s XP — archiving must not undo a level', async () => {
      const kv = await seed(
        [habit({ id: 'h2', name: '스쿼트', lifecycle: 'archived' }), habit()],
        [activity('h2', YESTERDAY, amountWorth(FIRST / 2)), activity('h1', YESTERDAY, amountWorth(FIRST / 2))],
      );
      const view = (await dashboard(new LocalRepository(kv))).current;

      expect(view.rows.map((row) => row.habit.id)).toEqual(['h1']);
      expect(statOf(view, 'strength').level).toBe(1);
    });

    it('moves the level card as soon as a log lands', async () => {
      const result = await dashboard(new LocalRepository(await seed([habit()])));
      expect(result.current.level.barFraction).toBe(0);

      await record(result, TODAY, 5);

      expect(statOf(result.current, 'strength').xp).toBe(TUNING.xpPerFloorCompletion);
      expect(result.current.level.nextLine).toBe(
        `다음 레벨까지 별 ${FIRST - TUNING.xpPerFloorCompletion}개`,
      );
    });
  });
});
