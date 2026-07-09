import { heatLevel } from './heatLevel';
import type { DayRecord } from '../domain/util';

/** Build a computed day record; override the fields under test. */
function rec(over: Partial<DayRecord> & Pick<DayRecord, 'state'>): DayRecord {
  return { date: '2026-06-01', sumActual: 0, ...over };
}

describe('heatLevel — flat day-state (facts-only)', () => {
  it('undefined (no rows) → blank', () => expect(heatLevel(undefined)).toBe('blank'));
  it('unknown → blank', () => expect(heatLevel(rec({ state: 'unknown' }))).toBe('blank'));

  it('partial → partial (distinct from blank and skip)', () =>
    expect(heatLevel(rec({ state: 'partial', sumActual: 3 }))).toBe('partial'));

  it('done → done', () => expect(heatLevel(rec({ state: 'done', sumActual: 10 }))).toBe('done'));
  it('over → over', () => expect(heatLevel(rec({ state: 'over', sumActual: 30 }))).toBe('over'));

  it('non-exception skip → skip (a diagnostic miss)', () =>
    expect(heatLevel(rec({ state: 'skip', effectiveSkipReason: 'cue' }))).toBe('skip'));
  it('exception skip → blank (excused, never a miss)', () =>
    expect(heatLevel(rec({ state: 'skip', effectiveSkipReason: 'exception' }))).toBe('blank'));
});
