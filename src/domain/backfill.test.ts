import type { Habit, HabitEntry } from '@/models';

import { TUNING } from '@/config/tuning';

import {
  buildBackfillActivity,
  buildBackfillSkip,
  isBackfillableDate,
  nextBackfillTimestamp,
} from './backfill';
import { dayStates } from './classify';
import { addDays } from './dates';

const TODAY = '2026-03-01';

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

/**
 * A **local** wall-clock stamp on `date`. Every fixture here is built this way, and no
 * test asserts a `Z` literal: the pin is local noon, so a suite written in UTC literals
 * would assert the implementation against itself and pass in exactly one timezone.
 */
function atLocal(date: string, hour: number, minute = 0): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

/** The day's local noon — what `src/lib/device.ts` `localNoonOn` hands the builders. */
function noonOn(date: string): string {
  return atLocal(date, 12);
}

function plusSeconds(stamp: string, seconds: number): string {
  return new Date(Date.parse(stamp) + seconds * 1_000).toISOString();
}

let seq = 0;
function activity(date: string, actual: number, hour = 9): HabitEntry {
  return { id: `a${++seq}`, habitId: 'h1', date, timestamp: atLocal(date, hour), actual };
}

/** `n` days before today, as 'YYYY-MM-DD'. */
function ago(n: number): string {
  return addDays(TODAY, -n);
}

/** A day the classifier will see as anything but `missed`, to break a run. */
function doneDay(date: string): HabitEntry {
  return activity(date, COUNT.floor);
}

/** A history where every one of the last 14 days holds a `done` row, so a test can
 *  carve exact `missed` days out of it. */
function fullWindow(): HabitEntry[] {
  return Array.from({ length: TUNING.windows.missedRate }, (_, i) => doneDay(ago(i + 1)));
}

/** Drops the rows on the given dates, leaving those days with zero rows → `missed`. */
function without(entries: HabitEntry[], dates: string[]): HabitEntry[] {
  return entries.filter((e) => !dates.includes(e.date));
}

describe('isBackfillableDate (§6.3 allowed range)', () => {
  it('allows today and every date back to createdAt', () => {
    expect(isBackfillableDate(COUNT, TODAY, TODAY)).toBe(true);
    expect(isBackfillableDate(COUNT, '2026-01-01', TODAY)).toBe(true);
    expect(isBackfillableDate(COUNT, ago(10), TODAY)).toBe(true);
  });

  it('blocks dates before createdAt', () => {
    expect(isBackfillableDate(COUNT, '2025-12-31', TODAY)).toBe(false);
  });

  it('blocks future dates', () => {
    expect(isBackfillableDate(COUNT, addDays(TODAY, 1), TODAY)).toBe(false);
  });

  it('allows a date inside a pause interval — filling a day actually done is pure recovery (ADR-0003)', () => {
    const paused: Habit = { ...COUNT, pauses: [{ from: ago(6), to: ago(1) }] };
    expect(isBackfillableDate(paused, ago(3), TODAY)).toBe(true);
  });
});

describe('nextBackfillTimestamp (§6.3 noon pin)', () => {
  it('pins the first backfill of a date to that day’s local noon', () => {
    const date = ago(3);
    const at = new Date(nextBackfillTimestamp(noonOn(date), []));

    // The property, not the constant: the user reads the stamp back off the local
    // clock (`clockOf`), and what it must read there is 12:00 on the target date.
    expect([at.getHours(), at.getMinutes(), at.getSeconds()]).toEqual([12, 0, 0]);
    expect([at.getFullYear(), at.getMonth() + 1, at.getDate()]).toEqual(
      date.split('-').map(Number),
    );
  });

  it('still pins to noon when the date already holds ordinary rows on either side of noon', () => {
    const date = ago(3);
    // 21:00 local is `12:00Z` in Seoul — the row a UTC pin would collide with.
    const rows = [activity(date, 2, 9), activity(date, 2, 21)];

    expect(nextBackfillTimestamp(noonOn(date), rows)).toBe(noonOn(date));
  });

  it('gives repeated same-day backfills strictly increasing sub-noon offsets', () => {
    const date = ago(3);
    const rows: HabitEntry[] = [];
    const stamps: string[] = [];

    for (let i = 0; i < 3; i++) {
      const row = buildBackfillActivity(COUNT, date, noonOn(date), rows, `b${i}`, TODAY);
      stamps.push(row.timestamp);
      rows.push(row);
    }

    expect(stamps).toEqual([noonOn(date), plusSeconds(noonOn(date), 1), plusSeconds(noonOn(date), 2)]);
    // Strictly increasing under lexicographic compare — the total order of §7.3.
    expect([...stamps].sort()).toEqual(stamps);
  });

  it('is unaffected by the order the existing rows are passed in', () => {
    const date = ago(3);
    const rows = [
      buildBackfillActivity(COUNT, date, noonOn(date), [], 'b0', TODAY),
      {
        ...buildBackfillActivity(COUNT, date, noonOn(date), [], 'b1', TODAY),
        timestamp: plusSeconds(noonOn(date), 1),
      },
    ];

    expect(nextBackfillTimestamp(noonOn(date), [...rows].reverse())).toBe(
      plusSeconds(noonOn(date), 2),
    );
  });
});

describe('buildBackfillActivity — filling a past date', () => {
  it('appends one activity row at the floor and never overwrites an existing row', () => {
    const date = ago(3);
    const existing = [activity(date, 2)];
    const row = buildBackfillActivity(COUNT, date, noonOn(date), existing, 'new', TODAY);

    expect(row).toEqual({
      id: 'new',
      habitId: COUNT.id,
      date,
      timestamp: noonOn(date),
      actual: COUNT.floor,
    });
    expect(existing).toHaveLength(1);
    expect(existing[0].actual).toBe(2);
  });

  it('uses floor 1 for a binary habit ("mark done")', () => {
    expect(buildBackfillActivity(BINARY, ago(3), noonOn(ago(3)), [], 'new', TODAY).actual).toBe(1);
  });

  /**
   * The ADR-0001 trade, on one day: the unrecorded day is a miss, and filling it takes
   * the miss back. Carved out of the parked `backfillPrompt.test.ts` — its other half
   * ("and drops it from the prompt") belongs to `backfillPrompt`, which lands with #22.
   */
  it('reclassifies the filled date out of missed (ADR-0001 recovery)', () => {
    const date = ago(3);
    const before = without(fullWindow(), [date]);
    expect(dayStates(COUNT, before, date, date, TODAY)[0].state).toBe('missed');

    const filled = [...before, buildBackfillActivity(COUNT, date, noonOn(date), [], 'new', TODAY)];

    const day = dayStates(COUNT, filled, date, date, TODAY)[0];
    expect(day.state).toBe('done');
    expect(day.isMiss).toBe(false);
  });

  it('creates an activity row, never a day-state row', () => {
    const row = buildBackfillActivity(COUNT, ago(3), noonOn(ago(3)), [], 'new', TODAY);

    expect(row.actual).toBeGreaterThan(0);
    expect(row.skipReason).toBeUndefined();
    expect(Object.keys(row)).not.toContain('state');
  });

  it('refuses a future date and a pre-createdAt date', () => {
    const future = addDays(TODAY, 1);
    expect(() =>
      buildBackfillActivity(COUNT, future, noonOn(future), [], 'new', TODAY),
    ).toThrow();
    expect(() =>
      buildBackfillActivity(COUNT, '2025-12-31', noonOn('2025-12-31'), [], 'new', TODAY),
    ).toThrow();
  });
});

describe('buildBackfillSkip — marking a past date not-done', () => {
  it('appends a skip row carrying the chosen reason', () => {
    const date = ago(3);
    const row = buildBackfillSkip(COUNT, date, noonOn(date), [], 'new', 'floor', TODAY);

    expect(row).toEqual({
      id: 'new',
      habitId: COUNT.id,
      date,
      timestamp: noonOn(date),
      actual: 0,
      skipReason: 'floor',
    });
  });

  it('turns the day into a skip that still counts as a miss, so a reason now exists', () => {
    const date = ago(3);
    const entries = [...without(fullWindow(), [date]), buildBackfillSkip(COUNT, date, noonOn(date), [], 'x', 'cue', TODAY)];
    const day = dayStates(COUNT, entries, date, date, TODAY)[0];

    expect(day.state).toBe('skip');
    expect(day.skipReason).toBe('cue');
    expect(day.isMiss).toBe(true);
  });

  it('marking exception makes the day not a miss', () => {
    const date = ago(3);
    const entries = [
      ...without(fullWindow(), [date]),
      buildBackfillSkip(COUNT, date, noonOn(date), [], 'x', 'exception', TODAY),
    ];

    expect(dayStates(COUNT, entries, date, date, TODAY)[0].isMiss).toBe(false);
  });

  it('shares the noon pin and the increasing offsets with activity backfill', () => {
    const date = ago(3);
    const first = buildBackfillActivity(COUNT, date, noonOn(date), [], 'a', TODAY);
    const second = buildBackfillSkip(COUNT, date, noonOn(date), [first], 'b', 'cue', TODAY);

    expect(second.timestamp).toBe(plusSeconds(noonOn(date), 1));
  });
});
