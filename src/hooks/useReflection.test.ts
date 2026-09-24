import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository } from '@/data';
import { addDays } from '@/domain/dates';
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
    return createElement(RepositoryProvider, { repository, children });
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
    // Missed (outline ·) and skip (filled ✕) are both misses; only the latter has a
    // reason — they must never share a mark (Reflection.body.html:32).
    expect(result.current.mirror.map((cell) => cell.mark)).toEqual(['6', '·', '2', '9', '✕', '✕', '오늘']);
    expect(result.current.mirror.map((cell) => cell.weekday)).toEqual([
      '월',
      '화',
      '수',
      '목',
      '금',
      '토',
      '일',
    ]);
  });

  it('marks a binary habit ✓ instead of a number', async () => {
    const days = daysEndingAt(TODAY, 7);
    const repository = await seed(binary(), [activity(days[0], 1), skip(days[1], 'floor')]);
    const { result } = await render(repository);

    expect(result.current.mirror.map((cell) => cell.mark)).toEqual(['✓', '✕', '·', '·', '·', '·', '오늘']);
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
    expect(result.current.mirror[0].mark).toBe('');
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
      { date: days[2], text: '어깨가 뻐근' },
      { date: days[5], text: '야근' },
    ]);
  });
});

describe('diagnosis flags and their evidence (§6.4, AC 2–5)', () => {
  it('shows each flag with its component label, severity, message and evidence', async () => {
    const { subject, entries } = rule4Only();
    const { result } = await render(await seed(subject, entries));

    expect(result.current.flags).toHaveLength(1);
    const [card] = result.current.flags;
    expect(card.flag.component).toBe('cue');
    expect(card.flag.severity).toBe('critical');
    expect(card.componentLabel).toBe('언제 할지');
    expect(card.flag.evidence).toContain('21%');
    expect(card.chart).toBeNull();
  });

  it('draws the weekly totals under a Rule 3 stagnation flag (AC 3)', async () => {
    // Floor exactly met every day for three weeks: solid floor, no growth.
    const entries = daysEndingAt(TODAY, 41).map((date) => activity(date, 5));
    const { result } = await render(await seed(habit(), entries));

    const load = result.current.flags.find((card) => card.flag.component === 'load');
    expect(load?.chart?.bars.map((bar) => bar.total).slice(-3)).toEqual([35, 35, 35]);
  });

  it('turns an Established decline — a 🔴 with no flag — into its own evidence card (AC 3)', async () => {
    const established = habit({ lifecycle: 'established' });
    const entries = [9, 8, 7, 6].map((total, i) => activity(addDays('2026-03-25', -7 * (3 - i)), total));
    const { result } = await render(await seed(established, entries));

    expect(result.current.decline?.totals).toEqual([8, 7, 6]);
    expect(result.current.decline?.evidence).toContain('8 → 7 → 6');
    expect(result.current.decline?.chart).not.toBeNull();
  });

  it('has no decline card on a habit whose light is not the decline arm', async () => {
    const { result } = await render(await seed(habit(), healthy()));

    expect(result.current.decline).toBeNull();
    expect(result.current.flags).toEqual([]);
  });

  it('attributes nothing to a run of missed days — the 🔴 opens onto no diagnosis (AC 5, ADR-0002)', async () => {
    const entries = daysEndingAt(addDays(TODAY, -4), 30).map((date) => activity(date, 6));
    const { result } = await render(await seed(habit(), entries));

    expect(result.current.mirror.slice(3, 6).map((cell) => cell.state)).toEqual([
      'missed',
      'missed',
      'missed',
    ]);
    expect(result.current.flags).toEqual([]);
    expect(result.current.decline).toBeNull();
    expect(result.current.suggested).toBe('keep');
  });
});

describe('the recommended action (§6.4, AC 7, AC 9)', () => {
  it('pre-selects the engine’s suggestion, with its reason', async () => {
    const { subject, entries } = rule4Only();
    const { result } = await render(await seed(subject, entries));

    expect(result.current.suggested).toBe('fill_cue');
    expect(result.current.chosen).toBe('fill_cue');
    const chosen = result.current.options.find((option) => option.action === 'fill_cue');
    expect(chosen?.label).toBe('할 시간 정하기');
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
    const flags = result.current.flags.map((card) => card.flag);

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

    expect(await commit(() => result.current, 'fill_cue', '   ')).not.toBeNull();
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
    expect(before.reflectable).toBe(true);

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

  it('opens with the question on a run of missed days at the threshold (AC 1)', async () => {
    const { result } = await render(await seed(habit(), doneExcept(GAP)));

    expect(result.current.recover).toEqual({ question: '이 3일, 하셨나요?', dates: GAP });
  });

  it('does not open one day short of the threshold (AC 1)', async () => {
    const { result } = await render(await seed(habit(), doneExcept(GAP.slice(1))));

    expect(result.current.recover).toBeNull();
  });

  it('opens on the 14-day missed rate with no run at the threshold (AC 2)', async () => {
    // Every other day of the last 14: seven `missed` days, 7/13 decided days, no run over 1.
    const gap = daysEndingAt(addDays(TODAY, -1), 14).filter((_, i) => i % 2 === 1);
    const { result } = await render(await seed(habit(), doneExcept(gap)));

    expect(result.current.recover?.dates).toEqual(gap);
  });

  it('lists only missed dates on or after the habit’s birth (AC 4)', async () => {
    const born = addDays(TODAY, -3);
    const { result } = await render(
      await seed(habit({ createdAt: `${born}T00:00:00.000Z` }), [skip(addDays(TODAY, -1), 'cue')]),
    );

    expect(result.current.recover?.dates).toEqual([born, addDays(TODAY, -2)]);
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
      const { streak: value } = dashboard.result.current.rows[0];
      dashboard.unmount();
      return value;
    };
    expect(await streak()).toBe(1);

    const { result } = await render(repository);
    for (const date of GAP) await settle(() => result.current.fill(date));

    expect(await streak()).toBe(40);
  });

  it('stays open for the rest of the visit once the run is broken, listing what is left', async () => {
    const { result } = await render(await seed(habit(), doneExcept(GAP)));

    await settle(() => result.current.fill(GAP[1]));

    // The domain alone would no longer prompt: the run is 1 and the rate is 2/13.
    await waitFor(() =>
      expect(result.current.recover).toEqual({
        question: '이 2일, 하셨나요?',
        dates: [GAP[0], GAP[2]],
      }),
    );
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
    expect(result.current.asking).toBe(GAP[0]);
    expect(await repository.getEntries('h1', GAP[0], GAP[0])).toEqual([]);

    await settle(() => result.current.skip(GAP[0], 'floor'));

    const rows = await repository.getEntries('h1', GAP[0], GAP[0]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actual: 0, skipReason: 'floor' });
    expect(Object.keys(rows[0])).not.toContain('state');
    expect(result.current.asking).toBeNull();
    await waitFor(() => expect(result.current.recover?.dates).toEqual(GAP.slice(1)));
  });

  it('brings an undone fill back onto the list', async () => {
    const { result } = await render(await seed(habit(), doneExcept(GAP)));

    await settle(() => result.current.fill(GAP[1]));
    await waitFor(() => expect(result.current.recover?.dates).toHaveLength(2));
    await settle(() => result.current.undoLast());

    await waitFor(() => expect(result.current.recover?.dates).toEqual(GAP));
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
    expect(result.current.recover?.dates).toEqual(GAP);
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
