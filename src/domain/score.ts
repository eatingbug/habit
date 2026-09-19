import { TUNING } from '@/config/tuning';
import type { Habit, HabitEntry } from '@/models';

import { classifyDay, isFloorMet, sortDayRows } from './classify';
import { atRiskToday, computeStreak, floorRuns, historyDays } from './streak';

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
  const floorMet = days.filter((day) => isFloorMet(day.state));

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
  const metBefore = isFloorMet(stateBefore);
  const metAfter = isFloorMet(stateAfter);

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

/** One row's share of its day — see `attributeDayXP` (issue #37). */
export interface RowReward {
  entry: HabitEntry;
  /** The XP this row caused: the day's XP through it, minus through the row before it. */
  xp: number;
  /** The day's activity sum through this row, under the total order. */
  sum: number;
  /** Was the floor met as of this row? */
  floorMet: boolean;
  /** Did *this* row take the day from below the floor to at or above it? */
  crossedFloor: boolean;
  /** The effective target this row crossed; absent when it crossed none. */
  crossedTarget?: number;
}

/**
 * What each of a day's rows earned — the feed's per-row reward line (issue #37).
 *
 * `describeLogEffect` cannot answer this: it needs the `before` of a log that is
 * happening, and a row read back from the repository has no such `before`. So the day
 * is **replayed** in the §7.3 total order `(timestamp ASC, id ASC)` and each row is
 * credited with the delta it caused — the day's XP through that row minus the day's XP
 * through the previous one.
 *
 * The deltas telescope, so their sum is `computeXP(before + dayRows) -
 * computeXP(before, habit)` **by construction**: the very quantity `useToday.xpToday`
 * sums per habit. That identity is the reason for this rule and not another one. Per-row
 * independent recomputation, or splitting the day's XP evenly, cannot hold it: the
 * floor XP is counted once per day and above-floor intensity is not linear in a row's
 * amount.
 *
 * `before` is the habit's rows on **other** dates, and it is not optional padding: XP
 * carries run-keyed bonuses (`xpStreakBonus`, `milestoneBonusXP`), so replaying the day
 * from an empty set would score a different quantity than the one that must be matched.
 *
 * **The consequence, stated so it is not later read as a bug:** the row that *crosses*
 * the floor takes the whole floor XP, and every other row of that day gets only its
 * marginal contribution — frequently zero. A day filled 5/5 in one row and a day filled
 * 1/5 five times therefore do not distribute alike. That is the content of the rule, not
 * a defect: the floor XP exists once per day (`computeXP` pays
 * `xpPerFloorCompletion` per floor-met **day**), so one row gets it and the others do
 * not, and dividing it up would break the sum the rule exists to keep.
 *
 * Skip rows are attributed too, though they normally earn 0: a non-exception skip is a
 * miss (§4.1) and can cut a run, so filtering them out would be assuming a delta rather
 * than computing it.
 */
export function attributeDayXP(
  before: HabitEntry[],
  dayRows: HabitEntry[],
  habit: Habit,
): RowReward[] {
  const ordered = sortDayRows(dayRows);
  if (ordered.length === 0) return [];

  const date = ordered[0].date;
  const rewards: RowReward[] = [];
  const prefix: HabitEntry[] = [];
  let xpThrough = computeXP(before, habit);
  // The day's own date as `today`: an empty prefix then reads `pending` rather than
  // `missed`, and neither is floor-met, so the crossing tests are unaffected either way.
  let stateThrough = classifyDay(prefix, habit, date, date);

  for (const entry of ordered) {
    prefix.push(entry);
    const xpBefore = xpThrough;
    const stateBefore = stateThrough;
    xpThrough = computeXP([...before, ...prefix], habit);
    stateThrough = classifyDay(prefix, habit, date, date);

    rewards.push({
      entry,
      xp: xpThrough - xpBefore,
      sum: prefix.reduce((total, row) => total + (row.skipReason == null ? row.actual : 0), 0),
      floorMet: isFloorMet(stateThrough),
      crossedFloor: !isFloorMet(stateBefore) && isFloorMet(stateThrough),
      // `over` is the classifier's own answer about the *effective* target (§4.1's
      // defensive read), so `habit.target` is the real figure exactly in this branch.
      crossedTarget:
        stateBefore !== 'over' && stateThrough === 'over' ? habit.target : undefined,
    });
  }
  return rewards;
}
