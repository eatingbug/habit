import type { Habit, HabitEntry } from '@/models';

import { TUNING } from '@/config/tuning';

import { addDays } from './dates';
import { evaluateLifecycle } from './lifecycle';

/**
 * SPEC §4.7 + §7.1 `lifecycle.test.ts` row + the §7.3 scoped-fairness property.
 *
 * The window is `TUNING.formingToEstablishedDays` days ending at `TODAY`, and every
 * fixture is born on the first day of that window so the whole window is in scope.
 */
const TODAY = '2026-03-31';
const WINDOW = TUNING.formingToEstablishedDays;
const RATE = TUNING.formingToEstablishedRate;

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
function activity(date: string, actual: number): HabitEntry {
  return { id: `a${++seq}`, habitId: 'h1', date, timestamp: `${date}T09:00:00.000Z`, actual };
}

/** `n` consecutive dates ending at `end` (inclusive), ascending. */
function daysEndingAt(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, -(n - 1 - i)));
}

const WINDOW_DATES = daysEndingAt(TODAY, WINDOW);
const BORN_AT_WINDOW_START = `${WINDOW_DATES[0]}T00:00:00.000Z`;

/** `done` days first, then `partial` days, filling the whole window. */
function mix(done: number, partial: number): HabitEntry[] {
  return [
    ...WINDOW_DATES.slice(0, done).map((d) => activity(d, 6)),
    ...WINDOW_DATES.slice(done, done + partial).map((d) => activity(d, 2)),
  ];
}

describe('forming → established (§4.7)', () => {
  const forming: Habit = { ...COUNT, lifecycle: 'forming', createdAt: BORN_AT_WINDOW_START };

  it('promotes exactly at TUNING.formingToEstablishedRate on a full window', () => {
    const done = WINDOW * RATE; // 24 of 30
    expect(Number.isInteger(done)).toBe(true);
    expect(evaluateLifecycle(forming, mix(done, WINDOW - done), TODAY)).toBe('established');
  });

  it('does not promote one floor-met day below the threshold', () => {
    const done = WINDOW * RATE - 1;
    expect(evaluateLifecycle(forming, mix(done, WINDOW - done + 1), TODAY)).toBe('forming');
  });

  it('uses the standard partial-inclusive rate — a partial keeps the user in Forming', () => {
    // 24 floor-met + 6 sub-floor promotes (24/30 = 80%); the same 24 floor-met days
    // with the other six unrecorded do NOT, because `missed` leaves that rate's
    // denominator entirely and the window is then short of scaffolding-worthy data.
    const done = WINDOW * RATE;
    expect(evaluateLifecycle(forming, mix(done, WINDOW - done), TODAY)).toBe('established');
    const lowered = [
      ...WINDOW_DATES.slice(0, done - 1).map((d) => activity(d, 6)),
      ...WINDOW_DATES.slice(done - 1, WINDOW).map((d) => activity(d, 2)),
    ];
    expect(evaluateLifecycle(forming, lowered, TODAY)).toBe('forming');
  });

  it('does not promote before the window holds enough classified days', () => {
    // A five-day-old habit with a perfect record: the rate reads 100%, but "for
    // `formingToEstablishedDays` consecutive days" has not happened yet.
    const young: Habit = {
      ...COUNT,
      lifecycle: 'forming',
      createdAt: `${addDays(TODAY, -4)}T00:00:00.000Z`,
    };
    const entries = daysEndingAt(TODAY, 5).map((d) => activity(d, 6));
    expect(evaluateLifecycle(young, entries, TODAY)).toBe('forming');
  });

  it('stays Forming when the rate is null (not enough data reads as healthy)', () => {
    expect(evaluateLifecycle(forming, [], TODAY)).toBe('forming');
    expect(evaluateLifecycle(forming, mix(3, 0), TODAY)).toBe('forming');
  });
});

describe('established → forming demotion uses the partial-excluded rate (§4.7, §3.2)', () => {
  const established: Habit = {
    ...COUNT,
    lifecycle: 'established',
    createdAt: BORN_AT_WINDOW_START,
  };

  it('demotes when the partial-excluded rate falls below the threshold (missed included)', () => {
    // 23 floor-met, 7 unrecorded → 23/30 ≈ 77% < 80%.
    expect(evaluateLifecycle(established, mix(23, 0), TODAY)).toBe('forming');
  });

  it('does not demote at the threshold exactly', () => {
    expect(evaluateLifecycle(established, mix(WINDOW * RATE, 0), TODAY)).toBe('established');
  });

  it('missed → partial never demotes — backfill is pure repair (ADR-0001, §7.3)', () => {
    const missedVersion = mix(23, 0); // 7 unrecorded days → demoted above
    const backfilled = [
      ...missedVersion,
      ...WINDOW_DATES.slice(23).map((d) => activity(d, 2)), // the same days, sub-floor
    ];
    expect(evaluateLifecycle(established, backfilled, TODAY)).toBe('established');
  });

  it('an honest partial-logger is never evicted while a silent non-logger would be', () => {
    // 20 floor-met + 10 sub-floor: the partial-inclusive rate is 67% (would demote),
    // the partial-excluded rate is 100% (does not). This is the whole point of §4.4's
    // rate role split — remove `{ excludePartial: true }` and this test fails.
    expect(evaluateLifecycle(established, mix(20, 10), TODAY)).toBe('established');
    // …while 20 floor-met and 10 *unrecorded* days do demote.
    expect(evaluateLifecycle(established, mix(20, 0), TODAY)).toBe('forming');
  });

  it('stays Established when the rate is null (not enough data reads as healthy)', () => {
    const fresh: Habit = {
      ...COUNT,
      lifecycle: 'established',
      createdAt: `${TODAY}T00:00:00.000Z`,
    };
    expect(evaluateLifecycle(fresh, [], TODAY)).toBe('established');
    expect(evaluateLifecycle(fresh, [activity(TODAY, 6)], TODAY)).toBe('established');
  });

  it('flipping any single unrecorded day to partial never worsens the outcome (§7.3)', () => {
    const base = mix(24, 0); // promoted/kept at exactly 80%
    for (const date of WINDOW_DATES.slice(24)) {
      expect(evaluateLifecycle(established, [...base, activity(date, 2)], TODAY)).toBe(
        'established',
      );
    }
    // …and from a demoting baseline, a single backfill can only help.
    const demoting = mix(20, 0);
    expect(evaluateLifecycle(established, demoting, TODAY)).toBe('forming');
    for (const date of WINDOW_DATES.slice(20)) {
      const after = evaluateLifecycle(established, [...demoting, activity(date, 2)], TODAY);
      expect(['established', 'forming']).toContain(after);
    }
  });
});

describe('pause never costs (ADR-0003 §지켜야 할 성질)', () => {
  it('an unrecorded stretch inside a PauseInterval does not demote', () => {
    const createdAt = BORN_AT_WINDOW_START;
    const entries = WINDOW_DATES.slice(0, 20).map((d) => activity(d, 6));
    const bare: Habit = { ...COUNT, lifecycle: 'established', createdAt };
    expect(evaluateLifecycle(bare, entries, TODAY)).toBe('forming');

    const paused: Habit = { ...bare, pauses: [{ from: WINDOW_DATES[20], to: TODAY }] };
    expect(evaluateLifecycle(paused, entries, TODAY)).toBe('established');
  });
});

describe('paused / archived are explicit user actions only (§4.7)', () => {
  it('never returns paused or archived from an automatic evaluation', () => {
    const forming: Habit = { ...COUNT, lifecycle: 'forming', createdAt: BORN_AT_WINDOW_START };
    const established: Habit = { ...forming, lifecycle: 'established' };
    for (const entries of [[], mix(0, 30), mix(30, 0), mix(23, 0)]) {
      expect(['forming', 'established']).toContain(evaluateLifecycle(forming, entries, TODAY));
      expect(['forming', 'established']).toContain(evaluateLifecycle(established, entries, TODAY));
    }
  });

  it('leaves a paused habit paused, however bad the data looks', () => {
    const paused: Habit = {
      ...COUNT,
      lifecycle: 'paused',
      createdAt: BORN_AT_WINDOW_START,
      pauses: [{ from: WINDOW_DATES[1] }],
    };
    expect(evaluateLifecycle(paused, [], TODAY)).toBe('paused');
    expect(evaluateLifecycle(paused, mix(30, 0), TODAY)).toBe('paused');
  });

  it('leaves an archived habit archived, however good the data looks', () => {
    const archived: Habit = {
      ...COUNT,
      lifecycle: 'archived',
      createdAt: BORN_AT_WINDOW_START,
      pauses: [{ from: WINDOW_DATES[1] }],
    };
    expect(evaluateLifecycle(archived, mix(30, 0), TODAY)).toBe('archived');
  });
});
