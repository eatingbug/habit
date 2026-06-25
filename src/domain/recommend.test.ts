import { suggestAction } from './recommend';
import type { DiagnosisFlag, Habit } from '../models';

const habit: Habit = {
  id: 'h1',
  name: 'Pushups',
  statId: 'strength',
  kind: 'count',
  floor: 5,
  floorUnit: 'reps',
  lifecycle: 'forming',
  createdAt: '2026-06-01T00:00:00.000Z',
};

const flag = (
  component: DiagnosisFlag['component'],
  severity: DiagnosisFlag['severity'],
): DiagnosisFlag => ({ component, severity, message: `${component}/${severity}`, evidence: 'e' });

describe('suggestAction', () => {
  it('empty flags -> keep', () => {
    expect(suggestAction([], habit)).toBe('keep');
  });

  it('non-matching flags (ok severity) -> keep', () => {
    expect(
      suggestAction([flag('cue', 'ok'), flag('floor', 'ok'), flag('load', 'ok')], habit),
    ).toBe('keep');
  });

  it('critical cue -> fill_cue', () => {
    expect(suggestAction([flag('cue', 'critical')], habit)).toBe('fill_cue');
  });

  it('critical identity -> fill_identity', () => {
    expect(suggestAction([flag('identity', 'critical')], habit)).toBe('fill_identity');
  });

  it('floor warning -> lower_floor', () => {
    expect(suggestAction([flag('floor', 'warning')], habit)).toBe('lower_floor');
  });

  it('cue warning -> adjust_cue', () => {
    expect(suggestAction([flag('cue', 'warning')], habit)).toBe('adjust_cue');
  });

  it('load warning -> raise_target', () => {
    expect(suggestAction([flag('load', 'warning')], habit)).toBe('raise_target');
  });

  // ── priority / first-matching-rule-wins ──────────────────────────────────

  it('critical cue beats critical identity', () => {
    expect(
      suggestAction([flag('identity', 'critical'), flag('cue', 'critical')], habit),
    ).toBe('fill_cue');
  });

  it('critical identity beats floor warning', () => {
    expect(
      suggestAction([flag('floor', 'warning'), flag('identity', 'critical')], habit),
    ).toBe('fill_identity');
  });

  it('floor warning beats cue warning', () => {
    expect(
      suggestAction([flag('cue', 'warning'), flag('floor', 'warning')], habit),
    ).toBe('lower_floor');
  });

  it('cue warning beats load warning', () => {
    expect(
      suggestAction([flag('load', 'warning'), flag('cue', 'warning')], habit),
    ).toBe('adjust_cue');
  });

  // ── boundary: severity matters, component matters ────────────────────────

  it('cue warning does NOT trigger fill_cue (critical-only rule)', () => {
    // only a cue warning present -> adjust_cue, never fill_cue
    expect(suggestAction([flag('cue', 'warning')], habit)).toBe('adjust_cue');
  });

  it('identity warning is not mapped -> keep', () => {
    // there is no identity-warning rule; falls through to keep
    expect(suggestAction([flag('identity', 'warning')], habit)).toBe('keep');
  });

  it('floor critical is not mapped -> keep', () => {
    // only floor WARNING maps; a floor critical alone has no rule
    expect(suggestAction([flag('floor', 'critical')], habit)).toBe('keep');
  });

  it('load critical is not mapped -> keep', () => {
    expect(suggestAction([flag('load', 'critical')], habit)).toBe('keep');
  });

  it('full priority chain: critical cue wins over everything', () => {
    expect(
      suggestAction(
        [
          flag('load', 'warning'),
          flag('cue', 'warning'),
          flag('floor', 'warning'),
          flag('identity', 'critical'),
          flag('cue', 'critical'),
        ],
        habit,
      ),
    ).toBe('fill_cue');
  });
});
