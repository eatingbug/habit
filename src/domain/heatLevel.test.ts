import type { Habit, HabitEntry, SkipReason } from '@/models';

import { TUNING } from '@/config/tuning';

import { dayStates } from './classify';
import { addDays } from './dates';
import { heatCells, heatLevel } from './heatLevel';

const TODAY = '2026-03-01';

const COUNT: Habit = {
  id: 'h1',
  name: '팔굽혀펴기',
  statId: 'strength',
  kind: 'count',
  floor: 5,
  floorUnit: 'reps',
  target: 8,
  lifecycle: 'forming',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const BINARY: Habit = {
  id: 'h2',
  name: '명상',
  statId: 'willpower',
  kind: 'binary',
  floor: 1,
  floorUnit: 'time',
  lifecycle: 'forming',
  createdAt: '2026-01-01T00:00:00.000Z',
};

let seq = 0;
function activity(date: string, actual: number): HabitEntry {
  return { id: `a${++seq}`, habitId: 'h1', date, timestamp: `${date}T09:00:00.000Z`, actual };
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

function ago(n: number): string {
  return addDays(TODAY, -n);
}

/** The cell for one date, going through the shared `dayStates` walk. */
function cellFor(habit: Habit, entries: HabitEntry[], date: string) {
  return heatCells(habit, entries, date, date, TODAY)[0];
}

describe('heatLevel — day-states are visually distinguishable (§6.0, ADR-0001 §7)', () => {
  it('renders a binary done day as a full cell', () => {
    const cell = cellFor(BINARY, [activity(ago(1), 1)], ago(1));

    expect(cell).toMatchObject({ tone: 'done', fill: 'filled', level: 4 });
  });

  it('renders a non-exception skip as the miss tone, filled — the reason is known', () => {
    const cell = cellFor(COUNT, [skip(ago(1), 'cue')], ago(1));

    expect(cell).toMatchObject({ tone: 'miss', fill: 'filled', level: 0 });
  });

  it('renders a missed day as the miss tone, outline only — no reason is known', () => {
    const cell = cellFor(COUNT, [], ago(1));

    expect(cell).toMatchObject({ state: 'missed', tone: 'miss', fill: 'outline', level: 0 });
  });

  it('renders an exception skip as neutral, not as a miss', () => {
    const cell = cellFor(COUNT, [skip(ago(1), 'exception')], ago(1));

    expect(cell).toMatchObject({ tone: 'neutral', fill: 'none', level: 0 });
  });

  it('renders today with no rows as neutral pending', () => {
    const cell = cellFor(COUNT, [], TODAY);

    expect(cell).toMatchObject({ state: 'pending', tone: 'neutral', fill: 'none', level: 0 });
  });

  it('renders a partial day in its own sub-floor shade — not the miss tone', () => {
    const cell = cellFor(COUNT, [activity(ago(1), 3)], ago(1));

    expect(cell).toMatchObject({ state: 'partial', tone: 'partial', fill: 'filled', level: 1 });
    expect(cell.tone).not.toBe('miss');
  });

  it('renders an unclassified day (out of scope) as an empty cell (ADR-0003 §6)', () => {
    const paused: Habit = { ...COUNT, pauses: [{ from: ago(6), to: ago(1) }] };
    const cell = cellFor(paused, [], ago(3));

    expect(cell).toMatchObject({ tone: 'empty', fill: 'none', level: 0 });
    expect(cell.state).toBeUndefined();
  });

  it('keeps empty, pending, missed, skip and partial mutually distinguishable', () => {
    const paused: Habit = { ...COUNT, pauses: [{ from: ago(6), to: ago(1) }] };
    const cells = [
      cellFor(paused, [], ago(3)), // unclassified
      cellFor(COUNT, [], TODAY), // pending
      cellFor(COUNT, [], ago(1)), // missed
      cellFor(COUNT, [skip(ago(1), 'cue')], ago(1)), // skip (a miss, reason known)
      cellFor(COUNT, [activity(ago(1), 3)], ago(1)), // partial
    ];

    const signatures = cells.map((c) => `${c.tone}/${c.fill}/${c.level}`);
    expect(new Set(signatures).size).toBe(5);
  });
});

describe('heatLevel — count above-floor ramp', () => {
  function level(sum: number, habit: Habit = COUNT): number {
    return cellFor(habit, [activity(ago(1), sum)], ago(1)).level;
  }

  it('ramps 1 → 4 from sub-floor through floor and above-floor to target', () => {
    expect(level(3)).toBe(1); // partial (sub-floor)
    expect(level(5)).toBe(2); // exactly the floor → done
    expect(level(6)).toBe(3); // above the floor, short of the target
    expect(level(8)).toBe(4); // target met → over
    expect(level(20)).toBe(4); // the ramp saturates; it never exceeds 4
  });

  it('marks the target-met day as the over tone', () => {
    expect(cellFor(COUNT, [activity(ago(1), 8)], ago(1))).toMatchObject({
      state: 'over',
      tone: 'over',
      fill: 'filled',
    });
  });

  it('caps a count habit with no target at the above-floor level — 4 is the target step', () => {
    const noTarget: Habit = { ...COUNT, target: undefined };

    expect(level(5, noTarget)).toBe(2);
    expect(level(50, noTarget)).toBe(3);
  });

  it('ignores a corrupt target <= floor, exactly as classifyDay does', () => {
    const corrupt: Habit = { ...COUNT, target: 3 };

    expect(level(4, corrupt)).toBe(1); // sum < floor → partial, never over
    expect(level(6, corrupt)).toBe(3);
  });
});

describe('heatCells — the dashboard strip', () => {
  it('emits one cell per date in the range, in ascending order, even where dayStates omits a day', () => {
    const paused: Habit = { ...COUNT, pauses: [{ from: ago(6), to: ago(2) }] };
    const cells = heatCells(paused, [], ago(9), TODAY, TODAY);

    expect(cells).toHaveLength(10);
    expect(cells.map((c) => c.date)).toEqual([
      ago(9),
      ago(8),
      ago(7),
      ago(6),
      ago(5),
      ago(4),
      ago(3),
      ago(2),
      ago(1),
      TODAY,
    ]);
    expect(cells.filter((c) => c.tone === 'empty').map((c) => c.date)).toEqual([
      ago(6),
      ago(5),
      ago(4),
      ago(3),
    ]);
  });

  it('agrees with dayStates on every classified day', () => {
    const entries = [activity(ago(2), 9), activity(ago(3), 2), skip(ago(4), 'floor')];
    const cells = heatCells(COUNT, entries, ago(5), TODAY, TODAY);
    const states = dayStates(COUNT, entries, ago(5), TODAY, TODAY);

    expect(cells.map((c) => c.state).filter(Boolean)).toEqual(states.map((d) => d.state));
  });

  it('renders a strip of TUNING.heatmapDays days when spanned that way (§6.1)', () => {
    const from = addDays(TODAY, -(TUNING.heatmapDays - 1));

    expect(heatCells(COUNT, [], from, TODAY, TODAY)).toHaveLength(TUNING.heatmapDays);
  });
});

describe('heatLevel — the single-day mapper', () => {
  it('maps a classified day without re-walking the range', () => {
    const day = dayStates(COUNT, [activity(ago(1), 6)], ago(1), ago(1), TODAY)[0];

    expect(heatLevel(COUNT, day)).toMatchObject({ tone: 'done', fill: 'filled', level: 3 });
  });
});
