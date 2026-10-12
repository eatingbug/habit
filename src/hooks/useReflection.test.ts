import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ComponentProps, type ReactNode } from 'react';

import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository } from '@/data';
import { addDays } from '@/domain/dates';
import { diagnose } from '@/domain/diagnose';
import type { Habit, HabitEntry, SkipReason } from '@/models';

import { useDashboard } from './useDashboard';
import { useReflection, type ReflectionView } from './useReflection';

/**
 * SPEC §6.4 — every judgment the Reflection screen makes, asserted at the hook seam
 * (jest.config.js: a real `LocalRepository` over `MemoryKV`, no component render).
 *
 * `TODAY` is a **Sunday**, so the ISO week it closes is `THIS_MONDAY`…`TODAY` and the
 * decline arm (completed weeks only) reads it. Timestamps are fixtures, never asserted.
 */
const TODAY = '2026-03-29'; // Sunday
const THIS_MONDAY = '2026-03-23';
const CREATED = addDays(TODAY, -40);
const NOW = new Date('2026-03-29T11:00:00.000Z');

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: '턱걸이',
    statId: 'strength',
    kind: 'count',
    floor: 5,
    floorUnit: 'reps',
    target: 8,
    cue: '아침 커피 뒤',
    identity: '몸을 돌보는 사람',
    lifecycle: 'forming',
    createdAt: `${CREATED}T00:00:00.000Z`,
    ...over,
  };
}

function binary(over: Partial<Habit> = {}): Habit {
  return habit({ kind: 'binary', floor: 1, floorUnit: 'time', target: undefined, ...over });
}

let seq = 0;
function activity(date: string, actual: number, over: Partial<HabitEntry> = {}): HabitEntry {
  return { id: `a${++seq}`, habitId: 'h1', date, timestamp: `${date}T09:00:00.000Z`, actual, ...over };
}
function skip(date: string, skipReason: SkipReason, over: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: `s${++seq}`,
    habitId: 'h1',
    date,
    timestamp: `${date}T09:00:00.000Z`,
    actual: 0,
    skipReason,
    ...over,
  };
}

/** `n` consecutive dates ending at `end`, ascending. */
function daysEndingAt(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, -(n - 1 - i)));
}

function wrapperFor(repository: HabitRepository) {
  return function Wrapper({ children }: { children: ReactNode }) {
    // `children` goes in as the third argument; the cast covers the prop it fills at runtime.
    const props = { repository } as ComponentProps<typeof RepositoryProvider>;
    return createElement(RepositoryProvider, props, children);
  };
}

async function seed(subject: Habit, entries: HabitEntry[] = []): Promise<HabitRepository> {
  const repository = new LocalRepository(new MemoryKV());
  await repository.upsertHabit(subject);
  for (const entry of entries) await repository.upsertEntry(entry);
  return repository;
}

async function render(repository: HabitRepository, id = 'h1') {
  const hook = renderHook(() => useReflection(id, { today: TODAY, now: () => NOW }), {
    wrapper: wrapperFor(repository),
  });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

/** A healthy history: every day of the habit's life floor-met and growing. */
function healthy(): HabitEntry[] {
  return daysEndingAt(TODAY, 41).map((date) => activity(date, 6));
}

/**
 * Rule 4 alone: no cue, and the last 14 days mostly `partial` (3/14 floor-met, 21% —
 * under `lowCompletionForCuePrompt`) while the 28-day rate stays at 17/28 = 61%, over
 * Rule 1's 60%. No day is a miss, so the Forming 🔴 arm is silent: the light is 🟡 and
 * setting the cue is exactly what clears it.
 */
function rule4Only(): { subject: Habit; entries: HabitEntry[] } {
  const older = daysEndingAt(addDays(TODAY, -14), 14).map((date) => activity(date, 6));
  const recent = daysEndingAt(TODAY, 14).map((date, i) => activity(date, i % 4 === 3 ? 6 : 2));
  return {
    subject: habit({ cue: undefined, createdAt: `${addDays(TODAY, -27)}T00:00:00.000Z` }),
    entries: [...older, ...recent],
  };
}

describe('the 7-day mirror (§6.4, AC 1)', () => {
  it('shows the last 7 days, oldest first, each day-state with its own mark', async () => {
    const days = daysEndingAt(TODAY, 7);
    const repository = await seed(habit(), [
      activity(days[0], 6), // done
      // days[1] — nothing logged: missed
      activity(days[2], 2), // partial
      activity(days[3], 9), // over
      skip(days[4], 'cue'), // skip — a miss, reason known
      skip(days[5], 'exception'), // skip — excused
      // today — nothing yet: pending
    ]);
    const { result } = await render(repository);

    expect(result.current.mirror.map((cell) => cell.date)).toEqual(days);
    expect(result.current.mirror.map((cell) => cell.state)).toEqual([
      'done',
      'missed',
      'partial',
      'over',
      'skip',
      'skip',
      'pending',
    ]);
    // `ReReflection`: each cell is named by its weekday, and today's by 오늘.
    expect(result.current.mirror.map((cell) => cell.label)).toEqual(['월', '화', '수', '목', '금', '토', '오늘']);
  });

  it('keeps 7 cells for a habit younger than a week — a day before its birth has no state', async () => {
    const repository = await seed(habit({ createdAt: `${addDays(TODAY, -2)}T00:00:00.000Z` }));
    const { result } = await render(repository);

    expect(result.current.mirror).toHaveLength(7);
    expect(result.current.mirror.map((cell) => cell.state)).toEqual([
      null,
      null,
      null,
      null,
      'missed',
      'missed',
      'pending',
    ]);
  });

  it('lists the notes written on the mirrored days, oldest first', async () => {
    const days = daysEndingAt(TODAY, 8);
    const repository = await seed(habit(), [
      activity(days[0], 6, { note: '창 밖의 날' }),
      activity(days[2], 6, { note: '어깨가 뻐근' }),
      skip(days[5], 'floor', { note: '야근' }),
      activity(days[6], 6),
    ]);
    const { result } = await render(repository);

    expect(result.current.notes).toEqual([
      { date: days[2], label: '3/24', text: '어깨가 뻐근' },
      { date: days[5], label: '3/27', text: '야근' },
    ]);
  });
});

describe('diagnosis flags and their evidence (§6.4, AC 2–5)', () => {
  it('shows each flag with its component label, severity, message and evidence', async () => {
    const { subject, entries } = rule4Only();
    const { result } = await render(await seed(subject, entries));

    expect(result.current.folded).toEqual([]);
    const card = result.current.lead!;
    expect(card.key).toBe('cue');
    expect(card.severity).toBe('critical');
    expect(card.badge).toBe('▲ 언제·어디서');
    expect(card.evidence).toContain('21%');
    expect(card.chart).toBeNull();
  });

  it('draws the weekly totals under a Rule 3 stagnation flag (AC 3)', async () => {
    // Floor exactly met every day for three weeks: solid floor, no growth.
    const entries = daysEndingAt(TODAY, 41).map((date) => activity(date, 5));
    const { result } = await render(await seed(habit(), entries));

    const load = [result.current.lead, ...result.current.folded].find((card) => card?.key === 'load');
    expect(load?.chart?.bars.map((bar) => bar.total).slice(-3)).toEqual([35, 35, 35]);
  });

  it('turns an Established decline — a 🔴 with no flag — into its own evidence card (AC 3)', async () => {
    const established = habit({ lifecycle: 'established' });
    const entries = [9, 8, 7, 6].map((total, i) => activity(addDays('2026-03-25', -7 * (3 - i)), total));
    const { result } = await render(await seed(established, entries));

    expect(result.current.lead).toMatchObject({ key: 'decline', severity: 'critical', badge: '▲ 주마다 한 양' });
    expect(result.current.lead?.evidence).toContain('8 → 7 → 6');
    expect(result.current.lead?.chart).not.toBeNull();
  });

  it('has no decline card on a habit whose light is not the decline arm', async () => {
    const { result } = await render(await seed(habit(), healthy()));

    expect(result.current.lead).toBeNull();
    expect(result.current.folded).toEqual([]);
  });

  it('attributes nothing to a run of missed days — the 🔴 opens onto no diagnosis (AC 5, ADR-0002)', async () => {
    const entries = daysEndingAt(addDays(TODAY, -4), 30).map((date) => activity(date, 6));
    const { result } = await render(await seed(habit(), entries));

    expect(result.current.mirror.slice(3, 6).map((cell) => cell.state)).toEqual([
      'missed',
      'missed',
      'missed',
    ]);
    expect(result.current.lead).toBeNull();
    expect(result.current.folded).toEqual([]);
    expect(result.current.suggested).toBe('keep');
  });
});

/**
 * SPEC §6.7 Diagnosis copy — the table's ten rows, as the screen receives them (#111).
 * `TODAY` is a Sunday, so `TUESDAYS` are the 24th and the 17th.
 */
describe('the diagnosis copy table (§6.7, #131)', () => {
  const TUESDAYS = [addDays(TODAY, -5), addDays(TODAY, -12)];

  /** Healthy, except `skipped` — those days hold one `reason` skip and nothing else. */
  function cueSkips(skipped: string[], reason: SkipReason = 'cue'): HabitEntry[] {
    return [
      ...healthy().filter((entry) => !skipped.includes(entry.date)),
      ...skipped.map((date) => skip(date, reason)),
    ];
  }

  function rule4Identity(): { subject: Habit; entries: HabitEntry[] } {
    const { subject, entries } = rule4Only();
    return { subject: { ...subject, cue: '아침 커피 뒤', identity: undefined }, entries };
  }

  it('names cue 언제·어디서 and identity 이유 on the badge', async () => {
    const cue = await render(await seed(rule4Only().subject, rule4Only().entries));
    const { subject, entries } = rule4Identity();
    const identity = await render(await seed(subject, entries));

    expect(cue.result.current.lead?.badge).toBe('▲ 언제·어디서');
    expect(identity.result.current.lead?.badge).toBe('▲ 이유');
  });

  it('says Rule 2 with the weekday and 언제·어디서', async () => {
    const { result } = await render(await seed(habit(), cueSkips(TUESDAYS)));

    expect(result.current.lead?.message).toBe('화요일 언제·어디서가 자꾸 어긋나요.');
    expect(result.current.lead?.evidence).toBe('못 했다고 찍은 2일 중 2일이 화요일이에요');
    expect(result.current.folded).toEqual([]);
  });

  it('says Rule 4 for an empty 언제·어디서, with its evidence', async () => {
    const { subject, entries } = rule4Only();
    const { result } = await render(await seed(subject, entries));

    expect(result.current.lead?.message).toBe(
      '언제·어디서가 비어 있어요. 습관이 붙지 않는 가장 큰 이유일 수 있어요.',
    );
    expect(result.current.lead?.evidence).toBe('최근 14일 달성률 21%, 언제·어디서 미설정');
  });

  it('says Rule 4 for an empty 이유, with its evidence', async () => {
    const { subject, entries } = rule4Identity();
    const { result } = await render(await seed(subject, entries));

    expect(result.current.lead?.message).toBe('이유가 비어 있어요. 습관이 붙지 않는 가장 큰 이유일 수 있어요.');
    expect(result.current.lead?.evidence).toBe('최근 14일 달성률 21%, 이유 미설정');
  });

  it('says Rule 5 on cue skips with the 깜빡함 chip’s own word', async () => {
    // A Tuesday and a Wednesday: two weekdays, so Rule 2 stays silent.
    const { result } = await render(await seed(habit(), cueSkips([TUESDAYS[0], addDays(TODAY, -4)])));

    expect(result.current.lead?.message).toBe('깜빡해서 못 한 날이 반복돼요.');
    expect(result.current.lead?.evidence).toBe("최근 28일 중 '깜빡함' 사유로 못 했다고 찍은 날 2일");
    expect(result.current.folded).toEqual([]);
  });

  it('cites Rule 5 identity skips by the 안 내킴 chip’s own word', async () => {
    const { result } = await render(
      await seed(habit(), cueSkips([TUESDAYS[0], addDays(TODAY, -4)], 'identity')),
    );

    expect(result.current.lead?.badge).toBe('◆ 이유');
    expect(result.current.lead?.evidence).toBe("최근 28일 중 '안 내킴' 사유로 못 했다고 찍은 날 2일");
  });

  it('names the two cue prescriptions 언제·어디서 정하기 and 언제·어디서 바꾸기', async () => {
    const empty = await render(await seed(rule4Only().subject, rule4Only().entries));
    const set = await render(await seed(habit(), cueSkips(TUESDAYS)));

    expect(empty.result.current.suggested).toBe('fill_cue');
    expect(empty.result.current.options[0].label).toBe('언제·어디서 정하기');
    expect(set.result.current.suggested).toBe('adjust_cue');
    expect(set.result.current.options[0].label).toBe('언제·어디서 바꾸기');
  });
});

/** §6.7 — only the most severe card is open; the rest fold under one button. */
describe('which diagnosis opens (§6.7, #131)', () => {
  /**
   * No cue, and the floor met on every 4th day of the last 28 (the rest `partial`):
   * Rule 1's `floor` warning (25% < 60%) comes first from `diagnose`, Rule 4's `cue`
   * critical (14-day 4/14 = 29% < 50%) second.
   */
  function floorAndCue(): HabitEntry[] {
    return daysEndingAt(TODAY, 28).map((date, i) => activity(date, i % 4 === 3 ? 6 : 2));
  }

  it('opens the critical card over an earlier warning, and folds the warning', async () => {
    const { result } = await render(await seed(habit({ cue: undefined }), floorAndCue()));

    expect(result.current.lead).toMatchObject({
      severity: 'critical',
      badge: '▲ 언제·어디서',
      message: '언제·어디서가 비어 있어요. 습관이 붙지 않는 가장 큰 이유일 수 있어요.',
      evidence: '최근 14일 달성률 29%, 언제·어디서 미설정',
    });
    expect(result.current.folded.map((card) => [card.badge, card.severity])).toEqual([
      ['◆ 최소량', 'warning'],
    ]);
    expect(result.current.moreLabel).toBe('다른 점 1개 더 보기');
  });

  it('opens the one card there is, with nothing folded', async () => {
    const { subject, entries } = rule4Only();
    const { result } = await render(await seed(subject, entries));

    expect(result.current.lead?.badge).toBe('▲ 언제·어디서');
    expect(result.current.folded).toEqual([]);
    expect(result.current.moreLabel).toBeNull();
  });

  it('opens nothing on a healthy habit', async () => {
    const { result } = await render(await seed(habit(), healthy()));

    expect(result.current.lead).toBeNull();
    expect(result.current.folded).toEqual([]);
    expect(result.current.moreLabel).toBeNull();
    expect(result.current.diagnosed).toBe(false);
  });
});

describe('the screen’s own words (§6.7, #131)', () => {
  it('titles the screen with the habit’s name', async () => {
    const { result } = await render(await seed(habit()));

    expect(result.current.title).toBe('턱걸이, 잠깐 볼까요');
  });

  it('heads the recommended action with the chosen one, and follows a switch', async () => {
    const { subject, entries } = rule4Only();
    const { result } = await render(await seed(subject, entries));

    expect(result.current.proposal).toBe('✓ 이렇게 해 볼까요: 언제·어디서 정하기');
    act(() => result.current.choose('pause'));
    expect(result.current.proposal).toBe('✓ 이렇게 해 볼까요: 잠깐 쉬기');
  });

  it('never says 계기 or 정체성', async () => {
    const { subject, entries } = rule4Only();
    const cue = await render(await seed(subject, entries));
    const identity = await render(await seed({ ...subject, cue: '아침 커피 뒤', identity: undefined }, entries));

    for (const view of [cue.result.current, identity.result.current]) {
      const words = JSON.stringify([view.title, view.lead, view.folded, view.proposal, view.options]);
      expect(words).not.toMatch(/계기|정체성/);
    }
  });
});

describe('the recommended action (§6.4, AC 7, AC 9)', () => {
  it('pre-selects the engine’s suggestion, with its reason', async () => {
    const { subject, entries } = rule4Only();
    const { result } = await render(await seed(subject, entries));

    expect(result.current.suggested).toBe('fill_cue');
    expect(result.current.chosen).toBe('fill_cue');
    const chosen = result.current.options.find((option) => option.action === 'fill_cue');
    expect(chosen?.label).toBe('언제·어디서 정하기');
    expect(chosen?.reason.length).toBeGreaterThan(0);
    expect(chosen?.field).toBe('cue');
  });

  it('lets the user switch to another offered action, and ignores one that is not offered', async () => {
    const { result } = await render(await seed(binary()));

    act(() => result.current.choose('pause'));
    expect(result.current.chosen).toBe('pause');

    act(() => result.current.choose('lower_floor'));
    expect(result.current.chosen).toBe('pause');
  });

  it('hides lower_floor and raise_target on a binary habit (AC 9)', async () => {
    const { result } = await render(await seed(binary()));

    const actions = result.current.options.map((option) => option.action);
    expect(actions).not.toContain('lower_floor');
    expect(actions).not.toContain('raise_target');
  });

  it('prefills an amount field with the current design', async () => {
    const { result } = await render(await seed(habit()));

    const floor = result.current.options.find((option) => option.action === 'lower_floor');
    const target = result.current.options.find((option) => option.action === 'raise_target');
    expect(floor).toMatchObject({ field: 'floor', current: '5' });
    expect(target).toMatchObject({ field: 'target', current: '8' });
    expect(result.current.options.find((option) => option.action === 'keep')?.field).toBeNull();
  });
});

describe('commit (§6.4, AC 8, AC 10)', () => {
  async function commit(view: () => ReflectionView, action: ReflectionView['chosen'], value = '') {
    act(() => view().choose(action));
    let error: string | null = 'unset';
    await act(async () => {
      error = await view().commit(value);
    });
    return error;
  }

  it('writes the design change and a ReflectionSession, then reports committed', async () => {
    const { subject, entries } = rule4Only();
    const repository = await seed(subject, entries);
    const { result } = await render(repository);
    const flags = diagnose(subject, entries, TODAY);

    expect(await commit(() => result.current, 'fill_cue', '  아침 커피 뒤  ')).toBeNull();

    expect((await repository.getHabit('h1'))?.cue).toBe('아침 커피 뒤');
    const [session] = await repository.getReflectionSessions('h1');
    expect(session).toMatchObject({
      habitId: 'h1',
      weekOf: THIS_MONDAY,
      flags,
      suggestedAction: 'fill_cue',
      chosenAction: 'fill_cue',
      designBefore: { floor: 5, floorUnit: 'reps', target: 8, identity: '몸을 돌보는 사람' },
      designAfter: { floor: 5, floorUnit: 'reps', target: 8, identity: '몸을 돌보는 사람', cue: '아침 커피 뒤' },
      committedAt: NOW.toISOString(),
    });
    expect(session.designBefore.cue).toBeUndefined();
    expect(result.current.committed).toBe(true);
  });

  it('writes nothing for a blank text field', async () => {
    const repository = await seed(habit({ cue: undefined }));
    const { result } = await render(repository);

    expect(await commit(() => result.current, 'fill_cue', '   ')).toBe('언제·어디서를 적어 주세요.');
    expect((await repository.getHabit('h1'))?.cue).toBeUndefined();
    expect(await repository.getReflectionSessions('h1')).toEqual([]);
    expect(result.current.committed).toBe(false);
  });

  it('writes a new identity', async () => {
    const repository = await seed(habit());
    const { result } = await render(repository);

    expect(await commit(() => result.current, 'fill_identity', '오래 걷고 싶은 사람')).toBeNull();
    expect((await repository.getHabit('h1'))?.identity).toBe('오래 걷고 싶은 사람');
  });

  it('lowers the floor only below the current one, and within §3.2', async () => {
    const repository = await seed(habit());
    const { result } = await render(repository);

    expect(await commit(() => result.current, 'lower_floor', '5')).not.toBeNull();
    expect(await commit(() => result.current, 'lower_floor', '0')).not.toBeNull();
    expect(await commit(() => result.current, 'lower_floor', 'abc')).not.toBeNull();
    expect((await repository.getHabit('h1'))?.floor).toBe(5);

    expect(await commit(() => result.current, 'lower_floor', '3')).toBeNull();
    expect(await repository.getHabit('h1')).toMatchObject({ floor: 3, target: 8 });
  });

  it('raises the target only above the floor and the current target', async () => {
    const repository = await seed(habit());
    const { result } = await render(repository);

    expect(await commit(() => result.current, 'raise_target', '5')).not.toBeNull();
    expect(await commit(() => result.current, 'raise_target', '8')).not.toBeNull();
    expect((await repository.getHabit('h1'))?.target).toBe(8);

    expect(await commit(() => result.current, 'raise_target', '10')).toBeNull();
    expect((await repository.getHabit('h1'))?.target).toBe(10);
  });

  it('pause appends a PauseInterval from today (AC 10, ADR-0003)', async () => {
    const repository = await seed(habit());
    const { result } = await render(repository);

    expect(await commit(() => result.current, 'pause')).toBeNull();
    expect(await repository.getHabit('h1')).toMatchObject({
      lifecycle: 'paused',
      pauses: [{ from: TODAY, resumeTo: 'forming' }],
    });
  });

  it('archive appends a PauseInterval from today (AC 10, ADR-0003)', async () => {
    const repository = await seed(habit({ lifecycle: 'established' }));
    const { result } = await render(repository);

    expect(await commit(() => result.current, 'archive')).toBeNull();
    expect(await repository.getHabit('h1')).toMatchObject({
      lifecycle: 'archived',
      pauses: [{ from: TODAY, resumeTo: 'established' }],
    });
  });

  it('keep changes no design and still records the session', async () => {
    const subject = habit();
    const repository = await seed(subject);
    const { result } = await render(repository);

    expect(await commit(() => result.current, 'keep')).toBeNull();
    expect(await repository.getHabit('h1')).toEqual(subject);
    const [session] = await repository.getReflectionSessions('h1');
    expect(session.chosenAction).toBe('keep');
    expect(session.designAfter).toEqual(session.designBefore);
  });

  it('a failed write reports a failure and does not report committed', async () => {
    const repository = await seed(habit());
    const { result } = await render(repository);
    jest.spyOn(repository, 'upsertHabit').mockRejectedValueOnce(new Error('offline'));

    await commit(() => result.current, 'keep');

    expect(result.current.failure).not.toBeNull();
    expect(result.current.committed).toBe(false);
    expect(await repository.getReflectionSessions('h1')).toEqual([]);
  });

  it('after the commit the Dashboard’s light has updated (§6.4 walkthrough steps 6–9)', async () => {
    const { subject, entries } = rule4Only();
    const repository = await seed(subject, entries);
    const light = async () => {
      const dashboard = renderHook(() => useDashboard({ today: TODAY }), {
        wrapper: wrapperFor(repository),
      });
      await waitFor(() => expect(dashboard.result.current.loading).toBe(false));
      const row = dashboard.result.current.rows[0];
      dashboard.unmount();
      return row;
    };

    const before = await light();
    expect(before.statusLight).toBe('caution');
    // §6.3: only a 🔴 row has 회고하기. A 🟡 reaches Reflection from Habit Detail's ⋯.
    expect(before.reflectable).toBe(false);

    const { result } = await render(repository);
    expect(await commit(() => result.current, 'fill_cue', '아침 커피 뒤')).toBeNull();

    const after = await light();
    expect(after.statusLight).not.toBe('caution');
    expect(after.statusLight).not.toBe('intervention');
    expect(after.reflectable).toBe(false);
  });
});

/**
 * ADR-0002's recover-first prompt (#22). Asserted rows are read back as properties of
 * the local clock, never as `Z` literals.
 */
describe('the recover-first prompt (#22, ADR-0002)', () => {
  /** Every day of the habit's life done, except the given dates and today. */
  function doneExcept(gap: string[]): HabitEntry[] {
    return daysEndingAt(addDays(TODAY, -1), 40)
      .filter((date) => !gap.includes(date))
      .map((date) => activity(date, 6));
  }
  const GAP = [addDays(TODAY, -4), addDays(TODAY, -3), addDays(TODAY, -2)];

  async function settle(run: () => Promise<void> | void) {
    await act(async () => {
      await run();
    });
  }

  /** The listed dates alone. */
  function dates(view: ReflectionView): string[] | undefined {
    return view.recover?.rows.map((row) => row.date);
  }

  it('opens with the question on a run of missed days at the threshold (AC 1)', async () => {
    const { result } = await render(await seed(habit(), doneExcept(GAP)));

    expect(result.current.recover).toEqual({
      question: '이 3일, 하셨나요?',
      rows: [
        { date: GAP[0], label: '3/25 (수)' },
        { date: GAP[1], label: '3/26 (목)' },
        { date: GAP[2], label: '3/27 (금)' },
      ],
    });
  });

  it('does not open one day short of the threshold (AC 1)', async () => {
    const { result } = await render(await seed(habit(), doneExcept(GAP.slice(1))));

    expect(result.current.recover).toBeNull();
  });

  it('opens on the 14-day missed rate with no run at the threshold (AC 2)', async () => {
    // Every other day of the last 14: seven `missed` days, 7/13 decided days, no run over 1.
    const gap = daysEndingAt(addDays(TODAY, -1), 14).filter((_, i) => i % 2 === 1);
    const { result } = await render(await seed(habit(), doneExcept(gap)));

    expect(dates(result.current)).toEqual(gap);
  });

  it('lists only missed dates on or after the habit’s birth (AC 4)', async () => {
    const born = addDays(TODAY, -3);
    const { result } = await render(
      await seed(habit({ createdAt: `${born}T00:00:00.000Z` }), [skip(addDays(TODAY, -1), 'cue')]),
    );

    expect(dates(result.current)).toEqual([born, addDays(TODAY, -2)]);
  });

  it('fills a date with one activity row at the floor, at local noon — no day-state row (AC 5, AC 8)', async () => {
    const repository = await seed(habit(), doneExcept(GAP));
    const { result } = await render(repository);

    await settle(() => result.current.fill(GAP[1]));

    const rows = await repository.getEntries('h1', GAP[1], GAP[1]);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(['actual', 'date', 'habitId', 'id', 'timestamp']);
    expect(rows[0].actual).toBe(habit().floor);
    expect(new Date(rows[0].timestamp).getHours()).toBe(12);
    await waitFor(() => expect(result.current.mirror[3].state).toBe('done'));
  });

  it('re-runs the streak once the listed dates are filled (AC 5, ADR-0001)', async () => {
    const repository = await seed(habit(), doneExcept(GAP));
    const streak = async () => {
      const dashboard = renderHook(() => useDashboard({ today: TODAY }), {
        wrapper: wrapperFor(repository),
      });
      await waitFor(() => expect(dashboard.result.current.loading).toBe(false));
      const { streakLabel: value } = dashboard.result.current.rows[0];
      dashboard.unmount();
      return value;
    };
    expect(await streak()).toBe('🔥 1');

    const { result } = await render(repository);
    for (const date of GAP) await settle(() => result.current.fill(date));

    expect(await streak()).toBe('🔥 40');
  });

  it('stays open for the rest of the visit once the run is broken, listing what is left', async () => {
    const { result } = await render(await seed(habit(), doneExcept(GAP)));

    await settle(() => result.current.fill(GAP[1]));

    // The domain alone would no longer prompt: the run is 1 and the rate is 2/13.
    await waitFor(() => expect(result.current.recover?.question).toBe('이 2일, 하셨나요?'));
    expect(dates(result.current)).toEqual([GAP[0], GAP[2]]);
  });

  it('closes once every listed date is answered', async () => {
    const { result } = await render(await seed(habit(), doneExcept(GAP)));

    for (const date of GAP) await settle(() => result.current.fill(date));

    await waitFor(() => expect(result.current.recover).toBeNull());
  });

  it('asks why on 안 했어요, and writes the skip only once a reason is picked (AC 6)', async () => {
    const repository = await seed(habit(), doneExcept(GAP));
    const { result } = await render(repository);

    act(() => result.current.askWhy(GAP[0]));
    // The skip reason sheet's words (§6.2 B5), for the date it asks about.
    expect(result.current.asking).toEqual({
      date: GAP[0],
      eyebrow: '💪 턱걸이',
      title: '3/25 (수) 못 했어요 · 왜?',
    });
    expect(await repository.getEntries('h1', GAP[0], GAP[0])).toEqual([]);

    await settle(() => result.current.skip(GAP[0], 'floor', '야근'));

    const rows = await repository.getEntries('h1', GAP[0], GAP[0]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actual: 0, skipReason: 'floor', note: '야근' });
    expect(Object.keys(rows[0])).not.toContain('state');
    expect(result.current.asking).toBeNull();
    await waitFor(() => expect(dates(result.current)).toEqual(GAP.slice(1)));
  });

  it('closes the reason sheet on a failed skip, and reports the failure instead', async () => {
    const repository = await seed(habit(), doneExcept(GAP));
    const { result } = await render(repository);
    jest.spyOn(repository, 'upsertEntry').mockRejectedValueOnce(new Error('offline'));

    act(() => result.current.askWhy(GAP[0]));
    await settle(() => result.current.skip(GAP[0], 'floor'));

    expect(result.current.asking).toBeNull();
    expect(result.current.failure).not.toBeNull();
    expect(dates(result.current)).toEqual(GAP);
  });

  it('brings an undone fill back onto the list', async () => {
    const { result } = await render(await seed(habit(), doneExcept(GAP)));

    await settle(() => result.current.fill(GAP[1]));
    await waitFor(() => expect(dates(result.current)).toHaveLength(2));
    await settle(() => result.current.undoLast());

    await waitFor(() => expect(dates(result.current)).toEqual(GAP));
  });

  it('writes one row for two taps before the first write lands', async () => {
    const repository = await seed(habit(), doneExcept(GAP));
    const { result } = await render(repository);

    await settle(async () => {
      await Promise.all([result.current.fill(GAP[1]), result.current.fill(GAP[1])]);
    });

    expect(await repository.getEntries('h1', GAP[1], GAP[1])).toHaveLength(1);
  });

  it('reports a failed write and keeps the date listed and answerable', async () => {
    const repository = await seed(habit(), doneExcept(GAP));
    const { result } = await render(repository);
    jest.spyOn(repository, 'upsertEntry').mockRejectedValueOnce(new Error('offline'));

    await settle(() => result.current.fill(GAP[1]));

    expect(result.current.failure).not.toBeNull();
    expect(result.current.answering).toBe(false);
    expect(dates(result.current)).toEqual(GAP);
  });
});

describe('loading', () => {
  it('reports a habit that does not exist as null', async () => {
    const { result } = await render(await seed(habit()), 'nope');

    expect(result.current.habit).toBeNull();
    expect(result.current.mirror).toEqual([]);
    expect(result.current.options).toEqual([]);
  });
});
