import type { DiagnosisComponent, DiagnosisFlag, Habit, HabitEntry, Severity } from '@/models';

import { TUNING } from '@/config/tuning';

import type { ClassifiedDay } from './classify';
import { dayStates } from './classify';
import { daysBetween, weekdayOf, windowEndingAt } from './dates';

/**
 * Diagnosis engine — SPEC §4.4.
 *
 * All five rules read **day-states**, never rows, and they get those states from
 * `dayStates` so the ADR-0003 pause/scope asymmetry is expressed in exactly one place
 * (a date is dropped only when it is both out of scope *and* holds no rows — which is
 * why a skip logged inside a pause still speaks to Rules 2 and 5).
 *
 * The load-bearing invariant (ADR-0002, §7.3): a `missed` day never produces a flag or
 * a component attribution. It conflates "doing it but not logging" with "quietly
 * stopped", and the data cannot tell those apart — so a run of them triggers the §6.4
 * bulk-backfill prompt instead of a guess dressed up as a diagnosis.
 *
 * User-facing strings are Korean inline (no i18n layer in V1); `evidence` always cites
 * the real numbers, because it is rendered as the anti-rubber-stamp guardrail (§6.4).
 */

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

/** Floor met — `over ⇒ done`, so both count (§7.3). */
function isFloorMet(day: ClassifiedDay): boolean {
  return day.state === 'done' || day.state === 'over';
}

/**
 * A reason-bearing non-completion: the *only* day-state that attributes a component
 * (CONTEXT glossary). `isMiss` already encodes "not an `exception` skip".
 */
function isReasonedSkip(day: ClassifiedDay): boolean {
  return day.state === 'skip' && day.isMiss;
}

/**
 * An "engaged" day — one the user actually showed up for or gave a reason about
 * (§4.4). `missed` is deliberately not engaged: it says nothing about the design.
 */
function isEngaged(day: ClassifiedDay): boolean {
  return isFloorMet(day) || day.state === 'partial' || isReasonedSkip(day);
}

/** The `window` days ending at `asOfDate`, classified once and shared by every rule. */
function windowDays(
  habit: Habit,
  entries: HabitEntry[],
  asOfDate: string,
  window: number,
): ClassifiedDay[] {
  const dates = windowEndingAt(asOfDate, window);
  return dayStates(habit, entries, dates[0], dates[dates.length - 1], asOfDate);
}

/**
 * A rate over a chosen population, with the §4.4 min-sample guard applied to that
 * population: below `minEngagedDaysForRate` denominator days the answer is "not enough
 * data" (`null`), which every consumer must read as healthy. Without the guard a single
 * honest `partial` would give 0/1 and trip Rules 1 and 4 off one data point.
 */
function rateOver(
  days: ClassifiedDay[],
  inDenominator: (day: ClassifiedDay) => boolean,
): number | null {
  const denominator = days.filter(inDenominator);
  if (denominator.length < TUNING.diagnosis.minEngagedDaysForRate) return null;
  return denominator.filter(isFloorMet).length / denominator.length;
}

/**
 * The number the **user** sees ("성공률") — `done`/`over` ÷ (`done` + `over` +
 * `partial` + non-exception `skip` + **`missed`**). `pending` and exception skips are
 * excluded. An unrecorded day lowers it and backfilling raises it back (ADR-0001).
 */
export function successRate(
  entries: HabitEntry[],
  habit: Habit,
  asOfDate: string,
  window: number,
): number | null {
  const days = windowDays(habit, entries, asOfDate, window);
  return rateOver(
    days,
    (day) =>
      isFloorMet(day) || day.state === 'partial' || day.state === 'missed' || isReasonedSkip(day),
  );
}

/**
 * The number the **diagnosis** reads — `missed` excluded from **both** sides.
 *
 * Rule 1 asks *"when you tried, could you reach the floor?"*, and a `missed` day says
 * nothing about the floor; letting it into that denominator would make forgotten
 * logging read as "your floor is too high" (§4.4).
 *
 * `excludePartial` serves the Established→Forming demotion (§4.7), the one consumer
 * where a low rate **costs** the user status: there `partial` sits in neither the
 * numerator nor the denominator (and `missed` returns to it), so an honest
 * partial-logger is never evicted while a silent non-logger is.
 */
export function floorCompletionRate(
  entries: HabitEntry[],
  habit: Habit,
  asOfDate: string,
  window: number,
  opts?: { excludePartial?: boolean },
): number | null {
  const days = windowDays(habit, entries, asOfDate, window);
  if (opts?.excludePartial) {
    return rateOver(
      days,
      (day) => isFloorMet(day) || day.state === 'missed' || isReasonedSkip(day),
    );
  }
  return rateOver(days, (day) => isFloorMet(day) || day.state === 'partial' || isReasonedSkip(day));
}

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Rule 1 — the floor may be out of reach. */
function ruleFloorTooHigh(
  habit: Habit,
  entries: HabitEntry[],
  asOfDate: string,
): DiagnosisFlag[] {
  const window = TUNING.windows.floorRate;
  const rate = floorCompletionRate(entries, habit, asOfDate, window);
  if (rate == null || rate >= TUNING.diagnosis.lowFloorRateThreshold) return [];
  return [
    {
      component: 'floor',
      severity: 'warning',
      message: '최소량이 너무 높은지도 몰라요.',
      evidence: `최근 ${window}일 최소량 달성률 ${percent(rate)}`,
    },
  ];
}

/**
 * Rule 2 — one weekday's cue keeps failing.
 *
 * Reads **non-exception `skip` days only**. The earlier "misses" wording would, under
 * ADR-0001, pull in unrecorded days and manufacture exactly the false signal that ADR
 * names by example — *"you keep missing Tuesdays"* read off days that say nothing about
 * **why**. A weekday cluster of `missed` days belongs to the §6.4 backfill prompt.
 *
 * The spec's cluster shape is literal: `2+` on one weekday and **0 on every other**.
 */
function ruleCueClustering(
  habit: Habit,
  entries: HabitEntry[],
  asOfDate: string,
): DiagnosisFlag[] {
  const window = TUNING.windows.cueCluster;
  const skipDays = windowDays(habit, entries, asOfDate, window).filter(isReasonedSkip);
  if (skipDays.length < 2) return [];

  const weekdays = new Set(skipDays.map((day) => weekdayOf(day.date)));
  if (weekdays.size !== 1) return [];

  const dayName = WEEKDAY_NAMES[[...weekdays][0]];
  return [
    {
      component: 'cue',
      severity: 'warning',
      message: `${dayName} 신호가 계속 무너지고 있어요.`,
      evidence: `안 함으로 찍은 ${skipDays.length}일 중 ${skipDays.length}일이 ${dayName}이에요`,
    },
  ];
}

/**
 * Rule 3 — the floor is solid but nothing grows. Count habits only: a yes/no habit has
 * no above-floor amount, so the rule would fire perpetually and pin it to a 🟡.
 *
 * "Weeks" here are the N trailing 7-day blocks ending at `asOfDate` rather than
 * calendar weeks, so the newest block is never a half week that fails the floor test
 * for a reason the user cannot act on. Growth is measured as the amount above the floor
 * (`sum - floor`), not the `over` day-state — a day of 7 against floor 5 / target 8 is
 * `done` yet clearly growing.
 */
function ruleStagnation(habit: Habit, entries: HabitEntry[], asOfDate: string): DiagnosisFlag[] {
  if (habit.kind !== 'count') return [];

  const weeks = TUNING.diagnosis.stagnationAboveFloorWeeks;
  const days = windowDays(habit, entries, asOfDate, weeks * 7);

  // Min-sample guard — the same one Rules 1 and 4 apply, for the same reason. Without
  // it one floor-exact day in an otherwise unrecorded week satisfies "floor met this
  // week", and the `load` attribution below would rest on days that are `missed`:
  // §7.3 forbids that outright and ADR-0002 routes such a history to the bulk-backfill
  // prompt instead. A habit tracked a few days every week still clears this and is
  // still diagnosable; one tracked three times in three weeks is not.
  if (days.filter(isEngaged).length < TUNING.diagnosis.minEngagedDaysForRate) return [];

  for (let block = 0; block < weeks; block += 1) {
    const inBlock = days.filter(
      (day) => Math.floor(daysBetween(day.date, asOfDate) / 7) === block,
    );
    const aboveFloor = inBlock.reduce((total, day) => total + Math.max(0, day.sum - habit.floor), 0);
    if (aboveFloor > 0 || !inBlock.some(isFloorMet)) return [];
  }

  return [
    {
      component: 'load',
      severity: 'warning',
      message: `최소량은 안정적인데 ${weeks}주 동안 성장이 없어요.`,
      evidence: `${weeks}주 동안 최소량을 넘긴 기록이 0회`,
    },
  ];
}

/** Rule 4 — an empty cue or identity outranks every pattern rule. */
function ruleFillDesignField(
  habit: Habit,
  entries: HabitEntry[],
  asOfDate: string,
): DiagnosisFlag[] {
  if (habit.cue && habit.identity) return [];

  const window = TUNING.windows.cuePrompt;
  const rate = floorCompletionRate(entries, habit, asOfDate, window);
  if (rate == null || rate >= TUNING.diagnosis.lowCompletionForCuePrompt) return [];

  // Cue first: it is the cheaper fix and the more common cause (§5's late introduction).
  const component: DiagnosisComponent = habit.cue ? 'identity' : 'cue';
  const label = component === 'cue' ? '신호' : '정체성';
  const subject = component === 'cue' ? '신호가' : '정체성이';
  return [
    {
      component,
      severity: 'critical',
      message: `${subject} 비어 있어요 — 습관이 붙지 않는 가장 큰 이유일 수 있어요.`,
      evidence: `최근 ${window}일 달성률 ${percent(rate)}, ${label} 미설정`,
    },
  ];
}

const RULE5: Record<'cue' | 'floor' | 'identity', { message: string; reasonLabel: string }> = {
  cue: { message: '신호 때문에 안 한 날이 반복돼요.', reasonLabel: '신호' },
  floor: { message: '최소량이 부담이라 안 한 날이 반복돼요.', reasonLabel: '너무 힘듦' },
  identity: { message: '의미를 못 느껴 안 한 날이 반복돼요.', reasonLabel: '의미 없음' },
};

const RULE5_THRESHOLD: Record<'cue' | 'floor' | 'identity', number> = {
  cue: TUNING.diagnosis.cueSkipThreshold,
  floor: TUNING.diagnosis.floorSkipThreshold,
  identity: TUNING.diagnosis.identitySkipThreshold,
};

/**
 * Rule 5 — the skip reason *is* a user-declared diagnosis (CONCEPT §5), so count it.
 *
 * Counted per **day** by its effective (latest) reason, not per row: §4.4 states all
 * rules read day-states, and that is also what keeps two skip rows on one day from
 * counting twice and what makes a skip day that a later activity row carried to the
 * floor drop out entirely. `exception` is never counted, consistent with `isMissDay`.
 */
function ruleSkipReasonAttribution(
  habit: Habit,
  entries: HabitEntry[],
  asOfDate: string,
): DiagnosisFlag[] {
  const window = TUNING.windows.skipReason;
  const days = windowDays(habit, entries, asOfDate, window).filter(isReasonedSkip);

  const flags: DiagnosisFlag[] = [];
  for (const reason of ['cue', 'floor', 'identity'] as const) {
    const count = days.filter((day) => day.skipReason === reason).length;
    if (count < RULE5_THRESHOLD[reason]) continue;
    flags.push({
      component: reason,
      severity: 'warning',
      message: RULE5[reason].message,
      evidence: `최근 ${window}일 중 '${RULE5[reason].reasonLabel}' 사유로 안 함으로 찍은 날 ${count}일`,
    });
  }
  return flags;
}

const SEVERITY_RANK: Record<Severity, number> = { ok: 0, warning: 1, critical: 2 };

/**
 * One flag per component — the higher severity wins, so a Rule 4 `critical` cue is
 * never downgraded by a Rule 5 `warning` (§4.4). The surviving flag keeps its own
 * message and evidence; the earlier rule's position in the array is preserved.
 */
function dedupeByComponent(flags: DiagnosisFlag[]): DiagnosisFlag[] {
  const out: DiagnosisFlag[] = [];
  for (const flag of flags) {
    const at = out.findIndex((kept) => kept.component === flag.component);
    if (at === -1) out.push(flag);
    else if (SEVERITY_RANK[flag.severity] > SEVERITY_RANK[out[at].severity]) out[at] = flag;
  }
  return out;
}

/** SPEC §4.4 — runs every rule in order; the array may be empty (a healthy habit). */
export function diagnose(habit: Habit, entries: HabitEntry[], asOfDate: string): DiagnosisFlag[] {
  return dedupeByComponent([
    ...ruleFloorTooHigh(habit, entries, asOfDate),
    ...ruleCueClustering(habit, entries, asOfDate),
    ...ruleStagnation(habit, entries, asOfDate),
    ...ruleFillDesignField(habit, entries, asOfDate),
    ...ruleSkipReasonAttribution(habit, entries, asOfDate),
  ]);
}
