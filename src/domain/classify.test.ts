import { classifyEntry, isMiss } from './classify';
import type { HabitEntry } from '../models';

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

describe('classifyEntry', () => {
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

    it('returns "over" at the target boundary (actual === target)', () => {
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

    it('returns "done" at the floor boundary when below the target', () => {
      expect(classifyEntry(3, 3, 10)).toBe('done');
    });

    it('throws RangeError when actual is below both the floor and the target', () => {
      expect(() => classifyEntry(2, 3, 10)).toThrow(RangeError);
    });
  });

  it('returns "over" when floor equals target and actual meets it (target precedence)', () => {
    expect(classifyEntry(3, 3, 3)).toBe('over');
  });
});

describe('isMiss', () => {
  it('returns false for undefined (blank day)', () => {
    expect(isMiss(undefined)).toBe(false);
  });

  it('returns true for a skip with reason "cue"', () => {
    expect(isMiss(entry({ state: 'skip', skipReason: 'cue' }))).toBe(true);
  });

  it('returns true for a skip with reason "floor"', () => {
    expect(isMiss(entry({ state: 'skip', skipReason: 'floor' }))).toBe(true);
  });

  it('returns true for a skip with reason "identity"', () => {
    expect(isMiss(entry({ state: 'skip', skipReason: 'identity' }))).toBe(true);
  });

  it('returns false for a skip with reason "exception"', () => {
    expect(isMiss(entry({ state: 'skip', skipReason: 'exception' }))).toBe(false);
  });

  it('returns false for a "done" entry', () => {
    expect(isMiss(entry({ state: 'done' }))).toBe(false);
  });

  it('returns false for an "over" entry', () => {
    expect(isMiss(entry({ state: 'over' }))).toBe(false);
  });
});
