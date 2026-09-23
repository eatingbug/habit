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
 * A rule whose action the habit does not offer (`offeredActions`) is skipped rather than
 * returned, so the pre-selected action is always one the screen can show. That is how
 * §4.5's yes/no limitation is closed (#21): `lower_floor` and `raise_target` mean
 * nothing on a binary habit (floor fixed at 1, no target), and lowering a floor that is
 * already 1 is impossible on any habit.
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

/**
 * The cue action is named for the cue's state, whichever rule raised the flag: with no
 * cue set there is nothing to adjust, so a Rule 2/5 cue warning prescribes `fill_cue`
 * — the same text field, and the only one of the two the action list offers. Rule 4's
 * `critical` cue only fires on an empty cue, so there it is always `fill_cue`.
 */
function cueAction(habit: Habit): ReflectionAction {
  return habit.cue ? 'adjust_cue' : 'fill_cue';
}

/** The Reflection action list (§6.4), in the order the screen offers it. */
export function offeredActions(habit: Habit): ReflectionAction[] {
  const amounts = habit.kind === 'count';
  return [
    cueAction(habit),
    'fill_identity',
    ...(amounts && habit.floor > 1 ? (['lower_floor'] as const) : []),
    ...(amounts ? (['raise_target'] as const) : []),
    'pause',
    'archive',
    'keep',
  ];
}

export function suggestAction(flags: DiagnosisFlag[], habit: Habit): ReflectionAction {
  const offered = offeredActions(habit);
  for (const rule of PRIORITY) {
    const action = rule.component === 'cue' ? cueAction(habit) : rule.action;
    if (!offered.includes(action)) continue;
    if (flags.some((f) => f.component === rule.component && f.severity === rule.severity)) {
      return action;
    }
  }
  return 'keep';
}
