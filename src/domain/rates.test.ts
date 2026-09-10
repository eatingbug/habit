import type { Habit, HabitEntry } from '@/models';

import { TUNING } from '@/config/tuning';

import { buildBackfillActivity } from './backfill';
import { floorCompletionRate, successRate } from './rates';

/**
 * SPEC §4.4's "deliberately different populations", carved out of the parked
 * `diagnose.test.ts` — the five-rule engine those fixtures also serve lands with #20.
 *
 * `AS_OF` is a Tuesday.
 */
const AS_OF = '2026-03-31';

const COUNT: Habit = {
  id: 'h1',
  name: '팔굽혀펴기',
  statId: 'strength',
  kind: 'count',
  floor: 5,
  floorUnit: 'reps',
  target: 8,
  cue: '아침 커피 후',
  identity: '몸을 돌보는 사람',
  lifecycle: 'forming',
  createdAt: '2025-12-01T00:00:00.000Z',
};

let seq = 0;
function activity(date: string, actual: number, time = '09:00:00'): HabitEntry {
  return { id: `a${++seq}`, habitId: 'h1', date, timestamp: `${date}T${time}.000Z`, actual };
}

/** `n` consecutive dates ending at `end` (inclusive), ascending. */
function daysEndingAt(end: string, n: number): string[] {
  const ms = Date.parse(`${end}T00:00:00.000Z`);
  return Array.from({ length: n }, (_, i) =>
    new Date(ms - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

describe('successRate vs floorCompletionRate — deliberately different populations (§4.4)', () => {
  // 28 days all in scope: 10 done, 5 partial, 13 with no rows at all (`missed`).
  const window = TUNING.windows.floorRate;
  const dates = daysEndingAt(AS_OF, window);
  const habit: Habit = { ...COUNT, createdAt: `${dates[0]}T00:00:00.000Z` };
  // 13 unrecorded days first, then 10 floor-met, then 5 partial — the last day of the
  // window is `partial` rather than `pending`, so the denominator is the full 28.
  const entries = [
    ...dates.slice(13, 23).map((d) => activity(d, 6)),
    ...dates.slice(23, 28).map((d) => activity(d, 2)),
  ];

  it('successRate counts missed days in the denominator (the number the user sees)', () => {
    expect(successRate(entries, habit, AS_OF, window)).toBeCloseTo(10 / 28);
  });

  it('floorCompletionRate excludes missed days from both sides', () => {
    expect(floorCompletionRate(entries, habit, AS_OF, window)).toBeCloseTo(10 / 15);
  });

  it('floorCompletionRate({ excludePartial }) drops partial from both sides but keeps missed', () => {
    expect(floorCompletionRate(entries, habit, AS_OF, window, { excludePartial: true })).toBeCloseTo(
      10 / 23,
    );
  });

  it('both return null when there is not enough data', () => {
    const fresh: Habit = { ...COUNT, createdAt: `${AS_OF}T00:00:00.000Z` };
    expect(successRate([], fresh, AS_OF, window)).toBeNull();
    expect(floorCompletionRate([], fresh, AS_OF, window)).toBeNull();
  });

  it('floorCompletionRate is null when every day in the window is missed (no engaged days)', () => {
    expect(floorCompletionRate([], habit, AS_OF, window)).toBeNull();
    // …while the user-facing rate still reads 0% — a missed day is a miss (ADR-0001).
    expect(successRate([], habit, AS_OF, window)).toBe(0);
  });

  it('converting a day missed → partial never worsens the rates the costly consumers read (§7.3)', () => {
    const dates14 = daysEndingAt(AS_OF, 14);
    const scoped: Habit = { ...COUNT, createdAt: `${dates14[0]}T00:00:00.000Z` };
    const before = dates14.slice(0, 5).map((d) => activity(d, 6));
    const after = [...before, activity(dates14[5], 2)];

    // successRate: both states sit in the denominator, so it cannot move.
    expect(successRate(after, scoped, AS_OF, 28)).toBeCloseTo(
      successRate(before, scoped, AS_OF, 28)!,
    );
    // the demotion rate (§4.7) can only rise: the day leaves the denominator entirely.
    expect(floorCompletionRate(after, scoped, AS_OF, 28, { excludePartial: true })!).toBeGreaterThan(
      floorCompletionRate(before, scoped, AS_OF, 28, { excludePartial: true })!,
    );
  });
  /**
   * AC 8b — ADR-0001's trade, actually paid. The parked suite never asserted this: its
   * §7.3 monotonicity guard is `missed → partial`, a transition `successRate` *cannot*
   * move (both states sit in its denominator). Only `missed → done`/`over` adds to the
   * numerator while the denominator stays put, so this is the one test that proves an
   * unrecorded day is recoverable rather than merely forgiven.
   */
  it('backfilling a missed day to done raises the user-facing success rate (AC 8b)', () => {
    const filled = dates[5];
    const [y, mo, d] = filled.split('-').map(Number);
    const row = buildBackfillActivity(
      habit,
      filled,
      new Date(y, mo - 1, d, 12, 0).toISOString(),
      [],
      'backfilled',
      AS_OF,
    );
    const after = [...entries, row];

    expect(successRate(entries, habit, AS_OF, window)).toBeCloseTo(10 / 28);
    // The denominator does not move — `missed` was already in it — so the whole gain
    // is numerator: the recovered day now counts as a success.
    expect(successRate(after, habit, AS_OF, window)).toBeCloseTo(11 / 28);
    expect(successRate(after, habit, AS_OF, window)!).toBeGreaterThan(
      successRate(entries, habit, AS_OF, window)!,
    );
  });
});
