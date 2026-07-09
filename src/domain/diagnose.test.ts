import { diagnose } from './diagnose';
import type { Habit, HabitEntry, SkipReason } from '../models';

// asOf is Monday 2026-06-22 (weekStartsOn = Monday).
// Complete weeks before it: week1 06-15..06-21, week2 06-08..06-14, week3 06-01..06-07.
const ASOF = '2026-06-22';

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: 'Pushups',
    statId: 'strength',
    kind: 'count',
    floor: 5,
    floorUnit: 'reps',
    cue: 'after coffee',
    identity: 'I am strong',
    lifecycle: 'forming',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

let seq = 0;
function done(date: string, actual = 5): HabitEntry {
  return { id: `e${seq++}`, habitId: 'h1', date, timestamp: `${date}T12:00:00.000Z`, actual };
}
function over(date: string, actual: number): HabitEntry {
  return { id: `e${seq++}`, habitId: 'h1', date, timestamp: `${date}T12:00:00.000Z`, actual };
}
function part(date: string, actual = 2): HabitEntry {
  // 0 < actual < floor (5) → partial
  return { id: `e${seq++}`, habitId: 'h1', date, timestamp: `${date}T12:00:00.000Z`, actual };
}
function skip(date: string, reason: SkipReason): HabitEntry {
  return { id: `e${seq++}`, habitId: 'h1', date, timestamp: `${date}T12:00:00.000Z`, actual: 0, skipReason: reason };
}

describe('diagnose — Rule 1 floor too high', () => {
  it('fires when floor-completion rate is just under 0.60 (with ≥5 engaged days)', () => {
    // 5 engaged (2 done + 3 floor-skip), 2 met → 0.40 < 0.60.
    const entries = [
      done('2026-06-18'),
      done('2026-06-19'),
      skip('2026-06-15', 'floor'),
      skip('2026-06-16', 'floor'),
      skip('2026-06-17', 'floor'),
    ];
    const flags = diagnose(habit(), entries, ASOF);
    const r1 = flags.filter((f) => f.component === 'floor');
    expect(r1).toHaveLength(1);
    expect(r1[0]).toEqual({
      component: 'floor',
      severity: 'warning',
      message: '최소 기준이 너무 높을 수 있어요.',
      evidence: '최근 28일간 최소 달성률 40%',
    });
  });

  it('does NOT fire at exactly 0.60 (boundary)', () => {
    // 5 engaged, 3 met → 0.60, not < 0.60.
    const entries = [
      done('2026-06-18'),
      done('2026-06-19'),
      done('2026-06-20'),
      skip('2026-06-15', 'floor'),
      skip('2026-06-16', 'floor'),
    ];
    expect(diagnose(habit(), entries, ASOF).some((f) => f.component === 'floor')).toBe(false);
  });

  it('A3: stays silent below the minimum engaged sample even at 0% rate', () => {
    // 4 floor-skips on distinct weekdays → engaged 4 < 5 → no Rule 1 (and no Rule 2 cluster).
    const entries = [
      skip('2026-06-17', 'floor'),
      skip('2026-06-18', 'floor'),
      skip('2026-06-19', 'floor'),
      skip('2026-06-20', 'floor'),
    ];
    expect(diagnose(habit(), entries, ASOF).some((f) => f.component === 'floor')).toBe(false);
  });

  it('A3: a lone partial day does not trip Rule 1 off a single data point', () => {
    expect(diagnose(habit(), [part('2026-06-20')], ASOF).some((f) => f.component === 'floor')).toBe(false);
  });

  it('partial days count against the rate once the sample is large enough', () => {
    // 5 engaged (2 done + 3 partial), met 2 → 0.40.
    const entries = [
      done('2026-06-16'),
      done('2026-06-17'),
      part('2026-06-18'),
      part('2026-06-19'),
      part('2026-06-20'),
    ];
    const r1 = diagnose(habit(), entries, ASOF).filter((f) => f.component === 'floor');
    expect(r1).toHaveLength(1);
    expect(r1[0].evidence).toBe('최근 28일간 최소 달성률 40%');
  });
});

describe('diagnose — Rule 2 cue clustering', () => {
  it('fires when 2 miss days fall on the same weekday and none elsewhere', () => {
    // Two Sundays inside the 28-day window: 06-14 and 06-21. Pad with done so R1 stays silent.
    const entries = [
      skip('2026-06-14', 'cue'),
      skip('2026-06-21', 'cue'),
      done('2026-06-15'),
      done('2026-06-16'),
      done('2026-06-17'),
    ];
    const r2 = diagnose(habit(), entries, ASOF).filter((f) => f.component === 'cue');
    expect(r2).toHaveLength(1);
    expect(r2[0]).toEqual({
      component: 'cue',
      severity: 'warning',
      message: '일요일 신호가 계속 실패하고 있어요.',
      evidence: '놓침 2회 중 2회가 일요일에 몰렸어요',
    });
  });

  it('does NOT fire when misses span two weekdays', () => {
    const entries = [
      skip('2026-06-21', 'cue'),
      skip('2026-06-16', 'cue'),
      done('2026-06-15'),
      done('2026-06-17'),
      done('2026-06-18'),
    ];
    expect(diagnose(habit(), entries, ASOF).some((f) => f.component === 'cue')).toBe(false);
  });

  it('does NOT fire with only a single miss on a weekday (below min 2)', () => {
    const entries = [skip('2026-06-21', 'cue'), done('2026-06-15'), done('2026-06-16')];
    expect(diagnose(habit(), entries, ASOF).some((f) => f.component === 'cue')).toBe(false);
  });

  it('groups same-day skip rows into one miss day (multi-entry)', () => {
    // Two skip rows on the SAME Sunday (06-21) are one miss day, so no cluster (min 2 days).
    const entries = [
      skip('2026-06-21', 'cue'),
      skip('2026-06-21', 'cue'),
      done('2026-06-15'),
      done('2026-06-16'),
      done('2026-06-17'),
    ];
    expect(diagnose(habit(), entries, ASOF).some((f) => f.component === 'cue')).toBe(false);
  });
});

describe('diagnose — Rule 3 stagnation', () => {
  it('fires when all 3 complete weeks have floor-met, rate>=0.60, zero above-floor', () => {
    const entries = [
      done('2026-06-15'),
      done('2026-06-18'),
      done('2026-06-08'),
      done('2026-06-11'),
      done('2026-06-01'),
      done('2026-06-04'),
    ];
    const r3 = diagnose(habit(), entries, ASOF).filter((f) => f.component === 'load');
    expect(r3).toHaveLength(1);
    expect(r3[0]).toEqual({
      component: 'load',
      severity: 'warning',
      message: '최소 기준은 탄탄하지만 3주째 성장이 없어요.',
      evidence: '3주간 최소 기준을 넘은 reps 기록이 0',
    });
  });

  it('does NOT fire when any week has an above-floor entry', () => {
    const entries = [done('2026-06-15'), done('2026-06-08'), over('2026-06-01', 9)]; // above-floor in week3
    expect(diagnose(habit({ target: 8 }), entries, ASOF).some((f) => f.component === 'load')).toBe(false);
  });

  it('does NOT fire when a week has no floor-met data', () => {
    const entries = [done('2026-06-15'), done('2026-06-01')]; // week2 empty
    expect(diagnose(habit(), entries, ASOF).some((f) => f.component === 'load')).toBe(false);
  });

  it('above-floor is summed per day (two rows crossing the floor count as growth)', () => {
    // week3 day 06-01 has two rows 3+3 = 6 > floor 5 → above-floor 1 → not stagnant.
    const entries = [
      done('2026-06-15'),
      done('2026-06-08'),
      part('2026-06-01', 3),
      part('2026-06-01', 3),
    ];
    expect(diagnose(habit(), entries, ASOF).some((f) => f.component === 'load')).toBe(false);
  });
});

describe('diagnose — Rule 3 binary suppression', () => {
  it('does NOT fire for a binary habit (no above-floor magnitude exists)', () => {
    const entries = [
      done('2026-06-15'),
      done('2026-06-18'),
      done('2026-06-08'),
      done('2026-06-11'),
      done('2026-06-01'),
      done('2026-06-04'),
    ];
    expect(diagnose(habit({ kind: 'binary', floor: 1 }), entries, ASOF).some((f) => f.component === 'load')).toBe(false);
  });
});

describe('diagnose — Rule 4 fill cue/identity first', () => {
  it('fires (component cue) via the hasMiss path when cue is empty (≥5 engaged)', () => {
    // 4 done + 1 cue-skip → engaged 5, rate 0.80 (no low-rate trigger) but hasMiss fires it.
    const h = habit({ cue: undefined, identity: undefined });
    const entries = [
      done('2026-06-15'),
      done('2026-06-16'),
      done('2026-06-17'),
      done('2026-06-18'),
      skip('2026-06-19', 'cue'),
    ];
    const r4 = diagnose(h, entries, ASOF).filter((f) => f.severity === 'critical');
    expect(r4).toHaveLength(1);
    expect(r4[0]).toEqual({
      component: 'cue',
      severity: 'critical',
      message: '신호 미설정 — 습관이 안 붙는 주된 이유일 수 있어요.',
      evidence: '달성률 80%, 신호 비어 있음',
    });
  });

  it('fires on the low-rate trigger when cue is empty', () => {
    // 2 done + 3 floor-skip → engaged 5, rate 40% < 50%.
    const h = habit({ cue: undefined, identity: undefined });
    const entries = [
      done('2026-06-17'),
      done('2026-06-18'),
      skip('2026-06-15', 'floor'),
      skip('2026-06-16', 'floor'),
      skip('2026-06-19', 'floor'),
    ];
    const r4 = diagnose(h, entries, ASOF).filter((f) => f.severity === 'critical');
    expect(r4).toHaveLength(1);
    expect(r4[0]).toEqual({
      component: 'cue',
      severity: 'critical',
      message: '신호 미설정 — 습관이 안 붙는 주된 이유일 수 있어요.',
      evidence: '달성률 40%, 신호 비어 있음',
    });
  });

  it('reports component identity when cue is set but identity is empty', () => {
    const h = habit({ cue: 'after coffee', identity: undefined });
    const entries = [
      done('2026-06-15'),
      done('2026-06-16'),
      done('2026-06-17'),
      done('2026-06-18'),
      skip('2026-06-19', 'cue'),
    ];
    const r4 = diagnose(h, entries, ASOF).filter((f) => f.severity === 'critical');
    expect(r4).toHaveLength(1);
    expect(r4[0].component).toBe('identity');
    expect(r4[0].message).toBe('정체성 미설정 — 습관이 안 붙는 주된 이유일 수 있어요.');
    expect(r4[0].evidence).toBe('달성률 80%, 정체성 비어 있음');
  });

  it('does NOT fire when both cue and identity are set', () => {
    const entries = [skip('2026-06-20', 'cue')];
    expect(diagnose(habit(), entries, ASOF).some((f) => f.severity === 'critical')).toBe(false);
  });

  it('does NOT fire when rate >= 0.50 and there is no miss, even with empty cue', () => {
    const h = habit({ cue: undefined, identity: undefined });
    // 5 done → engaged 5 (guard passes), rate 1.0, no miss → neither trigger holds.
    const entries = [
      done('2026-06-15'),
      done('2026-06-16'),
      done('2026-06-17'),
      done('2026-06-18'),
      done('2026-06-19'),
    ];
    expect(diagnose(h, entries, ASOF).some((f) => f.severity === 'critical')).toBe(false);
  });

  it('A3: does NOT fire below the minimum engaged sample even with a miss', () => {
    const h = habit({ cue: undefined, identity: undefined });
    const entries = [skip('2026-06-20', 'cue')]; // 1 engaged day < 5
    expect(diagnose(h, entries, ASOF).some((f) => f.severity === 'critical')).toBe(false);
  });
});

describe('diagnose — healthy habit', () => {
  it('returns [] for a habit with cue+identity, high rate, growth, no clustering', () => {
    const entries = [
      over('2026-06-15', 9),
      over('2026-06-16', 10),
      done('2026-06-18'),
      over('2026-06-08', 9),
      done('2026-06-10'),
      over('2026-06-01', 9),
      done('2026-06-03'),
    ];
    expect(diagnose(habit({ target: 8 }), entries, ASOF)).toEqual([]);
  });
});
