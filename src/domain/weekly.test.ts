import type { Habit, HabitEntry } from '@/models';

import { weeklyActualTotals } from './weekly';

/**
 * SPEC §4.6 C4 — `weeklyActualTotals`, the numbers the §6.3 growth chart draws.
 *
 * `TODAY` is a **Sunday**, so the ISO week containing it is complete. Mondays of the
 * trailing weeks: 03-23 (this week), 03-16, 03-09, 03-02.
 *
 * The fixtures' `Z` stamps are irrelevant to every expectation here: `weeklyActualTotals`
 * buckets by `entry.date` alone — it reaches the rows through `dayStates`, which groups
 * on `date` (§3.3, the authoritative day) and hands back `sum`, and the only field the
 * function then reads is `day.date`. No `timestamp` is read on the path to a total, so
 * the device timezone cannot move a row between weeks.
 */
const TODAY = '2026-03-29'; // Sunday
const MID_WEEK = '2026-03-25'; // Wednesday of the same ISO week

/** floor 5 / target 8 — the amounts are what matter, not achievement. */
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
  createdAt: '2026-01-01T00:00:00.000Z',
};

let seq = 0;
function activity(date: string, actual: number, time = '09:00:00'): HabitEntry {
  return { id: `a${++seq}`, habitId: 'h1', date, timestamp: `${date}T${time}.000Z`, actual };
}

function born(date: string): string {
  return `${date}T00:00:00.000Z`;
}

describe('weeklyActualTotals — day-summed actual per ISO week, most-recent last (§4.6 C4)', () => {
  const habit: Habit = { ...COUNT, createdAt: born('2026-03-01') };

  it('returns one total per requested week, oldest first, summing a day’s rows', () => {
    const entries = [
      activity('2026-03-17', 2), // week of 03-16
      activity('2026-03-17', 3, '20:00:00'), // same day → summed
      activity('2026-03-24', 9), // week of 03-23 (this week)
    ];
    expect(weeklyActualTotals(entries, habit, TODAY, 3)).toEqual([0, 5, 9]);
  });

  it('is fixed length — fully unrecorded weeks read 0, not a gap', () => {
    expect(weeklyActualTotals([], habit, TODAY, 4)).toEqual([0, 0, 0, 0]);
    expect(weeklyActualTotals([], habit, TODAY, 1)).toEqual([0]);
  });

  it('counts sub-floor days too — it is actual amount, not achievement', () => {
    expect(weeklyActualTotals([activity('2026-03-24', 2)], habit, TODAY, 1)).toEqual([2]);
  });

  it('the last element is the week containing asOfDate, even mid-week', () => {
    // Wednesday 03-25 belongs to the same ISO week as Sunday 03-29.
    expect(weeklyActualTotals([activity('2026-03-24', 7)], habit, MID_WEEK, 1)).toEqual([7]);
  });
});
