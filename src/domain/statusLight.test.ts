import { deriveStatusLight, aggregateStatusCount } from './statusLight';
import type { Habit, HabitEntry } from '../models';

// today = Wednesday 2026-06-24. Week windows (weekStartsOn = Monday):
//   weeksAgo 0: 2026-06-22 .. 2026-06-28
//   weeksAgo 1: 2026-06-15 .. 2026-06-21
//   weeksAgo 2: 2026-06-08 .. 2026-06-14
//   weeksAgo 3: 2026-06-01 .. 2026-06-07
const TODAY = '2026-06-24';

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: 'Pushups',
    statId: 'strength',
    kind: 'count',
    floor: 1,
    floorUnit: 'reps',
    cue: 'after coffee',
    identity: 'I am strong',
    lifecycle: 'forming',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

let idSeq = 0;
function entry(date: string, state: HabitEntry['state'], actual: number, extra: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: `e${idSeq++}`,
    habitId: 'h1',
    date,
    timestamp: `${date}T12:00:00.000Z`,
    actual,
    state,
    ...extra,
  };
}

function done(date: string, actual = 1): HabitEntry {
  return entry(date, 'done', actual);
}
function miss(date: string): HabitEntry {
  return entry(date, 'skip', 0, { skipReason: 'cue' });
}

describe('deriveStatusLight — intervention (forming, consecutive misses)', () => {
  it('fires at exactly 2 consecutive misses', () => {
    const h = habit({ lifecycle: 'forming' });
    const entries = [miss('2026-06-23'), miss('2026-06-24')];
    expect(deriveStatusLight(h, entries, TODAY)).toBe('intervention');
  });

  it('does NOT fire at only 1 consecutive miss (boundary)', () => {
    const h = habit({ lifecycle: 'forming' });
    // one done before the single miss so it isn't a caution-via-diagnose surprise:
    const entries = [done('2026-06-23'), miss('2026-06-24')];
    // single miss -> not intervention; but diagnose Rule 2 needs >=2 misses and Rule 4
    // is satisfied (cue+identity set), Rule 1 rate is high -> caution from Rule... check
    // value is not intervention regardless:
    expect(deriveStatusLight(h, entries, TODAY)).not.toBe('intervention');
  });
});

describe('deriveStatusLight — intervention (established, declining trend)', () => {
  it('fires on 3 strictly-declining complete weeks', () => {
    const h = habit({ lifecycle: 'established', floor: 1 });
    const entries = [
      // weeksAgo 3 (oldest): total 30
      done('2026-06-01', 30),
      // weeksAgo 2: total 20
      done('2026-06-08', 20),
      // weeksAgo 1 (newest complete): total 10
      done('2026-06-15', 10),
    ];
    expect(deriveStatusLight(h, entries, TODAY)).toBe('intervention');
  });

  it('does NOT fire when newest equals oldest (not strictly below)', () => {
    const h = habit({ lifecycle: 'established', floor: 1 });
    const entries = [
      done('2026-06-01', 20), // weeksAgo 3
      done('2026-06-08', 20), // weeksAgo 2
      done('2026-06-15', 20), // weeksAgo 1
    ];
    // flat, not declining -> not intervention. (May be caution/stable, just not red.)
    expect(deriveStatusLight(h, entries, TODAY)).not.toBe('intervention');
  });

  it('does NOT fire when a middle week increases (non-monotonic)', () => {
    const h = habit({ lifecycle: 'established', floor: 1 });
    const entries = [
      done('2026-06-01', 30), // weeksAgo 3 oldest
      done('2026-06-08', 35), // weeksAgo 2 increases
      done('2026-06-15', 10), // weeksAgo 1 newest
    ];
    expect(deriveStatusLight(h, entries, TODAY)).not.toBe('intervention');
  });

  it('does NOT fire when oldest week has no data (insufficient evidence)', () => {
    const h = habit({ lifecycle: 'established', floor: 1 });
    const entries = [
      // no entry in weeksAgo 3 (2026-06-01..07)
      done('2026-06-08', 20), // weeksAgo 2
      done('2026-06-15', 10), // weeksAgo 1
    ];
    expect(deriveStatusLight(h, entries, TODAY)).not.toBe('intervention');
  });

  it('declining trend does NOT apply to forming habits', () => {
    const h = habit({ lifecycle: 'forming', floor: 1 });
    const entries = [
      done('2026-06-01', 30),
      done('2026-06-08', 20),
      done('2026-06-15', 10),
    ];
    expect(deriveStatusLight(h, entries, TODAY)).not.toBe('intervention');
  });
});

describe('deriveStatusLight — caution (exactly one diagnosis flag, no intervention)', () => {
  it('fires on an established habit with 28-day floor-rate just under 0.60 (R1) and no decline', () => {
    // Build a 28-day window (2026-05-28 .. 2026-06-24) with rate just under 0.60.
    // 5 entries: 2 met floor + 3 misses -> 2/5 = 0.40 < 0.60.
    // Keep them spread so misses don't cluster on one weekday (avoid Rule 2) and
    // don't form 2 consecutive misses through "established" (intervention is decline-only
    // for established anyway). cue+identity set -> Rule 4 silent.
    const h = habit({ lifecycle: 'established', floor: 1 });
    const entries = [
      done('2026-05-28', 1), // Thursday
      miss('2026-05-30'), // Saturday
      miss('2026-06-03'), // Wednesday
      miss('2026-06-09'), // Tuesday
      done('2026-06-24', 1), // Wednesday (today)
    ];
    // Sanity: established, so the forming-miss rule never applies; weekly totals are
    // not a strict 3-week decline -> not intervention. Exactly the R1 flag -> caution.
    expect(deriveStatusLight(h, entries, TODAY)).toBe('caution');
  });

  it('boundary: rate exactly at 0.60 does NOT raise the R1 caution', () => {
    // 3 met / 5 = 0.60, NOT < 0.60. With cue+identity set and misses non-clustered,
    // no diagnosis flag fires. Misses are spread across distinct weekdays and the
    // weekly totals are not a strict 3-week decline (newest week is the highest),
    // so no intervention either -> stable.
    const h = habit({ lifecycle: 'established', floor: 1 });
    const entries = [
      miss('2026-06-05'), // weeksAgo 3 (oldest complete) total 0, Friday
      done('2026-06-09', 1), // weeksAgo 2 total 1
      done('2026-06-17', 1), // weeksAgo 1 total 1
      done('2026-06-22', 1), // current week
      miss('2026-06-24'), // current week (today), Wednesday
    ];
    expect(deriveStatusLight(h, entries, TODAY)).toBe('stable');
  });
});

describe('deriveStatusLight — stable (healthy habit, no flags, no PB)', () => {
  it('returns stable for a forming habit completing its floor with cue+identity set', () => {
    const h = habit({ lifecycle: 'forming', floor: 1 });
    // All done, no misses, high rate, cue+identity present -> no diagnosis flags.
    // forming -> personal_best never applies.
    const entries = [done('2026-06-22', 1), done('2026-06-23', 1), done('2026-06-24', 1)];
    expect(deriveStatusLight(h, entries, TODAY)).toBe('stable');
  });
});

describe('deriveStatusLight — personal_best', () => {
  it('fires when current-week total actual exceeds all prior weeks with data', () => {
    const h = habit({ lifecycle: 'established', floor: 1 });
    const entries = [
      // prior weeks with data:
      done('2026-06-08', 10), // weeksAgo 2 total 10
      done('2026-06-15', 15), // weeksAgo 1 total 15
      // current week (weeksAgo 0): total 20 > 15 and > 10
      done('2026-06-22', 12),
      done('2026-06-24', 8),
    ];
    // Above-floor present each week and rising -> no stagnation; rate high; cue+identity
    // set -> no diagnosis flag; not declining -> not intervention. => personal_best.
    expect(deriveStatusLight(h, entries, TODAY)).toBe('personal_best');
  });

  it('does NOT fire when current week only ties the prior best (not strictly greater)', () => {
    const h = habit({ lifecycle: 'established', floor: 1 });
    const entries = [
      done('2026-06-15', 20), // weeksAgo 1 total 20
      done('2026-06-22', 20), // current week total 20 (tie)
    ];
    expect(deriveStatusLight(h, entries, TODAY)).not.toBe('personal_best');
  });

  it('does NOT fire when there is no prior week with data', () => {
    const h = habit({ lifecycle: 'established', floor: 1 });
    const entries = [done('2026-06-22', 50)]; // only the current week has data
    expect(deriveStatusLight(h, entries, TODAY)).not.toBe('personal_best');
  });

  it('does NOT apply to forming habits even when current week is highest', () => {
    const h = habit({ lifecycle: 'forming', floor: 1 });
    const entries = [done('2026-06-15', 5), done('2026-06-22', 50)];
    expect(deriveStatusLight(h, entries, TODAY)).not.toBe('personal_best');
  });
});

describe('aggregateStatusCount', () => {
  it('tallies caution and intervention across multiple habits', () => {
    const interventionHabit = habit({ id: 'a', lifecycle: 'forming' });
    const cautionHabit = habit({ id: 'b', lifecycle: 'established' });
    const stableHabit = habit({ id: 'c', lifecycle: 'forming' });
    const pbHabit = habit({ id: 'd', lifecycle: 'established' });

    const entriesByHabit: Record<string, HabitEntry[]> = {
      a: [
        { ...miss('2026-06-23'), habitId: 'a' },
        { ...miss('2026-06-24'), habitId: 'a' },
      ],
      b: [
        { ...done('2026-05-28', 1), habitId: 'b' },
        { ...miss('2026-05-30'), habitId: 'b' },
        { ...miss('2026-06-03'), habitId: 'b' },
        { ...miss('2026-06-09'), habitId: 'b' },
        { ...done('2026-06-24', 1), habitId: 'b' },
      ],
      c: [
        { ...done('2026-06-22', 1), habitId: 'c' },
        { ...done('2026-06-23', 1), habitId: 'c' },
        { ...done('2026-06-24', 1), habitId: 'c' },
      ],
      d: [
        { ...done('2026-06-08', 10), habitId: 'd' },
        { ...done('2026-06-15', 15), habitId: 'd' },
        { ...done('2026-06-22', 12), habitId: 'd' },
        { ...done('2026-06-24', 8), habitId: 'd' },
      ],
    };

    // Sanity-check the individual lights so the aggregate is meaningful.
    expect(deriveStatusLight(interventionHabit, entriesByHabit.a, TODAY)).toBe('intervention');
    expect(deriveStatusLight(cautionHabit, entriesByHabit.b, TODAY)).toBe('caution');
    expect(deriveStatusLight(stableHabit, entriesByHabit.c, TODAY)).toBe('stable');
    expect(deriveStatusLight(pbHabit, entriesByHabit.d, TODAY)).toBe('personal_best');

    const result = aggregateStatusCount(
      [interventionHabit, cautionHabit, stableHabit, pbHabit],
      entriesByHabit,
      TODAY,
    );
    expect(result).toEqual({ caution: 1, intervention: 1 });
  });

  it('treats a habit with no entries array as empty (no crash, counts nothing)', () => {
    const h = habit({ id: 'x', lifecycle: 'forming' });
    const result = aggregateStatusCount([h], {}, TODAY);
    expect(result).toEqual({ caution: 0, intervention: 0 });
  });
});
