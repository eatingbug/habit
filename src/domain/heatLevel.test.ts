import type { Habit, HabitEntry, SkipReason } from '@/models';

import { TUNING } from '@/config/tuning';

import { dayStates } from './classify';
import { addDays } from './dates';
import { heatCells } from './heatLevel';

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
    expect(cells.filter((c) => c.state === undefined).map((c) => c.date)).toEqual([
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
