/**
 * domain/diagnose.ts — weekly diagnosis rules (SPEC §4.4 + plan resolutions).
 *
 * Runs all four rules in order and returns the fired flags (possibly empty). Pure:
 * date math + the shared floor-rate helper + the miss predicate. No React, no I/O.
 */
import type { DiagnosisFlag, Habit, HabitEntry } from '../models';
import { TUNING } from '../config/tuning';
import {
  aboveFloorAmount,
  dayOfWeek,
  entriesInWindow,
  floorCompletionRate,
  metFloor,
  nthWeekWindow,
  windowFrom,
} from './util';
import { isMiss } from './classify';

const DAY_NAMES = [
  '일요일',
  '월요일',
  '화요일',
  '수요일',
  '목요일',
  '금요일',
  '토요일',
];

export function diagnose(habit: Habit, entries: HabitEntry[], asOfDate: string): DiagnosisFlag[] {
  const flags: DiagnosisFlag[] = [];

  // RULE 1 — Floor too high.
  const r1Window = windowFrom(asOfDate, TUNING.diagnosis.floorRateWindowDays);
  const r1Rate = floorCompletionRate(entries, r1Window);
  if (r1Rate < TUNING.diagnosis.lowFloorRateThreshold) {
    flags.push({
      component: 'floor',
      severity: 'warning',
      message: '최소 기준이 너무 높을 수 있어요.',
      evidence: `최근 ${TUNING.diagnosis.floorRateWindowDays}일간 최소 달성률 ${Math.round(r1Rate * 100)}%`,
    });
  }

  // RULE 2 — Cue clustering: all misses fall on a single weekday and there are >= 2.
  const r2Window = windowFrom(asOfDate, TUNING.diagnosis.cueClusterWindowDays);
  const misses = entriesInWindow(entries, r2Window).filter(isMiss);
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const miss of misses) {
    counts[dayOfWeek(miss.date)] += 1;
  }
  const total = misses.length;
  const clusteredDays = counts
    .map((count, d) => ({ count, d }))
    .filter(({ count }) => count >= TUNING.diagnosis.cueClusterMinMisses);
  const otherMisses = counts
    .filter((_, d) => clusteredDays.length === 1 && d !== clusteredDays[0].d)
    .reduce((sum, count) => sum + count, 0);
  if (clusteredDays.length === 1 && otherMisses === 0) {
    const d = clusteredDays[0].d;
    flags.push({
      component: 'cue',
      severity: 'warning',
      message: `${DAY_NAMES[d]} 신호가 계속 실패하고 있어요.`,
      evidence: `놓침 ${total}회 중 ${counts[d]}회가 ${DAY_NAMES[d]}에 몰렸어요`,
    });
  }

  // RULE 3 — Stagnation: floor solid but no above-floor growth across the last N complete weeks.
  // Binary (yes/no) habits have no above-floor magnitude (it is structurally always 0), so this
  // rule cannot apply — it would otherwise fire forever. Only diagnose stagnation for count habits.
  const N = TUNING.diagnosis.stagnationAboveFloorWeeks;
  let allWeeksQualify = habit.kind === 'count';
  for (let weeksAgo = 1; allWeeksQualify && weeksAgo <= N; weeksAgo += 1) {
    const weekWindow = nthWeekWindow(asOfDate, weeksAgo, TUNING.weekStartsOn);
    const weekEntries = entriesInWindow(entries, weekWindow);
    const hasFloorMet = weekEntries.some(metFloor);
    const rate = floorCompletionRate(entries, weekWindow);
    const aboveFloor = weekEntries.reduce((sum, e) => sum + aboveFloorAmount(e, habit), 0);
    const qualifies =
      hasFloorMet && rate >= TUNING.diagnosis.lowFloorRateThreshold && aboveFloor === 0;
    if (!qualifies) {
      allWeeksQualify = false;
      break;
    }
  }
  if (allWeeksQualify) {
    flags.push({
      component: 'load',
      severity: 'warning',
      message: `최소 기준은 탄탄하지만 ${N}주째 성장이 없어요.`,
      evidence: `${N}주간 최소 기준을 넘은 ${habit.floorUnit} 기록이 0`,
    });
  }

  // RULE 4 — Fill cue / identity first (SPEC deviation, plan).
  if (!habit.cue || !habit.identity) {
    const r4Window = windowFrom(asOfDate, TUNING.diagnosis.cuePromptWindowDays);
    const rate = floorCompletionRate(entries, r4Window);
    const hasMiss = entriesInWindow(entries, r4Window).some(isMiss);
    if (rate < TUNING.diagnosis.lowCompletionForCuePrompt || hasMiss) {
      const field = habit.cue ? 'identity' : 'cue';
      const fieldKo = field === 'cue' ? '신호' : '정체성';
      flags.push({
        component: field,
        severity: 'critical',
        message: `${fieldKo} 미설정 — 습관이 안 붙는 주된 이유일 수 있어요.`,
        evidence: `달성률 ${Math.round(rate * 100)}%, ${fieldKo} 비어 있음`,
      });
    }
  }

  return flags;
}
