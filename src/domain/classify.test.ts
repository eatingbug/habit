import {
  classifyDay,
  classifyEntry,
  compareEntries,
  effectiveSkipReason,
  isMiss,
  isMissDay,
} from './classify';
import type { HabitEntry, SkipReason } from '../models';

/** Build a minimal HabitEntry with overridable fields for the miss predicate. */
function entry(overrides: Partial<HabitEntry>): HabitEntry {
  return {
    id: 'e1',
    habitId: 'h1',
    date: '2026-06-23',
    timestamp: '2026-06-23T12:00:00.000Z',
    actual: 1,
    state: 'done',
    ...overrides,
  };
}

/** Build a facts-only row. `state` is a vestigial placeholder ignored by the day API. */
let seq = 0;
function row(over: Partial<HabitEntry> & { actual: number }): HabitEntry {
  seq += 1;
  return {
    id: over.id ?? `r${seq}`,
    habitId: 'h1',
    date: '2026-06-23',
    timestamp: over.timestamp ?? '2026-06-23T12:00:00.000Z',
    state: 'done',
    ...over,
  };
}
const act = (actual: number, o: Partial<HabitEntry> = {}) => row({ actual, ...o });
const skip = (skipReason: SkipReason, o: Partial<HabitEntry> = {}) => row({ actual: 0, skipReason, ...o });

describe('classifyDay', () => {
  it('returns "unknown" when there are no rows', () => {
    expect(classifyDay([], 5)).toBe('unknown');
  });

  it('returns "unknown" for rows with no activity and no skip reason', () => {
    expect(classifyDay([row({ actual: 0 })], 5)).toBe('unknown');
  });

  it('returns "skip" when the day has only skip rows', () => {
    expect(classifyDay([skip('cue')], 5)).toBe('skip');
  });

  it('returns "done" when the summed activity meets the floor', () => {
    expect(classifyDay([act(5)], 5)).toBe('done');
  });

  it('sums multiple activity rows to reach the floor', () => {
    expect(classifyDay([act(3), act(3)], 5)).toBe('done'); // sum 6 >= 5
  });

  it('returns "partial" when 0 < sum < floor', () => {
    expect(classifyDay([act(3)], 5)).toBe('partial');
    expect(classifyDay([act(1), act(1)], 5)).toBe('partial'); // sum 2 < 5
  });

  it('returns "over" when the summed activity reaches a valid target', () => {
    expect(classifyDay([act(10)], 5, 10)).toBe('over');
    expect(classifyDay([act(6), act(6)], 5, 10)).toBe('over'); // sum 12 >= 10
  });

  it('classifies "done" before "over" (over ⇒ done): floor met but below target', () => {
    expect(classifyDay([act(3), act(4)], 5, 10)).toBe('done'); // sum 7: >=floor, <target
  });

  it('defensively treats target <= floor as no target (no phantom over)', () => {
    expect(classifyDay([act(6)], 5, 5)).toBe('done'); // target === floor
    expect(classifyDay([act(6)], 5, 3)).toBe('done'); // target < floor (corrupt)
  });

  it('boundary: sum === target === floor is "done", not "over"', () => {
    expect(classifyDay([act(5)], 5, 5)).toBe('done');
  });

  it('an activity row overrides skip rows on the same day', () => {
    expect(classifyDay([skip('cue'), act(6)], 5)).toBe('done');
  });

  it('binary (no target): multiple done rows stay "done" (idempotent, never over)', () => {
    expect(classifyDay([act(1), act(1)], 1)).toBe('done'); // sum 2, floor 1, no target
  });
});

describe('effectiveSkipReason', () => {
  it('is undefined when there are no skip rows', () => {
    expect(effectiveSkipReason([act(5)])).toBeUndefined();
  });

  it('is the reason of a single skip row', () => {
    expect(effectiveSkipReason([skip('cue')])).toBe('cue');
  });

  it('is the LATEST skip by timestamp', () => {
    const early = skip('cue', { timestamp: '2026-06-23T09:00:00.000Z', id: 'a' });
    const late = skip('floor', { timestamp: '2026-06-23T10:00:00.000Z', id: 'b' });
    expect(effectiveSkipReason([late, early])).toBe('floor');
  });

  it('breaks equal-timestamp ties by id (ASC → last id wins)', () => {
    const a = skip('cue', { timestamp: '2026-06-23T09:00:00.000Z', id: 'a' });
    const b = skip('floor', { timestamp: '2026-06-23T09:00:00.000Z', id: 'b' });
    expect(effectiveSkipReason([a, b])).toBe('floor');
    expect(effectiveSkipReason([b, a])).toBe('floor'); // permutation-invariant
  });

  it('ignores activity rows when picking the latest skip', () => {
    const s = skip('identity', { timestamp: '2026-06-23T08:00:00.000Z', id: 'a' });
    const a = act(5, { timestamp: '2026-06-23T20:00:00.000Z', id: 'z' });
    expect(effectiveSkipReason([a, s])).toBe('identity');
  });
});

describe('compareEntries (total order: timestamp ASC, then id ASC)', () => {
  const e = (timestamp: string, id: string) => act(5, { timestamp, id });
  it('orders by timestamp first', () => {
    expect(compareEntries(e('...T09:00:00Z', 'z'), e('...T10:00:00Z', 'a'))).toBeLessThan(0);
  });
  it('falls back to id on equal timestamps', () => {
    expect(compareEntries(e('...T09:00:00Z', 'a'), e('...T09:00:00Z', 'b'))).toBeLessThan(0);
  });
  it('is 0 for identical (timestamp, id)', () => {
    expect(compareEntries(e('...T09:00:00Z', 'a'), e('...T09:00:00Z', 'a'))).toBe(0);
  });
});

describe('isMissDay', () => {
  it('is a miss for a skip day with a non-exception effective reason', () => {
    expect(isMissDay([skip('cue')], 5)).toBe(true);
    expect(isMissDay([skip('floor')], 5)).toBe(true);
    expect(isMissDay([skip('identity')], 5)).toBe(true);
  });

  it('is NOT a miss when the effective (latest) skip reason is exception', () => {
    const early = skip('cue', { timestamp: '2026-06-23T09:00:00.000Z', id: 'a' });
    const late = skip('exception', { timestamp: '2026-06-23T10:00:00.000Z', id: 'b' });
    expect(isMissDay([early, late], 5)).toBe(false);
  });

  it('is NOT a miss for partial / done / over / blank days', () => {
    expect(isMissDay([act(3)], 5)).toBe(false); // partial
    expect(isMissDay([act(5)], 5)).toBe(false); // done
    expect(isMissDay([act(10)], 5, 10)).toBe(false); // over
    expect(isMissDay([], 5)).toBe(false); // blank
  });
});

describe('classifyEntry (legacy per-row, kept for UI)', () => {
  describe('no target set', () => {
    it('returns "done" when actual exceeds the floor', () => {
      expect(classifyEntry(5, 3)).toBe('done');
    });

    it('returns "done" at the floor boundary (actual === floor)', () => {
      expect(classifyEntry(3, 3)).toBe('done');
    });

    it('throws RangeError just below the floor boundary (actual === floor - epsilon)', () => {
      expect(() => classifyEntry(2.999, 3)).toThrow(RangeError);
    });

    it('throws RangeError when actual is below the floor', () => {
      expect(() => classifyEntry(1, 3)).toThrow(RangeError);
    });
  });

  describe('target set', () => {
    it('returns "over" when actual reaches the target', () => {
      expect(classifyEntry(10, 3, 10)).toBe('over');
    });

    it('returns "over" when actual exceeds the target', () => {
      expect(classifyEntry(11, 3, 10)).toBe('over');
    });

    it('returns "done" just below the target (actual === target - epsilon, still >= floor)', () => {
      expect(classifyEntry(9.999, 3, 10)).toBe('done');
    });

    it('returns "done" when actual meets the floor but is below the target', () => {
      expect(classifyEntry(5, 3, 10)).toBe('done');
    });

    it('throws RangeError when actual is below both the floor and the target', () => {
      expect(() => classifyEntry(2, 3, 10)).toThrow(RangeError);
    });
  });
});

describe('isMiss (legacy per-row, kept for UI)', () => {
  it('returns false for undefined (blank day)', () => {
    expect(isMiss(undefined)).toBe(false);
  });

  it('returns true for a skip with a non-exception reason', () => {
    expect(isMiss(entry({ state: 'skip', skipReason: 'cue' }))).toBe(true);
    expect(isMiss(entry({ state: 'skip', skipReason: 'floor' }))).toBe(true);
    expect(isMiss(entry({ state: 'skip', skipReason: 'identity' }))).toBe(true);
  });

  it('returns false for a skip with reason "exception"', () => {
    expect(isMiss(entry({ state: 'skip', skipReason: 'exception' }))).toBe(false);
  });

  it('returns false for done / over entries', () => {
    expect(isMiss(entry({ state: 'done' }))).toBe(false);
    expect(isMiss(entry({ state: 'over' }))).toBe(false);
  });
});
