import type { DiagnosisComponent, DiagnosisFlag, Habit, Severity } from '@/models';

import { suggestAction } from './recommend';

const HABIT: Habit = {
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

function flag(component: DiagnosisComponent, severity: Severity): DiagnosisFlag {
  return { component, severity, message: `${component}/${severity}`, evidence: 'n/a' };
}

const CRITICAL_CUE = flag('cue', 'critical');
const CRITICAL_IDENTITY = flag('identity', 'critical');
const WARN_FLOOR = flag('floor', 'warning');
const WARN_CUE = flag('cue', 'warning');
const WARN_IDENTITY = flag('identity', 'warning');
const WARN_LOAD = flag('load', 'warning');

describe('suggestAction — recommended-action mapping (SPEC §4.5)', () => {
  it('returns keep when there are no flags at all', () => {
    expect(suggestAction([], HABIT)).toBe('keep');
  });

  it('maps each condition on its own', () => {
    expect(suggestAction([CRITICAL_CUE], HABIT)).toBe('fill_cue');
    expect(suggestAction([CRITICAL_IDENTITY], HABIT)).toBe('fill_identity');
    expect(suggestAction([WARN_FLOOR], HABIT)).toBe('lower_floor');
    expect(suggestAction([WARN_CUE], HABIT)).toBe('adjust_cue');
    // Rule 5 can warn on identity even when one is set — "revisit your why" (Part D).
    expect(suggestAction([WARN_IDENTITY], HABIT)).toBe('fill_identity');
    expect(suggestAction([WARN_LOAD], HABIT)).toBe('raise_target');
  });

  it('prefers a critical cue over everything else', () => {
    const flags = [WARN_LOAD, WARN_CUE, WARN_FLOOR, CRITICAL_IDENTITY, CRITICAL_CUE];
    expect(suggestAction(flags, HABIT)).toBe('fill_cue');
  });

  it('prefers a critical identity over any warning', () => {
    expect(suggestAction([WARN_LOAD, WARN_CUE, WARN_FLOOR, CRITICAL_IDENTITY], HABIT)).toBe(
      'fill_identity',
    );
  });

  it('prefers a floor warning over a cue warning and stagnation', () => {
    expect(suggestAction([WARN_LOAD, WARN_CUE, WARN_FLOOR], HABIT)).toBe('lower_floor');
  });

  it('prefers a cue warning over stagnation', () => {
    expect(suggestAction([WARN_LOAD, WARN_CUE], HABIT)).toBe('adjust_cue');
  });

  it('prefers an identity warning over stagnation', () => {
    expect(suggestAction([WARN_LOAD, WARN_IDENTITY], HABIT)).toBe('fill_identity');
  });

  it('ignores flag order — priority is on the flag, not the array position', () => {
    expect(suggestAction([CRITICAL_CUE, WARN_FLOOR], HABIT)).toBe('fill_cue');
    expect(suggestAction([WARN_FLOOR, CRITICAL_CUE], HABIT)).toBe('fill_cue');
  });

  it('ignores an ok-severity flag', () => {
    expect(suggestAction([flag('floor', 'ok'), flag('cue', 'ok')], HABIT)).toBe('keep');
  });
});
