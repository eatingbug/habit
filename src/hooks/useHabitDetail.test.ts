import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ComponentProps, type ReactNode } from 'react';

import { DETAIL_COPY, LIFECYCLE_NOTE, TOOLTIPS } from '@/config/copy';
import { TUNING } from '@/config/tuning';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository } from '@/data';
import { addDays } from '@/domain/dates';
import { localNoonOn } from '@/lib/device';
import type { Habit, HabitEntry, SkipReason } from '@/models';

import { useHabitDetail, type HabitDetailView } from './useHabitDetail';

/**
 * SPEC §6.3 — every judgment the habit detail screen makes, asserted at the hook seam
 * (jest.config.js: a real `LocalRepository` over `MemoryKV`, no component render).
 * Anything decided in `app/habit/[id].tsx` is decided where no test can reach it.
 *
 * `TODAY` is a **Sunday**, so `mondayOf(TODAY)` starts the current ISO week and the
 * chart's twelve buckets are easy to name. Timestamps are never asserted literally:
 * a backfill's stamp is the day's **local** noon (§6.3), so the assertions read the
 * hook's own `JournalRow.backfilled` and hold in any timezone. `localNoonOn` appears
 * only where a fixture has to *be* a noon-pinned row.
 */
const TODAY = '2026-03-29'; // Sunday
const THIS_MONDAY = '2026-03-23';
const CREATED = addDays(TODAY, -40);

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: '턱걸이',
    statId: 'strength',
    kind: 'count',
    floor: 5,
    floorUnit: 'reps',
    target: 8,
    lifecycle: 'forming',
    createdAt: `${CREATED}T00:00:00.000Z`,
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

let seq = 0;
function activity(date: string, actual: number, time = '09:00:00', over: Partial<HabitEntry> = {}) {
  return {
    id: `a${++seq}`,
    habitId: 'h1',
    date,
    timestamp: `${date}T${time}.000Z`,
    actual,
    ...over,
  };
}
function skip(date: string, skipReason: SkipReason, time = '09:00:00'): HabitEntry {
  return {
    id: `s${++seq}`,
    habitId: 'h1',
    date,
    timestamp: `${date}T${time}.000Z`,
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

async function seed(subject: Habit, entries: HabitEntry[] = []): Promise<HabitRepository> {
  const repository = new LocalRepository(new MemoryKV());
  await repository.upsertHabit(subject);
  for (const entry of entries) await repository.upsertEntry(entry);
  return repository;
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

async function detail(repository: HabitRepository, habitId = 'h1') {
  const { result } = renderHook(
    () => useHabitDetail(habitId, { today: TODAY, now: stepClock() }),
    { wrapper: wrapperFor(repository) },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

function dayOf(view: HabitDetailView, date: string) {
  const day = view.journal.find((entry) => entry.date === date);
  if (day == null) throw new Error(`no journal day for ${date}`);
  return day;
}

describe('useHabitDetail — loading', () => {
  it('settles with the habit and its stat', async () => {
    const result = await detail(await seed(habit()));

    expect(result.current.habit?.id).toBe('h1');
    expect(result.current.stat?.name).toBe('힘');
  });

  it('settles empty for an id no habit answers to', async () => {
    const result = await detail(await seed(habit()), 'nobody');

    expect(result.current.habit).toBeNull();
    expect(result.current.journal).toEqual([]);
    expect(result.current.hero).toBeNull();
    expect(result.current.pills).toEqual([]);
    expect(result.current.menu).toEqual([]);
  });
});

/** The pill with this key, or `undefined` when it is not shown. */
function pill(view: HabitDetailView, key: string) {
  return view.pills.find((p) => p.key === key);
}

describe('useHabitDetail — the pills (§6.5 Numbers)', () => {
  it('always shows 연속, 최고 연속 and 성공률, in that order, each with its tooltip', async () => {
    const result = await detail(await seed(habit()));

    expect(result.current.pills.map((p) => [p.label, p.help])).toEqual([
      ['연속', TOOLTIPS.streak],
      ['최고 연속', TOOLTIPS.bestStreak],
      ['성공률', TOOLTIPS.successRate],
    ]);
  });

  it('counts the streak back from today, across the whole history', async () => {
    const entries = [activity(addDays(TODAY, -2), 6), activity(addDays(TODAY, -1), 6)];
    const result = await detail(await seed(habit(), entries));

    // Today is `pending` and transparent (ADR-0001), so the run is the two days before.
    expect(pill(result.current, 'streak')).toMatchObject({ value: '2', unit: '일' });
  });

  it('shows 성공률 as a whole percent — a missed day lowers it', async () => {
    // Born six days ago: five floor-met days, one `missed`, and today `pending`.
    const born = habit({ createdAt: `${addDays(TODAY, -6)}T00:00:00.000Z` });
    const entries = [1, 2, 3, 4, 5].map((back) => activity(addDays(TODAY, -back), 6));
    const result = await detail(await seed(born, entries));

    expect(pill(result.current, 'successRate')).toMatchObject({ value: '83', unit: '%' });
  });

  it('says — with no unit below the §4.4 min-sample guard, instead of 0%', async () => {
    const result = await detail(await seed(habit({ createdAt: `${TODAY}T00:00:00.000Z` })));

    expect(pill(result.current, 'successRate')).toMatchObject({ value: '—', unit: undefined });
  });

  describe('최고 연속', () => {
    function meditated(...backs: number[]): HabitEntry[] {
      return backs.map((back) => activity(addDays(TODAY, -back), 1, '09:00:00', { habitId: 'b1' }));
    }

    it('shows the longest run in the whole history, which the current streak may trail', async () => {
      // Three done days, a two-day gap that misses, then two more done days.
      const result = await detail(await seed(binary(), meditated(7, 6, 5, 2, 1)), 'b1');

      expect(pill(result.current, 'longestStreak')?.value).toBe('3');
      expect(pill(result.current, 'streak')?.value).toBe('2');
    });

    it('shows for a count habit too (§6.5: both habit kinds)', async () => {
      const result = await detail(await seed(habit(), [activity(addDays(TODAY, -1), 6)]));

      expect(pill(result.current, 'longestStreak')?.value).toBe('1');
    });

    it('rises when a backfill joins two past runs (ADR-0001 — derived, never stored)', async () => {
      const result = await detail(await seed(binary(), meditated(5, 4, 3, 1)), 'b1');
      expect(pill(result.current, 'longestStreak')?.value).toBe('3');

      act(() => result.current.openRecord(addDays(TODAY, -2)));
      await act(async () => {
        await result.current.recordFromSheet(1, '');
      });

      expect(pill(result.current, 'longestStreak')?.value).toBe('5');
    });
  });

  describe('조금이라도 한 날, the fourth pill', () => {
    /** Five consecutive days at 2 against a floor of 5 — every one of them `partial`. */
    const partialRun = [1, 2, 3, 4, 5].map((back) => activity(addDays(TODAY, -back), 2));

    it('shows, last, only when it is larger than 연속', async () => {
      const result = await detail(await seed(habit(), partialRun));

      expect(result.current.pills.map((p) => p.key)).toEqual([
        'streak',
        'longestStreak',
        'successRate',
        'engagementStreak',
      ]);
      expect(pill(result.current, 'engagementStreak')).toMatchObject({
        label: '조금이라도 한 날',
        value: '5',
        unit: '일',
        help: TOOLTIPS.engagementStreak,
      });
      expect(pill(result.current, 'streak')?.value).toBe('0');
      // Four pills sit two by two (`ReDetailForming`).
      expect(result.current.pillColumns).toBe(2);
    });

    it('is hidden when it equals 연속', async () => {
      const entries = [1, 2, 3].map((back) => activity(addDays(TODAY, -back), 6));
      const result = await detail(await seed(habit(), entries));

      expect(pill(result.current, 'streak')?.value).toBe('3');
      expect(pill(result.current, 'engagementStreak')).toBeUndefined();
      expect(result.current.pillColumns).toBe(3);
    });

    it('is hidden on a yes/no habit, whose engagement run is its streak', async () => {
      const entries = [1, 2].map((back) =>
        activity(addDays(TODAY, -back), 1, '09:00:00', { habitId: 'b1' }),
      );
      const result = await detail(await seed(binary(), entries), 'b1');

      expect(result.current.pills).toHaveLength(3);
    });
  });
});

describe('useHabitDetail — the journal is a date walk (D7)', () => {
  it('gives an unrecorded past day its own line, newest first', async () => {
    const result = await detail(await seed(habit(), [activity(addDays(TODAY, -1), 6)]));

    expect(result.current.journal[0].date).toBe(TODAY);
    expect(dayOf(result.current, addDays(TODAY, -1)).state).toBe('done');

    const empty = dayOf(result.current, addDays(TODAY, -2));
    expect(empty.state).toBe('missed');
    expect(empty.badge).toBe('! 기록 없음');
    expect(empty.tone).toBe('crit');
    expect(empty.rows).toEqual([]);
    expect(empty.backfillable).toBe(true);
  });

  it('starts at the habit’s birth — days before it are out of scope (ADR-0003)', async () => {
    const result = await detail(await seed(habit()));
    const dates = result.current.journal.map((day) => day.date);

    expect(dates[dates.length - 1]).toBe(CREATED);
    expect(dates).not.toContain(addDays(CREATED, -1));
  });

  it('reaches a day older than the heatmap, and that row is editable there', async () => {
    const old = addDays(TODAY, -100);
    const born = habit({ createdAt: `${addDays(old, -1)}T00:00:00.000Z` });
    const row = activity(old, 6);
    const result = await detail(await seed(born, [row]));

    expect(dayOf(result.current, old).rows).toHaveLength(1);

    act(() => result.current.openEntry(row.id));
    await act(async () => {
      await result.current.saveEntryFromSheet({ kind: 'activity', amount: '2', note: '', time: null });
    });
    expect(dayOf(result.current, old).state).toBe('partial');
    expect(result.current.sheet).toBeNull();
  });

  it('heads each day with its date, today marked, and its state mark and word (§6.0)', async () => {
    const entries = [activity(addDays(TODAY, -1), 6), activity(addDays(TODAY, -2), 3)];
    const result = await detail(await seed(habit(), entries));

    expect(dayOf(result.current, TODAY)).toMatchObject({
      isToday: true,
      title: '3월 29일 (오늘)',
      badge: '아직이에요',
      tone: 'quiet',
    });
    expect(dayOf(result.current, addDays(TODAY, -1))).toMatchObject({
      title: '3월 28일',
      badge: '✓ 했어요',
      tone: 'done',
    });
    expect(dayOf(result.current, addDays(TODAY, -2)).badge).toBe('½ 조금 했어요');
    expect(result.current.journal.filter((day) => day.isToday)).toHaveLength(1);
  });

  it('keeps a day’s rows together, in the domain order, each with its amount and note', async () => {
    const entries = [
      activity(addDays(TODAY, -1), 3, '18:30:00', { note: '출근길에 조금' }),
      activity(addDays(TODAY, -1), 2, '07:10:00'),
    ];
    const result = await detail(await seed(habit(), entries));
    const day = dayOf(result.current, addDays(TODAY, -1));

    // The domain total order, not the repository's insertion order (§7.3).
    expect(day.rows.map((row) => [row.summary, row.entry.note])).toEqual([
      ['+2reps', undefined],
      ['+3reps', '출근길에 조금'],
    ]);
    expect(day.rows[0].time).toMatch(/^\d\d:\d\d$/);
    expect(day.state).toBe('done');
  });

  it('says 했어요 with no amount on a binary habit', async () => {
    const done = { ...activity(addDays(TODAY, -1), 1), habitId: 'b1' };
    const result = await detail(await seed(binary(), [done]), 'b1');

    expect(dayOf(result.current, addDays(TODAY, -1)).rows[0].summary).toBe('✓ 했어요');
  });

  it('names a skip row’s reason', async () => {
    const result = await detail(await seed(habit(), [skip(addDays(TODAY, -1), 'exception')]));
    const skipped = dayOf(result.current, addDays(TODAY, -1));

    expect(skipped.state).toBe('skip');
    expect(skipped.badge).toBe('− 못 했어요');
    // `inset`, apart from the `surface2` of 아직이에요 (`.st.skip`, `.st.pending`).
    expect(skipped.tone).toBe('neutral');
    expect(skipped.rows[0].summary).toBe('못 했어요 · 예외');
  });

  it('freezes the time of a noon-pinned row and leaves an ordinary one editable (D11)', async () => {
    const past = addDays(TODAY, -3);
    const entries = [
      activity(past, 6, '07:00:00'),
      { ...activity(past, 6), timestamp: localNoonOn(past) },
    ];
    const result = await detail(await seed(habit(), entries));
    const rows = dayOf(result.current, past).rows;
    const rowOf = (id: string) => {
      const row = rows.find((each) => each.entry.id === id);
      if (row == null) throw new Error(`no journal row for ${id}`);
      return row;
    };
    const [ordinary, pinned] = entries;

    expect(rowOf(ordinary.id).backfilled).toBe(false);
    expect(rowOf(ordinary.id).timeEditable).toBe(true);
    expect(rowOf(pinned.id).backfilled).toBe(true);
    expect(rowOf(pinned.id).timeEditable).toBe(false);
  });

  describe('최근 3일 and 더 보기 (§6.5 Journal)', () => {
    it('shows the last 3 days, and 더 보기 for the rest', async () => {
      const result = await detail(await seed(habit()));

      expect(result.current.journalShown.map((day) => day.date)).toEqual([
        TODAY,
        addDays(TODAY, -1),
        addDays(TODAY, -2),
      ]);
      expect(result.current.journalMoreLabel).toBe('더 보기');
    });

    it('opens every day on 더 보기, and then offers it no more', async () => {
      const result = await detail(await seed(habit()));

      act(() => result.current.showMoreJournal());

      expect(result.current.journalShown).toHaveLength(result.current.journal.length);
      expect(result.current.journalShown.length).toBeGreaterThan(3);
      expect(result.current.journalMoreLabel).toBeNull();
    });

    it('offers no 더 보기 when the habit has 3 days or fewer', async () => {
      const result = await detail(
        await seed(habit({ createdAt: `${addDays(TODAY, -2)}T00:00:00.000Z` })),
      );

      expect(result.current.journalShown).toHaveLength(3);
      expect(result.current.journalMoreLabel).toBeNull();
    });
  });
});

/** An established count habit — the one whose hero is the weekly chart. */
function established(over: Partial<Habit> = {}): Habit {
  return habit({ lifecycle: 'established', ...over });
}

/** The weekly hero's geometry, or `null` when the hero is not the chart. */
function chartOf(view: HabitDetailView) {
  return view.hero?.kind === 'weekly' ? view.hero.chart : null;
}

describe('useHabitDetail — the growth chart’s geometry (D5)', () => {
  it('draws one bar per configured week, oldest first', async () => {
    const result = await detail(await seed(established()));

    expect(chartOf(result.current)?.bars).toHaveLength(TUNING.growthChartWeeks);
    expect(chartOf(result.current)?.bars[TUNING.growthChartWeeks - 1].weeksAgo).toBe(0);
    expect(chartOf(result.current)?.bars[0].weeksAgo).toBe(TUNING.growthChartWeeks - 1);
  });

  it('scales the bars and both lines against one maximum, so no line escapes', async () => {
    // 60 this week clears both the weekly floor (5×7) and the weekly target (8×7).
    const result = await detail(await seed(established(), [activity(addDays(THIS_MONDAY, 1), 60)]));
    const chart = chartOf(result.current);

    expect(chart?.weeklyFloor).toBe(35);
    expect(chart?.weeklyTarget).toBe(56);
    expect(chart?.bars[TUNING.growthChartWeeks - 1].height).toBe(100);
    expect(chart?.floorLine).toBeCloseTo((35 / 60) * 100);
    expect(chart?.targetLine).toBeCloseTo((56 / 60) * 100);
  });

  it('keeps the reference lines inside the chart when every bar is below them', async () => {
    const result = await detail(await seed(established(), [activity(addDays(THIS_MONDAY, 1), 10)]));
    const chart = chartOf(result.current);

    // The scale is the target line, the tallest thing drawn.
    expect(chart?.targetLine).toBe(100);
    expect(chart?.floorLine).toBeCloseTo((35 / 56) * 100);
    expect(chart?.bars[TUNING.growthChartWeeks - 1].height).toBeCloseTo((10 / 56) * 100);
  });

  it('draws no target line for a habit whose target says nothing (§4.1)', async () => {
    const noTarget = await detail(await seed(established({ target: undefined })));
    expect(chartOf(noTarget.current)?.targetLine).toBeNull();
    expect(chartOf(noTarget.current)?.weeklyTarget).toBeNull();

    // `target <= floor` is read as no target at all — the same defensive read.
    const flat = await detail(await seed(established({ target: 5 })));
    expect(chartOf(flat.current)?.targetLine).toBeNull();
  });

  it('stars the best week, and the most recent of a tie', async () => {
    const entries = [
      activity(addDays(THIS_MONDAY, -6), 10), // last week
      activity(addDays(THIS_MONDAY, 1), 10), // this week
    ];
    const result = await detail(await seed(established(), entries));
    const starred = chartOf(result.current)?.bars.filter((bar) => bar.best);

    expect(starred).toHaveLength(1);
    expect(starred?.[0].weeksAgo).toBe(0);
    expect(chartOf(result.current)?.best).toBe(10);
  });

  it('reports this week’s running total beside the best week', async () => {
    const entries = [
      activity(addDays(THIS_MONDAY, -6), 20), // last week
      activity(THIS_MONDAY, 4),
      activity(addDays(THIS_MONDAY, 1), 3),
    ];
    const result = await detail(await seed(established(), entries));

    // The week `today` falls in, still running — the canvas's `최고 62 · 이번 주 37`.
    expect(chartOf(result.current)?.thisWeek).toBe(7);
    expect(chartOf(result.current)?.best).toBe(20);
  });

  it('stars nothing when nothing was ever recorded', async () => {
    const result = await detail(await seed(established()));

    expect(chartOf(result.current)?.bars.some((bar) => bar.best)).toBe(false);
    expect(chartOf(result.current)?.best).toBe(0);
  });

  it('draws no chart while the habit is forming — the ring leads instead', async () => {
    const result = await detail(await seed(habit()));

    expect(chartOf(result.current)).toBeNull();
  });
});

describe('useHabitDetail — the hero card (§6.5)', () => {
  describe('forming: the 자리 잡는 중 ring', () => {
    it('counts repetitions, not the calendar, against the usual 66 days', async () => {
      const entries = [
        activity(addDays(TODAY, -1), 6),
        activity(addDays(TODAY, -2), 2), // `partial` still counts as showing up (§4.3 C3)
        activity(addDays(TODAY, -10), 6),
      ];
      const result = await detail(await seed(habit(), entries));

      expect(result.current.hero).toMatchObject({
        kind: 'forming',
        daysLabel: '3일',
        expectedLabel: '보통 66일',
      });
      const hero = result.current.hero;
      expect(hero?.kind === 'forming' && hero.ratio).toBeCloseTo(3 / TUNING.formingExpectationDays);
    });

    it('clamps the ring at full past day 66, and still says the raw count', async () => {
      const days = TUNING.formingExpectationDays + 4;
      const entries = Array.from({ length: days }, (_, i) => activity(addDays(TODAY, -(i + 1)), 6));
      const result = await detail(
        await seed(habit({ createdAt: `${addDays(TODAY, -(days + 1))}T00:00:00.000Z` }), entries),
      );

      expect(result.current.hero).toMatchObject({ kind: 'forming', ratio: 1, daysLabel: `${days}일` });
    });

    it('says how much more today raises the streak (the board’s 오늘 4쪽 더 하면 3일)', async () => {
      const entries = [
        activity(addDays(TODAY, -2), 6),
        activity(addDays(TODAY, -1), 6),
        activity(TODAY, 2),
      ];
      const result = await detail(await seed(habit(), entries));

      expect(result.current.hero).toMatchObject({ streak: 2, nextStep: '오늘 3reps 더 하면 3일' });
    });

    it('names the floor when nothing is logged today yet', async () => {
      const result = await detail(await seed(habit(), [activity(addDays(TODAY, -1), 6)]));

      expect(result.current.hero).toMatchObject({ streak: 1, nextStep: '오늘 5reps 하면 2일' });
    });

    it('says the day is done once today’s floor is met', async () => {
      const result = await detail(await seed(habit(), [activity(TODAY, 6)]));

      expect(result.current.hero).toMatchObject({ streak: 1, nextStep: '오늘 몫을 채웠어요' });
    });

    it('says 다시 시작하면 돼요 when a run broke (the ReDetailRed board)', async () => {
      const entries = [1, 3, 4].map((back) =>
        activity(addDays(TODAY, -back - 1), 1, '09:00:00', { habitId: 'b1' }),
      );
      const result = await detail(await seed(binary(), entries), 'b1');

      expect(result.current.hero).toMatchObject({ streak: 0, nextStep: '다시 시작하면 돼요' });
    });

    it('asks a yes/no habit only to do it today', async () => {
      const entries = [activity(addDays(TODAY, -1), 1, '09:00:00', { habitId: 'b1' })];
      const result = await detail(await seed(binary(), entries), 'b1');

      expect(result.current.hero).toMatchObject({ streak: 1, nextStep: '오늘 하면 2일' });
    });
  });

  describe('established: 주마다 한 양', () => {
    it('draws the weekly bars with their labels (C4)', async () => {
      const entries = [activity(addDays(THIS_MONDAY, -6), 20), activity(THIS_MONDAY, 7)];
      const result = await detail(await seed(established(), entries));

      expect(result.current.hero).toMatchObject({
        kind: 'weekly',
        totalLabel: '이번 주 7reps',
        floorLabel: '최소 35',
        targetLabel: '목표 56',
        startLabel: `${TUNING.growthChartWeeks - 1}주 전`,
        endLabel: '이번 주',
      });
    });

    it('has no target label when the habit has no target that counts', async () => {
      const result = await detail(await seed(established({ target: undefined })));

      expect(result.current.hero).toMatchObject({ kind: 'weekly', targetLabel: null });
    });

    it('keeps the bars on a paused habit that was established', async () => {
      const paused = established({
        lifecycle: 'paused',
        pauses: [{ from: addDays(TODAY, -3), resumeTo: 'established' }],
      });
      const result = await detail(await seed(paused));

      expect(result.current.hero?.kind).toBe('weekly');
    });

    it('shows a yes/no habit its streak and next step alone — it has no amount per week', async () => {
      const result = await detail(await seed(binary({ lifecycle: 'established' })), 'b1');

      expect(result.current.hero).toMatchObject({ kind: 'streak', streak: 0, nextStep: '오늘 하면 1일' });
    });
  });
});

/** The open record sheet, or a failure when another sheet (or none) is open. */
function recordSheet(view: HabitDetailView) {
  if (view.sheet?.kind !== 'record') throw new Error(`no record sheet: ${view.sheet?.kind}`);
  return view.sheet;
}

describe('useHabitDetail — the 최근 3주 heatmap (§6.5 Heatmap)', () => {
  it('draws the last 21 days, three weeks, ending on today', async () => {
    const result = await detail(await seed(habit({ createdAt: `${TODAY}T00:00:00.000Z` })));
    const { cells } = result.current.heatmap;

    expect(cells).toHaveLength(21);
    expect(cells[0].date).toBe(addDays(TODAY, -20));
    // The 21st cell is the bottom-right one of a 7 by 3 grid.
    expect(cells[20].date).toBe(TODAY);
  });

  it('heads the 7 columns with the weekdays of the first row, so today sits under its own', async () => {
    const result = await detail(await seed(habit()));

    // TODAY is a Sunday, so the grid starts on a Monday and ends under 일.
    expect(result.current.heatmap.weekdays).toEqual(['월', '화', '수', '목', '금', '토', '일']);
  });

  it('lists the six day-states under the grid, in the §6.0 order', async () => {
    const result = await detail(await seed(habit()));

    expect(result.current.heatmap.legend.map((item) => item.word)).toEqual([
      '했어요',
      '목표까지 했어요',
      '조금 했어요',
      '못 했어요',
      '기록 없음',
      '아직이에요',
    ]);
  });

  it('gives each cell its state, and an accessible name of date and state word', async () => {
    const result = await detail(await seed(habit(), [activity(addDays(TODAY, -1), 6)]));
    const { cells } = result.current.heatmap;

    expect(cells[19]).toMatchObject({ state: 'done', label: '3월 28일 했어요', tappable: true });
    expect(cells[18]).toMatchObject({ state: 'missed', label: '3월 27일 기록 없음' });
    expect(cells[20]).toMatchObject({ state: 'pending', tappable: true });
  });

  it('leaves a day before the habit was born blank and not pressable', async () => {
    const born = habit({ createdAt: `${addDays(TODAY, -2)}T00:00:00.000Z` });
    const result = await detail(await seed(born));
    const { cells } = result.current.heatmap;

    expect(cells[17]).toMatchObject({ state: undefined, label: '3월 26일', tappable: false });
    expect(cells[18].tappable).toBe(true);
  });
});

describe('useHabitDetail — the record sheet for a date (D10, §6.5)', () => {
  it('opens on a past date with that date in its head, a noon time and the skip link', async () => {
    const past = addDays(TODAY, -5);
    const result = await detail(await seed(habit()));

    act(() => result.current.openRecord(past));

    expect(recordSheet(result.current)).toMatchObject({
      date: past,
      eyebrow: '💪 턱걸이',
      title: '3월 24일 화요일',
      sumLabel: null,
      isCount: true,
      unit: 'reps',
      timeLabel: '3월 24일 12:00',
      skipLabel: '3월 24일 못 했어요 · 왜?',
    });
    expect(recordSheet(result.current).resultLine(5)).toBe('이걸로 3월 24일 몫을 채워요 ✓');
  });

  it('calls yesterday 어제 and today 오늘, stamped now', async () => {
    const result = await detail(await seed(habit()));

    act(() => result.current.openRecord(addDays(TODAY, -1)));
    expect(recordSheet(result.current).timeLabel).toBe('어제 12:00');

    act(() => result.current.openRecord(TODAY));
    expect(recordSheet(result.current).timeLabel).toMatch(/^지금 \d\d:\d\d$/);
    expect(recordSheet(result.current).skipLabel).toBe('오늘 못 했어요 · 왜?');
    // Only today's head shows the running sum, as on Today and the Dashboard.
    expect(recordSheet(result.current).sumLabel).toBe('지금 0reps');
  });

  it('changes nothing until 기록하기 — closing the sheet writes no row (#109)', async () => {
    const past = addDays(TODAY, -5);
    const result = await detail(await seed(habit()));

    act(() => result.current.openRecord(past));
    act(() => result.current.closeSheet());

    expect(result.current.sheet).toBeNull();
    expect(dayOf(result.current, past).state).toBe('missed');
    expect(dayOf(result.current, past).rows).toEqual([]);
  });

  it('points 지난 날 기록 추가 at the most recent gap, and it is fillable', async () => {
    const filled = [1, 3, 4, 5, 7, 8].map((back) => activity(addDays(TODAY, -back), 6));
    const born = habit({ createdAt: `${addDays(TODAY, -8)}T00:00:00.000Z` });
    const result = await detail(await seed(born, filled));

    expect(result.current.nextBackfillDate).toBe(addDays(TODAY, -2));
    expect(result.current.backfillLabel).toBe(DETAIL_COPY.backfill);
    expect(dayOf(result.current, addDays(TODAY, -2)).backfillable).toBe(true);
  });

  it('offers no 지난 날 기록 추가 when there is no gap at all', async () => {
    const result = await detail(await seed(habit({ createdAt: `${TODAY}T00:00:00.000Z` })));

    expect(result.current.nextBackfillDate).toBeNull();
    expect(result.current.backfillLabel).toBeNull();
  });

  it('drops the button’s date once that gap is filled', async () => {
    const gap = addDays(TODAY, -2);
    const born = habit({ createdAt: `${gap}T00:00:00.000Z` });
    const result = await detail(await seed(born, [activity(addDays(TODAY, -1), 6)]));

    act(() => result.current.openRecord(gap));
    await act(async () => {
      await result.current.recordFromSheet(5, '');
    });

    expect(result.current.nextBackfillDate).toBeNull();
  });

  it('withholds the skip link on a date an activity row already covers (§4.1)', async () => {
    const covered = addDays(TODAY, -4);
    const result = await detail(await seed(habit(), [activity(covered, 6)]));

    act(() => result.current.openRecord(covered));
    expect(recordSheet(result.current).skipLabel).toBeNull();
  });

  it('prefills the floor, then the date\'s last amount (§6.2 B2)', async () => {
    const past = addDays(TODAY, -5);
    const result = await detail(
      await seed(habit(), [activity(past, 3, '18:00:00'), activity(past, 7, '07:00:00')]),
    );

    act(() => result.current.openRecord(addDays(TODAY, -6)));
    expect(recordSheet(result.current).defaultAmount).toBe(5);

    act(() => result.current.openRecord(past));
    expect(recordSheet(result.current).defaultAmount).toBe(3);
  });

  it('gives a binary habit no stepper', async () => {
    const result = await detail(await seed(binary()), 'b1');

    act(() => result.current.openRecord(addDays(TODAY, -3)));
    expect(recordSheet(result.current)).toMatchObject({ isCount: false, sumLabel: null });
  });

  it('ignores a request to open a date the §6.3 range forbids', async () => {
    const result = await detail(await seed(habit()));

    act(() => result.current.openRecord(addDays(TODAY, 1)));
    expect(result.current.sheet).toBeNull();

    act(() => result.current.openRecord(addDays(CREATED, -1)));
    expect(result.current.sheet).toBeNull();
  });

  it('fills a past day, noon-pinned, closes, and the day recovers (ADR-0001)', async () => {
    const past = addDays(TODAY, -5);
    const result = await detail(await seed(habit()));

    act(() => result.current.openRecord(past));
    await act(async () => {
      await result.current.recordFromSheet(5, '저녁에 읽음');
    });

    expect(result.current.sheet).toBeNull();
    const day = dayOf(result.current, past);
    expect(day.state).toBe('done');
    expect(day.rows).toHaveLength(1);
    expect(day.rows[0].entry).toMatchObject({ actual: 5, note: '저녁에 읽음' });
    expect(day.rows[0].backfilled).toBe(true);
    expect(result.current.toast?.entryId).toBe(day.rows[0].entry.id);
  });

  it('appends rather than overwriting, with strictly increasing stamps (§6.3)', async () => {
    const past = addDays(TODAY, -5);
    const result = await detail(await seed(habit()));

    for (const amount of [3, 4]) {
      act(() => result.current.openRecord(past));
      await act(async () => {
        await result.current.recordFromSheet(amount, '');
      });
    }

    const rows = dayOf(result.current, past).rows;
    expect(rows.map((row) => row.entry.actual)).toEqual([3, 4]);
    expect(rows[0].entry.timestamp < rows[1].entry.timestamp).toBe(true);
  });

  it('moves to the skip reason sheet, whose chip writes a reason onto the past day', async () => {
    const past = addDays(TODAY, -5);
    const result = await detail(await seed(habit()));

    act(() => result.current.openRecord(past));
    act(() => result.current.openSkip(past));
    expect(result.current.sheet).toMatchObject({
      kind: 'skip',
      eyebrow: '💪 턱걸이',
      title: '3월 24일 못 했어요 · 왜?',
    });

    await act(async () => {
      await result.current.skipFromSheet('cue', '깜빡');
    });

    expect(result.current.sheet).toBeNull();
    const day = dayOf(result.current, past);
    expect(day.state).toBe('skip');
    expect(day.rows[0].entry).toMatchObject({ skipReason: 'cue', note: '깜빡' });
  });

  it('marks a binary fill done with a single row of 1', async () => {
    const past = addDays(TODAY, -5);
    const result = await detail(await seed(binary()), 'b1');

    act(() => result.current.openRecord(past));
    await act(async () => {
      await result.current.recordFromSheet(1, '');
    });

    const day = dayOf(result.current, past);
    expect(day.state).toBe('done');
    expect(day.rows[0].entry.actual).toBe(1);
  });
});

describe('useHabitDetail — the edit sheet for one row (#13)', () => {
  it('opens a journal row with its date in the head and its own time', async () => {
    const past = addDays(TODAY, -2);
    const row = activity(past, 6, '07:10:00');
    const result = await detail(await seed(habit(), [row]));

    act(() => result.current.openEntry(row.id));

    expect(result.current.sheet).toMatchObject({
      kind: 'editEntry',
      timeEditable: true,
      item: { entry: row, title: '3월 27일 금요일' },
    });
  });

  it('rewrites the row, and the day reclassifies', async () => {
    const past = addDays(TODAY, -2);
    const row = activity(past, 6);
    const result = await detail(await seed(habit(), [row]));

    act(() => result.current.openEntry(row.id));
    await act(async () => {
      await result.current.saveEntryFromSheet({ kind: 'activity', amount: '2', note: '', time: null });
    });

    const day = dayOf(result.current, past);
    expect(day.rows).toHaveLength(1);
    expect(day.state).toBe('partial');
  });

  it('deletes the row, and names the past day and the streak in the confirm', async () => {
    const entries = [1, 2, 3].map((back) => activity(addDays(TODAY, -back), 6));
    const result = await detail(await seed(habit(), entries));
    const middle = entries[1];

    act(() => result.current.openEntry(middle.id));
    // The edit sheet words its confirm from these: the row's own day, and the run.
    expect(result.current.sheet).toMatchObject({
      kind: 'editEntry',
      dayLabel: '3월 27일',
      deleteEffect: { emptiesDay: true, stateAfter: 'missed', showsStreak: true, streakBefore: 3, streakAfter: 1 },
    });

    await act(async () => {
      await result.current.removeEntryFromSheet();
    });

    expect(result.current.sheet).toBeNull();
    expect(dayOf(result.current, addDays(TODAY, -2)).state).toBe('missed');
  });
});

describe('useHabitDetail — the delete confirm (AC 9)', () => {
  it('is null for an ordinary delete, and for an id the journal does not hold', async () => {
    const past = addDays(TODAY, -2);
    const rows = [activity(past, 6), activity(past, 6, '18:00:00')];
    const result = await detail(await seed(habit(), rows));

    // 6 + 6 against a floor of 5: deleting one leaves 6, so the day drops from `over`
    // to `done` and stays floor-met. Nothing is emptied, no miss is erased and the
    // streak does not move.
    expect(result.current.deletePreview(rows[0].id)).toBeNull();
    expect(result.current.deletePreview('nobody')).toBeNull();
  });

  it('warns on a past day’s last row: it returns to missed and the streak breaks', async () => {
    const rows = [
      activity(addDays(TODAY, -3), 6),
      activity(addDays(TODAY, -2), 6),
      activity(addDays(TODAY, -1), 6),
    ];
    const result = await detail(await seed(habit(), rows));

    const effect = result.current.deletePreview(rows[1].id);
    expect(effect?.emptiesDay).toBe(true);
    expect(effect?.stateAfter).toBe('missed');
    expect(effect?.showsStreak).toBe(true);
    // Both sides, not a difference — `연속 3일 → 1일`.
    expect(effect?.streakBefore).toBe(3);
    expect(effect?.streakAfter).toBe(1);
    expect(effect?.habit.id).toBe('h1');
  });

  it('says nothing about a streak on today’s row — today is still open (ADR-0001)', async () => {
    const rows = [activity(addDays(TODAY, -1), 6), activity(TODAY, 6)];
    const result = await detail(await seed(habit(), rows));

    const effect = result.current.deletePreview(rows[1].id);
    expect(effect?.emptiesDay).toBe(true);
    expect(effect?.stateAfter).toBe('pending');
    expect(effect?.showsStreak).toBe(false);
  });

  it('warns when a surviving row drops a past day below its floor and cuts the run', async () => {
    const past = addDays(TODAY, -1);
    const rows = [activity(addDays(TODAY, -2), 6), activity(past, 3), activity(past, 3, '18:00:00')];
    const result = await detail(await seed(habit(), rows));

    const effect = result.current.deletePreview(rows[2].id);
    // Nothing emptied, no miss erased — the confirm exists only because the run moves.
    expect(effect?.emptiesDay).toBe(false);
    expect(effect?.carriesMiss).toBe(false);
    expect(effect?.showsStreak).toBe(true);
    expect(effect?.streakBefore).toBe(2);
    expect(effect?.streakAfter).toBe(1);
  });

  it('warns when the delete erases the day’s recorded miss', async () => {
    // Latest intent wins (§4.1), so the day reads `cue` — a miss. Deleting that row
    // leaves the `exception` skip, which is no miss at all (ADR-0001).
    const past = addDays(TODAY, -1);
    const rows = [skip(past, 'exception'), skip(past, 'cue', '10:00:00')];
    const result = await detail(await seed(habit(), rows));

    const effect = result.current.deletePreview(rows[1].id);
    expect(effect?.emptiesDay).toBe(false);
    expect(effect?.carriesMiss).toBe(true);
    expect(effect?.stateAfter).toBe('skip');
  });

  it('does not call a past day’s emptied skip an erased miss — it returns to missed', async () => {
    const row = skip(addDays(TODAY, -1), 'cue');
    const result = await detail(await seed(habit(), [row]));

    const effect = result.current.deletePreview(row.id);
    // The miss is not erased, only stripped of its reason: an empty past day is
    // `missed`, which is a miss all the same (ADR-0001). The confirm fires on
    // `emptiesDay`, and must not claim a failure stops being counted.
    expect(effect?.emptiesDay).toBe(true);
    expect(effect?.stateAfter).toBe('missed');
    expect(effect?.carriesMiss).toBe(false);
  });
});

describe('useHabitDetail — the design box (D13, AC 8)', () => {
  it('shows the current hypothesis, with no target when the stored one says nothing', async () => {
    const result = await detail(await seed(habit({ cue: '아침 커피 후', target: 5 })));

    expect(result.current.design?.cue).toBe('아침 커피 후');
    expect(result.current.design?.identity).toBeUndefined();
    expect(result.current.design?.floor).toBe(5);
    expect(result.current.design?.target).toBeUndefined();
    expect(result.current.design?.editsAmounts).toBe(true);
  });

  it('hides the amount inputs on a binary habit', async () => {
    const result = await detail(await seed(binary()), 'b1');

    expect(result.current.design?.editsAmounts).toBe(false);
  });

  it('fills a cue and an identity that were left empty at creation', async () => {
    const result = await detail(await seed(habit()));

    await act(async () => {
      expect(await result.current.saveDesign({ cue: ' 아침 커피 후 ', identity: '몸 쓰는 사람' })).toBeNull();
    });

    expect(result.current.design?.cue).toBe('아침 커피 후');
    expect(result.current.design?.identity).toBe('몸 쓰는 사람');
  });

  it('clears a field on null and leaves an absent one alone', async () => {
    const result = await detail(await seed(habit({ cue: '아침 커피 후', identity: '몸 쓰는 사람' })));

    await act(async () => {
      await result.current.saveDesign({ cue: null });
    });

    expect(result.current.design?.cue).toBeUndefined();
    expect(result.current.design?.identity).toBe('몸 쓰는 사람');
  });

  it('refuses a floor below 1 and a target at or under the floor, writing nothing', async () => {
    const result = await detail(await seed(habit()));

    await act(async () => {
      expect(await result.current.saveDesign({ floor: 0 })).toEqual({
        floor: '최소량은 1 이상의 숫자로 적어 주세요.',
      });
      expect(await result.current.saveDesign({ target: 5 })).toEqual({
        target: '목표는 최소량보다 커야 합니다.',
      });
      expect(await result.current.saveDesign({ floorUnit: '  ' })).toEqual({
        floorUnit: '단위를 적어 주세요 (예: 회, 쪽, 분).',
      });
    });

    expect(result.current.design?.floor).toBe(5);
    expect(result.current.design?.target).toBe(8);
    expect(result.current.design?.floorUnit).toBe('reps');
  });

  it('ignores amounts sent for a binary habit — its floor is always 1 (§3.2)', async () => {
    const result = await detail(await seed(binary()), 'b1');

    await act(async () => {
      expect(await result.current.saveDesign({ floor: 9, target: 20 })).toBeNull();
    });

    expect(result.current.design?.floor).toBe(1);
    expect(result.current.design?.target).toBeUndefined();
  });

  it('raises the floor, which reclassifies the days already recorded (ADR-0001)', async () => {
    const past = addDays(TODAY, -1);
    const result = await detail(await seed(habit(), [activity(past, 6)]));

    expect(dayOf(result.current, past).state).toBe('done');

    await act(async () => {
      await result.current.saveDesign({ floor: 10, target: 20 });
    });

    expect(dayOf(result.current, past).state).toBe('partial');
  });
});
describe('useHabitDetail — the design card (§6.5 Design card)', () => {
  it('words each row: 언제·어디서, 하루 최소량, 하루 목표 and the 능력치', async () => {
    const result = await detail(await seed(habit({ cue: '출근 전, 문틀 바에서', identity: '몸 쓰는 사람' })));

    expect(result.current.designCard).toEqual({
      cue: '출근 전, 문틀 바에서',
      cueInk: 'text',
      floor: '하루 5reps',
      target: '하루 8reps',
      stat: '💪 힘',
      identity: '몸 쓰는 사람',
      identityInk: 'text',
    });
  });

  it('keeps 이것부터 정해 보세요 on screen when 언제·어디서 is empty', async () => {
    const result = await detail(await seed(habit()));

    expect(result.current.designCard).toMatchObject({
      cue: DETAIL_COPY.cueEmpty,
      cueInk: 'critInk',
      identity: DETAIL_COPY.identityEmpty,
      identityInk: 'muted',
    });
  });

  it('hides the 목표 row when the habit has no target that counts (§4.1)', async () => {
    const result = await detail(await seed(habit({ target: 5 })));

    expect(result.current.designCard?.target).toBeNull();
  });

  it('hides the 최소량 and 목표 rows on a yes/no habit', async () => {
    const result = await detail(await seed(binary()), 'b1');

    expect(result.current.designCard).toMatchObject({ floor: null, target: null });
  });

  it('opens the edit sheet on 수정, and a stored edit closes it', async () => {
    const result = await detail(await seed(habit()));

    act(() => result.current.openDesign());
    expect(result.current.sheet).toMatchObject({
      kind: 'design',
      eyebrow: '💪 턱걸이',
      title: DETAIL_COPY.designTitle,
    });

    await act(async () => {
      expect(await result.current.saveDesign({ cue: '아침 커피 후' })).toBeNull();
    });
    expect(result.current.sheet).toBeNull();
    expect(result.current.designCard?.cue).toBe('아침 커피 후');
  });

  it('keeps the edit sheet open when the edit is refused', async () => {
    const result = await detail(await seed(habit()));

    act(() => result.current.openDesign());
    await act(async () => {
      await result.current.saveDesign({ floor: 0 });
    });

    expect(result.current.sheet?.kind).toBe('design');
  });
});

describe('useHabitDetail — the head (§6.5 Head)', () => {
  it('shows the icon, the name and the status light with its tooltip', async () => {
    const result = await detail(await seed(habit()));

    expect(result.current.head).toMatchObject({
      icon: '💪',
      name: '턱걸이',
      lightHelp: TOOLTIPS.statusLight,
      stoppedNote: null,
    });
    expect(['stable', 'caution', 'intervention', 'personal_best']).toContain(result.current.head?.light);
  });

  it('gives a 손봐야 해요 habit the 회고하기 button, and others none', async () => {
    // Two missed days in a row: never-miss-twice turns the light 🔴 (§4.6).
    const red = await detail(await seed(habit()));
    expect(red.current.head?.light).toBe('intervention');
    expect(red.current.head?.reflectLabel).toBe('회고하기');

    const entries = Array.from({ length: 40 }, (_, i) => activity(addDays(TODAY, -(i + 1)), 6));
    const fine = await detail(await seed(habit(), entries));
    expect(fine.current.head?.light).not.toBe('intervention');
    expect(fine.current.head?.reflectLabel).toBeNull();
  });
});

describe('useHabitDetail — the ⋯ menu and its confirm sheets (§6.5 ⋯ menu)', () => {
  function stable() {
    return Array.from({ length: 40 }, (_, i) => activity(addDays(TODAY, -(i + 1)), 6));
  }

  it('offers 회고하기, 잠깐 쉬기 and 보관하기 on an active habit', async () => {
    const result = await detail(await seed(habit(), stable()));

    expect(result.current.menu).toEqual([
      { key: 'reflect', label: '회고하기', ink: 'text' },
      { key: 'pause', label: '⏸ 잠깐 쉬기', ink: 'text' },
      { key: 'archive', label: '🗄 보관하기', ink: 'critInk' },
    ]);
  });

  it('keeps 회고하기 first in every state — 괜찮아요, 손봐야 해요, paused, archived', async () => {
    const paused = habit({ lifecycle: 'paused', pauses: [{ from: TODAY, resumeTo: 'forming' }] });
    const archived = habit({ lifecycle: 'archived', pauses: [{ from: TODAY, resumeTo: 'forming' }] });
    for (const [subject, entries] of [
      [habit(), stable()],
      [habit(), []],
      [paused, []],
      [archived, []],
    ] as const) {
      const result = await detail(await seed(subject, [...entries]));
      expect(result.current.menu[0]).toMatchObject({ key: 'reflect', label: '회고하기' });
    }
  });

  it('pauses only through the confirm sheet', async () => {
    const result = await detail(await seed(habit()));

    await act(() => result.current.pickMenu('pause'));

    expect(result.current.habit?.lifecycle).toBe('forming');
    expect(result.current.sheet).toEqual({
      kind: 'confirm',
      action: 'pause',
      eyebrow: '💪 턱걸이',
      title: '잠깐 쉴까요?',
      body: LIFECYCLE_NOTE,
      confirmLabel: '잠깐 쉬기',
      keepLabel: '그대로 둘게요',
    });

    await act(async () => {
      await result.current.confirmFromSheet();
    });

    expect(result.current.sheet).toBeNull();
    expect(result.current.habit?.lifecycle).toBe('paused');
    expect(result.current.habit?.pauses).toEqual([{ from: TODAY, resumeTo: 'forming' }]);
    expect(result.current.head?.stoppedNote).toBe(DETAIL_COPY.paused);
  });

  it('archives only through its confirm sheet', async () => {
    const past = addDays(TODAY, -3);
    const result = await detail(await seed(habit(), [activity(past, 6)]));

    await act(() => result.current.pickMenu('archive'));
    expect(result.current.sheet).toMatchObject({
      kind: 'confirm',
      title: '보관할까요?',
      body: LIFECYCLE_NOTE,
      confirmLabel: '보관하기',
      keepLabel: '그대로 둘게요',
    });

    await act(async () => {
      await result.current.confirmFromSheet();
    });

    expect(result.current.habit?.lifecycle).toBe('archived');
    expect(result.current.head?.stoppedNote).toBe(DETAIL_COPY.archived);
    // 보관 전에 남긴 날은 한 줄도 사라지지 않았다.
    expect(dayOf(result.current, past).state).toBe('done');
  });

  it('changes nothing on 그대로 둘게요', async () => {
    const result = await detail(await seed(habit()));

    for (const key of ['pause', 'archive'] as const) {
      await act(() => result.current.pickMenu(key));
      act(() => result.current.closeSheet());
    }

    expect(result.current.sheet).toBeNull();
    expect(result.current.habit?.lifecycle).toBe('forming');
    expect(result.current.habit?.pauses).toBeUndefined();
  });

  it('offers a paused habit 다시 시작 in place of 잠깐 쉬기, which resumes at once', async () => {
    const result = await detail(await seed(habit({ lifecycle: 'established' })));

    await act(() => result.current.pickMenu('pause'));
    await act(async () => {
      await result.current.confirmFromSheet();
    });
    expect(result.current.menu.map((item) => item.label)).toEqual(['회고하기', '다시 시작']);

    await act(async () => {
      await result.current.pickMenu('resume');
    });

    // A pause remembers what to resume to: an established habit comes back established.
    expect(result.current.habit?.lifecycle).toBe('established');
    expect(result.current.head?.stoppedNote).toBeNull();
  });

  it('offers an archived habit 다시 꺼내기', async () => {
    const archived = habit({ lifecycle: 'archived', pauses: [{ from: TODAY, resumeTo: 'forming' }] });
    const result = await detail(await seed(archived));

    expect(result.current.menu.map((item) => item.label)).toEqual(['회고하기', '다시 꺼내기']);

    await act(async () => {
      await result.current.pickMenu('unarchive');
    });

    expect(result.current.habit?.lifecycle).toBe('forming');
  });

  it('재개일은 다시 활성이라 그 날을 채우면 연속이 선다 (반열림 [from, to))', async () => {
    const start = addDays(TODAY, -24);
    const entries = [0, 1, 2].map((n) => activity(addDays(start, n), 6));
    const result = await detail(await seed(habit({ createdAt: `${start}T00:00:00.000Z` }), entries));

    expect(pill(result.current, 'streak')?.value).toBe('0');

    await act(() => result.current.pickMenu('pause'));
    await act(async () => {
      await result.current.confirmFromSheet();
    });
    await act(async () => {
      await result.current.pickMenu('resume');
    });
    act(() => result.current.openRecord(TODAY));
    await act(async () => {
      await result.current.recordFromSheet(5, '');
    });

    expect(result.current.habit?.pauses).toEqual([{ from: TODAY, to: TODAY, resumeTo: 'forming' }]);
    expect(pill(result.current, 'streak')?.value).toBe('1');
  });
});
