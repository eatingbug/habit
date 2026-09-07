import type { Habit, HabitEntry, SkipReason } from '@/models';

import {
  classifyDay,
  dayStates,
  effectiveSkipReason,
  isDateInScope,
  isMissDay,
  sortDayRows,
} from './classify';

const COUNT: Habit = {
  id: 'h1',
  name: '팔굽혀펴기',
  statId: 'strength',
  kind: 'count',
  floor: 5,
  floorUnit: 'reps',
  target: 8,
  lifecycle: 'forming',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const BINARY: Habit = {
  id: 'h2',
  name: '명상',
  statId: 'willpower',
  kind: 'binary',
  floor: 1,
  floorUnit: 'time',
  lifecycle: 'forming',
  createdAt: '2026-01-01T00:00:00.000Z',
};

let seq = 0;
function activity(date: string, actual: number, time = '09:00:00'): HabitEntry {
  return { id: `a${++seq}`, habitId: 'h1', date, timestamp: `${date}T${time}.000Z`, actual };
}
function skip(date: string, skipReason: SkipReason, time = '09:00:00', id?: string): HabitEntry {
  return {
    id: id ?? `s${++seq}`,
    habitId: 'h1',
    date,
    timestamp: `${date}T${time}.000Z`,
    actual: 0,
    skipReason,
  };
}

describe('isDateInScope (ADR-0003)', () => {
  it('is false before createdAt and true on the creation date itself', () => {
    expect(isDateInScope(COUNT, '2025-12-31')).toBe(false);
    expect(isDateInScope(COUNT, '2026-01-01')).toBe(true);
  });

  it('is false inside a pause interval and true again on the resume date (half-open [from, to))', () => {
    const paused: Habit = { ...COUNT, pauses: [{ from: '2026-02-01', to: '2026-02-15' }] };
    expect(isDateInScope(paused, '2026-01-31')).toBe(true);
    expect(isDateInScope(paused, '2026-02-01')).toBe(false);
    expect(isDateInScope(paused, '2026-02-14')).toBe(false);
    // the resume date is active again
    expect(isDateInScope(paused, '2026-02-15')).toBe(true);
  });

  it('is false indefinitely for an open interval (still paused)', () => {
    const paused: Habit = { ...COUNT, pauses: [{ from: '2026-02-01' }] };
    expect(isDateInScope(paused, '2026-02-01')).toBe(false);
    expect(isDateInScope(paused, '2027-06-01')).toBe(false);
  });
});

describe('classifyDay — no rows (ADR-0001)', () => {
  it('is pending when the date is today', () => {
    expect(classifyDay([], COUNT, '2026-03-10', '2026-03-10')).toBe('pending');
  });

  it('is missed when the date is past', () => {
    expect(classifyDay([], COUNT, '2026-03-09', '2026-03-10')).toBe('missed');
  });

  it('is still missed for a past date, even out of scope — the scope check lives in consumers', () => {
    // classifyDay stays TOTAL (§4.1); `dayStates` is what drops out-of-scope empty days.
    const paused: Habit = { ...COUNT, pauses: [{ from: '2026-03-01', to: '2026-03-20' }] };
    expect(classifyDay([], paused, '2026-03-09', '2026-03-10')).toBe('missed');
  });
});

describe('classifyDay — activity rows classify by the day SUM', () => {
  it('sums two rows to done', () => {
    const day = [activity('2026-03-09', 2), activity('2026-03-09', 4)];
    expect(classifyDay(day, COUNT, '2026-03-09', '2026-03-10')).toBe('done');
  });

  it('upgrades to over once the sum reaches the target', () => {
    const day = [activity('2026-03-09', 5), activity('2026-03-09', 4)];
    expect(classifyDay(day, COUNT, '2026-03-09', '2026-03-10')).toBe('over');
  });

  it('is partial when positive but sub-floor', () => {
    const day = [activity('2026-03-09', 2), activity('2026-03-09', 1)];
    expect(classifyDay(day, COUNT, '2026-03-09', '2026-03-10')).toBe('partial');
  });

  it('lets a single activity row override the day’s skip rows', () => {
    const day = [skip('2026-03-09', 'cue'), activity('2026-03-09', 5, '21:00:00')];
    expect(classifyDay(day, COUNT, '2026-03-09', '2026-03-10')).toBe('done');
  });

  it('never emits over below the floor when target <= floor (defensive)', () => {
    const corrupt: Habit = { ...COUNT, floor: 5, target: 3 };
    const day = [activity('2026-03-09', 4)];
    expect(classifyDay(day, corrupt, '2026-03-09', '2026-03-10')).toBe('partial');
  });

  it('ignores any target on a binary habit (defensive)', () => {
    const corrupt: Habit = { ...BINARY, target: 1 };
    const day = [{ ...activity('2026-03-09', 1), habitId: 'h2' }];
    expect(classifyDay(day, corrupt, '2026-03-09', '2026-03-10')).toBe('done');
  });

  it('is done for a binary habit on any activity row, idempotent across many', () => {
    const one = [{ ...activity('2026-03-09', 1), habitId: 'h2' }];
    const many = [
      { ...activity('2026-03-09', 1), habitId: 'h2' },
      { ...activity('2026-03-09', 1, '18:00:00'), habitId: 'h2' },
    ];
    expect(classifyDay(one, BINARY, '2026-03-09', '2026-03-10')).toBe('done');
    expect(classifyDay(many, BINARY, '2026-03-09', '2026-03-10')).toBe('done');
  });

  it('over always implies done — an over day has met the floor', () => {
    const day = [activity('2026-03-09', 9)];
    const state = classifyDay(day, COUNT, '2026-03-09', '2026-03-10');
    expect(state).toBe('over');
    const sum = day.reduce((t, e) => t + e.actual, 0);
    expect(sum).toBeGreaterThanOrEqual(COUNT.floor);
  });

  it('is invariant under any permutation of a day’s rows', () => {
    const rows = [activity('2026-03-09', 2), activity('2026-03-09', 4, '18:00:00'), skip('2026-03-09', 'cue', '07:00:00')];
    const forward = classifyDay(rows, COUNT, '2026-03-09', '2026-03-10');
    const reversed = classifyDay([...rows].reverse(), COUNT, '2026-03-09', '2026-03-10');
    expect(reversed).toBe(forward);
  });

  it('classifies an in-pause day that holds rows normally (ADR-0003 asymmetry)', () => {
    const paused: Habit = { ...COUNT, pauses: [{ from: '2026-03-01', to: '2026-03-20' }] };
    const day = [activity('2026-03-05', 6)];
    expect(classifyDay(day, paused, '2026-03-05', '2026-03-10')).toBe('done');
  });
});

describe('classifyDay — only skip rows', () => {
  it('is skip', () => {
    expect(classifyDay([skip('2026-03-09', 'cue')], COUNT, '2026-03-09', '2026-03-10')).toBe('skip');
  });
});

describe('effectiveSkipReason — latest intent wins under (timestamp ASC, id ASC)', () => {
  it('picks the most recent skip row by timestamp', () => {
    const rows = [skip('2026-03-09', 'cue', '09:00:00'), skip('2026-03-09', 'floor', '21:00:00')];
    expect(effectiveSkipReason(rows)).toBe('floor');
    expect(effectiveSkipReason([...rows].reverse())).toBe('floor');
  });

  it('breaks an equal-timestamp tie by id, deterministically under permutation', () => {
    // §6.3 gives same-day backfills strictly increasing sub-noon offsets, but equal
    // timestamps must still resolve — id ASC is the final tiebreak.
    const a = skip('2026-03-09', 'cue', '12:00:00', 'id-a');
    const b = skip('2026-03-09', 'identity', '12:00:00', 'id-b');
    expect(effectiveSkipReason([a, b])).toBe('identity');
    expect(effectiveSkipReason([b, a])).toBe('identity');
  });

  it('resolves strictly increasing sub-noon backfill offsets', () => {
    const rows = [
      skip('2026-03-09', 'cue', '12:00:00'),
      skip('2026-03-09', 'floor', '12:00:01'),
    ];
    expect(effectiveSkipReason(rows)).toBe('floor');
  });

  it('is undefined when the day holds no skip row', () => {
    expect(effectiveSkipReason([activity('2026-03-09', 5)])).toBeUndefined();
    expect(effectiveSkipReason([])).toBeUndefined();
  });
});

describe('isMissDay', () => {
  it('counts an unrecorded past day as a miss (ADR-0001)', () => {
    expect(isMissDay('missed', [])).toBe(true);
  });

  it('does not count pending, partial, done or over', () => {
    expect(isMissDay('pending', [])).toBe(false);
    expect(isMissDay('partial', [activity('2026-03-09', 2)])).toBe(false);
    expect(isMissDay('done', [activity('2026-03-09', 5)])).toBe(false);
    expect(isMissDay('over', [activity('2026-03-09', 9)])).toBe(false);
  });

  it('counts a non-exception skip as a miss but never an exception skip', () => {
    expect(isMissDay('skip', [skip('2026-03-09', 'cue')])).toBe(true);
    expect(isMissDay('skip', [skip('2026-03-09', 'floor')])).toBe(true);
    expect(isMissDay('skip', [skip('2026-03-09', 'identity')])).toBe(true);
    expect(isMissDay('skip', [skip('2026-03-09', 'exception')])).toBe(false);
  });

  it('reads the effective reason, so the latest skip decides the miss', () => {
    const rows = [skip('2026-03-09', 'cue', '09:00:00'), skip('2026-03-09', 'exception', '21:00:00')];
    expect(isMissDay('skip', rows)).toBe(false);
  });
});

describe('backfill repairs a missed day', () => {
  it('reclassifies the day and clears the miss', () => {
    const before = classifyDay([], COUNT, '2026-03-09', '2026-03-10');
    expect(before).toBe('missed');
    expect(isMissDay(before, [])).toBe(true);

    const filled = [activity('2026-03-09', 5, '12:00:00')];
    const after = classifyDay(filled, COUNT, '2026-03-09', '2026-03-10');
    expect(after).toBe('done');
    expect(isMissDay(after, filled)).toBe(false);
  });
});

describe('dayStates — the one shared walk over a date range', () => {
  it('drops dates before createdAt', () => {
    const walked = dayStates(COUNT, [], '2025-12-30', '2026-01-02', '2026-01-02');
    expect(walked.map((d) => d.date)).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('drops empty in-pause days but keeps in-pause days that hold rows (ADR-0003)', () => {
    const paused: Habit = { ...COUNT, pauses: [{ from: '2026-03-02', to: '2026-03-05' }] };
    const entries = [activity('2026-03-03', 6)];
    const walked = dayStates(paused, entries, '2026-03-01', '2026-03-05', '2026-03-05');
    expect(walked.map((d) => [d.date, d.state])).toEqual([
      ['2026-03-01', 'missed'],
      // 03-02 and 03-04 are empty and in-pause → no state at all
      ['2026-03-03', 'done'],
      ['2026-03-05', 'pending'],
    ]);
  });

  it('groups rows onto the day named by `date`, not by `timestamp`', () => {
    // A row timestamped late UTC still belongs to the `date` it declares (§3.3).
    const entries = [{ ...activity('2026-03-09', 5), timestamp: '2026-03-10T02:00:00.000Z' }];
    const walked = dayStates(COUNT, entries, '2026-03-09', '2026-03-10', '2026-03-10');
    expect(walked.map((d) => [d.date, d.state])).toEqual([
      ['2026-03-09', 'done'],
      ['2026-03-10', 'pending'],
    ]);
  });

  it('reports the day sum and the effective skip reason alongside each state', () => {
    const entries = [activity('2026-03-08', 2), activity('2026-03-08', 1), skip('2026-03-09', 'floor')];
    const walked = dayStates(COUNT, entries, '2026-03-08', '2026-03-09', '2026-03-10');
    expect(walked[0]).toMatchObject({ state: 'partial', sum: 3, isMiss: false });
    expect(walked[1]).toMatchObject({ state: 'skip', sum: 0, isMiss: true, skipReason: 'floor' });
  });
});

describe('sortDayRows — the domain total order', () => {
  it('orders by timestamp ASC then id ASC and is permutation-invariant', () => {
    const a = skip('2026-03-09', 'cue', '12:00:00', 'id-b');
    const b = skip('2026-03-09', 'floor', '12:00:00', 'id-a');
    const c = activity('2026-03-09', 5, '08:00:00');
    const ids = (rows: HabitEntry[]) => sortDayRows(rows).map((r) => r.id);
    expect(ids([a, b, c])).toEqual([c.id, 'id-a', 'id-b']);
    expect(ids([b, c, a])).toEqual([c.id, 'id-a', 'id-b']);
  });
});
