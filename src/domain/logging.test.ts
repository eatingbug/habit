import {
  backfillTimestamp,
  dayXPContribution,
  dayXPForSum,
  describeDeleteConsequence,
  oneTapAction,
  previewLog,
  smartDefaultAmount,
} from './logging';
import { TUNING } from '../config/tuning';
import type { Habit, HabitEntry } from '../models';

const count: Pick<Habit, 'floor' | 'target' | 'kind'> = { floor: 10, target: 30, kind: 'count' };
const binary: Pick<Habit, 'floor' | 'target' | 'kind'> = { floor: 1, target: undefined, kind: 'binary' };

const HABIT: Habit = {
  id: 'h',
  name: 'Pushups',
  statId: 'strength',
  kind: 'count',
  floor: 10,
  floorUnit: 'reps',
  target: 30,
  lifecycle: 'forming',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const erow = (id: string, date: string, actual: number, skipReason?: HabitEntry['skipReason']): HabitEntry => ({
  id,
  habitId: 'h',
  date,
  timestamp: `${date}T12:00:00.000Z`,
  actual,
  ...(skipReason ? { skipReason } : {}),
});

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

describe('oneTapAction', () => {
  it('count, first tap of the day → +floor', () =>
    expect(oneTapAction(count, false)).toEqual({ amount: 10, label: '+10', disabled: false }));
  it('count, day already has activity → +1 더 (still a full floor chunk)', () =>
    expect(oneTapAction(count, true)).toEqual({ amount: 10, label: '+1 더', disabled: false }));
  it('binary, not yet done → ✓', () =>
    expect(oneTapAction(binary, false)).toEqual({ amount: 1, label: '✓', disabled: false }));
  it('binary, already done → 완료 ✓ disabled', () =>
    expect(oneTapAction(binary, true)).toEqual({ amount: 1, label: '완료 ✓', disabled: true }));
});

describe('smartDefaultAmount', () => {
  it('first of the day → floor', () => expect(smartDefaultAmount(0, 10)).toBe(10));
  it('later in the day → last-used amount', () => expect(smartDefaultAmount(5, 10, 7)).toBe(7));
  it('later with no last-used → floor', () => expect(smartDefaultAmount(5, 10)).toBe(10));
});

describe('previewLog', () => {
  it('staging up to the floor → done, remaining 0', () =>
    expect(previewLog(0, 10, count)).toEqual({
      sum: 10,
      floor: 10,
      remaining: 0,
      state: 'done',
      xpDelta: TUNING.xpPerFloorCompletion,
    }));
  it('staging below the floor → partial, remaining, 0 XP', () =>
    expect(previewLog(0, 3, count)).toMatchObject({ sum: 3, remaining: 7, state: 'partial', xpDelta: 0 }));
  it('staging past the target → over, XP includes over bonus + intensity', () =>
    expect(previewLog(10, 20, count)).toMatchObject({
      sum: 30,
      state: 'over',
      xpDelta: dayXPForSum(30, count) - dayXPForSum(10, count),
    }));
});

describe('describeDeleteConsequence', () => {
  const TODAY = '2026-06-10';
  it('deleting a non-last activity row that flips the day below floor warns of the streak drop', () => {
    // two 6-rep rows → sum 12 done (streak 1); deleting one → sum 6 partial → streak 0.
    const entries = [erow('a', '2026-06-10', 6), erow('b', '2026-06-10', 6)];
    const msg = describeDeleteConsequence(entries, 'a', HABIT, TODAY);
    expect(msg).toContain('스트릭');
  });
  it('deleting the last row of a done day warns + notes the streak change', () => {
    const entries = [erow('a', '2026-06-09', 10), erow('b', '2026-06-10', 10)];
    const msg = describeDeleteConsequence(entries, 'b', HABIT, TODAY);
    expect(msg).toContain('비워집니다');
    expect(msg).toContain('스트릭');
  });
  it('deleting a skip on a day that ALSO has activity is inconsequential → null (day is not a miss)', () => {
    const entries = [erow('a', '2026-06-10', 10), erow('b', '2026-06-10', 0, 'floor')];
    expect(describeDeleteConsequence(entries, 'b', HABIT, TODAY)).toBeNull();
  });
  it('deleting one skip of a miss-day (multiple skips) warns it erases a 놓침', () => {
    const entries = [erow('a', '2026-06-10', 0, 'floor'), erow('b', '2026-06-10', 0, 'cue')];
    expect(describeDeleteConsequence(entries, 'a', HABIT, TODAY)).toContain('놓침');
  });
});
