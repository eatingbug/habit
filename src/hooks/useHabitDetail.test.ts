import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

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
    return createElement(RepositoryProvider, { repository, children });
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
    expect(result.current.panelOrder).toEqual([]);
    expect(result.current.chart).toBeNull();
  });
});

describe('useHabitDetail — the stat pills (D1)', () => {
  it('counts the streak back from today, across the whole history', async () => {
    const entries = [activity(addDays(TODAY, -2), 6), activity(addDays(TODAY, -1), 6)];
    const result = await detail(await seed(habit(), entries));

    // Today is `pending` and transparent (ADR-0001), so the run is the two days before.
    expect(result.current.pills.streak).toBe(2);
  });

  it('shows 성공률, the user-facing rate — a missed day lowers it', async () => {
    // Born six days ago, so the 28-day window holds exactly the days below: five
    // floor-met, one `missed`, and today, which is `pending` and out of both sides.
    const born = habit({ createdAt: `${addDays(TODAY, -6)}T00:00:00.000Z` });
    const entries = [1, 2, 3, 4, 5].map((back) => activity(addDays(TODAY, -back), 6));
    const result = await detail(await seed(born, entries));

    expect(result.current.pills.successRate).toBeCloseTo(5 / 6);
  });

  it('is null below the §4.4 min-sample guard, so the pill can say — instead of 0%', async () => {
    const result = await detail(await seed(habit({ createdAt: `${TODAY}T00:00:00.000Z` })));

    expect(result.current.pills.successRate).toBeNull();
  });
});

describe('useHabitDetail — the journal is a date walk (D7)', () => {
  it('gives an unrecorded past day its own line, newest first', async () => {
    const result = await detail(await seed(habit(), [activity(addDays(TODAY, -1), 6)]));

    expect(result.current.journal[0].date).toBe(TODAY);
    expect(dayOf(result.current, addDays(TODAY, -1)).state).toBe('done');

    const empty = dayOf(result.current, addDays(TODAY, -2));
    expect(empty.state).toBe('missed');
    expect(empty.rows).toEqual([]);
    expect(empty.recoverable).toBe(true);
    expect(empty.backfillable).toBe(true);
  });

  it('starts at the habit’s birth — days before it are out of scope (ADR-0003)', async () => {
    const result = await detail(await seed(habit()));
    const dates = result.current.journal.map((day) => day.date);

    expect(dates[dates.length - 1]).toBe(CREATED);
    expect(dates).not.toContain(addDays(CREATED, -1));
  });

  it('reaches a day older than the chart, and that row is editable there', async () => {
    // §6.3's backfill range is `createdAt`부터 오늘까지, and a day's own journal line is
    // the only gesture that reaches an arbitrary date — the ribbon is read-only (a cell
    // is far under `TAP_TARGET`) and the button names one date. So a journal clipped to
    // the chart's twelve weeks would leave an older gap unreachable.
    const old = addDays(TODAY, -100);
    const born = habit({ createdAt: `${addDays(old, -1)}T00:00:00.000Z` });
    const row = activity(old, 6);
    const result = await detail(await seed(born, [row]));

    expect(dayOf(result.current, old).rows).toHaveLength(1);
    // The chart is unmoved: `TUNING.growthChartWeeks` is its constant, not the walk's.
    expect(result.current.chart?.bars).toHaveLength(TUNING.growthChartWeeks);

    await act(async () => {
      await result.current.editEntry({ ...row, actual: 2 });
    });
    expect(dayOf(result.current, old).state).toBe('partial');

    await act(async () => {
      await result.current.removeEntry(row.id);
    });
    expect(dayOf(result.current, old).state).toBe('missed');
  });

  it('marks today, and only today, as today', async () => {
    // The delete confirm names the day it changes, and `3월 29일` for today is false.
    const result = await detail(await seed(habit()));

    expect(dayOf(result.current, TODAY).isToday).toBe(true);
    expect(result.current.journal.filter((day) => day.isToday)).toHaveLength(1);
  });

  it('keeps a day’s rows together and reports the summed chip amount', async () => {
    const entries = [
      activity(addDays(TODAY, -1), 3, '18:30:00'),
      activity(addDays(TODAY, -1), 2, '07:10:00'),
    ];
    const result = await detail(await seed(habit(), entries));
    const day = dayOf(result.current, addDays(TODAY, -1));

    // The domain total order, not the repository's insertion order (§7.3).
    expect(day.rows.map((row) => row.entry.actual)).toEqual([2, 3]);
    expect(day.state).toBe('done');
    expect(day.sum).toBe(5);
    expect(day.chipAmount).toBe(5);
    expect(day.recoverable).toBe(false);
  });

  it('says no amount on a binary habit — it has none to report', async () => {
    const done = { ...activity(addDays(TODAY, -1), 1), habitId: 'b1' };
    const result = await detail(await seed(binary(), [done]), 'b1');

    expect(dayOf(result.current, addDays(TODAY, -1)).chipAmount).toBeUndefined();
  });

  it('carries the day’s effective skip reason, and calls a partial no miss', async () => {
    const entries = [skip(addDays(TODAY, -1), 'floor'), activity(addDays(TODAY, -2), 3)];
    const result = await detail(await seed(habit(), entries));

    const skipped = dayOf(result.current, addDays(TODAY, -1));
    expect(skipped.state).toBe('skip');
    expect(skipped.skipReason).toBe('floor');

    const partial = dayOf(result.current, addDays(TODAY, -2));
    expect(partial.state).toBe('partial');
    // A `partial` is not a miss (CONTEXT glossary), so it is offered no repair line.
    expect(partial.recoverable).toBe(false);
  });

  it('freezes the time of a noon-pinned row and leaves an ordinary one editable (D11)', async () => {
    const past = addDays(TODAY, -3);
    const entries = [
      activity(past, 6, '07:00:00'),
      { ...activity(past, 6), timestamp: localNoonOn(past) },
    ];
    const result = await detail(await seed(habit(), entries));
    const rows = dayOf(result.current, past).rows;
    // By id, not by position: local noon sorts before or after 07:00Z depending on the
    // device timezone, and the two rows are told apart by the hook's own reading of
    // each — so dropping the call in `journalDay` fails here.
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
});

describe('useHabitDetail — the growth chart’s geometry (D5)', () => {
  it('draws one bar per configured week, oldest first', async () => {
    const result = await detail(await seed(habit()));

    expect(result.current.chart?.bars).toHaveLength(TUNING.growthChartWeeks);
    expect(result.current.chart?.bars[TUNING.growthChartWeeks - 1].weeksAgo).toBe(0);
    expect(result.current.chart?.bars[0].weeksAgo).toBe(TUNING.growthChartWeeks - 1);
  });

  it('scales the bars and both lines against one maximum, so no line escapes', async () => {
    // 60 this week clears both the weekly floor (5×7) and the weekly target (8×7).
    const result = await detail(await seed(habit(), [activity(addDays(THIS_MONDAY, 1), 60)]));
    const chart = result.current.chart;

    expect(chart?.weeklyFloor).toBe(35);
    expect(chart?.weeklyTarget).toBe(56);
    expect(chart?.bars[TUNING.growthChartWeeks - 1].height).toBe(100);
    expect(chart?.floorLine).toBeCloseTo((35 / 60) * 100);
    expect(chart?.targetLine).toBeCloseTo((56 / 60) * 100);
  });

  it('keeps the reference lines inside the chart when every bar is below them', async () => {
    const result = await detail(await seed(habit(), [activity(addDays(THIS_MONDAY, 1), 10)]));
    const chart = result.current.chart;

    // The scale is the target line, the tallest thing drawn.
    expect(chart?.targetLine).toBe(100);
    expect(chart?.floorLine).toBeCloseTo((35 / 56) * 100);
    expect(chart?.bars[TUNING.growthChartWeeks - 1].height).toBeCloseTo((10 / 56) * 100);
  });

  it('draws no target line for a habit whose target says nothing (§4.1)', async () => {
    const noTarget = await detail(await seed(habit({ target: undefined })));
    expect(noTarget.current.chart?.targetLine).toBeNull();
    expect(noTarget.current.chart?.weeklyTarget).toBeNull();

    // `target <= floor` is read as no target at all — the same defensive read.
    const flat = await detail(await seed(habit({ target: 5 })));
    expect(flat.current.chart?.targetLine).toBeNull();
  });

  it('stars the best week, and the most recent of a tie', async () => {
    const entries = [
      activity(addDays(THIS_MONDAY, -6), 10), // last week
      activity(addDays(THIS_MONDAY, 1), 10), // this week
    ];
    const result = await detail(await seed(habit(), entries));
    const starred = result.current.chart?.bars.filter((bar) => bar.best);

    expect(starred).toHaveLength(1);
    expect(starred?.[0].weeksAgo).toBe(0);
    expect(result.current.chart?.best).toBe(10);
  });

  it('reports this week’s running total beside the best week', async () => {
    const entries = [
      activity(addDays(THIS_MONDAY, -6), 20), // last week
      activity(THIS_MONDAY, 4),
      activity(addDays(THIS_MONDAY, 1), 3),
    ];
    const result = await detail(await seed(habit(), entries));

    // The week `today` falls in, still running — the canvas's `최고 62 · 이번 주 37`.
    expect(result.current.chart?.thisWeek).toBe(7);
    expect(result.current.chart?.best).toBe(20);
  });

  it('stars nothing when nothing was ever recorded', async () => {
    const result = await detail(await seed(habit()));

    expect(result.current.chart?.bars.some((bar) => bar.best)).toBe(false);
    expect(result.current.chart?.best).toBe(0);
  });

  it('draws no chart at all for a binary habit — it has no amount per week', async () => {
    const result = await detail(await seed(binary()), 'b1');

    expect(result.current.chart).toBeNull();
    expect(result.current.panelOrder).not.toContain('chart');
  });
});

describe('useHabitDetail — the Forming expectation (D4)', () => {
  it('counts repetitions, not the calendar', async () => {
    const entries = [
      activity(addDays(TODAY, -1), 6),
      activity(addDays(TODAY, -2), 2), // `partial` still counts as showing up (§4.3 C3)
      activity(addDays(TODAY, -10), 6),
    ];
    const result = await detail(await seed(habit(), entries));

    expect(result.current.forming?.days).toBe(3);
    expect(result.current.forming?.expectedDays).toBe(TUNING.formingExpectationDays);
    expect(result.current.forming?.ratio).toBeCloseTo(3 / TUNING.formingExpectationDays);
  });

  it('clamps the ratio at 1 past day 66, and still reports the raw count', async () => {
    const days = TUNING.formingExpectationDays + 4;
    const entries = Array.from({ length: days }, (_, i) => activity(addDays(TODAY, -(i + 1)), 6));
    const result = await detail(
      await seed(habit({ createdAt: `${addDays(TODAY, -(days + 1))}T00:00:00.000Z` }), entries),
    );

    expect(result.current.forming?.days).toBe(days);
    expect(result.current.forming?.ratio).toBe(1);
  });

  it('is absent once the habit is established', async () => {
    const result = await detail(await seed(habit({ lifecycle: 'established' })));

    expect(result.current.forming).toBeNull();
    expect(result.current.panelOrder).not.toContain('forming');
  });
});

describe('useHabitDetail — the panel order (D6)', () => {
  it('puts the pills first while forming, with the chart below them', async () => {
    const result = await detail(await seed(habit()));

    expect(result.current.panelOrder).toEqual([
      'pills',
      'heatmap',
      'forming',
      'chart',
      'design',
      'journal',
    ]);
  });

  it('lifts the growth chart above the pills once established', async () => {
    const result = await detail(await seed(habit({ lifecycle: 'established' })));

    expect(result.current.panelOrder).toEqual(['chart', 'pills', 'heatmap', 'design', 'journal']);
  });

  it('has no chart to lift for an established binary habit', async () => {
    const result = await detail(await seed(binary({ lifecycle: 'established' })), 'b1');

    expect(result.current.panelOrder).toEqual(['pills', 'heatmap', 'design', 'journal']);
  });
});

describe('useHabitDetail — backfill (D10, D14)', () => {
  it('ends the heatmap ribbon on today', async () => {
    const result = await detail(await seed(habit({ createdAt: `${TODAY}T00:00:00.000Z` })));
    const cells = result.current.heatmap;

    expect(cells).toHaveLength(TUNING.heatmapDays);
    expect(cells[cells.length - 1].date).toBe(TODAY);
  });

  it('points 지난 날 기록 추가 at the most recent gap, and it is fillable', async () => {
    // Two gaps: TODAY-6 and TODAY-2. Every other past day in the window is floor-met,
    // so the button must name the newer of the two.
    const filled = [1, 3, 4, 5, 7, 8].map((back) => activity(addDays(TODAY, -back), 6));
    const born = habit({ createdAt: `${addDays(TODAY, -8)}T00:00:00.000Z` });
    const result = await detail(await seed(born, filled));

    expect(result.current.nextBackfillDate).toBe(addDays(TODAY, -2));
    expect(dayOf(result.current, addDays(TODAY, -6)).state).toBe('missed');
    expect(dayOf(result.current, addDays(TODAY, -2)).backfillable).toBe(true);
  });

  it('names no date when the window holds no gap at all', async () => {
    // Born today: the only day in scope is today, which is `pending`, never `missed`.
    const result = await detail(await seed(habit({ createdAt: `${TODAY}T00:00:00.000Z` })));

    expect(result.current.journal.every((day) => day.state !== 'missed')).toBe(true);
    expect(result.current.nextBackfillDate).toBeNull();
  });

  it('drops the button’s date once that gap is filled', async () => {
    const gap = addDays(TODAY, -2);
    const born = habit({ createdAt: `${gap}T00:00:00.000Z` });
    const result = await detail(await seed(born, [activity(addDays(TODAY, -1), 6)]));

    expect(result.current.nextBackfillDate).toBe(gap);

    act(() => result.current.openBackfill(gap));
    await act(async () => {
      await result.current.fillDay();
    });

    expect(result.current.nextBackfillDate).toBeNull();
  });

  it('withholds the skip chips on a date an activity row already covers (§4.1)', async () => {
    const covered = addDays(TODAY, -4);
    const empty = addDays(TODAY, -5);
    const result = await detail(await seed(habit(), [activity(covered, 6)]));

    // No composer, no date to answer about.
    expect(result.current.composerAffordances).toBeNull();

    // Activity overrides skip, so a skip row written on `covered` would change no
    // state, no miss and no diagnosis — the composer must not offer the reason chips.
    act(() => result.current.openBackfill(covered));
    expect(result.current.composerAffordances?.skippable).toBe(false);
    expect(result.current.composerAffordances?.hasActivityToday).toBe(true);

    act(() => result.current.openBackfill(empty));
    expect(result.current.composerAffordances?.skippable).toBe(true);
  });

  it('prefills the composer with the floor, then with the date\'s last amount (§6.2 B2)', async () => {
    const past = addDays(TODAY, -5);
    // Seeded newest-first on purpose: the prefill is the day's **last** amount in the
    // domain's order (`sortDayRows`), never the repository's array order.
    const result = await detail(
      await seed(habit(), [activity(past, 3, '18:00:00'), activity(past, 7, '07:00:00')]),
    );

    // No composer, nothing prefilled.
    expect(result.current.composerDefaultAmount).toBeNull();

    const empty = addDays(TODAY, -6);
    act(() => result.current.openBackfill(empty));
    expect(result.current.composerDefaultAmount).toBe(5);

    act(() => result.current.openBackfill(past));
    expect(result.current.composerDefaultAmount).toBe(3);
  });

  it('prefills a binary composer with 1, which is the only amount it has (§3.3)', async () => {
    const result = await detail(await seed(binary()), 'b1');

    act(() => result.current.openBackfill(addDays(TODAY, -3)));
    expect(result.current.composerDefaultAmount).toBe(1);
  });

  it('ignores a request to open a date the §6.3 range forbids', async () => {
    const result = await detail(await seed(habit()));

    act(() => result.current.openBackfill(addDays(TODAY, 1)));
    expect(result.current.backfillDate).toBeNull();

    act(() => result.current.openBackfill(addDays(CREATED, -1)));
    expect(result.current.backfillDate).toBeNull();
  });

  it('fills a past day at the floor, noon-pinned, and the day recovers (ADR-0001)', async () => {
    const past = addDays(TODAY, -5);
    const result = await detail(await seed(habit()));

    expect(dayOf(result.current, past).state).toBe('missed');

    act(() => result.current.openBackfill(past));
    await act(async () => {
      await result.current.fillDay();
    });

    const day = dayOf(result.current, past);
    expect(day.state).toBe('done');
    expect(day.rows).toHaveLength(1);
    expect(day.rows[0].entry.actual).toBe(5);
    expect(day.rows[0].backfilled).toBe(true);
    expect(day.rows[0].timeEditable).toBe(false);
  });

  it('appends rather than overwriting, with strictly increasing stamps (§6.3)', async () => {
    const past = addDays(TODAY, -5);
    const result = await detail(await seed(habit()));

    act(() => result.current.openBackfill(past));
    await act(async () => {
      await result.current.fillDay(3);
    });
    await act(async () => {
      await result.current.fillDay(4);
    });

    const rows = dayOf(result.current, past).rows;
    expect(rows.map((row) => row.entry.actual)).toEqual([3, 4]);
    expect(rows[0].entry.timestamp < rows[1].entry.timestamp).toBe(true);
    expect(dayOf(result.current, past).sum).toBe(7);
  });

  it('writes a reason onto a past day, which turns an unattributable miss into one', async () => {
    const past = addDays(TODAY, -5);
    const result = await detail(await seed(habit()));

    act(() => result.current.openBackfill(past));
    await act(async () => {
      await result.current.skipDay('cue', { note: '깜빡' });
    });

    const day = dayOf(result.current, past);
    expect(day.state).toBe('skip');
    expect(day.skipReason).toBe('cue');
    expect(day.rows[0].entry.note).toBe('깜빡');
  });

  it('marks a binary fill done with a single row of 1', async () => {
    const past = addDays(TODAY, -5);
    const result = await detail(await seed(binary()), 'b1');

    act(() => result.current.openBackfill(past));
    await act(async () => {
      await result.current.fillDay();
    });

    const day = dayOf(result.current, past);
    expect(day.state).toBe('done');
    expect(day.rows[0].entry.actual).toBe(1);
  });
});

describe('useHabitDetail — editing and deleting one row (#13)', () => {
  it('rewrites the row it is given, and the day reclassifies', async () => {
    const past = addDays(TODAY, -2);
    const row = activity(past, 6);
    const result = await detail(await seed(habit(), [row]));

    await act(async () => {
      await result.current.editEntry({ ...row, actual: 2 });
    });

    const day = dayOf(result.current, past);
    expect(day.rows).toHaveLength(1);
    expect(day.state).toBe('partial');
  });

  it('deletes the row it is given', async () => {
    const past = addDays(TODAY, -2);
    const row = activity(past, 6);
    const result = await detail(await seed(habit(), [row]));

    await act(async () => {
      await result.current.removeEntry(row.id);
    });

    expect(dayOf(result.current, past).state).toBe('missed');
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
