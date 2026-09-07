import type { DiagnosisFlag, Habit, HabitEntry, SkipReason } from '@/models';

import { TUNING } from '@/config/tuning';

import { diagnose, floorCompletionRate, successRate } from './diagnose';

/**
 * SPEC §4.4 + §7.1 `diagnose.test.ts` row + the §7.3 scenarios that land here.
 *
 * `AS_OF` is a Tuesday, so the 28-day cue-cluster window is 2026-03-04..2026-03-31
 * and the 14-day Rule 4 window is 2026-03-18..2026-03-31.
 */
const AS_OF = '2026-03-31';

/** Both design fields filled, so Rule 4 stays silent unless a test asks for it. */
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
  createdAt: '2025-12-01T00:00:00.000Z',
};

const BINARY: Habit = {
  ...COUNT,
  id: 'h2',
  name: '명상',
  kind: 'binary',
  floor: 1,
  floorUnit: 'time',
  target: undefined,
};

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

/** `n` consecutive dates ending at `end` (inclusive), ascending. */
function daysEndingAt(end: string, n: number): string[] {
  const ms = Date.parse(`${end}T00:00:00.000Z`);
  return Array.from({ length: n }, (_, i) =>
    new Date(ms - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

function componentsOf(flags: DiagnosisFlag[]): string[] {
  return flags.map((flag) => flag.component);
}
function ofComponent(flags: DiagnosisFlag[], component: string): DiagnosisFlag[] {
  return flags.filter((flag) => flag.component === component);
}

describe('successRate vs floorCompletionRate — deliberately different populations (§4.4)', () => {
  // 28 days all in scope: 10 done, 5 partial, 13 with no rows at all (`missed`).
  const window = TUNING.windows.floorRate;
  const dates = daysEndingAt(AS_OF, window);
  const habit: Habit = { ...COUNT, createdAt: `${dates[0]}T00:00:00.000Z` };
  // 13 unrecorded days first, then 10 floor-met, then 5 partial — the last day of the
  // window is `partial` rather than `pending`, so the denominator is the full 28.
  const entries = [
    ...dates.slice(13, 23).map((d) => activity(d, 6)),
    ...dates.slice(23, 28).map((d) => activity(d, 2)),
  ];

  it('successRate counts missed days in the denominator (the number the user sees)', () => {
    expect(successRate(entries, habit, AS_OF, window)).toBeCloseTo(10 / 28);
  });

  it('floorCompletionRate excludes missed days from both sides', () => {
    expect(floorCompletionRate(entries, habit, AS_OF, window)).toBeCloseTo(10 / 15);
  });

  it('floorCompletionRate({ excludePartial }) drops partial from both sides but keeps missed', () => {
    expect(floorCompletionRate(entries, habit, AS_OF, window, { excludePartial: true })).toBeCloseTo(
      10 / 23,
    );
  });

  it('both return null when there is not enough data', () => {
    const fresh: Habit = { ...COUNT, createdAt: `${AS_OF}T00:00:00.000Z` };
    expect(successRate([], fresh, AS_OF, window)).toBeNull();
    expect(floorCompletionRate([], fresh, AS_OF, window)).toBeNull();
  });

  it('floorCompletionRate is null when every day in the window is missed (no engaged days)', () => {
    expect(floorCompletionRate([], habit, AS_OF, window)).toBeNull();
    // …while the user-facing rate still reads 0% — a missed day is a miss (ADR-0001).
    expect(successRate([], habit, AS_OF, window)).toBe(0);
  });

  it('converting a day missed → partial never worsens the rates the costly consumers read (§7.3)', () => {
    const dates14 = daysEndingAt(AS_OF, 14);
    const scoped: Habit = { ...COUNT, createdAt: `${dates14[0]}T00:00:00.000Z` };
    const before = dates14.slice(0, 5).map((d) => activity(d, 6));
    const after = [...before, activity(dates14[5], 2)];

    // successRate: both states sit in the denominator, so it cannot move.
    expect(successRate(after, scoped, AS_OF, 28)).toBeCloseTo(
      successRate(before, scoped, AS_OF, 28)!,
    );
    // the demotion rate (§4.7) can only rise: the day leaves the denominator entirely.
    expect(floorCompletionRate(after, scoped, AS_OF, 28, { excludePartial: true })!).toBeGreaterThan(
      floorCompletionRate(before, scoped, AS_OF, 28, { excludePartial: true })!,
    );
  });
});

describe('Rule 1 — floor too high (§4.4)', () => {
  const week = daysEndingAt(AS_OF, 7);

  it('does not fire at exactly lowFloorRateThreshold (the rule reads strictly below)', () => {
    // 5 engaged days (meets the min-sample guard), 3 floor-met → 0.6.
    const entries = [
      ...week.slice(0, 3).map((d) => activity(d, 6)),
      ...week.slice(3, 5).map((d) => activity(d, 2)),
    ];
    expect(floorCompletionRate(entries, COUNT, AS_OF, 28)).toBe(
      TUNING.diagnosis.lowFloorRateThreshold,
    );
    expect(ofComponent(diagnose(COUNT, entries, AS_OF), 'floor')).toEqual([]);
  });

  it('fires just below the threshold, with the rate cited as evidence', () => {
    // 6 engaged days, 3 floor-met → 0.5 < 0.6.
    const entries = [
      ...week.slice(0, 3).map((d) => activity(d, 6)),
      ...week.slice(3, 6).map((d) => activity(d, 2)),
    ];
    const flags = ofComponent(diagnose(COUNT, entries, AS_OF), 'floor');
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe('warning');
    expect(flags[0].evidence).toContain('50%');
    expect(flags[0].evidence).toContain(String(TUNING.windows.floorRate));
  });
});

describe('min-sample guard — Rules 1 and 4 stay silent below minEngagedDaysForRate (§4.4, §7.3)', () => {
  it('one engaged day that is partial raises nothing at all', () => {
    // No cue and no identity, so Rule 4 would otherwise fire on a 0% rate.
    const bare: Habit = { ...COUNT, cue: undefined, identity: undefined };
    const entries = [activity('2026-03-30', 2)];

    expect(floorCompletionRate(entries, bare, AS_OF, 28)).toBeNull();
    expect(diagnose(bare, entries, AS_OF)).toEqual([]);
  });

  it('the same shape fires once the window holds minEngagedDaysForRate engaged days', () => {
    const bare: Habit = { ...COUNT, cue: undefined, identity: undefined };
    const week = daysEndingAt(AS_OF, 7);
    const entries = week
      .slice(0, TUNING.diagnosis.minEngagedDaysForRate)
      .map((d) => activity(d, 2));

    expect(floorCompletionRate(entries, bare, AS_OF, 28)).toBe(0);
    expect(componentsOf(diagnose(bare, entries, AS_OF))).toContain('floor');
    expect(componentsOf(diagnose(bare, entries, AS_OF))).toContain('cue');
  });
});

describe('Rule 2 — cue clustering, non-exception skip days only (§4.4)', () => {
  const TUESDAYS = ['2026-03-10', '2026-03-17', '2026-03-24'];

  it('fires when 2+ non-exception skip days all fall on one weekday', () => {
    // Three *different* reasons, so every Rule 5 count stays at 1 and Rule 2 is alone.
    const entries = [
      skip(TUESDAYS[0], 'cue'),
      skip(TUESDAYS[1], 'floor'),
      skip(TUESDAYS[2], 'identity'),
    ];
    const flags = diagnose(COUNT, entries, AS_OF);
    expect(flags).toHaveLength(1);
    expect(flags[0].component).toBe('cue');
    expect(flags[0].severity).toBe('warning');
    expect(flags[0].message).toContain('화요일');
    expect(flags[0].evidence).toContain('3');
  });

  it('still fires when an exception skip sits on another weekday (exception is not in the population)', () => {
    const entries = [
      skip(TUESDAYS[0], 'cue'),
      skip(TUESDAYS[1], 'floor'),
      skip(TUESDAYS[2], 'identity'),
      skip('2026-03-27', 'exception'),
    ];
    const flags = diagnose(COUNT, entries, AS_OF);
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain('화요일');
  });

  it('does not fire on a single skip day (below the 2+ cluster threshold)', () => {
    expect(diagnose(COUNT, [skip(TUESDAYS[0], 'cue')], AS_OF)).toEqual([]);
  });

  it('does not fire when two different weekdays both carry skips ("0 on others" fails)', () => {
    const entries = [
      skip(TUESDAYS[0], 'cue'),
      skip(TUESDAYS[1], 'cue'),
      skip('2026-03-27', 'floor'),
      skip('2026-03-20', 'floor'),
    ];
    const flags = diagnose(COUNT, entries, AS_OF);
    // Rule 5 still speaks (2 cue + 2 floor skips) — but no flag names a weekday.
    expect(componentsOf(flags).sort()).toEqual(['cue', 'floor']);
    for (const flag of flags) expect(flag.message).not.toMatch(/요일/);
  });

  it('raises no flag for a weekday cluster made purely of missed days (§7.3 invariant)', () => {
    // Three unrecorded Tuesdays and nothing else: no rows anywhere in the window.
    expect(diagnose(COUNT, [], AS_OF)).toEqual([]);
  });

  it('raises the cue warning once those same days are converted to skip rows (§7.3)', () => {
    const entries = TUESDAYS.map((d) => skip(d, 'cue'));
    expect(componentsOf(diagnose(COUNT, entries, AS_OF))).toContain('cue');
  });
});

describe('Rule 3 — stagnation, count habits only (§4.4)', () => {
  const weeks = TUNING.diagnosis.stagnationAboveFloorWeeks;
  /** Three floor-exact days in each of the last N weeks. */
  function floorExactWeeks(floor: number): HabitEntry[] {
    return daysEndingAt(AS_OF, weeks * 7)
      .filter((_, i) => i % 7 < 3)
      .map((d) => activity(d, floor));
  }

  it('fires when the floor is met every week but nothing goes above it', () => {
    const flags = diagnose(COUNT, floorExactWeeks(5), AS_OF);
    expect(flags).toHaveLength(1);
    expect(flags[0].component).toBe('load');
    expect(flags[0].severity).toBe('warning');
    expect(flags[0].evidence).toContain(String(weeks));
  });

  it('does not fire when a single day exceeded the floor without reaching over', () => {
    // sum 7 with floor 5 / target 8 still classifies `done` — the rule must read the
    // amount above the floor, not the day-state.
    const entries = [...floorExactWeeks(5), activity('2026-03-29', 7, '10:00:00')];
    expect(componentsOf(diagnose(COUNT, entries, AS_OF))).not.toContain('load');
  });

  it('is suppressed for binary habits', () => {
    const entries = daysEndingAt(AS_OF, weeks * 7)
      .filter((_, i) => i % 7 < 3)
      .map((d) => activity(d, 1));
    expect(diagnose(BINARY, entries, AS_OF)).toEqual([]);
  });

  it('stays silent on a barely-recorded habit (one floor-exact day per week)', () => {
    // Three floor-exact days across 21 days — 18 of them unrecorded. Attributing `load`
    // here would rest the flag entirely on `missed` days, which §7.3 forbids ("a
    // `missed` day never produces a diagnosis flag or a component attribution");
    // ADR-0002 sends this history to the bulk-backfill prompt instead. The per-week
    // engagement gate (`minEngagedDaysPerWeekForStagnation`) is what keeps it quiet.
    const entries = ['2026-03-11', '2026-03-18', '2026-03-25'].map((d) => activity(d, 5));
    expect(componentsOf(diagnose(COUNT, entries, AS_OF))).not.toContain('load');
  });

  it('still fires when the weeks are genuinely engaged and flat', () => {
    // The gate must not silence the rule it exists to qualify: every day recorded at
    // exactly the floor for three weeks is real stagnation and must be flagged.
    const entries = daysEndingAt(AS_OF, 21).map((d) => activity(d, 5));
    expect(componentsOf(diagnose(COUNT, entries, AS_OF))).toContain('load');
  });

  it('does not fire when a week has no floor-met day at all', () => {
    const entries = floorExactWeeks(5).filter((e) => e.date >= '2026-03-18');
    expect(componentsOf(diagnose(COUNT, entries, AS_OF))).not.toContain('load');
  });
});

describe('Rule 4 — fill cue / identity first (§4.4)', () => {
  const window14 = daysEndingAt(AS_OF, TUNING.windows.cuePrompt);

  it('does not fire at exactly lowCompletionForCuePrompt', () => {
    const bare: Habit = { ...COUNT, cue: undefined };
    // 6 engaged days in the 14-day window, 3 floor-met → 0.5.
    const entries = [
      ...window14.slice(0, 3).map((d) => activity(d, 6)),
      ...window14.slice(3, 6).map((d) => activity(d, 2)),
    ];
    expect(floorCompletionRate(entries, bare, AS_OF, TUNING.windows.cuePrompt)).toBe(
      TUNING.diagnosis.lowCompletionForCuePrompt,
    );
    expect(ofComponent(diagnose(bare, entries, AS_OF), 'cue')).toEqual([]);
  });

  it('fires critical on cue when the cue is empty and the 14-day rate is below threshold', () => {
    const bare: Habit = { ...COUNT, cue: undefined };
    // 7 engaged days, 3 floor-met → ~0.43 < 0.5.
    const entries = [
      ...window14.slice(0, 3).map((d) => activity(d, 6)),
      ...window14.slice(3, 7).map((d) => activity(d, 2)),
    ];
    const flags = ofComponent(diagnose(bare, entries, AS_OF), 'cue');
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe('critical');
    expect(flags[0].evidence).toContain('43%');
  });

  it('names identity when the cue is set but the identity is empty', () => {
    const bare: Habit = { ...COUNT, identity: undefined };
    const entries = [
      ...window14.slice(0, 3).map((d) => activity(d, 6)),
      ...window14.slice(3, 7).map((d) => activity(d, 2)),
    ];
    const flags = ofComponent(diagnose(bare, entries, AS_OF), 'identity');
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe('critical');
  });
});

describe('Rule 5 — skip-reason attribution (§4.4 Part D)', () => {
  // Two different weekdays, so Rule 2's "0 on others" never holds in these fixtures.
  const D1 = '2026-03-25'; // 수
  const D2 = '2026-03-26'; // 목
  const D3 = '2026-03-27'; // 금

  it('fires the cue component at cueSkipThreshold skips in the window (§7.3)', () => {
    const entries = [skip(D1, 'cue'), skip(D2, 'cue')];
    const flags = diagnose(COUNT, entries, AS_OF);
    expect(flags).toHaveLength(1);
    expect(flags[0].component).toBe('cue');
    expect(flags[0].severity).toBe('warning');
    expect(flags[0].evidence).toContain('2');
    expect(flags[0].evidence).toContain(String(TUNING.windows.skipReason));
  });

  it('does not fire below the threshold', () => {
    expect(diagnose(COUNT, [skip(D1, 'cue')], AS_OF)).toEqual([]);
  });

  it('fires the floor component at floorSkipThreshold skips', () => {
    const flags = diagnose(COUNT, [skip(D1, 'floor'), skip(D2, 'floor')], AS_OF);
    expect(componentsOf(flags)).toEqual(['floor']);
  });

  it('fires the identity component at identitySkipThreshold skips', () => {
    const flags = diagnose(COUNT, [skip(D1, 'identity'), skip(D2, 'identity')], AS_OF);
    expect(componentsOf(flags)).toEqual(['identity']);
  });

  it('never counts exception skips', () => {
    const entries = [skip(D1, 'exception'), skip(D2, 'exception'), skip(D3, 'exception')];
    expect(diagnose(COUNT, entries, AS_OF)).toEqual([]);
  });

  it('counts one attribution per day — the effective (latest) reason, not every skip row', () => {
    // Two days, each holding a `cue` row and a later `floor` row. Day-level counting
    // sees floor=2 / cue=0; counting rows would also reach the cue threshold.
    const entries = [
      skip(D1, 'cue', '09:00:00'),
      skip(D1, 'floor', '21:00:00'), // latest intent wins → this day is a `floor` skip
      skip(D2, 'cue', '09:00:00'),
      skip(D2, 'floor', '21:00:00'),
    ];
    const flags = diagnose(COUNT, entries, AS_OF);
    expect(componentsOf(flags)).toEqual(['floor']);
    expect(ofComponent(flags, 'cue')).toEqual([]);
  });

  it('ignores skip rows on a day an activity row carried to the floor', () => {
    // Two `cue` skip rows sit in the window, but the only day carrying them is `done`.
    const entries = [skip(D1, 'cue', '08:00:00'), skip(D1, 'cue', '09:00:00'), activity(D1, 6, '21:00:00')];
    expect(diagnose(COUNT, entries, AS_OF)).toEqual([]);
  });

  it('dedupes by component and keeps the higher severity even when the warning is found first', () => {
    // Rule 2 (a Tuesday cue cluster) raises a cue *warning* before Rule 4 raises the
    // cue *critical*, so "keep the first" and "keep the higher severity" disagree here.
    const bare: Habit = { ...COUNT, cue: undefined };
    const entries = [
      skip('2026-03-10', 'cue'),
      skip('2026-03-17', 'cue'),
      skip('2026-03-24', 'cue'),
      ...['2026-03-19', '2026-03-20', '2026-03-21', '2026-03-22'].map((d) => activity(d, 2)),
    ];
    const cueFlags = ofComponent(diagnose(bare, entries, AS_OF), 'cue');
    expect(cueFlags).toHaveLength(1);
    expect(cueFlags[0].severity).toBe('critical');
  });

  it('dedupes a Rule 4 critical against a Rule 5 warning on the same component', () => {
    const bare: Habit = { ...COUNT, cue: undefined };
    const window14 = daysEndingAt(AS_OF, TUNING.windows.cuePrompt);
    const entries = [
      skip(D1, 'cue'),
      skip(D2, 'cue'),
      ...window14.slice(0, 2).map((d) => activity(d, 6)),
      ...window14.slice(2, 5).map((d) => activity(d, 2)),
    ];
    // 7 engaged days in 14d, 2 floor-met → ~0.29 < 0.5 → Rule 4 critical cue,
    // while Rule 5 raises a warning cue. One cue flag survives, the critical one.
    const cueFlags = ofComponent(diagnose(bare, entries, AS_OF), 'cue');
    expect(cueFlags).toHaveLength(1);
    expect(cueFlags[0].severity).toBe('critical');
    expect(cueFlags[0].evidence).toContain('29%');
  });
});

describe('a healthy habit raises no flags (§7.1)', () => {
  it('returns an empty array', () => {
    const dates = daysEndingAt(AS_OF, 28);
    const entries = dates.map((d, i) => activity(d, i % 2 === 0 ? 9 : 6));
    expect(diagnose(COUNT, entries, AS_OF)).toEqual([]);
  });
});
