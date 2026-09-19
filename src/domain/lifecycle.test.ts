import type { Habit, HabitEntry } from '@/models';

import { TUNING } from '@/config/tuning';

import { isDateInScope } from './classify';
import { addDays } from './dates';
import { archiveHabit, evaluateLifecycle, pauseHabit, resumeHabit } from './lifecycle';

/**
 * SPEC §4.7 / ADR-0003 — the write path that creates `PauseInterval`s, and the two
 * invariants it must never break: `pauses` stays non-overlapping, `from` ASC and
 * append-only, and an open interval ⟺ a `paused`/`archived` lifecycle.
 *
 * The functions are pure, so the fixtures are plain dates — day 0 is the habit's
 * creation date, as in `streak.test.ts`.
 */
const START = '2026-03-01';

function d(n: number): string {
  return addDays(START, n);
}

const FORMING: Habit = {
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

const ESTABLISHED: Habit = { ...FORMING, lifecycle: 'established' };

describe('pauseHabit / archiveHabit — 열린 구간 하나를 append한다', () => {
  it('정지하면 오늘부터 열린 구간이 붙고 lifecycle이 paused가 된다', () => {
    const paused = pauseHabit(FORMING, d(10));
    expect(paused.lifecycle).toBe('paused');
    expect(paused.pauses).toEqual([{ from: d(10), resumeTo: 'forming' }]);
  });

  it('보관도 같은 기계장치를 탄다 — 열린 구간 + archived', () => {
    const archived = archiveHabit(FORMING, d(10));
    expect(archived.lifecycle).toBe('archived');
    expect(archived.pauses).toEqual([{ from: d(10), resumeTo: 'forming' }]);
  });

  it('입력 습관을 건드리지 않고 새 습관을 돌려준다 (순수)', () => {
    const before: Habit = { ...FORMING, pauses: [{ from: d(2), to: d(4) }] };
    const after = pauseHabit(before, d(10));
    expect(before.pauses).toEqual([{ from: d(2), to: d(4) }]);
    expect(after.pauses).not.toBe(before.pauses);
  });

  it('정지한 날부터 분류 대상 밖이 된다 (ADR-0003, 열린 구간이 권위)', () => {
    const paused = pauseHabit(FORMING, d(10));
    expect(isDateInScope(paused, d(9))).toBe(true);
    expect(isDateInScope(paused, d(10))).toBe(false);
    expect(isDateInScope(paused, d(40))).toBe(false);
  });

  it('established 습관은 재개할 lifecycle을 구간에 적어 둔다', () => {
    expect(pauseHabit(ESTABLISHED, d(10)).pauses).toEqual([
      { from: d(10), resumeTo: 'established' },
    ]);
  });
});

describe('resumeHabit — 열린 구간을 닫고 오늘을 다시 활성으로 만든다', () => {
  it('재개일은 다시 활성이다 (반열림 [from, to))', () => {
    const resumed = resumeHabit(pauseHabit(FORMING, d(10)), d(20));
    expect(resumed.pauses).toEqual([{ from: d(10), to: d(20), resumeTo: 'forming' }]);
    expect(isDateInScope(resumed, d(19))).toBe(false);
    expect(isDateInScope(resumed, d(20))).toBe(true);
  });

  it('established 습관은 쉬었다는 이유만으로 강등되지 않는다', () => {
    expect(resumeHabit(pauseHabit(ESTABLISHED, d(10)), d(20)).lifecycle).toBe('established');
  });

  it('resumeTo가 없는 (이전에 쓰인) 구간은 forming으로 재개한다', () => {
    const legacy: Habit = { ...ESTABLISHED, lifecycle: 'paused', pauses: [{ from: d(10) }] };
    expect(resumeHabit(legacy, d(20)).lifecycle).toBe('forming');
  });

  // #19: *"보관된 습관은 … 기록이 보존되고 되돌릴 수 있다"*.
  it('보관을 되돌리면 기록이 그대로 남은 채 다시 활성이 된다', () => {
    const back = resumeHabit(archiveHabit(ESTABLISHED, d(10)), d(20));
    expect(back.lifecycle).toBe('established');
    expect(back.pauses).toEqual([{ from: d(10), to: d(20), resumeTo: 'established' }]);
  });

  /**
   * 정지 중인데 구간이 하나도 없는 습관 — ⟺ 불변식이 깨진 모양이고, 이 모듈의 어떤
   * 함수도 만들어 내지 못한다. 그래도 **만들 수는 있다**: `lifecycle: 'archived'` 만
   * 적고 `pauses` 를 아예 두지 않은 저장 습관이 그것이고, 실제로
   * `src/hooks/useDashboard.test.ts:201` 이 정확히 그 픽스처를 만든다.
   *
   * 그대로 돌려주면 다시 꺼내기 버튼이 똑같은 습관을 쓰고 끝나 사용자에게 나갈 길이
   * 없다 — #19 의 *"되돌릴 수 있다"* 가 없애라는 바로 그 막다른 길이다.
   */
  it('구간이 없는 보관 습관도 다시 활성이 된다 (막다른 길을 남기지 않는다)', () => {
    const orphan: Habit = { ...ESTABLISHED, lifecycle: 'archived' };
    const back = resumeHabit(orphan, d(20));
    expect(back.lifecycle).toBe('forming');
    expect(back.pauses).toBeUndefined();
  });
});

// #19: *"`PauseInterval`이 겹치지 않고 `from` 오름차순으로 append된다"*.
describe('불변식 — 겹치지 않고 from 오름차순이고 append-only', () => {
  it('정지→재개→정지→재개가 닫힌 구간 둘을 남기고 첫 구간은 그대로다', () => {
    const first = resumeHabit(pauseHabit(FORMING, d(3)), d(7));
    const second = resumeHabit(pauseHabit(first, d(12)), d(15));

    expect(second.pauses).toEqual([
      { from: d(3), to: d(7), resumeTo: 'forming' },
      { from: d(12), to: d(15), resumeTo: 'forming' },
    ]);
    // 앞 구간은 한 글자도 바뀌지 않았다.
    expect(second.pauses![0]).toEqual(first.pauses![0]);
  });

  it('이미 정지 중인 습관을 또 정지해도 구간이 늘지 않는다', () => {
    const paused = pauseHabit(FORMING, d(10));
    expect(pauseHabit(paused, d(12))).toBe(paused);
  });

  it('이미 보관된 습관을 또 보관해도 구간이 늘지 않는다', () => {
    const archived = archiveHabit(FORMING, d(10));
    expect(archiveHabit(archived, d(12))).toBe(archived);
  });

  it('정지 중인 습관을 보관하면 구간은 그대로 두고 lifecycle만 바뀐다', () => {
    const archived = archiveHabit(pauseHabit(ESTABLISHED, d(10)), d(12));
    expect(archived.lifecycle).toBe('archived');
    // 두 번째 열린 구간이 생기면 ⟺ 불변식이 깨진다. 정지 시점의 resumeTo도 살아남는다.
    expect(archived.pauses).toEqual([{ from: d(10), resumeTo: 'established' }]);
    expect(resumeHabit(archived, d(20)).lifecycle).toBe('established');
  });

  it('보관된 습관을 정지해도 마찬가지다', () => {
    const paused = pauseHabit(archiveHabit(FORMING, d(10)), d(12));
    expect(paused.lifecycle).toBe('paused');
    expect(paused.pauses).toEqual([{ from: d(10), resumeTo: 'forming' }]);
  });

  it('활성인 습관을 재개하는 것은 아무 일도 하지 않는다', () => {
    expect(resumeHabit(FORMING, d(10))).toBe(FORMING);
    const closed: Habit = { ...FORMING, pauses: [{ from: d(2), to: d(4) }] };
    expect(resumeHabit(closed, d(10))).toBe(closed);
  });
});

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
