import type { Habit, HabitEntry, SkipReason } from '@/models';

import { addDays } from './dates';
import { deleteOutcome } from './deleteEffect';

/**
 * #13 AC 5–6 and #15 AC 9 — what one delete costs.
 *
 * Both callers' cases are asserted here rather than twice over in two hook suites:
 * today (an emptied day falls back to `pending`, no miss and no broken streak,
 * ADR-0001) and a past date (the same delete restores `missed` and cuts the streak).
 */
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

describe('deleteOutcome — the day', () => {
  it('reports the day emptied when the deleted row was its last', () => {
    const row = activity(d(2), 6);
    const outcome = deleteOutcome(COUNT, [...doneRun(2), row], row, d(2));

    expect(outcome.emptiesDay).toBe(true);
    expect(outcome.carriesMiss).toBe(false);
  });

  it('reports the day not emptied while another of its rows survives', () => {
    const first = activity(d(0), 3);
    const second = activity(d(0), 3, '20:00:00');
    const outcome = deleteOutcome(COUNT, [first, second], first, d(0));

    expect(outcome.emptiesDay).toBe(false);
    // 3 + 3 met the floor; 3 alone does not.
    expect(outcome.stateAfter).toBe('partial');
  });

  it('leaves today pending when emptied — today is still open (ADR-0001)', () => {
    const row = activity(d(2), 6);
    expect(deleteOutcome(COUNT, [row], row, d(2)).stateAfter).toBe('pending');
  });

  it('returns a past day to missed when emptied (AC 9)', () => {
    const row = activity(d(1), 6);
    expect(deleteOutcome(COUNT, [row], row, d(3)).stateAfter).toBe('missed');
  });

  it('leaves stateAfter undefined when the emptied day is paused (ADR-0003)', () => {
    const paused: Habit = { ...COUNT, pauses: [{ from: d(1), to: d(3) }] };
    const row = activity(d(1), 6);

    expect(deleteOutcome(paused, [row], row, d(4)).stateAfter).toBeUndefined();
  });
});

describe('deleteOutcome — the erased miss', () => {
  it('warns when the delete erases the day’s recorded miss', () => {
    const row = skip(d(1), 'cue');
    const outcome = deleteOutcome(COUNT, [row], row, d(1));

    expect(outcome.carriesMiss).toBe(true);
  });

  it('warns on a miss-carrying skip even when another row survives', () => {
    // Latest intent wins (§4.1), so the day reads `cue` — a miss. Deleting that row
    // leaves the `exception` skip, which is no miss: the miss really is erased.
    const exception = skip(d(1), 'exception');
    const cue = skip(d(1), 'cue', '10:00:00');
    const outcome = deleteOutcome(COUNT, [exception, cue], cue, d(1));

    expect(outcome.emptiesDay).toBe(false);
    expect(outcome.carriesMiss).toBe(true);
    expect(outcome.stateAfter).toBe('skip');
  });

  it('stays silent when the surviving skip keeps the day a miss', () => {
    const cue = skip(d(1), 'cue');
    const floor = skip(d(1), 'floor', '10:00:00');

    expect(deleteOutcome(COUNT, [cue, floor], cue, d(1)).carriesMiss).toBe(false);
  });

  it('does not warn for an exception skip, which is no miss at all (ADR-0001)', () => {
    const row = skip(d(1), 'exception');
    expect(deleteOutcome(COUNT, [row], row, d(1)).carriesMiss).toBe(false);
  });
});

describe('deleteOutcome — the streak, recomputed on both sides (AC 9)', () => {
  it('reports both sides, not a difference', () => {
    const history = doneRun(5);
    const outcome = deleteOutcome(COUNT, history, history[2], d(4));

    // Deleting day 2 leaves days 3–4 as the run ending today; day 2 is now `missed`.
    expect(outcome.streakBefore).toBe(5);
    expect(outcome.streakAfter).toBe(2);
  });

  it('does not break the run when today’s only row goes — today reads pending (ADR-0001)', () => {
    const history = doneRun(4);
    const outcome = deleteOutcome(COUNT, history, history[3], d(3));

    // Today falls back to `pending`, which is transparent to the streak walk: the run
    // loses today's day and stops there, rather than being cut to 0 by a miss.
    expect(outcome.streakBefore).toBe(4);
    expect(outcome.streakAfter).toBe(3);
  });

  it('cuts the streak when a surviving row drops the day below its floor', () => {
    const history = [...doneRun(2), activity(d(2), 3), activity(d(2), 3, '20:00:00')];
    const outcome = deleteOutcome(COUNT, history, history[3], d(2));

    // Nothing is emptied and no miss is erased, but the day falls to `partial` — which
    // is transparent, so the run ending today is the two days before it.
    expect(outcome.emptiesDay).toBe(false);
    expect(outcome.carriesMiss).toBe(false);
    expect(outcome.streakBefore).toBe(3);
    expect(outcome.streakAfter).toBe(2);
  });

  it('does not count a paused stretch against the streak (ADR-0003)', () => {
    const paused: Habit = { ...COUNT, pauses: [{ from: d(2), to: d(4) }] };
    const history = [...doneRun(2), ...doneRun(2, 4)];
    const outcome = deleteOutcome(paused, history, history[2], d(5));

    // The pause is transparent, so days 0–1 and 4–5 form one run of four. Deleting
    // day 4's row makes that day `missed`, which breaks the run: only day 5 is left.
    expect(outcome.streakBefore).toBe(4);
    expect(outcome.streakAfter).toBe(1);
  });
});
