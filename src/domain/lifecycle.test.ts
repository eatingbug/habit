import type { Habit } from '@/models';

import { isDateInScope } from './classify';
import { addDays } from './dates';
import { archiveHabit, pauseHabit, resumeHabit } from './lifecycle';

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

  it('보관을 되돌리면 기록이 그대로 남은 채 다시 활성이 된다 (AC 8)', () => {
    const back = resumeHabit(archiveHabit(ESTABLISHED, d(10)), d(20));
    expect(back.lifecycle).toBe('established');
    expect(back.pauses).toEqual([{ from: d(10), to: d(20), resumeTo: 'established' }]);
  });
});

describe('불변식 — 겹치지 않고 from 오름차순이고 append-only (AC 2)', () => {
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
