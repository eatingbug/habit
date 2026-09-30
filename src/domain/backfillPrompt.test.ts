import type { Habit, HabitEntry } from '@/models';

import { TUNING } from '@/config/tuning';

import { buildBackfillActivity, buildBackfillSkip } from './backfill';
import { backfillPrompt } from './backfillPrompt';
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

/**
 * A **local** wall-clock stamp on `date` — the same construction as `backfill.test.ts`.
 * Nothing here asserts a timestamp; the fixtures are local so no test can come to
 * depend on the runner's timezone.
 */
function atLocal(date: string, hour: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, hour).toISOString();
}

let seq = 0;
function activity(date: string, actual: number): HabitEntry {
  return { id: `a${++seq}`, habitId: 'h1', date, timestamp: atLocal(date, 9), actual };
}

/** `n` days before today, as 'YYYY-MM-DD'. */
function ago(n: number): string {
  return addDays(TODAY, -n);
}

/**
 * A history where every day of the last `TUNING.windows.missedRate` days holds a
 * `done` row, so the caller can carve exact numbers of `missed` days out of it.
 */
function fullWindow(): HabitEntry[] {
  return Array.from({ length: TUNING.windows.missedRate }, (_, i) =>
    activity(ago(i + 1), COUNT.floor),
  );
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
    const prompt = backfillPrompt(COUNT, without(fullWindow(), gap), TODAY);

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
    const entries = without(fullWindow(), [...gap, ago(5), ago(6)]);
    // A sub-floor day is NOT a miss and must not be offered for recovery.
    entries.push(activity(ago(5), 1));
    // Nor is a reasoned skip: it is a miss, but its reason is already known.
    entries.push(buildBackfillSkip(COUNT, ago(6), atLocal(ago(6), 12), [], 'x', 'cue', TODAY));

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

/**
 * The prompt half of the parked `:257` — `backfill.test.ts` keeps the reclassification
 * half (#14's split). What a fill or a "안 했어요" does to the prompt itself.
 */
describe('backfillPrompt — after an answer', () => {
  it('drops a filled date and re-counts the run (ADR-0001 recovery)', () => {
    const gap = [ago(2), ago(3), ago(4)];
    const before = without(fullWindow(), gap);
    expect(backfillPrompt(COUNT, before, TODAY).dates).toEqual([ago(4), ago(3), ago(2)]);

    const filled = [
      ...before,
      buildBackfillActivity(COUNT, ago(3), atLocal(ago(3), 12), [], 'new', TODAY),
    ];
    const after = backfillPrompt(COUNT, filled, TODAY);

    expect(after.dates).toEqual([ago(4), ago(2)]);
    expect(after.missedRun).toBe(1);
    expect(after.shouldPrompt).toBe(false);
  });

  it('drops a date marked not-done — a reasoned skip is no longer its business', () => {
    const date = ago(3);
    const entries = [
      ...without(fullWindow(), [ago(2), date, ago(4)]),
      buildBackfillSkip(COUNT, date, atLocal(date, 12), [], 'x', 'cue', TODAY),
    ];

    expect(backfillPrompt(COUNT, entries, TODAY).dates).toEqual([ago(4), ago(2)]);
  });
});
