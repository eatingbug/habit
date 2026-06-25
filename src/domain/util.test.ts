import type { HabitEntry } from '../models';
import {
  addDays,
  daysBetween,
  dayOfWeek,
  windowFrom,
  startOfWeek,
  nthWeekWindow,
  isExceptionSkip,
  metFloor,
  aboveFloorAmount,
  entriesInWindow,
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

describe('isExceptionSkip', () => {
  it('is true only for skip + exception', () => {
    expect(isExceptionSkip(entry({ date: '2026-06-10', state: 'skip', skipReason: 'exception' }))).toBe(true);
  });

  it('is false for a skip with a different reason', () => {
    expect(isExceptionSkip(entry({ date: '2026-06-10', state: 'skip', skipReason: 'floor' }))).toBe(false);
  });

  it('is false for a non-skip state even if no reason', () => {
    expect(isExceptionSkip(entry({ date: '2026-06-10', state: 'done', actual: 5 }))).toBe(false);
    expect(isExceptionSkip(entry({ date: '2026-06-10', state: 'over', actual: 50 }))).toBe(false);
  });
});

describe('metFloor', () => {
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

describe('aboveFloorAmount', () => {
  const habit = { floor: 10 };

  it('is the difference when actual strictly exceeds the floor', () => {
    expect(aboveFloorAmount(entry({ date: '2026-06-10', state: 'over', actual: 25 }), habit)).toBe(15);
  });

  it('is 0 when actual equals the floor', () => {
    expect(aboveFloorAmount(entry({ date: '2026-06-10', state: 'done', actual: 10 }), habit)).toBe(0);
  });

  it('is 0 when actual is below the floor', () => {
    expect(aboveFloorAmount(entry({ date: '2026-06-10', state: 'skip', actual: 3 }), habit)).toBe(0);
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

describe('floorCompletionRate', () => {
  const win: DateWindow = { from: '2026-06-01', to: '2026-06-30' };

  it('empty sample → 1.0', () => {
    expect(floorCompletionRate([], win)).toBe(1);
  });

  it('1.0 when there are no entries inside the window (blanks excluded)', () => {
    const entries = [entry({ date: '2026-05-15', state: 'skip', skipReason: 'floor' })];
    expect(floorCompletionRate(entries, win)).toBe(1);
  });

  it('exception skips are excluded from the denominator', () => {
    // 1 done, 1 exception skip → denominator 1, numerator 1 → 1.0 (not 0.5).
    const entries = [
      entry({ date: '2026-06-02', state: 'done', actual: 5 }),
      entry({ date: '2026-06-03', state: 'skip', skipReason: 'exception' }),
    ];
    expect(floorCompletionRate(entries, win)).toBe(1);
  });

  it('a real (floor) skip counts in the denominator as a miss', () => {
    // 1 done, 1 floor-skip → denominator 2, numerator 1 → 0.5.
    const entries = [
      entry({ date: '2026-06-02', state: 'done', actual: 5 }),
      entry({ date: '2026-06-03', state: 'skip', skipReason: 'floor' }),
    ];
    expect(floorCompletionRate(entries, win)).toBe(0.5);
  });

  it('yields the exact met/counted fraction for a mixed set', () => {
    // In-window: 2 done, 1 over (met = 3), 1 floor-skip, 1 cue-skip (misses),
    // 1 exception-skip (excluded). Out-of-window done is ignored.
    // counted = 5, met = 3 → 0.6.
    const entries = [
      entry({ date: '2026-06-05', state: 'done', actual: 5 }),
      entry({ date: '2026-06-06', state: 'done', actual: 5 }),
      entry({ date: '2026-06-07', state: 'over', actual: 50 }),
      entry({ date: '2026-06-08', state: 'skip', skipReason: 'floor' }),
      entry({ date: '2026-06-09', state: 'skip', skipReason: 'cue' }),
      entry({ date: '2026-06-10', state: 'skip', skipReason: 'exception' }), // excluded
      entry({ date: '2026-07-01', state: 'done', actual: 5 }), // out of window
    ];
    expect(floorCompletionRate(entries, win)).toBeCloseTo(0.6, 10);
  });

  it('returns 0 when every counted entry is a miss', () => {
    const entries = [
      entry({ date: '2026-06-02', state: 'skip', skipReason: 'floor' }),
      entry({ date: '2026-06-03', state: 'skip', skipReason: 'cue' }),
    ];
    expect(floorCompletionRate(entries, win)).toBe(0);
  });
});
