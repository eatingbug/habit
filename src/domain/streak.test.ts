import { TUNING } from '@/config/tuning';
import type { Habit, HabitEntry, SkipReason } from '@/models';

import { addDays } from './dates';
import {
  atRiskToday,
  computeStreak,
  consecutiveMissCount,
  engagementStreak,
  needsNeverMissTwiceIntervention,
  showedUpDays,
} from './streak';

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
function doneRun(n: number, start = 0): HabitEntry[] {
  return Array.from({ length: n }, (_, i) => activity(d(start + i), 6));
}

describe('computeStreak — consecutive floor-met days back from today (§4.2)', () => {
  it('counts a run that ends today', () => {
    expect(computeStreak(doneRun(3), COUNT, d(2))).toBe(3);
  });

  it('is 0 for a habit with no entries', () => {
    expect(computeStreak([], COUNT, d(3))).toBe(0);
  });

  it('keeps a pending today transparent', () => {
    expect(computeStreak(doneRun(3), COUNT, d(3))).toBe(3);
  });

  it('keeps a partial day transparent — it neither extends nor breaks', () => {
    const entries = [activity(d(0), 6), activity(d(1), 3), activity(d(2), 6)];
    expect(computeStreak(entries, COUNT, d(2))).toBe(2);
  });

  it('keeps a partial today transparent', () => {
    const entries = [...doneRun(2), activity(d(2), 3)];
    expect(computeStreak(entries, COUNT, d(2))).toBe(2);
  });

  it('breaks on a missed day and re-joins both runs when it is backfilled', () => {
    const broken = [activity(d(0), 6), activity(d(2), 6)];
    expect(computeStreak(broken, COUNT, d(2))).toBe(1);
    const backfilled = [...broken, activity(d(1), 6)];
    expect(computeStreak(backfilled, COUNT, d(2))).toBe(3);
  });

  it('keeps an exception skip transparent but breaks on any other skip reason', () => {
    const excepted = [activity(d(0), 6), skip(d(1), 'exception'), activity(d(2), 6)];
    expect(computeStreak(excepted, COUNT, d(2))).toBe(2);
    const reasoned = [activity(d(0), 6), skip(d(1), 'cue'), activity(d(2), 6)];
    expect(computeStreak(reasoned, COUNT, d(2))).toBe(1);
  });

  it('is invariant under any permutation of the rows (§7.3)', () => {
    const entries = [
      activity(d(0), 6),
      activity(d(1), 2),
      activity(d(1), 4, '21:00:00'),
      activity(d(2), 9),
    ];
    expect(computeStreak([...entries].reverse(), COUNT, d(2))).toBe(
      computeStreak(entries, COUNT, d(2)),
    );
  });
});

describe('out-of-scope days are transparent (ADR-0003)', () => {
  const paused: Habit = { ...COUNT, pauses: [{ from: d(3), to: d(7) }] };

  it('lets an empty in-pause day neither extend nor break the streak', () => {
    // today sits inside the pause and holds no rows
    expect(computeStreak(doneRun(3), paused, d(5))).toBe(3);
    // without the pause the same empty days are misses and the run is gone
    expect(computeStreak(doneRun(3), COUNT, d(5))).toBe(0);
  });

  it('re-joins the pre-pause run when the habit resumes', () => {
    const entries = [...doneRun(3), ...doneRun(2, 7)];
    expect(computeStreak(entries, paused, d(8))).toBe(5);
  });

  it('still classifies an in-pause day that holds rows', () => {
    const entries = [...doneRun(3), activity(d(4), 6), ...doneRun(2, 7)];
    expect(computeStreak(entries, paused, d(8))).toBe(6);
  });

  it('never lowers a streak when a pause interval is added (§7.3 pause never costs)', () => {
    const entries = [...doneRun(3), ...doneRun(2, 7)];
    expect(computeStreak(entries, paused, d(8))).toBeGreaterThanOrEqual(
      computeStreak(entries, COUNT, d(8)),
    );
  });

  it('ignores dates before createdAt', () => {
    const entries = [activity(addDays(START, -1), 6), ...doneRun(2)];
    expect(computeStreak(entries, COUNT, d(1))).toBe(2);
  });

  it('accrues no consecutiveMissCount and never fires atRiskToday while paused', () => {
    const openPause: Habit = { ...COUNT, pauses: [{ from: d(1) }] };
    const entries = [activity(d(0), 6)];
    expect(consecutiveMissCount(entries, openPause, d(10))).toBe(0);
    expect(needsNeverMissTwiceIntervention(entries, openPause, d(10))).toBe(false);
    expect(atRiskToday(entries, openPause, d(10))).toBe(false);
  });

  it('never fires atRiskToday even when an in-pause day holds a reasoned skip', () => {
    const openPause: Habit = { ...COUNT, pauses: [{ from: d(1) }] };
    const entries = [activity(d(0), 6), skip(d(2), 'cue')];
    expect(atRiskToday(entries, openPause, d(3))).toBe(false);
  });
});

describe('consecutiveMissCount and the never-miss-twice intervention (§4.3)', () => {
  it('is 0 when the resolved days back from asOfDate are floor-met', () => {
    expect(consecutiveMissCount(doneRun(3), COUNT, d(2))).toBe(0);
    // an empty asOfDate is pending — still unresolved, still transparent
    expect(consecutiveMissCount(doneRun(3), COUNT, d(3))).toBe(0);
  });

  it('counts one unrecorded past day', () => {
    expect(consecutiveMissCount(doneRun(3), COUNT, d(4))).toBe(1);
    expect(needsNeverMissTwiceIntervention(doneRun(3), COUNT, d(4))).toBe(false);
  });

  it('counts two and fires the intervention at the threshold', () => {
    expect(consecutiveMissCount(doneRun(3), COUNT, d(5))).toBe(
      TUNING.statusLight.interventionConsecMiss,
    );
    expect(needsNeverMissTwiceIntervention(doneRun(3), COUNT, d(5))).toBe(true);
  });

  it('counts reasoned skips as misses', () => {
    const entries = [activity(d(0), 6), skip(d(1), 'cue'), skip(d(2), 'floor')];
    expect(consecutiveMissCount(entries, COUNT, d(2))).toBe(2);
  });

  it('does not count an exception skip', () => {
    const entries = [activity(d(0), 6), skip(d(1), 'exception'), skip(d(2), 'exception')];
    expect(consecutiveMissCount(entries, COUNT, d(2))).toBe(0);
  });

  it('never increments on a partial day (§7.3 invariant)', () => {
    const entries = [activity(d(0), 6), activity(d(1), 3), skip(d(2), 'cue')];
    expect(consecutiveMissCount(entries, COUNT, d(2))).toBe(1);
  });

  it('drops when an unrecorded day is backfilled — backfill is pure recovery', () => {
    const before = doneRun(3);
    expect(consecutiveMissCount(before, COUNT, d(5))).toBe(2);
    // a floor-met backfill stops the walk outright
    expect(consecutiveMissCount([...before, activity(d(4), 6)], COUNT, d(5))).toBe(0);
    // a partial backfill is transparent: it stops incrementing, so the count still
    // falls, but the earlier unrecorded day beyond it keeps its own miss
    expect(consecutiveMissCount([...before, activity(d(4), 3)], COUNT, d(5))).toBe(1);
  });
});

describe('atRiskToday — the open save window (§4.3 C2)', () => {
  it('is true when yesterday is an unrecorded day and today is pending', () => {
    expect(atRiskToday(doneRun(2), COUNT, d(3))).toBe(true);
  });

  it('is true when today is only partial', () => {
    const entries = [...doneRun(2), activity(d(3), 3)];
    expect(atRiskToday(entries, COUNT, d(3))).toBe(true);
  });

  it('is false once today is floor-met', () => {
    const entries = [...doneRun(2), activity(d(3), 6)];
    expect(atRiskToday(entries, COUNT, d(3))).toBe(false);
  });

  it('is false when yesterday was floor-met', () => {
    expect(atRiskToday(doneRun(3), COUNT, d(3))).toBe(false);
  });

  it('is true for a reasoned skip yesterday and false for an exception skip', () => {
    const reasoned = [activity(d(0), 6), skip(d(2), 'cue')];
    expect(atRiskToday(reasoned, COUNT, d(3))).toBe(true);
    const excepted = [activity(d(0), 6), skip(d(2), 'exception')];
    expect(atRiskToday(excepted, COUNT, d(3))).toBe(false);
  });

  it('is false when yesterday is a partial day — a partial is never a miss', () => {
    const entries = [activity(d(0), 6), activity(d(2), 3)];
    expect(atRiskToday(entries, COUNT, d(3))).toBe(false);
  });

  it('is false on the creation date, whose previous day is out of scope', () => {
    expect(atRiskToday([], COUNT, d(0))).toBe(false);
  });
});

describe('engagementStreak — showing up, not floor XP (§4.3 C3)', () => {
  it('counts done, over and partial days alike', () => {
    const entries = [activity(d(0), 3), activity(d(1), 6), activity(d(2), 9)];
    expect(engagementStreak(entries, COUNT, d(2))).toBe(3);
    expect(computeStreak(entries, COUNT, d(2))).toBe(2);
  });

  it('reaches 10 on ten straight partial days while the floor streak stays 0 (§7.3)', () => {
    const partials = Array.from({ length: 10 }, (_, i) => activity(d(i), 3));
    expect(engagementStreak(partials, COUNT, d(9))).toBe(10);
    expect(computeStreak(partials, COUNT, d(9))).toBe(0);
  });

  it('breaks on an unrecorded day and on a reasoned skip', () => {
    const missedGap = [activity(d(0), 3), activity(d(2), 3)];
    expect(engagementStreak(missedGap, COUNT, d(2))).toBe(1);
    const reasoned = [activity(d(0), 3), skip(d(1), 'cue'), activity(d(2), 3)];
    expect(engagementStreak(reasoned, COUNT, d(2))).toBe(1);
  });

  it('keeps a pending today and an exception skip transparent', () => {
    const entries = [activity(d(0), 3), skip(d(1), 'exception'), activity(d(2), 3)];
    expect(engagementStreak(entries, COUNT, d(3))).toBe(2);
  });

  it('is always at least the floor streak (§7.3 engagement ⊇ floor)', () => {
    const fixtures: HabitEntry[][] = [
      [],
      doneRun(4),
      [activity(d(0), 3), activity(d(1), 6), activity(d(2), 9)],
      [activity(d(0), 6), skip(d(1), 'exception'), activity(d(2), 3)],
      [activity(d(0), 6), skip(d(1), 'cue'), activity(d(2), 6)],
      Array.from({ length: 10 }, (_, i) => activity(d(i), 3)),
    ];
    for (const entries of fixtures) {
      for (const today of [d(2), d(5), d(9)]) {
        expect(engagementStreak(entries, COUNT, today)).toBeGreaterThanOrEqual(
          computeStreak(entries, COUNT, today),
        );
      }
    }
  });
});

describe('showedUpDays — cumulative engagement in a window (§4.3 C3)', () => {
  const entries = [
    activity(d(0), 6), // done
    activity(d(1), 3), // partial
    skip(d(3), 'cue'), // a miss, not engagement
    activity(d(4), 9), // over
  ];

  it('counts every engaged day in the window, consecutive or not', () => {
    expect(showedUpDays(entries, COUNT, d(6), 7)).toBe(3);
  });

  it('only counts days inside the window', () => {
    expect(showedUpDays(entries, COUNT, d(6), 3)).toBe(1);
    expect(showedUpDays(entries, COUNT, d(6), 2)).toBe(0);
  });

  it('does not reach back before createdAt', () => {
    const withEarlier = [...entries, activity(addDays(START, -2), 6)];
    expect(showedUpDays(withEarlier, COUNT, d(6), 30)).toBe(3);
  });

  it('is 0 for a habit with no entries', () => {
    expect(showedUpDays([], COUNT, d(6), 7)).toBe(0);
  });
});
