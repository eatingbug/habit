import type { Habit, HabitEntry, SkipReason } from '../models';
import { consecutiveMissCount, needsNeverMissTwiceIntervention } from './streak';

const habit: Pick<Habit, 'floor' | 'target' | 'kind'> = { floor: 10, target: 30, kind: 'count' };

let seq = 0;
function entry(date: string, actual: number, skipReason?: SkipReason): HabitEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    habitId: 'h1',
    date,
    timestamp: `${date}T12:00:00.000Z`,
    actual,
    ...(skipReason ? { skipReason } : {}),
  };
}

const done = (d: string) => entry(d, 10);
const over = (d: string) => entry(d, 30);
const part = (d: string) => entry(d, 3); // 0 < 3 < floor 10 → partial
const miss = (d: string) => entry(d, 0, 'floor');
const exception = (d: string) => entry(d, 0, 'exception');

describe('consecutiveMissCount', () => {
  it('returns 0 when there are no entries at all', () => {
    expect(consecutiveMissCount([], '2026-06-10', habit)).toBe(0);
  });

  it('returns 0 when the last day is done (healthy)', () => {
    const entries = [miss('2026-06-08'), done('2026-06-09'), done('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10', habit)).toBe(0);
  });

  it('counts exactly 1 for a single trailing miss', () => {
    const entries = [done('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10', habit)).toBe(1);
  });

  it('counts 2 for two consecutive misses', () => {
    const entries = [done('2026-06-08'), miss('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10', habit)).toBe(2);
  });

  it('treats a blank day between two skips as transparent (counts both → 2)', () => {
    const entries = [miss('2026-06-08'), miss('2026-06-10')]; // 06-09 blank
    expect(consecutiveMissCount(entries, '2026-06-10', habit)).toBe(2);
  });

  it('treats a partial day as transparent: does not count, does not break', () => {
    const entries = [miss('2026-06-08'), part('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10', habit)).toBe(2);
  });

  it('a trailing partial day is not a miss (transparent → break at prior done)', () => {
    const entries = [done('2026-06-09'), part('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10', habit)).toBe(0);
  });

  it('treats an exception skip as transparent: does not count, does not break', () => {
    const entries = [miss('2026-06-08'), exception('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10', habit)).toBe(2);
  });

  it('does not count a lone exception skip', () => {
    const entries = [done('2026-06-09'), exception('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10', habit)).toBe(0);
  });

  it('breaks the run on a done day', () => {
    const entries = [miss('2026-06-07'), done('2026-06-08'), miss('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10', habit)).toBe(2);
  });

  it('breaks the run on an over day', () => {
    const entries = [over('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10', habit)).toBe(1);
  });

  it('walks transparently over trailing blanks before reaching a miss', () => {
    const entries = [done('2026-06-08'), miss('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-12', habit)).toBe(2);
  });

  it('stops at the earliest entry (no infinite walk, all-miss history)', () => {
    const entries = [miss('2026-06-08'), miss('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10', habit)).toBe(3);
  });
});

describe('needsNeverMissTwiceIntervention', () => {
  it('is false at 0 misses', () => {
    const entries = [done('2026-06-10')];
    expect(needsNeverMissTwiceIntervention(entries, '2026-06-10', habit)).toBe(false);
  });

  it('is false at exactly 1 miss (just below threshold 2)', () => {
    const entries = [done('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10', habit)).toBe(1);
    expect(needsNeverMissTwiceIntervention(entries, '2026-06-10', habit)).toBe(false);
  });

  it('is true at exactly 2 consecutive misses (threshold 2 just fires)', () => {
    const entries = [miss('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10', habit)).toBe(2);
    expect(needsNeverMissTwiceIntervention(entries, '2026-06-10', habit)).toBe(true);
  });

  it('is true above threshold (3 misses)', () => {
    const entries = [miss('2026-06-08'), miss('2026-06-09'), miss('2026-06-10')];
    expect(needsNeverMissTwiceIntervention(entries, '2026-06-10', habit)).toBe(true);
  });
});
