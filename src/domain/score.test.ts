import type { Habit, HabitEntry, EntryState, SkipReason } from '../models';
import { TUNING } from '../config/tuning';
import { computeStreak, computeXP, computeStatLevel, levelForXP, milestoneBonusXP } from './score';

const habit: Habit = {
  id: 'h1',
  name: 'Pushups',
  statId: 'strength',
  kind: 'count',
  floor: 10,
  floorUnit: 'reps',
  target: 30,
  lifecycle: 'forming',
  createdAt: '2026-01-01T00:00:00.000Z',
};

let seq = 0;
function entry(
  date: string,
  state: EntryState,
  actual: number,
  skipReason?: SkipReason,
): HabitEntry {
  return {
    id: `e${seq++}`,
    habitId: 'h1',
    date,
    timestamp: `${date}T12:00:00.000Z`,
    actual,
    state,
    ...(skipReason ? { skipReason } : {}),
  };
}

const done = (date: string, actual = 10) => entry(date, 'done', actual);
const over = (date: string, actual = 30) => entry(date, 'over', actual);
const skip = (date: string, reason: SkipReason) => entry(date, 'skip', 0, reason);

/** Build a run of consecutive done days starting at `start` for `n` days. */
function doneRun(start: string, n: number): HabitEntry[] {
  const out: HabitEntry[] = [];
  const base = new Date(`${start}T00:00:00.000Z`).getTime();
  for (let i = 0; i < n; i++) {
    out.push(done(new Date(base + i * 86400000).toISOString().slice(0, 10)));
  }
  return out;
}

describe('computeStreak', () => {
  it('returns 0 for no entries', () => {
    expect(computeStreak([], '2026-06-23')).toBe(0);
  });

  it('counts consecutive done/over days backward from today', () => {
    const entries = [done('2026-06-21'), over('2026-06-22'), done('2026-06-23')];
    expect(computeStreak(entries, '2026-06-23')).toBe(3);
  });

  it('a blank day between two done days does NOT break the streak (transparent)', () => {
    // 06-22 is blank
    const entries = [done('2026-06-21'), done('2026-06-23')];
    expect(computeStreak(entries, '2026-06-23')).toBe(2);
  });

  it('trailing blanks between today and last done day do not break', () => {
    // today 06-23, 06-23 & 06-22 blank, last done 06-21
    const entries = [done('2026-06-20'), done('2026-06-21')];
    expect(computeStreak(entries, '2026-06-23')).toBe(2);
  });

  it('exception skip is transparent (neither counts nor breaks)', () => {
    const entries = [done('2026-06-21'), skip('2026-06-22', 'exception'), done('2026-06-23')];
    expect(computeStreak(entries, '2026-06-23')).toBe(2);
  });

  it('a non-exception skip breaks the streak', () => {
    const entries = [
      done('2026-06-20'),
      done('2026-06-21'),
      skip('2026-06-22', 'cue'),
      done('2026-06-23'),
    ];
    // walking back: 06-23 done (1), 06-22 skip -> break
    expect(computeStreak(entries, '2026-06-23')).toBe(1);
  });

  it('returns 0 when today itself is a non-exception skip', () => {
    const entries = [done('2026-06-22'), skip('2026-06-23', 'floor')];
    expect(computeStreak(entries, '2026-06-23')).toBe(0);
  });

  it('still counts when today is blank but earlier days are done', () => {
    const entries = [done('2026-06-22')];
    expect(computeStreak(entries, '2026-06-23')).toBe(1);
  });

  it('does not require entries to be pre-sorted', () => {
    const entries = [done('2026-06-23'), done('2026-06-21'), done('2026-06-22')];
    expect(computeStreak(entries, '2026-06-23')).toBe(3);
  });
});

describe('computeXP', () => {
  it('base only: floorMetDays * xpPerFloorCompletion, no over, no milestone', () => {
    const entries = [done('2026-06-01'), done('2026-06-03'), done('2026-06-05')];
    expect(computeXP(entries, habit)).toBe(3 * TUNING.xpPerFloorCompletion);
  });

  it('over days add base, target bonus, AND above-floor intensity', () => {
    // 2 done(actual 10, floor 10 → 0 above) + 1 over(actual 30 → 20 above) =>
    // floorMetDays=3, overDays=1, aboveFloor=20.
    const entries = [done('2026-06-01'), done('2026-06-03'), over('2026-06-05')];
    expect(computeXP(entries, habit)).toBe(
      3 * TUNING.xpPerFloorCompletion +
        1 * TUNING.xpBonusTargetExceed +
        20 * TUNING.xpPerAboveFloorUnit,
    );
  });

  it('non-exception skips contribute no XP', () => {
    const entries = [done('2026-06-01'), skip('2026-06-02', 'cue'), done('2026-06-03')];
    expect(computeXP(entries, habit)).toBe(2 * TUNING.xpPerFloorCompletion);
  });

  it('a 7-run adds the 7 milestone bonus (+120) but not the 30 bonus', () => {
    const entries = doneRun('2026-06-01', 7);
    expect(computeXP(entries, habit)).toBe(
      7 * TUNING.xpPerFloorCompletion + TUNING.xpStreakBonus[7],
    );
  });

  it('a 6-run does NOT reach the 7 milestone (boundary just-below)', () => {
    const entries = doneRun('2026-06-01', 6);
    expect(computeXP(entries, habit)).toBe(6 * TUNING.xpPerFloorCompletion);
  });

  it('a 30-run adds BOTH milestones (+120 +300)', () => {
    const entries = doneRun('2026-06-01', 30);
    expect(computeXP(entries, habit)).toBe(
      30 * TUNING.xpPerFloorCompletion + TUNING.xpStreakBonus[7] + TUNING.xpStreakBonus[30],
    );
  });

  it('milestone uses LONGEST run; a non-exception skip resets the run', () => {
    // run of 7, break, run of 3 -> longest 7 -> +120 only
    const entries = [
      ...doneRun('2026-06-01', 7),
      skip('2026-06-08', 'cue'),
      ...doneRun('2026-06-09', 3),
    ];
    const floorMet = 7 + 3;
    expect(computeXP(entries, habit)).toBe(
      floorMet * TUNING.xpPerFloorCompletion + TUNING.xpStreakBonus[7],
    );
  });

  it('exception skips are transparent inside a run (do not reset longest)', () => {
    // 4 done, exception skip, 3 done -> contiguous run of 7 for milestone purposes
    const entries = [
      ...doneRun('2026-06-01', 4),
      skip('2026-06-05', 'exception'),
      ...doneRun('2026-06-06', 3),
    ];
    const floorMet = 7;
    expect(computeXP(entries, habit)).toBe(
      floorMet * TUNING.xpPerFloorCompletion + TUNING.xpStreakBonus[7],
    );
  });

  it('returns 0 for empty history', () => {
    expect(computeXP([], habit)).toBe(0);
  });
});

describe('levelForXP', () => {
  const T = TUNING.statLevelThresholds; // [0, 420, 1200, 2700, ...]
  it('0 XP -> level 0', () => expect(levelForXP(0)).toBe(0));
  it('one below a threshold stays', () => expect(levelForXP(T[1] - 1)).toBe(0));
  it('exactly at a threshold promotes', () => expect(levelForXP(T[1])).toBe(1));
  it('mid-band stays', () => expect(levelForXP(T[2] - 1)).toBe(1));
  it('next band promotes', () => expect(levelForXP(T[2])).toBe(2));
  it('huge XP clamps to the last index', () => expect(levelForXP(10_000_000)).toBe(T.length - 1));
});

describe('computeStatLevel = levelForXP(computeXP)', () => {
  it('count level reflects folded XP (base + over + intensity + streak)', () => {
    // 7 done(floor) then 1 over(actual 30 → 20 above) = a run of 8.
    const entries = [...doneRun('2026-06-01', 7), over('2026-06-08', 30)];
    const expectedXP =
      8 * TUNING.xpPerFloorCompletion +
      1 * TUNING.xpBonusTargetExceed +
      20 * TUNING.xpPerAboveFloorUnit +
      TUNING.xpStreakBonus[7];
    expect(computeXP(entries, habit)).toBe(expectedXP);
    expect(computeStatLevel(entries, habit)).toBe(levelForXP(expectedXP));
  });

  it('empty history -> level 0', () => {
    expect(computeStatLevel([], habit)).toBe(0);
  });
});

// ── Binary (yes/no) habits ─────────────────────────────────────────────────────────
const binaryHabit: Habit = { ...habit, kind: 'binary', floor: 1, floorUnit: 'time', target: undefined };

describe('computeXP — binary habit', () => {
  it('floor-met base only when no milestone is reached (no over/intensity)', () => {
    const entries = [done('2026-06-01'), done('2026-06-02')]; // run of 2 < 5
    expect(computeXP(entries, binaryHabit)).toBe(2 * TUNING.xpPerFloorCompletion);
  });

  it('adds the milestone bonus once a run reaches a tier', () => {
    const entries = doneRun('2026-06-01', 5);
    expect(computeXP(entries, binaryHabit)).toBe(
      5 * TUNING.xpPerFloorCompletion + TUNING.binaryStreakMilestones[5],
    );
  });
});

describe('milestoneBonusXP', () => {
  it('a run of exactly 5 awards the 5-tier once', () => {
    expect(milestoneBonusXP(doneRun('2026-06-01', 5))).toBe(TUNING.binaryStreakMilestones[5]);
  });

  it('a run of 4 awards nothing (below the first tier)', () => {
    expect(milestoneBonusXP(doneRun('2026-06-01', 4))).toBe(0);
  });

  it('a continuous run of 10 awards the 5-tier AND the 10-tier once each', () => {
    expect(milestoneBonusXP(doneRun('2026-06-01', 10))).toBe(
      TUNING.binaryStreakMilestones[5] + TUNING.binaryStreakMilestones[10],
    );
  });

  it('break-and-rebuild: the second 5-achievement is decayed (×0.5)', () => {
    const entries = [
      ...doneRun('2026-06-01', 5),
      skip('2026-06-06', 'cue'),
      ...doneRun('2026-06-07', 5),
    ];
    const base = TUNING.binaryStreakMilestones[5];
    expect(milestoneBonusXP(entries)).toBe(base + Math.round(base * TUNING.binaryMilestoneDecay));
  });

  it('a blank gap is forgiven: "5, gap, 5 more" is one 10-run (not the 5-tier twice)', () => {
    const entries = [...doneRun('2026-06-01', 5), ...doneRun('2026-06-13', 5)];
    expect(milestoneBonusXP(entries)).toBe(
      TUNING.binaryStreakMilestones[5] + TUNING.binaryStreakMilestones[10],
    );
  });

  it('an exception skip is transparent inside a run', () => {
    const entries = [
      ...doneRun('2026-06-01', 3),
      skip('2026-06-04', 'exception'),
      ...doneRun('2026-06-05', 2),
    ];
    expect(milestoneBonusXP(entries)).toBe(TUNING.binaryStreakMilestones[5]);
  });

  it('is order-independent (sorted internally)', () => {
    const run = doneRun('2026-06-01', 5);
    const shuffled = [run[3], run[0], run[4], run[1], run[2]];
    expect(milestoneBonusXP(shuffled)).toBe(milestoneBonusXP(run));
  });

  it('empty history awards nothing', () => {
    expect(milestoneBonusXP([])).toBe(0);
  });
});
