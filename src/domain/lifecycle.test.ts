import { evaluateLifecycle } from './lifecycle';
import type { Habit, HabitEntry, EntryState, SkipReason } from '../models';

const TODAY = '2026-06-30';
// windowFrom(TODAY, 30) → { from: '2026-06-01', to: '2026-06-30' }.
// daysBetween(TODAY, '2026-05-31') === 30 (age exactly 30 — the boundary).
// daysBetween(TODAY, '2026-06-01') === 29 (just under 30).

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: 'Pushups',
    statId: 'strength',
    kind: 'count',
    floor: 5,
    floorUnit: 'reps',
    lifecycle: 'forming',
    createdAt: '2026-05-31T08:00:00.000Z', // age 30 at TODAY
    ...overrides,
  };
}

let entryCounter = 0;
function entry(date: string, state: EntryState, skipReason?: SkipReason): HabitEntry {
  entryCounter += 1;
  return {
    id: `e${entryCounter}`,
    habitId: 'h1',
    date,
    timestamp: `${date}T09:00:00.000Z`,
    actual: state === 'skip' ? 0 : 5,
    state,
    ...(skipReason ? { skipReason } : {}),
  };
}

/** Build `count` entries inside the window, `met` of which meet the floor (done), rest are misses (skip/floor). */
function dataset(count: number, met: number): HabitEntry[] {
  const out: HabitEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = `2026-06-${String(i + 1).padStart(2, '0')}`; // all within 2026-06-01..30
    out.push(i < met ? entry(date, 'done') : entry(date, 'skip', 'floor'));
  }
  return out;
}

describe('evaluateLifecycle', () => {
  it('promotes forming → established when age ≥ 30 and rate ≥ 0.80 with real data', () => {
    // 10 entries, 8 met → rate = 0.80 exactly (the threshold).
    const entries = dataset(10, 8);
    expect(evaluateLifecycle(habit(), entries, TODAY)).toBe('established');
  });

  it('rate threshold is inclusive: 0.80 fires, just below 0.80 does not', () => {
    // 15 entries (all fit in the 30-day window), 12 met → rate = 0.80 exactly → established.
    expect(evaluateLifecycle(habit(), dataset(15, 12), TODAY)).toBe('established'); // 0.80
    // 15 entries, 11 met → rate ≈ 0.733 (just below 0.80) → stays forming.
    expect(evaluateLifecycle(habit(), dataset(15, 11), TODAY)).toBe('forming');
  });

  it('stays forming when rate < 0.80', () => {
    const entries = dataset(10, 5); // 0.50
    expect(evaluateLifecycle(habit(), entries, TODAY)).toBe('forming');
  });

  it('demotes established → forming when rate drops below 0.80', () => {
    const established = habit({ lifecycle: 'established' });
    const entries = dataset(10, 5); // 0.50
    expect(evaluateLifecycle(established, entries, TODAY)).toBe('forming');
  });

  it('established stays established while rate ≥ 0.80', () => {
    const established = habit({ lifecycle: 'established' });
    expect(evaluateLifecycle(established, dataset(10, 9), TODAY)).toBe('established');
  });

  it('paused stays paused regardless of entries (sticky — never auto-changes)', () => {
    const paused = habit({ lifecycle: 'paused' });
    // Perfect data that would otherwise promote.
    expect(evaluateLifecycle(paused, dataset(10, 10), TODAY)).toBe('paused');
    // No data.
    expect(evaluateLifecycle(paused, [], TODAY)).toBe('paused');
    // Terrible data that would otherwise demote.
    expect(evaluateLifecycle(paused, dataset(10, 0), TODAY)).toBe('paused');
  });

  it('is not established when age < 30 even at rate 1.0', () => {
    // createdAt '2026-06-01' → age 29 at TODAY.
    const young = habit({ createdAt: '2026-06-01T08:00:00.000Z' });
    const perfect = dataset(10, 10); // rate 1.0
    expect(evaluateLifecycle(young, perfect, TODAY)).toBe('forming');
  });

  it('age boundary is inclusive: age 30 promotes, age 29 does not', () => {
    const perfect = dataset(10, 10);
    expect(evaluateLifecycle(habit({ createdAt: '2026-05-31T08:00:00.000Z' }), perfect, TODAY)).toBe(
      'established',
    ); // age 30
    expect(evaluateLifecycle(habit({ createdAt: '2026-06-01T08:00:00.000Z' }), perfect, TODAY)).toBe(
      'forming',
    ); // age 29
  });

  it('is not established when the window has no non-exception data', () => {
    // No entries at all → empty sample (floorCompletionRate would be 1.0, but guard blocks it).
    expect(evaluateLifecycle(habit(), [], TODAY)).toBe('forming');

    // Only exception skips in window → sample empty after filtering → forming.
    const onlyExceptions = [
      entry('2026-06-10', 'skip', 'exception'),
      entry('2026-06-11', 'skip', 'exception'),
    ];
    expect(evaluateLifecycle(habit(), onlyExceptions, TODAY)).toBe('forming');

    // Entries that all fall OUTSIDE the trailing window → empty sample → forming.
    const stale = [entry('2026-05-15', 'done'), entry('2026-05-20', 'done')];
    expect(evaluateLifecycle(habit(), stale, TODAY)).toBe('forming');
  });

  it('demotes established → forming when its only window data is exception skips', () => {
    const established = habit({ lifecycle: 'established' });
    const onlyExceptions = [entry('2026-06-10', 'skip', 'exception')];
    expect(evaluateLifecycle(established, onlyExceptions, TODAY)).toBe('forming');
  });

  it('exception skips are excluded from the sample but met entries still count', () => {
    // 4 done + 1 exception skip → sample = 4 (all met), rate = 1.0 → established.
    const entries = [
      entry('2026-06-01', 'done'),
      entry('2026-06-02', 'done'),
      entry('2026-06-03', 'done'),
      entry('2026-06-04', 'done'),
      entry('2026-06-05', 'skip', 'exception'),
    ];
    expect(evaluateLifecycle(habit(), entries, TODAY)).toBe('established');
  });
});
