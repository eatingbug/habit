/**
 * domain/recommend.ts — map diagnosis flags to a suggested reflection action (SPEC §4.5).
 *
 * The engine pre-selects ONE action for a reflection session from the flags it raised.
 * Rules are ordered by priority; the first matching rule wins. `habit` is part of the
 * signature per SPEC but is unused by the V1 mapping.
 */
import type { DiagnosisFlag, Habit, ReflectionAction } from '../models';

export function suggestAction(flags: DiagnosisFlag[], habit: Habit): ReflectionAction {
  void habit; // unused in V1; kept in the signature per SPEC §4.5
  const has = (component: DiagnosisFlag['component'], severity: DiagnosisFlag['severity']): boolean =>
    flags.some((f) => f.component === component && f.severity === severity);

  if (has('cue', 'critical')) return 'fill_cue';
  if (has('identity', 'critical')) return 'fill_identity';
  if (has('floor', 'warning')) return 'lower_floor';
  if (has('cue', 'warning')) return 'adjust_cue';
  if (has('load', 'warning')) return 'raise_target';
  return 'keep';
}
