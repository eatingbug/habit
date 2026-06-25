import type { HabitEntry } from '../models';
import { consecutiveMissCount, needsNeverMissTwiceIntervention } from './streak';

let seq = 0;
function entry(
  date: string,
  state: HabitEntry['state'],
  skipReason?: HabitEntry['skipReason'],
): HabitEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    habitId: 'h1',
    date,
    timestamp: `${date}T12:00:00.000Z`,
    actual: state === 'skip' ? 0 : 10,
    state,
    ...(skipReason ? { skipReason } : {}),
  };
}

const done = (d: string) => entry(d, 'done');
const over = (d: string) => entry(d, 'over');
const miss = (d: string) => entry(d, 'skip', 'floor');
const exception = (d: string) => entry(d, 'skip', 'exception');

describe('consecutiveMissCount', () => {
  it('returns 0 when there are no entries at all', () => {
    expect(consecutiveMissCount([], '2026-06-10')).toBe(0);
  });

  it('returns 0 when the last day is done (healthy)', () => {
    const entries = [miss('2026-06-08'), done('2026-06-09'), done('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10')).toBe(0);
  });

  it('counts exactly 1 for a single trailing miss', () => {
    const entries = [done('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10')).toBe(1);
  });

  it('counts 2 for two consecutive misses', () => {
    const entries = [done('2026-06-08'), miss('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10')).toBe(2);
  });

  it('treats a blank day between two skips as transparent (counts both → 2)', () => {
    // 06-09 has no entry (blank) between two misses on 06-08 and 06-10
    const entries = [miss('2026-06-08'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10')).toBe(2);
  });

  it('treats an exception skip as transparent: does not count, does not break', () => {
    // miss, exception (transparent), miss → 2 misses
    const entries = [miss('2026-06-08'), exception('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10')).toBe(2);
  });

  it('does not count a lone exception skip', () => {
    const entries = [done('2026-06-09'), exception('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10')).toBe(0);
  });

  it('breaks the run on a done day', () => {
    // walking back: miss(10), miss(09), done(08) breaks → 2
    const entries = [miss('2026-06-07'), done('2026-06-08'), miss('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10')).toBe(2);
  });

  it('breaks the run on an over day', () => {
    const entries = [over('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10')).toBe(1);
  });

  it('walks transparently over trailing blanks before reaching a miss', () => {
    // asOf is 06-12, blanks on 11 and 12, miss on 10
    const entries = [done('2026-06-08'), miss('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-12')).toBe(2);
  });

  it('stops at the earliest entry (no infinite walk, all-miss history)', () => {
    const entries = [miss('2026-06-08'), miss('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10')).toBe(3);
  });
});

describe('needsNeverMissTwiceIntervention', () => {
  it('is false at 0 misses', () => {
    const entries = [done('2026-06-10')];
    expect(needsNeverMissTwiceIntervention(entries, '2026-06-10')).toBe(false);
  });

  it('is false at exactly 1 miss (just below threshold 2)', () => {
    const entries = [done('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10')).toBe(1);
    expect(needsNeverMissTwiceIntervention(entries, '2026-06-10')).toBe(false);
  });

  it('is true at exactly 2 consecutive misses (threshold 2 just fires)', () => {
    const entries = [miss('2026-06-09'), miss('2026-06-10')];
    expect(consecutiveMissCount(entries, '2026-06-10')).toBe(2);
    expect(needsNeverMissTwiceIntervention(entries, '2026-06-10')).toBe(true);
  });

  it('is true above threshold (3 misses)', () => {
    const entries = [miss('2026-06-08'), miss('2026-06-09'), miss('2026-06-10')];
    expect(needsNeverMissTwiceIntervention(entries, '2026-06-10')).toBe(true);
  });
});
