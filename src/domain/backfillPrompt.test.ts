import type { Habit, HabitEntry } from '@/models';

import { TUNING } from '@/config/tuning';

import { dayStates } from './classify';
import { addDays } from './dates';
import {
  backfillPrompt,
  buildBackfillActivity,
  buildBackfillSkip,
  isBackfillableDate,
  nextBackfillTimestamp,
} from './backfill';

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

let seq = 0;
function activity(date: string, actual: number, time = '09:00:00'): HabitEntry {
  return { id: `a${++seq}`, habitId: 'h1', date, timestamp: `${date}T${time}.000Z`, actual };
}

/** `n` days before today, as 'YYYY-MM-DD'. */
function ago(n: number): string {
  return addDays(TODAY, -n);
}

/** A day the classifier will see as anything but `missed`, to break a run. */
function doneDay(date: string): HabitEntry {
  return activity(date, COUNT.floor);
}

/**
 * A history where every day of the last `TUNING.windows.missedRate` days holds a
 * `done` row, so the caller can carve exact numbers of `missed` days out of it.
 */
function fullWindow(): HabitEntry[] {
  return Array.from({ length: TUNING.windows.missedRate }, (_, i) => doneDay(ago(i + 1)));
}

/** Drops the rows on the given dates, leaving those days with zero rows → `missed`. */
function without(entries: HabitEntry[], dates: string[]): HabitEntry[] {
  return entries.filter((e) => !dates.includes(e.date));
}

describe('backfillPrompt — trigger (ADR-0002)', () => {
  const run = TUNING.diagnosis.missedRunForBackfillPrompt;

  it(`fires at ${run} consecutive missed days`, () => {
    const gap = [ago(2), ago(3), ago(4)].slice(0, run);
    const prompt = backfillPrompt(COUNT, without(fullWindow(), gap), TODAY);

    expect(prompt.missedRun).toBe(run);
    expect(prompt.shouldPrompt).toBe(true);
  });

  it('does not fire one short of the consecutive-missed threshold', () => {
    const gap = [ago(2), ago(3), ago(4)].slice(0, run - 1);
    const prompt = backfillPrompt(COUNT, without(fullWindow(), gap), TODAY);

    expect(prompt.missedRun).toBe(run - 1);
    expect(prompt.shouldPrompt).toBe(false);
  });

  it('fires above the 14-day missed rate even when no run reaches the threshold', () => {
    const window = TUNING.windows.missedRate;
    const needed = Math.floor(window * TUNING.diagnosis.missedRateForBackfillPrompt) + 1;
    // Every other day, so the longest consecutive run stays at 1.
    const gap = Array.from({ length: needed }, (_, i) => ago(1 + i * 2));
    const entries = without(fullWindow(), gap);
    // Days beyond the window keep the run isolated; the window itself is 14 days.
    const prompt = backfillPrompt(COUNT, entries, TODAY);

    expect(prompt.missedRun).toBeLessThan(run);
    expect(prompt.missedRate).toBeGreaterThan(TUNING.diagnosis.missedRateForBackfillPrompt);
    expect(prompt.shouldPrompt).toBe(true);
  });

  it('does not fire below the missed rate threshold with no run', () => {
    const window = TUNING.windows.missedRate;
    const allowed = Math.floor(window * TUNING.diagnosis.missedRateForBackfillPrompt);
    const gap = Array.from({ length: allowed }, (_, i) => ago(1 + i * 2));
    const prompt = backfillPrompt(COUNT, without(fullWindow(), gap), TODAY);

    expect(prompt.missedRun).toBeLessThan(run);
    expect(prompt.missedRate).toBeLessThanOrEqual(TUNING.diagnosis.missedRateForBackfillPrompt);
    expect(prompt.shouldPrompt).toBe(false);
  });

  it('does not fire for a habit with no missed days at all', () => {
    const prompt = backfillPrompt(COUNT, fullWindow(), TODAY);

    expect(prompt.shouldPrompt).toBe(false);
    expect(prompt.dates).toEqual([]);
  });
});

describe('backfillPrompt — which dates it lists', () => {
  it('lists only missed dates, ascending — not partial, pending, skip or done days', () => {
    const gap = [ago(2), ago(3), ago(4)];
    const entries = without(fullWindow(), gap);
    // A sub-floor day is NOT a miss and must not be offered for recovery.
    entries.push(activity(ago(5), 1));

    const prompt = backfillPrompt(COUNT, entries, TODAY);

    expect(prompt.dates).toEqual([ago(4), ago(3), ago(2)]);
  });

  it('never lists today — an unlogged today is pending, not missed', () => {
    const prompt = backfillPrompt(COUNT, without(fullWindow(), [ago(1), ago(2), ago(3)]), TODAY);

    expect(prompt.dates).not.toContain(TODAY);
  });

  it('lists no date before createdAt', () => {
    const young: Habit = { ...COUNT, createdAt: `${ago(4)}T00:00:00.000Z` };
    const prompt = backfillPrompt(young, [], TODAY);

    expect(prompt.dates).toEqual([ago(4), ago(3), ago(2), ago(1)]);
  });

  it('lists no empty day inside a pause interval (ADR-0003)', () => {
    const paused: Habit = { ...COUNT, pauses: [{ from: ago(6), to: ago(1) }] };
    const prompt = backfillPrompt(paused, without(fullWindow(), [ago(2), ago(3), ago(4)]), TODAY);

    expect(prompt.dates).toEqual([]);
    expect(prompt.shouldPrompt).toBe(false);
  });

  it('carries a Korean question naming how many days it lists', () => {
    const prompt = backfillPrompt(COUNT, without(fullWindow(), [ago(2), ago(3), ago(4)]), TODAY);

    expect(prompt.question).toBe('이 3일, 하셨나요?');
  });

  it('emits no diagnosis flag, component or severity for missed days (§7.3)', () => {
    const prompt = backfillPrompt(COUNT, without(fullWindow(), [ago(2), ago(3), ago(4)]), TODAY);

    expect(Object.keys(prompt).sort()).toEqual([
      'dates',
      'missedRate',
      'missedRun',
      'question',
      'shouldPrompt',
    ]);
  });
});

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
  it('pins the first backfill of a date to noon', () => {
    expect(nextBackfillTimestamp(ago(3), [])).toBe(`${ago(3)}T12:00:00.000Z`);
  });

  it('still pins to noon when the date already holds ordinary rows on either side of noon', () => {
    const date = ago(3);
    const rows = [activity(date, 2, '09:00:00'), activity(date, 2, '21:00:00')];

    expect(nextBackfillTimestamp(date, rows)).toBe(`${date}T12:00:00.000Z`);
  });

  it('gives repeated same-day backfills strictly increasing sub-noon offsets', () => {
    const date = ago(3);
    const rows: HabitEntry[] = [];
    const stamps: string[] = [];

    for (let i = 0; i < 3; i++) {
      const row = buildBackfillActivity(COUNT, date, rows, `b${i}`, TODAY);
      stamps.push(row.timestamp);
      rows.push(row);
    }

    expect(stamps).toEqual([
      `${date}T12:00:00.000Z`,
      `${date}T12:00:01.000Z`,
      `${date}T12:00:02.000Z`,
    ]);
    // Strictly increasing under lexicographic compare — the total order of §7.3.
    expect([...stamps].sort()).toEqual(stamps);
  });

  it('is unaffected by the order the existing rows are passed in', () => {
    const date = ago(3);
    const rows = [
      buildBackfillActivity(COUNT, date, [], 'b0', TODAY),
      { ...buildBackfillActivity(COUNT, date, [], 'b1', TODAY), timestamp: `${date}T12:00:01.000Z` },
    ];

    expect(nextBackfillTimestamp(date, [...rows].reverse())).toBe(`${date}T12:00:02.000Z`);
  });
});

describe('buildBackfillActivity — filling a listed date', () => {
  it('appends one activity row at the floor and never overwrites an existing row', () => {
    const date = ago(3);
    const existing = [activity(date, 2)];
    const row = buildBackfillActivity(COUNT, date, existing, 'new', TODAY);

    expect(row).toEqual({
      id: 'new',
      habitId: COUNT.id,
      date,
      timestamp: `${date}T12:00:00.000Z`,
      actual: COUNT.floor,
    });
    expect(existing).toHaveLength(1);
    expect(existing[0].actual).toBe(2);
  });

  it('uses floor 1 for a binary habit ("mark done")', () => {
    expect(buildBackfillActivity(BINARY, ago(3), [], 'new', TODAY).actual).toBe(1);
  });

  it('reclassifies the filled date out of missed and drops it from the prompt (ADR-0001 recovery)', () => {
    const gap = [ago(2), ago(3), ago(4)];
    const before = without(fullWindow(), gap);
    expect(backfillPrompt(COUNT, before, TODAY).dates).toEqual(gap.slice().reverse());

    const filled = [...before, buildBackfillActivity(COUNT, ago(3), [], 'new', TODAY)];

    const day = dayStates(COUNT, filled, ago(3), ago(3), TODAY)[0];
    expect(day.state).toBe('done');
    expect(day.isMiss).toBe(false);

    const after = backfillPrompt(COUNT, filled, TODAY);
    expect(after.dates).toEqual([ago(4), ago(2)]);
    expect(after.missedRun).toBe(1);
    expect(after.shouldPrompt).toBe(false);
  });

  it('creates an activity row, never a day-state row', () => {
    const row = buildBackfillActivity(COUNT, ago(3), [], 'new', TODAY);

    expect(row.actual).toBeGreaterThan(0);
    expect(row.skipReason).toBeUndefined();
    expect(Object.keys(row)).not.toContain('state');
  });

  it('refuses a future date and a pre-createdAt date', () => {
    expect(() => buildBackfillActivity(COUNT, addDays(TODAY, 1), [], 'new', TODAY)).toThrow();
    expect(() => buildBackfillActivity(COUNT, '2025-12-31', [], 'new', TODAY)).toThrow();
  });
});

describe('buildBackfillSkip — marking a listed date not-done', () => {
  it('appends a skip row carrying the chosen reason', () => {
    const date = ago(3);
    const row = buildBackfillSkip(COUNT, date, [], 'new', 'floor', TODAY);

    expect(row).toEqual({
      id: 'new',
      habitId: COUNT.id,
      date,
      timestamp: `${date}T12:00:00.000Z`,
      actual: 0,
      skipReason: 'floor',
    });
  });

  it('turns the day into a skip that still counts as a miss, so a reason now exists', () => {
    const date = ago(3);
    const entries = [...without(fullWindow(), [date]), buildBackfillSkip(COUNT, date, [], 'x', 'cue', TODAY)];
    const day = dayStates(COUNT, entries, date, date, TODAY)[0];

    expect(day.state).toBe('skip');
    expect(day.skipReason).toBe('cue');
    expect(day.isMiss).toBe(true);
    // The prompt is about `missed` days only; a reasoned skip is no longer its business.
    expect(backfillPrompt(COUNT, entries, TODAY).dates).not.toContain(date);
  });

  it('marking exception makes the day not a miss', () => {
    const date = ago(3);
    const entries = [
      ...without(fullWindow(), [date]),
      buildBackfillSkip(COUNT, date, [], 'x', 'exception', TODAY),
    ];

    expect(dayStates(COUNT, entries, date, date, TODAY)[0].isMiss).toBe(false);
  });

  it('shares the noon pin and the increasing offsets with activity backfill', () => {
    const date = ago(3);
    const first = buildBackfillActivity(COUNT, date, [], 'a', TODAY);
    const second = buildBackfillSkip(COUNT, date, [first], 'b', 'cue', TODAY);

    expect(second.timestamp).toBe(`${date}T12:00:01.000Z`);
  });
});
