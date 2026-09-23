import type { DiagnosisComponent, DiagnosisFlag, Habit, Severity } from '@/models';

import { offeredActions, suggestAction } from './recommend';

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

/** A cue to adjust — with none set, a cue warning prescribes `fill_cue` (below). */
const WITH_CUE: Habit = { ...HABIT, cue: '아침 커피 뒤' };

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
    expect(suggestAction([WARN_CUE], WITH_CUE)).toBe('adjust_cue');
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
    expect(suggestAction([WARN_LOAD, WARN_CUE], WITH_CUE)).toBe('adjust_cue');
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

const BINARY: Habit = {
  ...HABIT,
  id: 'b1',
  name: '명상',
  kind: 'binary',
  floor: 1,
  floorUnit: 'time',
  target: undefined,
};

describe('suggestAction — only ever suggests an action the habit offers', () => {
  it('never suggests lower_floor or raise_target on a binary habit (§4.5 yes/no limitation)', () => {
    expect(suggestAction([WARN_FLOOR], BINARY)).toBe('keep');
    expect(suggestAction([WARN_LOAD], BINARY)).toBe('keep');
  });

  it('falls through to the next matching rule when a higher one is not offered', () => {
    expect(suggestAction([WARN_FLOOR, WARN_CUE], { ...BINARY, cue: '아침 커피 뒤' })).toBe(
      'adjust_cue',
    );
  });

  it('never suggests lower_floor on a count habit whose floor is already 1', () => {
    expect(suggestAction([WARN_FLOOR], { ...HABIT, floor: 1 })).toBe('keep');
  });

  it('suggests fill_cue for a cue warning when no cue is set — there is nothing to adjust', () => {
    expect(suggestAction([WARN_CUE], { ...HABIT, cue: undefined })).toBe('fill_cue');
    expect(suggestAction([WARN_CUE], { ...HABIT, cue: '아침 커피 뒤' })).toBe('adjust_cue');
  });
});

describe('offeredActions — the Reflection action list (§6.4)', () => {
  it('offers every design action on a count habit, with the cue action named for its state', () => {
    expect(offeredActions({ ...HABIT, cue: undefined })).toEqual([
      'fill_cue',
      'fill_identity',
      'lower_floor',
      'raise_target',
      'pause',
      'archive',
      'keep',
    ]);
    expect(offeredActions({ ...HABIT, cue: '아침 커피 뒤' })[0]).toBe('adjust_cue');
  });

  it('hides lower_floor and raise_target on a binary habit', () => {
    expect(offeredActions(BINARY)).toEqual(['fill_cue', 'fill_identity', 'pause', 'archive', 'keep']);
  });

  it('hides lower_floor on a count habit whose floor is already 1', () => {
    expect(offeredActions({ ...HABIT, floor: 1 })).not.toContain('lower_floor');
  });

  it('always contains what suggestAction returns', () => {
    const flags = [CRITICAL_CUE, CRITICAL_IDENTITY, WARN_FLOOR, WARN_CUE, WARN_IDENTITY, WARN_LOAD];
    for (const subject of [HABIT, BINARY, { ...HABIT, floor: 1 }, { ...HABIT, cue: 'x' }]) {
      for (const one of flags) {
        expect(offeredActions(subject)).toContain(suggestAction([one], subject));
      }
    }
  });
});
