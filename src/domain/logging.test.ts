import { backfillTimestamp, dayXPContribution, dayXPForSum } from './logging';
import { TUNING } from '../config/tuning';
import type { Habit, HabitEntry } from '../models';

const count: Pick<Habit, 'floor' | 'target' | 'kind'> = { floor: 10, target: 30, kind: 'count' };
const binary: Pick<Habit, 'floor' | 'target' | 'kind'> = { floor: 1, target: undefined, kind: 'binary' };

describe('dayXPForSum', () => {
  it('below floor (partial) earns 0', () => expect(dayXPForSum(3, count)).toBe(0));
  it('zero earns 0', () => expect(dayXPForSum(0, count)).toBe(0));
  it('at the floor earns the base', () =>
    expect(dayXPForSum(10, count)).toBe(TUNING.xpPerFloorCompletion));
  it('above the floor adds intensity XP', () =>
    expect(dayXPForSum(15, count)).toBe(TUNING.xpPerFloorCompletion + 5 * TUNING.xpPerAboveFloorUnit));
  it('at the target adds the over bonus + intensity', () =>
    expect(dayXPForSum(30, count)).toBe(
      TUNING.xpPerFloorCompletion + TUNING.xpBonusTargetExceed + 20 * TUNING.xpPerAboveFloorUnit,
    ));
  it('binary done earns only the base (no intensity / over)', () => {
    expect(dayXPForSum(1, binary)).toBe(TUNING.xpPerFloorCompletion);
    expect(dayXPForSum(5, binary)).toBe(TUNING.xpPerFloorCompletion);
  });
});

describe('dayXPContribution', () => {
  const row = (actual: number, skipReason?: HabitEntry['skipReason']): HabitEntry => ({
    id: 'x',
    habitId: 'h',
    date: '2026-06-10',
    timestamp: '2026-06-10T12:00:00.000Z',
    actual,
    ...(skipReason ? { skipReason } : {}),
  });

  it('sums the day’s activity rows before scoring', () =>
    // sum 12 → done + 2 units above floor
    expect(dayXPContribution([row(6), row(6)], count)).toBe(
      TUNING.xpPerFloorCompletion + 2 * TUNING.xpPerAboveFloorUnit,
    ));
  it('a partial day earns 0', () => expect(dayXPContribution([row(3)], count)).toBe(0));
  it('a skip day earns 0', () => expect(dayXPContribution([row(0, 'floor')], count)).toBe(0));
});

describe('backfillTimestamp', () => {
  it('produces a valid ISO timestamp', () =>
    expect(new Date(backfillTimestamp('2026-06-10', 0)).toISOString()).toBe(
      backfillTimestamp('2026-06-10', 0),
    ));

  it('increments strictly by row index so same-day backfills stay ordered (A4)', () => {
    const t0 = new Date(backfillTimestamp('2026-06-10', 0)).getTime();
    const t1 = new Date(backfillTimestamp('2026-06-10', 1)).getTime();
    const t2 = new Date(backfillTimestamp('2026-06-10', 2)).getTime();
    expect(t1 - t0).toBe(1);
    expect(t2 - t1).toBe(1);
  });
});
