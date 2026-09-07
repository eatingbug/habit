import { TUNING } from '@/config/tuning';
import type { Habit, HabitEntry } from '@/models';

import { type ClassifiedDay, classifyDay, dayStates, sortDayRows } from './classify';
import { compareDates, dateOf } from './dates';
import { atRiskToday, computeStreak } from './streak';

/**
 * XP, levels and the log-time reward delta — SPEC §4.2.
 *
 * Everything here scores **day aggregates**, never rows: a day that met the floor is
 * worth its base XP once, however many times the user logged it. XP is derived, never
 * stored, so a backfill onto a `missed` date pays out retroactively (ADR-0001) and a
 * pause can never claw back what a recorded day already earned (ADR-0003).
 */

/** SPEC §4.2 — declared with the scoring API; defined in `streak.ts` to avoid a cycle. */
export { computeStreak } from './streak';

/** SPEC §4.2 — a habit paired with its rows, so a stat can be summed over its habits. */
export interface HabitWithEntries {
  habit: Habit;
  entries: HabitEntry[];
}

/** SPEC §4.2 C1 — what THIS log just unlocked, for immediate log-time feedback (§6.2). */
export interface LogEffect {
  xpGained: number;
  /** The log's day went from not-floor-met to `done`/`over`. */
  floorCrossedToday: boolean;
  pushedToOver: boolean;
  statLevelUp: boolean;
  /** Milestone reached, including a decayed re-achievement. */
  streakMilestoneHit?: number;
  /** A `partial` log — engagement, not floor XP (C3). */
  showedUp: boolean;
  savedAtRiskDay: boolean;
}

/**
 * The habit's whole classified history, ending on its last recorded date.
 *
 * Scoring needs no `today` because of that end date. XP only ever reads `done`/`over`
 * days, and the one place the `pending`/`missed` distinction would matter — a run
 * reset — cannot arise inside the range: the last date holds rows by construction, so
 * every empty date strictly inside the range is genuinely past, hence `missed`. Any
 * empty date at or beyond the end has no later `done` day to cut off. Keeping `today`
 * out is what lets `computeStatXP(statId, all)` keep its SPEC signature.
 */
function historyDays(habit: Habit, entries: HabitEntry[]): ClassifiedDay[] {
  if (entries.length === 0) return [];

  // A real max, not the last element — scoring must survive any row permutation.
  const last = entries.reduce(
    (latest, entry) => (compareDates(entry.date, latest) > 0 ? entry.date : latest),
    entries[0].date,
  );
  return dayStates(habit, entries, dateOf(habit.createdAt), last, last);
}

function isFloorMet(day: ClassifiedDay): boolean {
  return day.state === 'done' || day.state === 'over';
}

/**
 * Lengths of the maximal runs of floor-met days, oldest first.
 *
 * One walker serves both run-keyed bonuses (`milestoneBonusXP` and the count habit's
 * longest-run bonus, which SPEC §4.2 spells out only for the former). A miss resets
 * the run — a `missed` day or a reasoned `skip` (ADR-0001); `pending`, `partial` and
 * exception skips are transparent, as are out-of-scope dates by never appearing.
 */
function floorRuns(days: ClassifiedDay[]): number[] {
  const runs: number[] = [];
  let current = 0;

  for (const day of days) {
    if (isFloorMet(day)) current += 1;
    else if (day.isMiss) {
      if (current > 0) runs.push(current);
      current = 0;
    }
  }
  if (current > 0) runs.push(current);
  return runs;
}

function milestoneKeys(table: Record<number, number>): number[] {
  return Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * Binary streak milestones — SPEC §4.2.
 *
 * Each milestone fires once per run that reaches it, and the k-th time it is reached
 * is worth `base × decay^(k-1)`. The decay is why re-achievement stays rewarding
 * without letting a break-and-rebuild loop farm XP; awards that round below the
 * epsilon are dropped rather than inflating the currency.
 *
 * `habit` is ours to add — a run is made of day-states, which need the habit's floor
 * and scope.
 */
export function milestoneBonusXP(entries: HabitEntry[], habit: Habit): number {
  const table = TUNING.binaryStreakMilestones;
  const keys = milestoneKeys(table);
  const timesReached = new Map<number, number>();

  let xp = 0;
  for (const run of floorRuns(historyDays(habit, entries))) {
    for (const key of keys) {
      if (run < key) break;
      const k = (timesReached.get(key) ?? 0) + 1;
      timesReached.set(key, k);
      const award = Math.round(table[key] * TUNING.binaryMilestoneDecay ** (k - 1));
      if (award >= TUNING.milestoneBonusEpsilon) xp += award;
    }
  }
  return xp;
}

/**
 * Cumulative XP for one habit — SPEC §4.2.
 *
 * Both kinds earn the base "showed up" XP per floor-met day. Count habits turn
 * intensity into XP (target bonus + per-unit above the floor) and take a once-only
 * longevity bonus keyed on their longest run; binary habits, having no intensity to
 * measure, take the decaying milestone ladder instead. A `partial` day earns nothing
 * here — it is rewarded as engagement (§4.3 C3), which keeps "honest logging beats
 * silence" true without paying XP for a day the floor was not met.
 */
export function computeXP(entries: HabitEntry[], habit: Habit): number {
  const days = historyDays(habit, entries);
  const floorMet = days.filter(isFloorMet);

  let xp = floorMet.length * TUNING.xpPerFloorCompletion;
  if (habit.kind !== 'count') return xp + milestoneBonusXP(entries, habit);

  xp += days.filter((day) => day.state === 'over').length * TUNING.xpBonusTargetExceed;
  for (const day of floorMet) {
    xp += (day.sum - habit.floor) * TUNING.xpPerAboveFloorUnit;
  }

  const longest = floorRuns(days).reduce((a, b) => Math.max(a, b), 0);
  for (const key of milestoneKeys(TUNING.xpStreakBonus)) {
    if (longest >= key) xp += TUNING.xpStreakBonus[key];
  }
  return xp;
}

/** SPEC §4.2 — the highest threshold index the XP has reached. */
export function levelForXP(xp: number): number {
  let level = 0;
  TUNING.statLevelThresholds.forEach((threshold, index) => {
    if (xp >= threshold) level = index;
  });
  return level;
}

/**
 * A stat's XP is the sum over **every** habit mapped to it — SPEC §4.2.
 *
 * Habit→Stat is 1:N, so a per-habit level would disagree with the Dashboard the moment
 * two habits share a stat. There is one level definition and everything reads it.
 */
export function computeStatXP(statId: string, all: HabitWithEntries[]): number {
  return all
    .filter((pair) => pair.habit.statId === statId)
    .reduce((total, pair) => total + computeXP(pair.entries, pair.habit), 0);
}

/** SPEC §4.2 — the only definition of a stat's level. */
export function computeStatLevel(statId: string, all: HabitWithEntries[]): number {
  return levelForXP(computeStatXP(statId, all));
}

function rowsOn(entries: HabitEntry[], date: string): HabitEntry[] {
  return entries.filter((entry) => entry.date === date);
}

/**
 * The pure delta of a single log — SPEC §4.2 C1.
 *
 * Scoring is already a total function of the entry set, so the delta is exact: score
 * `before`, score `after`, and name which term moved. It *computes* the reward and
 * never stores it.
 *
 * The log's own date is the anchor for every day-scoped field (hence
 * `floorCrossedToday`), which is why no `today` is needed: the day holds rows in
 * `after`, so the `pending`/`missed` distinction cannot arise, and both are inside the
 * "not yet floor-met" set anyway. `siblings` is required precisely so `statLevelUp` is
 * decided on the stat's total; an optional parameter would let a caller silently
 * report this habit's level instead, and no type error would catch it.
 */
export function describeLogEffect(
  before: HabitEntry[],
  after: HabitEntry[],
  habit: Habit,
  siblings: HabitWithEntries[],
): LogEffect {
  const known = new Set(before.map((entry) => entry.id));
  const added = sortDayRows(after.filter((entry) => !known.has(entry.id)));
  if (added.length === 0) {
    return {
      xpGained: 0,
      floorCrossedToday: false,
      pushedToOver: false,
      statLevelUp: false,
      showedUp: false,
      savedAtRiskDay: false,
    };
  }

  const logDate = added[added.length - 1].date;
  const stateBefore = classifyDay(rowsOn(before, logDate), habit, logDate, logDate);
  const stateAfter = classifyDay(rowsOn(after, logDate), habit, logDate, logDate);
  const metBefore = stateBefore === 'done' || stateBefore === 'over';
  const metAfter = stateAfter === 'done' || stateAfter === 'over';

  const runBefore = computeStreak(before, habit, logDate);
  const runAfter = computeStreak(after, habit, logDate);
  const table =
    habit.kind === 'binary' ? TUNING.binaryStreakMilestones : TUNING.xpStreakBonus;
  // A count habit's longevity bonus is once-only, so re-reaching a length it has
  // already passed unlocks nothing and must not be announced as if it did.
  const newlyEarned =
    habit.kind === 'binary' ||
    floorRuns(historyDays(habit, before)).reduce((a, b) => Math.max(a, b), 0) < runAfter;

  return {
    xpGained: computeXP(after, habit) - computeXP(before, habit),
    floorCrossedToday: !metBefore && metAfter,
    pushedToOver: stateBefore !== 'over' && stateAfter === 'over',
    statLevelUp:
      computeStatLevel(habit.statId, [{ habit, entries: after }, ...siblings]) >
      computeStatLevel(habit.statId, [{ habit, entries: before }, ...siblings]),
    streakMilestoneHit:
      runAfter > runBefore && table[runAfter] != null && newlyEarned ? runAfter : undefined,
    showedUp: stateAfter === 'partial',
    savedAtRiskDay: metAfter && atRiskToday(before, habit, logDate),
  };
}
