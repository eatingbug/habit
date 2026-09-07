import type { DiagnosisComponent, DiagnosisFlag, Habit, ReflectionAction, Severity } from '@/models';

/**
 * Recommended-action mapping — SPEC §4.5.
 *
 * Diagnosis names the broken component; the prescription is a separate deterministic
 * rule (CONTEXT glossary, 성분). Keeping them apart is what lets the Reflection screen
 * pre-select an action the user only has to confirm (CONCEPT §6.2) without the
 * diagnosis rules ever growing an opinion about the fix.
 *
 * First match wins, so the table order *is* the priority order: a missing design field
 * (`critical`) always outranks a pattern warning, because no pattern fix helps a habit
 * that has no cue at all.
 *
 * Known limitation (deferred, §4.5): `lower_floor` and `raise_target` are meaningless
 * for a yes/no habit (floor fixed at 1, no target). `habit` is taken now so that
 * special-casing `kind` later does not change the signature.
 */
const PRIORITY: { component: DiagnosisComponent; severity: Severity; action: ReflectionAction }[] = [
  { component: 'cue', severity: 'critical', action: 'fill_cue' },
  { component: 'identity', severity: 'critical', action: 'fill_identity' },
  { component: 'floor', severity: 'warning', action: 'lower_floor' },
  { component: 'cue', severity: 'warning', action: 'adjust_cue' },
  // Rule 5 can warn on `identity` even when one is set — `fill_identity` then reads as
  // "revisit your why"; a dedicated `adjust_identity` is a future refinement (§4.5).
  { component: 'identity', severity: 'warning', action: 'fill_identity' },
  { component: 'load', severity: 'warning', action: 'raise_target' },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `habit` is part of the
// §4.5 contract; the yes/no special-casing that will read it is a planned refinement.
export function suggestAction(flags: DiagnosisFlag[], habit: Habit): ReflectionAction {
  for (const rule of PRIORITY) {
    if (flags.some((f) => f.component === rule.component && f.severity === rule.severity)) {
      return rule.action;
    }
  }
  return 'keep';
}
