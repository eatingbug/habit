import type { Habit, HabitEntry, SkipReason } from '@/models';

import { TUNING } from '@/config/tuning';

import { addDays } from './dates';
import { aggregateStatusCount, deriveStatusLight, weeklyActualTotals } from './statusLight';

/**
 * SPEC §4.6 + §7.1 `statusLight.test.ts` row + the §7.3 scenarios and invariants that
 * land here (decline floor-guard, scoped fairness, pause never costs).
 *
 * `TODAY` is a **Sunday**, so the ISO week containing it is complete and the decline
 * check (which only ever reads completed weeks — §4.6) evaluates it. Mondays of the
 * trailing weeks: 03-23 (this week), 03-16, 03-09, 03-02.
 */
const TODAY = '2026-03-29'; // Sunday
const MID_WEEK = '2026-03-25'; // Wednesday of the same ISO week

/** floor 5 / target 8, both design fields filled so Rule 4 stays silent. */
const COUNT: Habit = {
  id: 'h1',
  name: '팔굽혀펴기',
  statId: 'strength',
  kind: 'count',
  floor: 5,
  floorUnit: 'reps',
  target: 8,
  cue: '아침 커피 후',
  identity: '몸을 돌보는 사람',
  lifecycle: 'forming',
  createdAt: '2026-01-01T00:00:00.000Z',
};

let seq = 0;
function activity(date: string, actual: number, time = '09:00:00'): HabitEntry {
  return { id: `a${++seq}`, habitId: 'h1', date, timestamp: `${date}T${time}.000Z`, actual };
}
function skip(date: string, skipReason: SkipReason): HabitEntry {
  return {
    id: `s${++seq}`,
    habitId: 'h1',
    date,
    timestamp: `${date}T09:00:00.000Z`,
    actual: 0,
    skipReason,
  };
}

/** `n` consecutive dates ending at `end` (inclusive), ascending. */
function daysEndingAt(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, -(n - 1 - i)));
}

function born(date: string): string {
  return `${date}T00:00:00.000Z`;
}

describe('weeklyActualTotals — day-summed actual per ISO week, most-recent last (§4.6 C4)', () => {
  const habit: Habit = { ...COUNT, createdAt: born('2026-03-01') };

  it('returns one total per requested week, oldest first, summing a day’s rows', () => {
    const entries = [
      activity('2026-03-17', 2), // week of 03-16
      activity('2026-03-17', 3, '20:00:00'), // same day → summed
      activity('2026-03-24', 9), // week of 03-23 (this week)
    ];
    expect(weeklyActualTotals(entries, habit, TODAY, 3)).toEqual([0, 5, 9]);
  });

  it('is fixed length — fully unrecorded weeks read 0, not a gap', () => {
    expect(weeklyActualTotals([], habit, TODAY, 4)).toEqual([0, 0, 0, 0]);
    expect(weeklyActualTotals([], habit, TODAY, 1)).toEqual([0]);
  });

  it('counts sub-floor days too — it is actual amount, not achievement', () => {
    expect(weeklyActualTotals([activity('2026-03-24', 2)], habit, TODAY, 1)).toEqual([2]);
  });

  it('the last element is the week containing asOfDate, even mid-week', () => {
    // Wednesday 03-25 belongs to the same ISO week as Sunday 03-29.
    expect(weeklyActualTotals([activity('2026-03-24', 7)], habit, MID_WEEK, 1)).toEqual([7]);
  });
});

describe('Forming 🔴 — consecutive misses (§4.6 / §4.3 C1)', () => {
  const dates = daysEndingAt(TODAY, 10);
  const habit: Habit = { ...COUNT, lifecycle: 'forming', createdAt: born(dates[0]) };
  /** Floor-met until `missDays` days before today; the rest of the past is unrecorded. */
  function doneUntil(missDays: number): HabitEntry[] {
    return dates.slice(0, dates.length - missDays - 1).map((d) => activity(d, 6));
  }

  it('turns 🔴 exactly at TUNING.statusLight.interventionConsecMiss unrecorded days', () => {
    expect(deriveStatusLight(habit, doneUntil(TUNING.statusLight.interventionConsecMiss), TODAY)).toBe(
      'intervention',
    );
  });

  it('does not turn 🔴 one miss below the threshold', () => {
    expect(
      deriveStatusLight(habit, doneUntil(TUNING.statusLight.interventionConsecMiss - 1), TODAY),
    ).not.toBe('intervention');
  });

  it('counts a non-exception skip as a miss and an exception skip as transparent', () => {
    const yesterday = addDays(TODAY, -1);
    const dayBefore = addDays(TODAY, -2);
    const withReason = [...doneUntil(2), skip(dayBefore, 'cue'), skip(yesterday, 'cue')];
    expect(deriveStatusLight(habit, withReason, TODAY)).toBe('intervention');

    const excused = [
      ...dates.slice(0, dates.length - 3).map((d) => activity(d, 6)),
      skip(dayBefore, 'exception'),
      skip(yesterday, 'exception'),
    ];
    expect(deriveStatusLight(habit, excused, TODAY)).not.toBe('intervention');
  });
});

describe('Established 🔴 — declining weekly actual with the floor-guard (§4.6 C5, §7.3)', () => {
  const habit: Habit = { ...COUNT, lifecycle: 'established', createdAt: born('2026-02-01') };
  /** One activity row per ISO week, oldest first, ending in the week of `TODAY`. */
  function weeklyTotals(totals: number[]): HabitEntry[] {
    return totals.map((total, i) =>
      activity(addDays('2026-03-25', -7 * (totals.length - 1 - i)), total),
    );
  }

  it('fires when the trend declines and the latest week is at/below target (9,8,7,6 · target 8)', () => {
    expect(deriveStatusLight(habit, weeklyTotals([9, 8, 7, 6]), TODAY)).toBe('intervention');
  });

  it('does NOT fire on a decline that stays above target — 12,11,10,9 · target 8 (C5)', () => {
    expect(deriveStatusLight(habit, weeklyTotals([12, 11, 10, 9]), TODAY)).not.toBe('intervention');
  });

  it('does not fire on a flat trend at/below target — the decline must be strict', () => {
    expect(deriveStatusLight(habit, weeklyTotals([6, 6, 6]), TODAY)).not.toBe('intervention');
  });

  it('does not fire on a non-monotone dip', () => {
    expect(deriveStatusLight(habit, weeklyTotals([9, 6, 8, 6]), TODAY)).not.toBe('intervention');
  });

  it('reads completed weeks only — a half-logged current week is no decline', () => {
    // Weekly totals 20, 18, 16 then a Wednesday-so-far 6: evaluating the in-progress
    // week would reproach a habit doing 16+/week, which §10 / C5 forbid.
    const entries = [
      ...[20, 18, 16].map((total, i) => activity(addDays('2026-03-18', -7 * (2 - i)), total)),
      activity('2026-03-23', 6),
    ];
    expect(deriveStatusLight(habit, entries, MID_WEEK)).not.toBe('intervention');
  });

  it('does not fire for a Forming habit on the same declining volumes', () => {
    const forming: Habit = { ...habit, lifecycle: 'forming' };
    // Every day floor-met (so the Forming miss rule is silent) with weekly volume
    // falling 63 → 56 → 49 → 42: an Established habit's 🔴 arm is not Forming's.
    const entries = [9, 8, 7, 6].flatMap((amount, i) =>
      daysEndingAt(addDays(TODAY, -7 * (3 - i)), 7).map((d) => activity(d, amount)),
    );
    expect(deriveStatusLight(forming, entries, TODAY)).not.toBe('intervention');
  });
});

describe('🟡 caution — flag-driven (§4.6, §7.4)', () => {
  const window = TUNING.windows.floorRate;
  const dates = daysEndingAt(TODAY, window);
  const habit: Habit = { ...COUNT, lifecycle: 'forming', createdAt: born(dates[0]) };

  it('turns 🟡 at TUNING.statusLight.cautionMinFlags flags', () => {
    // The last 10 days: 6 sub-floor, 4 floor-met (above the floor, so Rule 3 stays
    // quiet), today floor-met so there is no miss run. Rate 4/10 = 40% → Rule 1.
    const recent = dates.slice(window - 10);
    const entries = [
      ...recent.slice(0, 6).map((d) => activity(d, 2)),
      ...recent.slice(6).map((d) => activity(d, 6)),
    ];
    expect(TUNING.statusLight.cautionMinFlags).toBe(1);
    expect(deriveStatusLight(habit, entries, TODAY)).toBe('caution');
  });

  it('raises no caution when the same shape clears the Rule 1 threshold', () => {
    const recent = dates.slice(window - 10);
    const entries = [
      ...recent.slice(0, 2).map((d) => activity(d, 2)),
      ...recent.slice(2).map((d) => activity(d, 6)),
    ];
    // 8/10 = 80% → no flag. The light lands on ⭐ rather than `stable` because those
    // eight days are also this Forming habit's longest floor-streak yet (C6).
    expect(deriveStatusLight(habit, entries, TODAY)).not.toBe('caution');
  });
});

describe('⭐ personal_best is lifecycle-aware (§4.6 C6)', () => {
  it('Established: this week’s total actual beating every prior week is an intensity best', () => {
    const habit: Habit = { ...COUNT, lifecycle: 'established', createdAt: born('2026-03-16') };
    const entries = [
      activity('2026-03-17', 5),
      activity('2026-03-24', 6),
      activity('2026-03-26', 6),
    ];
    expect(weeklyActualTotals(entries, habit, TODAY, 2)).toEqual([5, 12]);
    expect(deriveStatusLight(habit, entries, TODAY)).toBe('personal_best');
  });

  it('Established: a week that does not beat every prior week is not a best', () => {
    const habit: Habit = { ...COUNT, lifecycle: 'established', createdAt: born('2026-03-16') };
    const entries = [activity('2026-03-17', 9), activity('2026-03-24', 6)];
    expect(deriveStatusLight(habit, entries, TODAY)).toBe('stable');
  });

  it('Forming: a new longest floor-streak is a consistency best', () => {
    // 7 floor-met days, one unrecorded day that breaks the run, then a 20-day run.
    const habit: Habit = { ...COUNT, lifecycle: 'forming', createdAt: born('2026-03-02') };
    const entries = [
      ...daysEndingAt('2026-03-08', 7).map((d) => activity(d, 6)),
      ...daysEndingAt(TODAY, 20).map((d) => activity(d, 6)),
    ];
    expect(deriveStatusLight(habit, entries, TODAY)).toBe('personal_best');
  });

  it('Forming: no new longest streak and no best floor week → stable', () => {
    // Prior run of 8 (03-16..03-23), a miss on 03-24, current run of 5.
    const habit: Habit = { ...COUNT, lifecycle: 'forming', createdAt: born('2026-03-16') };
    const entries = [
      ...daysEndingAt('2026-03-23', 8).map((d) => activity(d, 6)),
      ...daysEndingAt(TODAY, 5).map((d) => activity(d, 6)),
    ];
    expect(deriveStatusLight(habit, entries, TODAY)).toBe('stable');
  });

  it('the same history reads ⭐ in Forming and not in Established — the C6 asymmetry', () => {
    // A new longest streak (20 > 7) whose weekly *volume* is below an earlier week.
    const forming: Habit = { ...COUNT, lifecycle: 'forming', createdAt: born('2026-03-02') };
    const entries = [
      ...daysEndingAt('2026-03-08', 7).map((d) => activity(d, 10)),
      ...daysEndingAt(TODAY, 20).map((d) => activity(d, 6)),
    ];
    expect(deriveStatusLight(forming, entries, TODAY)).toBe('personal_best');
    expect(deriveStatusLight({ ...forming, lifecycle: 'established' }, entries, TODAY)).toBe(
      'stable',
    );
  });

  it('never reports a best on an empty history', () => {
    const fresh: Habit = { ...COUNT, lifecycle: 'forming', createdAt: born(TODAY) };
    expect(deriveStatusLight(fresh, [], TODAY)).toBe('stable');
    expect(deriveStatusLight({ ...fresh, lifecycle: 'established' }, [], TODAY)).toBe('stable');
  });
});

describe('paused / archived habits never demand intervention (issue #20 AC, ADR-0003)', () => {
  const dates = daysEndingAt(TODAY, 30);
  const entries = dates.slice(0, 5).map((d) => activity(d, 6));

  it('a paused habit with a long unrecorded stretch is stable, not 🔴', () => {
    const paused: Habit = {
      ...COUNT,
      lifecycle: 'paused',
      createdAt: born(dates[0]),
      pauses: [{ from: dates[5] }],
    };
    expect(deriveStatusLight(paused, entries, TODAY)).toBe('stable');
  });

  it('an archived habit is stable, not 🔴', () => {
    const archived: Habit = {
      ...COUNT,
      lifecycle: 'archived',
      createdAt: born(dates[0]),
      pauses: [{ from: dates[5] }],
    };
    expect(deriveStatusLight(archived, entries, TODAY)).toBe('stable');
  });
});

describe('pause never costs (§7.3 invariant, ADR-0003)', () => {
  const dates = daysEndingAt(TODAY, 21);

  it('a resumed habit’s empty pause days raise no 🔴 and no decline', () => {
    const habit: Habit = { ...COUNT, lifecycle: 'established', createdAt: born(dates[0]) };
    const entries = [...dates.slice(0, 5).map((d) => activity(d, 6)), activity(TODAY, 6)];
    const paused: Habit = { ...habit, pauses: [{ from: dates[5], to: TODAY }] };
    expect(deriveStatusLight(paused, entries, TODAY)).not.toBe('intervention');
    // Weekly totals go 30, 0, 6 — zeros must not read as a strict decline.
    expect(weeklyActualTotals(entries, paused, TODAY, 3)).toEqual([30, 0, 6]);
  });

  it('adding a pause interval never turns a light 🔴 for days that already hold rows', () => {
    const habit: Habit = { ...COUNT, lifecycle: 'forming', createdAt: born(dates[0]) };
    const entries = dates.slice(0, 7).map((d) => activity(d, 6));
    expect(deriveStatusLight(habit, entries, TODAY)).toBe('intervention'); // unrecorded days → 🔴
    expect(
      deriveStatusLight({ ...habit, pauses: [{ from: dates[7] }] }, entries, TODAY),
    ).not.toBe('intervention'); // the pause leaves them unclassified
  });
});

describe('scoped fairness — missed → partial never worsens a 🔴 (§7.3)', () => {
  const dates = daysEndingAt(TODAY, 14);
  const habit: Habit = { ...COUNT, lifecycle: 'forming', createdAt: born(dates[0]) };
  // Two floor-met days, seven unrecorded days, then five floor-met days ending today —
  // so the baseline holds no 🔴 and every unrecorded day is a real flip candidate.
  const base = [
    ...dates.slice(0, 2).map((d) => activity(d, 6)),
    ...dates.slice(9).map((d) => activity(d, 6)),
  ];
  const unrecorded = dates.slice(2, 9);

  it('the baseline holds no 🔴, so the flips below are meaningful', () => {
    expect(deriveStatusLight(habit, base, TODAY)).not.toBe('intervention');
    expect(unrecorded).toHaveLength(7);
  });

  it('flipping any single unrecorded day to partial never introduces a Forming 🔴', () => {
    for (const date of unrecorded) {
      // Backfill is pure repair: a 🔴 may disappear, never appear.
      expect(deriveStatusLight(habit, [...base, activity(date, 2)], TODAY)).not.toBe(
        'intervention',
      );
    }
  });

  it('flipping any single unrecorded day to floor-met never introduces a Forming 🔴', () => {
    for (const date of unrecorded) {
      expect(deriveStatusLight(habit, [...base, activity(date, 6)], TODAY)).not.toBe(
        'intervention',
      );
    }
  });

  it('a 🔴 baseline is repaired by a backfill, never deepened', () => {
    const red = dates.slice(0, 6).map((d) => activity(d, 6));
    expect(deriveStatusLight(habit, red, TODAY)).toBe('intervention');
    const repaired = [...red, activity(dates[12], 6), activity(dates[11], 6)];
    expect(deriveStatusLight(habit, repaired, TODAY)).not.toBe('intervention');
  });

  it('lets a backfill reveal an Established decline the missing data was hiding', () => {
    // The one place where §7.3's "a backfill never worsens any outcome" and §4.6's
    // Established decline light genuinely pull apart — and it resolves in favour of
    // this behaviour rather than against it.
    //
    // No implementation can satisfy both literally: "you are declining" is inherently
    // a *comparison against your own past*, so improving the past necessarily makes
    // the present compare worse. That is not an artefact of a strict-monotone test —
    // any first-vs-last or max-vs-latest formulation inverts the same way.
    //
    // The scoped fairness rule (§3.2) names what it protects: XP, streak and
    // miss-count, plus the surfaces where a lower rate *costs* the user status
    // (the Established→Forming demotion). A 🔴 is not one of those — §7.3 says of the
    // caution light that it is "an opportunity, not harm", and the 🔴's only effect is
    // to open Reflection, which is the product's help mechanism.
    //
    // And here the flag is simply true: weekly totals read 7, 8, 6 while the user was
    // actually at 9, 8, 6 against a target of 8. The unrecorded units were concealing
    // a real fall from 9 to 6. Backfill corrected the record and the diagnosis
    // followed the corrected record — which is the whole point of ADR-0001.
    const established: Habit = { ...COUNT, lifecycle: 'established', createdAt: born('2026-02-01') };
    const weeks = [9, 7, 8, 6].map((total, i) =>
      activity(addDays('2026-03-25', -7 * (3 - i)), total),
    );
    // Evaluated weeks (the last three completed) read 7, 8, 6 — not monotone.
    expect(weeklyActualTotals(weeks, established, TODAY, 3)).toEqual([7, 8, 6]);
    expect(deriveStatusLight(established, weeks, TODAY)).not.toBe('intervention');

    // Backfilling two sub-floor units into the *dipped* week (7 → 9) makes it decline.
    const backfilled = [...weeks, activity('2026-03-13', 2)];
    expect(weeklyActualTotals(backfilled, established, TODAY, 3)).toEqual([9, 8, 6]);
    expect(deriveStatusLight(established, backfilled, TODAY)).toBe('intervention');
  });
});

describe('aggregateStatusCount — the Dashboard “shaky habits · N” aggregate (CONCEPT §7.3)', () => {
  const dates = daysEndingAt(TODAY, TUNING.windows.floorRate);
  const createdAt = born(dates[0]);

  /** 🔴: a Forming habit sitting on the consecutive-miss threshold. */
  const red: Habit = { ...COUNT, id: 'red', lifecycle: 'forming', createdAt };
  const redEntries = dates
    .slice(0, dates.length - TUNING.statusLight.interventionConsecMiss - 1)
    .map((d) => activity(d, 6));

  /** 🟡: one Rule 1 flag, no miss run. */
  const amber: Habit = { ...COUNT, id: 'amber', lifecycle: 'forming', createdAt };
  const recent = dates.slice(dates.length - 10);
  const amberEntries = [
    ...recent.slice(0, 6).map((d) => activity(d, 2)),
    ...recent.slice(6).map((d) => activity(d, 6)),
  ];

  /** healthy: floor-met every day, above the floor. */
  const green: Habit = { ...COUNT, id: 'green', lifecycle: 'established', createdAt };
  const greenEntries = dates.map((d) => activity(d, 6));

  const paused: Habit = {
    ...COUNT,
    id: 'paused',
    lifecycle: 'paused',
    createdAt,
    pauses: [{ from: dates[3] }],
  };

  it('counts each light once and ignores paused habits', () => {
    expect(
      aggregateStatusCount(
        [red, amber, green, paused],
        {
          red: redEntries,
          amber: amberEntries,
          green: greenEntries,
          paused: dates.slice(0, 3).map((d) => activity(d, 6)),
        },
        TODAY,
      ),
    ).toEqual({ caution: 1, intervention: 1 });
  });

  it('is all zeroes for an empty dashboard', () => {
    expect(aggregateStatusCount([], {}, TODAY)).toEqual({ caution: 0, intervention: 0 });
  });

  it('treats a habit with no entries at all as absent, not as an error', () => {
    const fresh: Habit = { ...COUNT, id: 'fresh', lifecycle: 'forming', createdAt: born(TODAY) };
    expect(aggregateStatusCount([fresh], {}, TODAY)).toEqual({ caution: 0, intervention: 0 });
  });
});
