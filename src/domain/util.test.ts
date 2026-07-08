import type { HabitEntry, SkipReason } from '../models';
import {
  addDays,
  daysBetween,
  dayOfWeek,
  windowFrom,
  startOfWeek,
  nthWeekWindow,
  isExceptionSkip,
  metFloor,
  entriesInWindow,
  toDayRecords,
  countEngagedDays,
  floorCompletionRate,
  DateWindow,
} from './util';

/** Build a HabitEntry with sensible defaults; override per test. */
function entry(over: Partial<HabitEntry> & Pick<HabitEntry, 'date' | 'state'>): HabitEntry {
  return {
    id: `e-${over.date}-${over.state}`,
    habitId: 'h1',
    timestamp: `${over.date}T12:00:00.000Z`,
    actual: 0,
    ...over,
  };
}

/** Facts-only helpers for the day-based helpers. `state` is a vestigial placeholder. */
let seq = 0;
function act(date: string, actual: number): HabitEntry {
  seq += 1;
  return { id: `a${seq}`, habitId: 'h1', date, timestamp: `${date}T12:00:00.000Z`, actual, state: 'done' };
}
function skip(date: string, skipReason: SkipReason): HabitEntry {
  seq += 1;
  return { id: `s${seq}`, habitId: 'h1', date, timestamp: `${date}T12:00:00.000Z`, actual: 0, skipReason, state: 'skip' };
}

const COUNT_HABIT = { floor: 10, target: 30, kind: 'count' as const };

describe('addDays', () => {
  it('moves forward', () => {
    expect(addDays('2026-06-10', 5)).toBe('2026-06-15');
  });

  it('moves backward', () => {
    expect(addDays('2026-06-10', -5)).toBe('2026-06-05');
  });

  it('is identity for 0', () => {
    expect(addDays('2026-06-10', 0)).toBe('2026-06-10');
  });

  it('crosses a month boundary backward (Mar 1 -1 → Feb 28 non-leap)', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('crosses a month boundary forward (Jan 31 +1 → Feb 1)', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses a year boundary forward (Dec 31 +1 → Jan 1)', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('crosses a year boundary backward (Jan 1 -1 → Dec 31)', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles a leap day (2024 is a leap year: Feb 28 +1 → Feb 29)', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
  });
});

describe('daysBetween', () => {
  it('is positive when a is after b', () => {
    expect(daysBetween('2026-06-15', '2026-06-10')).toBe(5);
  });

  it('is negative when a is before b', () => {
    expect(daysBetween('2026-06-10', '2026-06-15')).toBe(-5);
  });

  it('is 0 for the same day', () => {
    expect(daysBetween('2026-06-10', '2026-06-10')).toBe(0);
  });

  it('spans a month boundary', () => {
    expect(daysBetween('2026-03-01', '2026-02-28')).toBe(1);
  });

  it('spans a year boundary', () => {
    expect(daysBetween('2027-01-01', '2026-12-31')).toBe(1);
  });
});

describe('dayOfWeek', () => {
  it('returns 1 for a known Monday (2026-06-22)', () => {
    expect(dayOfWeek('2026-06-22')).toBe(1);
  });

  it('returns 0 for a known Sunday (2026-06-21)', () => {
    expect(dayOfWeek('2026-06-21')).toBe(0);
  });

  it('returns 6 for a known Saturday (2026-06-20)', () => {
    expect(dayOfWeek('2026-06-20')).toBe(6);
  });
});

describe('windowFrom', () => {
  it('builds a 28-day trailing inclusive window (from = asOf-27, to = asOf)', () => {
    expect(windowFrom('2026-06-10', 28)).toEqual({ from: '2026-05-14', to: '2026-06-10' });
  });

  it('a 1-day window is the single day itself', () => {
    expect(windowFrom('2026-06-10', 1)).toEqual({ from: '2026-06-10', to: '2026-06-10' });
  });

  it('a 7-day window covers exactly 7 days inclusive', () => {
    const w = windowFrom('2026-06-10', 7);
    expect(w).toEqual({ from: '2026-06-04', to: '2026-06-10' });
    expect(daysBetween(w.to, w.from)).toBe(6);
  });
});

describe('startOfWeek (weekStartsOn = 1, Monday)', () => {
  // 2026-06-22 is a Monday.
  it('returns the same day when given the Monday itself', () => {
    expect(startOfWeek('2026-06-22', 1)).toBe('2026-06-22');
  });

  it('returns the prior Monday for a Wednesday', () => {
    expect(startOfWeek('2026-06-24', 1)).toBe('2026-06-22');
  });

  it('returns the prior Monday for the Sunday that ends the week', () => {
    // 2026-06-28 is a Sunday; its Monday is 2026-06-22.
    expect(startOfWeek('2026-06-28', 1)).toBe('2026-06-22');
  });

  it('returns the prior Monday for a Saturday', () => {
    // 2026-06-27 is a Saturday.
    expect(startOfWeek('2026-06-27', 1)).toBe('2026-06-22');
  });
});

describe('nthWeekWindow (weekStartsOn = 1, Monday)', () => {
  // asOf 2026-06-24 (Wed) → current week Mon 2026-06-22 .. Sun 2026-06-28.
  it('weeksAgo 0 is the current Mon..Sun week', () => {
    expect(nthWeekWindow('2026-06-24', 0, 1)).toEqual({ from: '2026-06-22', to: '2026-06-28' });
  });

  it('weeksAgo 1 is the previous Mon..Sun week', () => {
    expect(nthWeekWindow('2026-06-24', 1, 1)).toEqual({ from: '2026-06-15', to: '2026-06-21' });
  });

  it('weeksAgo 2 is two weeks back', () => {
    expect(nthWeekWindow('2026-06-24', 2, 1)).toEqual({ from: '2026-06-08', to: '2026-06-14' });
  });

  it('each window is exactly 7 days (to = from + 6)', () => {
    const w = nthWeekWindow('2026-06-24', 0, 1);
    expect(daysBetween(w.to, w.from)).toBe(6);
  });
});

describe('isExceptionSkip (facts-only: reason === exception)', () => {
  it('is true for an exception skip', () => {
    expect(isExceptionSkip(entry({ date: '2026-06-10', state: 'skip', skipReason: 'exception' }))).toBe(true);
  });

  it('is false for a skip with a different reason', () => {
    expect(isExceptionSkip(entry({ date: '2026-06-10', state: 'skip', skipReason: 'floor' }))).toBe(false);
  });

  it('is false for an activity row (no reason)', () => {
    expect(isExceptionSkip(entry({ date: '2026-06-10', state: 'done', actual: 5 }))).toBe(false);
    expect(isExceptionSkip(entry({ date: '2026-06-10', state: 'over', actual: 50 }))).toBe(false);
  });
});

describe('metFloor (legacy per-row, kept for UI)', () => {
  it('is true for done', () => {
    expect(metFloor(entry({ date: '2026-06-10', state: 'done', actual: 5 }))).toBe(true);
  });

  it('is true for over', () => {
    expect(metFloor(entry({ date: '2026-06-10', state: 'over', actual: 50 }))).toBe(true);
  });

  it('is false for skip (any reason)', () => {
    expect(metFloor(entry({ date: '2026-06-10', state: 'skip', skipReason: 'floor' }))).toBe(false);
    expect(metFloor(entry({ date: '2026-06-10', state: 'skip', skipReason: 'exception' }))).toBe(false);
  });
});

describe('entriesInWindow', () => {
  const win: DateWindow = { from: '2026-06-10', to: '2026-06-12' };
  const entries: HabitEntry[] = [
    entry({ date: '2026-06-09', state: 'done', actual: 5 }), // before
    entry({ date: '2026-06-10', state: 'done', actual: 5 }), // on from bound
    entry({ date: '2026-06-11', state: 'done', actual: 5 }), // inside
    entry({ date: '2026-06-12', state: 'done', actual: 5 }), // on to bound
    entry({ date: '2026-06-13', state: 'done', actual: 5 }), // after
  ];

  it('includes both boundary days and excludes outside days', () => {
    const got = entriesInWindow(entries, win).map((e) => e.date);
    expect(got).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);
  });

  it('returns empty when nothing falls in the window', () => {
    expect(entriesInWindow(entries, { from: '2026-07-01', to: '2026-07-31' })).toEqual([]);
  });
});

describe('toDayRecords', () => {
  it('groups multiple rows on a date and sums activity', () => {
    const recs = toDayRecords([act('2026-06-02', 6), act('2026-06-02', 6)], COUNT_HABIT);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ date: '2026-06-02', state: 'done', sumActual: 12 });
  });

  it('classifies each day and sorts ascending by date', () => {
    const recs = toDayRecords(
      [act('2026-06-03', 3), skip('2026-06-01', 'cue'), act('2026-06-02', 50)],
      COUNT_HABIT,
    );
    expect(recs.map((r) => [r.date, r.state])).toEqual([
      ['2026-06-01', 'skip'],
      ['2026-06-02', 'over'],
      ['2026-06-03', 'partial'],
    ]);
  });

  it('exposes the effective skip reason', () => {
    const recs = toDayRecords([skip('2026-06-01', 'floor')], COUNT_HABIT);
    expect(recs[0].effectiveSkipReason).toBe('floor');
  });

  it('binary habit ignores target (multiple done rows → one done day)', () => {
    const binary = { floor: 1, kind: 'binary' as const };
    const recs = toDayRecords([act('2026-06-01', 1), act('2026-06-01', 1)], binary);
    expect(recs).toEqual([
      { date: '2026-06-01', state: 'done', sumActual: 2, effectiveSkipReason: undefined },
    ]);
  });
});

describe('countEngagedDays', () => {
  const win: DateWindow = { from: '2026-06-01', to: '2026-06-30' };
  const entries = [
    act('2026-06-02', 10), // done
    act('2026-06-03', 3), // partial
    skip('2026-06-04', 'floor'), // miss
    skip('2026-06-05', 'exception'), // excluded
  ];

  it('counts done/partial/non-exception-skip by default; excludes exception & blank', () => {
    expect(countEngagedDays(entries, win, COUNT_HABIT)).toBe(3);
  });

  it('excludes partial when countPartialAsEngaged is false', () => {
    expect(countEngagedDays(entries, win, COUNT_HABIT, { countPartialAsEngaged: false })).toBe(2);
  });
});

describe('floorCompletionRate (day-based)', () => {
  const win: DateWindow = { from: '2026-06-01', to: '2026-06-30' };

  it('empty sample → 1.0', () => {
    expect(floorCompletionRate([], win, COUNT_HABIT)).toBe(1);
  });

  it('1.0 when nothing falls in the window (blanks excluded)', () => {
    expect(floorCompletionRate([act('2026-05-15', 3)], win, COUNT_HABIT)).toBe(1);
  });

  it('exception skips are excluded from the denominator', () => {
    const entries = [act('2026-06-02', 10), skip('2026-06-03', 'exception')];
    expect(floorCompletionRate(entries, win, COUNT_HABIT)).toBe(1);
  });

  it('a real (floor) skip counts as a miss', () => {
    const entries = [act('2026-06-02', 10), skip('2026-06-03', 'floor')];
    expect(floorCompletionRate(entries, win, COUNT_HABIT)).toBe(0.5);
  });

  it('a partial day lowers the rate by default (engaged, not met)', () => {
    const entries = [act('2026-06-02', 10), act('2026-06-03', 3)];
    expect(floorCompletionRate(entries, win, COUNT_HABIT)).toBe(0.5);
  });

  it('with countPartialAsEngaged:false, partial days are excluded from both parts', () => {
    const entries = [act('2026-06-02', 10), act('2026-06-03', 3)];
    expect(floorCompletionRate(entries, win, COUNT_HABIT, { countPartialAsEngaged: false })).toBe(1);
  });

  it('sums multiple activity rows on one day before classifying', () => {
    const entries = [act('2026-06-02', 6), act('2026-06-02', 6)]; // one day, sum 12 → done
    expect(floorCompletionRate(entries, win, COUNT_HABIT)).toBe(1);
  });

  it('yields the exact met/engaged fraction for a mixed set', () => {
    const entries = [
      act('2026-06-05', 10), // done
      act('2026-06-06', 10), // done
      act('2026-06-07', 50), // over
      skip('2026-06-08', 'floor'), // miss
      skip('2026-06-09', 'cue'), // miss
      skip('2026-06-10', 'exception'), // excluded
      act('2026-06-11', 4), // partial → engaged, not met
      act('2026-07-01', 10), // out of window
    ];
    // engaged = 6 (3 met + 2 miss + 1 partial), met = 3 → 0.5
    expect(floorCompletionRate(entries, win, COUNT_HABIT)).toBeCloseTo(0.5, 10);
  });

  it('returns 0 when every engaged day is a miss', () => {
    const entries = [skip('2026-06-02', 'floor'), skip('2026-06-03', 'cue')];
    expect(floorCompletionRate(entries, win, COUNT_HABIT)).toBe(0);
  });
});
