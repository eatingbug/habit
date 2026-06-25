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
  return { id: `e${seq++}`, habitId: 'h1', date, timestamp: `${date}T12:00:00.000Z`, actual, state: 'done' };
}
function over(date: string, actual: number): HabitEntry {
  return { id: `e${seq++}`, habitId: 'h1', date, timestamp: `${date}T12:00:00.000Z`, actual, state: 'over' };
}
function skip(date: string, reason: SkipReason): HabitEntry {
  return { id: `e${seq++}`, habitId: 'h1', date, timestamp: `${date}T12:00:00.000Z`, actual: 0, state: 'skip', skipReason: reason };
}

describe('diagnose — Rule 1 floor too high', () => {
  it('fires when floor-completion rate is just under 0.60', () => {
    // 5 counted entries, 2 met → 0.40 < 0.60. Habit has cue+identity so R4 stays silent.
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
    // 5 entries, 3 met → 0.60, not < 0.60.
    const entries = [
      done('2026-06-18'),
      done('2026-06-19'),
      done('2026-06-20'),
      skip('2026-06-15', 'floor'),
      skip('2026-06-16', 'floor'),
    ];
    const flags = diagnose(habit(), entries, ASOF);
    expect(flags.some((f) => f.component === 'floor')).toBe(false);
  });
});

describe('diagnose — Rule 2 cue clustering', () => {
  it('fires when 2 misses fall on the same weekday and none elsewhere', () => {
    // Two Sundays inside the 28-day window: 06-14 and 06-21. Pad with done so R1 stays silent.
    const entries = [
      skip('2026-06-14', 'cue'),
      skip('2026-06-21', 'cue'),
      done('2026-06-15'),
      done('2026-06-16'),
      done('2026-06-17'),
    ];
    const flags = diagnose(habit(), entries, ASOF);
    const r2 = flags.filter((f) => f.component === 'cue');
    expect(r2).toHaveLength(1);
    expect(r2[0]).toEqual({
      component: 'cue',
      severity: 'warning',
      message: '일요일 신호가 계속 실패하고 있어요.',
      evidence: '놓침 2회 중 2회가 일요일에 몰렸어요',
    });
  });

  it('does NOT fire when misses span two weekdays', () => {
    // One Sunday (06-21) miss + one Tuesday (06-16) miss → no single clustered day.
    const entries = [
      skip('2026-06-21', 'cue'),
      skip('2026-06-16', 'cue'),
      done('2026-06-15'),
      done('2026-06-17'),
      done('2026-06-18'),
    ];
    const flags = diagnose(habit(), entries, ASOF);
    expect(flags.some((f) => f.component === 'cue')).toBe(false);
  });

  it('does NOT fire with only a single miss on a weekday (below min 2)', () => {
    const entries = [skip('2026-06-21', 'cue'), done('2026-06-15'), done('2026-06-16')];
    const flags = diagnose(habit(), entries, ASOF);
    expect(flags.some((f) => f.component === 'cue')).toBe(false);
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
    const flags = diagnose(habit(), entries, ASOF);
    const r3 = flags.filter((f) => f.component === 'load');
    expect(r3).toHaveLength(1);
    expect(r3[0]).toEqual({
      component: 'load',
      severity: 'warning',
      message: '최소 기준은 탄탄하지만 3주째 성장이 없어요.',
      evidence: '3주간 최소 기준을 넘은 reps 기록이 0',
    });
  });

  it('does NOT fire when any week has an above-floor entry', () => {
    const entries = [
      done('2026-06-15'),
      done('2026-06-08'),
      over('2026-06-01', 9), // above-floor in week3
    ];
    const flags = diagnose(habit({ target: 8 }), entries, ASOF);
    expect(flags.some((f) => f.component === 'load')).toBe(false);
  });

  it('does NOT fire when a week has no floor-met data', () => {
    // week2 (06-08..06-14) is empty → hasFloorMet false → disqualifies.
    const entries = [
      done('2026-06-15'),
      done('2026-06-01'),
    ];
    const flags = diagnose(habit(), entries, ASOF);
    expect(flags.some((f) => f.component === 'load')).toBe(false);
  });
});

describe('diagnose — Rule 3 binary suppression', () => {
  it('does NOT fire for a binary habit (no above-floor magnitude exists)', () => {
    // The same data that fires Rule 3 for a count habit (see "Rule 3 stagnation" above).
    const entries = [
      done('2026-06-15'),
      done('2026-06-18'),
      done('2026-06-08'),
      done('2026-06-11'),
      done('2026-06-01'),
      done('2026-06-04'),
    ];
    const flags = diagnose(habit({ kind: 'binary', floor: 1 }), entries, ASOF);
    expect(flags.some((f) => f.component === 'load')).toBe(false);
  });
});

describe('diagnose — Rule 4 fill cue/identity first', () => {
  it('fires (component cue) for a fresh habit with no cue and a single cue-skip (hasMiss path)', () => {
    // SPEC 7.2: fresh habit, no cue, one skip(cue). rate = 0/1 = 0% but hasMiss alone suffices.
    const h = habit({ cue: undefined, identity: undefined });
    const entries = [skip('2026-06-20', 'cue')];
    const flags = diagnose(h, entries, ASOF);
    const r4 = flags.filter((f) => f.severity === 'critical');
    expect(r4).toHaveLength(1);
    expect(r4[0]).toEqual({
      component: 'cue',
      severity: 'critical',
      message: '신호 미설정 — 습관이 안 붙는 주된 이유일 수 있어요.',
      evidence: '달성률 0%, 신호 비어 있음',
    });
  });

  it('fires on the low-rate trigger when cue is empty', () => {
    // 1 done + 2 skip(floor) → rate 1/3 ≈ 33% < 50%. (floor-skips also count as misses,
    // so both R4 triggers hold here; the evidence string reflects the 33% rate.)
    const h = habit({ cue: undefined, identity: undefined });
    const entries = [done('2026-06-18'), skip('2026-06-19', 'floor'), skip('2026-06-20', 'floor')];
    const flags = diagnose(h, entries, ASOF);
    const r4 = flags.filter((f) => f.severity === 'critical');
    expect(r4).toHaveLength(1);
    expect(r4[0]).toEqual({
      component: 'cue',
      severity: 'critical',
      message: '신호 미설정 — 습관이 안 붙는 주된 이유일 수 있어요.',
      evidence: '달성률 33%, 신호 비어 있음',
    });
  });

  it('reports component identity when cue is set but identity is empty', () => {
    const h = habit({ cue: 'after coffee', identity: undefined });
    const entries = [skip('2026-06-20', 'cue')];
    const flags = diagnose(h, entries, ASOF);
    const r4 = flags.filter((f) => f.severity === 'critical');
    expect(r4).toHaveLength(1);
    expect(r4[0].component).toBe('identity');
    expect(r4[0].message).toBe('정체성 미설정 — 습관이 안 붙는 주된 이유일 수 있어요.');
    expect(r4[0].evidence).toBe('달성률 0%, 정체성 비어 있음');
  });

  it('does NOT fire when both cue and identity are set', () => {
    const h = habit(); // cue + identity present
    const entries = [skip('2026-06-20', 'cue')];
    const flags = diagnose(h, entries, ASOF);
    expect(flags.some((f) => f.severity === 'critical')).toBe(false);
  });

  it('does NOT fire when rate >= 0.50 and there is no miss, even with empty cue', () => {
    const h = habit({ cue: undefined, identity: undefined });
    // All-done → rate 1.0 and no miss, so neither R4 trigger holds.
    // (A floor-skip would BOTH lower the rate AND count as a miss via isMiss, so it cannot
    //  produce a "rate>=0.50 but no miss" case — the clean way to test the guard is no miss.)
    const entries = [done('2026-06-19'), done('2026-06-20')];
    const flags = diagnose(h, entries, ASOF);
    expect(flags.some((f) => f.severity === 'critical')).toBe(false);
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
    const flags = diagnose(habit({ target: 8 }), entries, ASOF);
    expect(flags).toEqual([]);
  });
});
