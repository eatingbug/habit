import { TUNING } from '@/config/tuning';
import type { Habit, HabitEntry, SkipReason } from '@/models';

import { addDays } from './dates';
import {
  computeStatLevel,
  computeStatXP,
  computeXP,
  describeLogEffect,
  levelForXP,
  milestoneBonusXP,
} from './score';

const START = '2026-03-01';

const COUNT: Habit = {
  id: 'h1',
  name: '팔굽혀펴기',
  statId: 'strength',
  kind: 'count',
  floor: 5,
  floorUnit: 'reps',
  target: 8,
  lifecycle: 'forming',
  createdAt: `${START}T00:00:00.000Z`,
};

const BINARY: Habit = {
  id: 'h2',
  name: '명상',
  statId: 'strength',
  kind: 'binary',
  floor: 1,
  floorUnit: 'time',
  lifecycle: 'forming',
  createdAt: `${START}T00:00:00.000Z`,
};

const SIBLING: Habit = { ...BINARY, id: 'h3', name: '독서' };

/** Day `n` of the fixture calendar (day 0 = the habit's creation date). */
function d(n: number): string {
  return addDays(START, n);
}

let seq = 0;
function activity(date: string, actual: number, time = '09:00:00'): HabitEntry {
  return { id: `a${++seq}`, habitId: 'h1', date, timestamp: `${date}T${time}.000Z`, actual };
}
function skip(date: string, skipReason: SkipReason, time = '09:00:00'): HabitEntry {
  return {
    id: `s${++seq}`,
    habitId: 'h1',
    date,
    timestamp: `${date}T${time}.000Z`,
    actual: 0,
    skipReason,
  };
}
/** `n` consecutive floor-met days beginning on fixture day `start`. */
function doneRun(n: number, amount: number, start = 0): HabitEntry[] {
  return Array.from({ length: n }, (_, i) => activity(d(start + i), amount));
}
/** Deterministic reordering — every scoring function must ignore array order. */
function permuted(entries: HabitEntry[]): HabitEntry[] {
  return [...entries].reverse();
}

describe('computeXP — count habits score day sums (§4.2)', () => {
  it('adds base XP, the target bonus and above-floor intensity', () => {
    const entries = [activity(d(0), 6), activity(d(1), 9)];
    // 2 floor-met days + 1 target-exceeded day + (1 + 4) units above the floor
    expect(computeXP(entries, COUNT)).toBe(
      2 * TUNING.xpPerFloorCompletion + TUNING.xpBonusTargetExceed + 5 * TUNING.xpPerAboveFloorUnit,
    );
  });

  it('counts a floor-met day once however many activity rows it holds', () => {
    const oneRow = [activity(d(0), 6)];
    const twoRows = [activity(d(0), 2), activity(d(0), 4, '21:00:00')];
    expect(computeXP(twoRows, COUNT)).toBe(computeXP(oneRow, COUNT));
  });

  it('awards the longest-run bonus once the run reaches a threshold', () => {
    expect(computeXP(doneRun(6, 5), COUNT)).toBe(6 * TUNING.xpPerFloorCompletion);
    expect(computeXP(doneRun(7, 5), COUNT)).toBe(
      7 * TUNING.xpPerFloorCompletion + TUNING.xpStreakBonus[7],
    );
  });

  it('accumulates every longest-run threshold the run has passed', () => {
    expect(computeXP(doneRun(30, 5), COUNT)).toBe(
      30 * TUNING.xpPerFloorCompletion + TUNING.xpStreakBonus[7] + TUNING.xpStreakBonus[30],
    );
  });

  it('keeps a partial day transparent to the longest run', () => {
    const entries = [...doneRun(3, 5), activity(d(3), 3), ...doneRun(4, 5, 4)];
    expect(computeXP(entries, COUNT)).toBe(
      7 * TUNING.xpPerFloorCompletion + TUNING.xpStreakBonus[7],
    );
  });

  it('gives a partial day no floor XP and no intensity', () => {
    expect(computeXP([activity(d(0), 3)], COUNT)).toBe(0);
  });

  it('is invariant under any permutation of the rows', () => {
    const entries = [
      activity(d(0), 2),
      activity(d(0), 4, '21:00:00'),
      activity(d(1), 9),
      skip(d(2), 'cue'),
      activity(d(3), 6),
    ];
    expect(computeXP(permuted(entries), COUNT)).toBe(computeXP(entries, COUNT));
  });
});

describe('computeXP — binary habits add milestone bonuses (§4.2)', () => {
  it('adds base XP per done day plus the run milestone', () => {
    expect(computeXP(doneRun(5, 1), BINARY)).toBe(
      5 * TUNING.xpPerFloorCompletion + TUNING.binaryStreakMilestones[5],
    );
  });

  it('awards a day at most once regardless of row count (§7.3 invariant)', () => {
    const twoDoneRows = [activity(d(0), 1), activity(d(0), 1, '21:00:00')];
    expect(computeXP(twoDoneRows, BINARY)).toBe(TUNING.xpPerFloorCompletion);
  });

  it('never earns the count-only target or intensity terms', () => {
    expect(computeXP(doneRun(3, 1), BINARY)).toBe(3 * TUNING.xpPerFloorCompletion);
  });
});

describe('milestoneBonusXP — runs, decay and recovery (§4.2)', () => {
  it('fires every milestone a single run passes, each at full value', () => {
    expect(milestoneBonusXP(doneRun(10, 1), BINARY)).toBe(
      TUNING.binaryStreakMilestones[5] + TUNING.binaryStreakMilestones[10],
    );
  });

  it('halves the award the second time a milestone is reached', () => {
    // five done days, one unrecorded day, then five done days again
    const entries = [...doneRun(5, 1), ...doneRun(5, 1, 6)];
    expect(milestoneBonusXP(entries, BINARY)).toBe(
      TUNING.binaryStreakMilestones[5] +
        Math.round(TUNING.binaryStreakMilestones[5] * TUNING.binaryMilestoneDecay),
    );
  });

  it('lets a missed day reset the run (ADR-0001)', () => {
    const broken = [...doneRun(5, 1), ...doneRun(5, 1, 6)];
    expect(milestoneBonusXP(broken, BINARY)).toBeLessThan(
      milestoneBonusXP(doneRun(10, 1), BINARY),
    );
  });

  it('restores the joined run when the missed day is backfilled', () => {
    const broken = [...doneRun(5, 1), ...doneRun(5, 1, 6)];
    const backfilled = [...broken, activity(d(5), 1)];
    expect(milestoneBonusXP(backfilled, BINARY)).toBe(
      TUNING.binaryStreakMilestones[5] + TUNING.binaryStreakMilestones[10],
    );
    expect(milestoneBonusXP(backfilled, BINARY)).toBeGreaterThan(milestoneBonusXP(broken, BINARY));
  });

  it('treats an exception skip as transparent to the run', () => {
    const entries = [...doneRun(3, 1), skip(d(3), 'exception'), ...doneRun(2, 1, 4)];
    expect(milestoneBonusXP(entries, BINARY)).toBe(TUNING.binaryStreakMilestones[5]);
  });

  it('lets a non-exception skip reset the run', () => {
    const entries = [...doneRun(3, 1), skip(d(3), 'cue'), ...doneRun(2, 1, 4)];
    expect(milestoneBonusXP(entries, BINARY)).toBe(0);
  });

  it('is idempotent and permutation-invariant', () => {
    const entries = [...doneRun(5, 1), ...doneRun(5, 1, 6)];
    const first = milestoneBonusXP(entries, BINARY);
    expect(milestoneBonusXP(entries, BINARY)).toBe(first);
    expect(milestoneBonusXP(permuted(entries), BINARY)).toBe(first);
  });

  it('drops an award that has decayed below the epsilon', () => {
    // ten runs of five, each separated by one unrecorded day
    const runs = Array.from({ length: 10 }, (_, i) => doneRun(5, 1, i * 6)).flat();
    const expected = Array.from({ length: 10 }, (_, k) =>
      Math.round(TUNING.binaryStreakMilestones[5] * TUNING.binaryMilestoneDecay ** k),
    )
      .filter((award) => award >= TUNING.milestoneBonusEpsilon)
      .reduce((a, b) => a + b, 0);
    expect(milestoneBonusXP(runs, BINARY)).toBe(expected);
    // the last runs really did decay to nothing
    expect(Math.round(TUNING.binaryStreakMilestones[5] * TUNING.binaryMilestoneDecay ** 9)).toBe(0);
  });
});

describe('levelForXP boundaries (§4.2)', () => {
  it('is the highest threshold index at or below the XP', () => {
    const [, second, third] = TUNING.statLevelThresholds;
    expect(levelForXP(0)).toBe(0);
    expect(levelForXP(second - 1)).toBe(0);
    expect(levelForXP(second)).toBe(1);
    expect(levelForXP(third - 1)).toBe(1);
    expect(levelForXP(third)).toBe(2);
  });

  it('caps at the last threshold', () => {
    const last = TUNING.statLevelThresholds.length - 1;
    expect(levelForXP(TUNING.statLevelThresholds[last])).toBe(last);
    expect(levelForXP(TUNING.statLevelThresholds[last] * 10)).toBe(last);
  });
});

describe('stat XP and level sum every habit mapped to the stat (§4.2)', () => {
  it('sums the XP of all habits on the stat and ignores other stats', () => {
    const all = [
      { habit: BINARY, entries: doneRun(2, 1) },
      { habit: SIBLING, entries: doneRun(4, 1) },
      { habit: { ...BINARY, id: 'h9', statId: 'intelligence' }, entries: doneRun(4, 1) },
    ];
    expect(computeStatXP('strength', all)).toBe(6 * TUNING.xpPerFloorCompletion);
    expect(computeStatLevel('strength', all)).toBe(levelForXP(6 * TUNING.xpPerFloorCompletion));
  });
});

describe('describeLogEffect — the pure delta of one log (§4.2 C1)', () => {
  it('reports the floor crossing and the XP it earned', () => {
    const before = [activity(d(0), 6)];
    const after = [...before, activity(d(1), 5)];
    const effect = describeLogEffect(before, after, COUNT, []);
    expect(effect.floorCrossedToday).toBe(true);
    expect(effect.pushedToOver).toBe(false);
    expect(effect.showedUp).toBe(false);
    expect(effect.xpGained).toBe(TUNING.xpPerFloorCompletion);
  });

  it('reports pushedToOver when the log clears the target', () => {
    const before = [activity(d(1), 5)];
    const after = [...before, activity(d(1), 3, '21:00:00')];
    const effect = describeLogEffect(before, after, COUNT, []);
    expect(effect.pushedToOver).toBe(true);
    expect(effect.floorCrossedToday).toBe(false);
    expect(effect.xpGained).toBe(TUNING.xpBonusTargetExceed + 3 * TUNING.xpPerAboveFloorUnit);
  });

  it('reports showedUp — and no XP — for a partial log (C3)', () => {
    const effect = describeLogEffect([], [activity(d(1), 3)], COUNT, []);
    expect(effect.showedUp).toBe(true);
    expect(effect.floorCrossedToday).toBe(false);
    expect(effect.xpGained).toBe(0);
  });

  it('reports the streak milestone the log reached', () => {
    const before = doneRun(4, 1);
    const after = [...before, activity(d(4), 1)];
    const effect = describeLogEffect(before, after, BINARY, []);
    expect(effect.streakMilestoneHit).toBe(5);
    expect(effect.xpGained).toBe(TUNING.xpPerFloorCompletion + TUNING.binaryStreakMilestones[5]);
  });

  it('reports a decayed re-achievement of the same milestone', () => {
    const before = [...doneRun(5, 1), skip(d(5), 'cue'), ...doneRun(4, 1, 6)];
    const after = [...before, activity(d(10), 1)];
    const effect = describeLogEffect(before, after, BINARY, []);
    expect(effect.streakMilestoneHit).toBe(5);
    expect(effect.xpGained).toBe(
      TUNING.xpPerFloorCompletion +
        Math.round(TUNING.binaryStreakMilestones[5] * TUNING.binaryMilestoneDecay),
    );
  });

  it('leaves streakMilestoneHit unset when no milestone was reached', () => {
    const before = doneRun(2, 1);
    const after = [...before, activity(d(2), 1)];
    expect(describeLogEffect(before, after, BINARY, []).streakMilestoneHit).toBeUndefined();
  });

  it('reports a stat level-up for a lone habit that crosses a threshold', () => {
    const before = doneRun(5, 1);
    const after = [...before, activity(d(5), 1)];
    expect(levelForXP(computeXP(before, BINARY))).toBe(0);
    expect(levelForXP(computeXP(after, BINARY))).toBe(1);
    expect(describeLogEffect(before, after, BINARY, []).statLevelUp).toBe(true);
  });

  it('reports no level-up when the threshold stays out of reach', () => {
    const before = doneRun(2, 1);
    const after = [...before, activity(d(2), 1)];
    expect(describeLogEffect(before, after, BINARY, []).statLevelUp).toBe(false);
  });

  it('crosses the stat threshold only via siblings — two habits on one stat', () => {
    const before = doneRun(2, 1); // this habit: 120 XP
    const after = [...before, activity(d(2), 1)]; // this habit: 180 XP
    const siblings = [{ habit: SIBLING, entries: doneRun(4, 1) }]; // 240 XP
    const [, levelOne] = TUNING.statLevelThresholds;

    // Neither habit reaches level 1 on its own…
    expect(levelForXP(computeXP(after, BINARY))).toBe(0);
    expect(levelForXP(computeXP(siblings[0].entries, SIBLING))).toBe(0);
    // …but summed over the stat, this one log tips it over.
    expect(computeStatXP('strength', [{ habit: BINARY, entries: before }, ...siblings])).toBe(
      levelOne - TUNING.xpPerFloorCompletion,
    );
    expect(computeStatXP('strength', [{ habit: BINARY, entries: after }, ...siblings])).toBe(
      levelOne,
    );

    expect(describeLogEffect(before, after, BINARY, siblings).statLevelUp).toBe(true);
    // the same log, without the sibling context, reports nothing
    expect(describeLogEffect(before, after, BINARY, []).statLevelUp).toBe(false);
  });

  it('reports savedAtRiskDay when the log closes an open save window (§4.3)', () => {
    // day 3 holds no rows and is past — a miss; day 4 is the log's own day, still pending
    const before = doneRun(3, 6);
    const after = [...before, activity(d(4), 5)];
    const effect = describeLogEffect(before, after, COUNT, []);
    expect(effect.savedAtRiskDay).toBe(true);
    expect(effect.floorCrossedToday).toBe(true);
  });

  it('reports the save exactly once — a later row on the saved day does not repeat it', () => {
    const saved = [...doneRun(3, 6), activity(d(4), 5)];
    const again = [...saved, activity(d(4), 2, '21:00:00')];
    expect(describeLogEffect(saved, again, COUNT, []).savedAtRiskDay).toBe(false);
  });

  it('reports the count habit’s longevity milestone the first time the run reaches it', () => {
    const before = doneRun(6, 5);
    const after = [...before, activity(d(6), 5)];
    const effect = describeLogEffect(before, after, COUNT, []);
    expect(effect.streakMilestoneHit).toBe(7);
    expect(effect.xpGained).toBe(TUNING.xpPerFloorCompletion + TUNING.xpStreakBonus[7]);
  });

  it('announces a count milestone only when it is paid — the longevity bonus is once-only', () => {
    const before = [...doneRun(7, 5), skip(d(7), 'cue'), ...doneRun(6, 5, 8)];
    const after = [...before, activity(d(14), 5)];
    const effect = describeLogEffect(before, after, COUNT, []);
    expect(effect.streakMilestoneHit).toBeUndefined();
    expect(effect.xpGained).toBe(TUNING.xpPerFloorCompletion);
  });

  it('reports no savedAtRiskDay when the previous day was not a miss', () => {
    const before = doneRun(2, 6);
    const after = [...before, activity(d(2), 6)];
    expect(describeLogEffect(before, after, COUNT, []).savedAtRiskDay).toBe(false);
  });

  it('is a zero effect when the log added nothing', () => {
    const entries = doneRun(3, 1);
    expect(describeLogEffect(entries, entries, BINARY, [])).toEqual({
      xpGained: 0,
      floorCrossedToday: false,
      pushedToOver: false,
      statLevelUp: false,
      showedUp: false,
      savedAtRiskDay: false,
    });
  });
});

describe('§7.3 invariants that land in scoring', () => {
  it('leaves XP unchanged across ten straight partial days', () => {
    const partials = Array.from({ length: 10 }, (_, i) => activity(d(i), 3));
    expect(computeXP(partials, COUNT)).toBe(computeXP([], COUNT));
  });

  it('never lowers the XP of days that already hold rows when a pause is added (ADR-0003)', () => {
    const entries = [...doneRun(3, 6), activity(d(6), 6)];
    const paused: Habit = { ...COUNT, pauses: [{ from: d(3), to: d(6) }] };
    expect(computeXP(entries, paused)).toBe(computeXP(entries, COUNT));
  });

  it('keeps a logged in-pause day earning its XP (pause suppresses only the empty-day default)', () => {
    const paused: Habit = { ...COUNT, pauses: [{ from: d(3), to: d(17) }] };
    expect(computeXP([activity(d(9), 6)], paused)).toBe(
      TUNING.xpPerFloorCompletion + TUNING.xpPerAboveFloorUnit,
    );
  });

  it('scores no XP for a habit with no entries', () => {
    expect(computeXP([], COUNT)).toBe(0);
    expect(computeXP([], BINARY)).toBe(0);
    expect(milestoneBonusXP([], BINARY)).toBe(0);
  });
});
