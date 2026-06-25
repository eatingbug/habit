import { heatLevel } from './heatLevel';
import type { Habit, HabitEntry } from '../models';

const countHabit: Pick<Habit, 'kind' | 'floor' | 'target'> = { kind: 'count', floor: 10, target: 30 };
const binaryHabit: Pick<Habit, 'kind' | 'floor' | 'target'> = { kind: 'binary', floor: 1, target: undefined };

function entry(state: HabitEntry['state'], actual: number, skipReason?: HabitEntry['skipReason']): HabitEntry {
  return {
    id: 'e',
    habitId: 'h',
    date: '2026-06-01',
    timestamp: '2026-06-01T12:00:00.000Z',
    actual,
    state,
    ...(skipReason ? { skipReason } : {}),
  };
}

describe('heatLevel — shared', () => {
  it('blank day -> 0', () => expect(heatLevel(undefined, countHabit)).toBe(0));
  it('exception skip -> 0', () => expect(heatLevel(entry('skip', 0, 'exception'), countHabit)).toBe(0));
  it('non-exception skip -> miss', () => expect(heatLevel(entry('skip', 0, 'cue'), countHabit)).toBe('miss'));
});

describe('heatLevel — binary', () => {
  it('done -> 4 (a full cell, no magnitude ramp)', () =>
    expect(heatLevel(entry('done', 1), binaryHabit)).toBe(4));
  it('non-exception skip -> miss', () =>
    expect(heatLevel(entry('skip', 0, 'floor'), binaryHabit)).toBe('miss'));
  it('exception skip -> 0', () =>
    expect(heatLevel(entry('skip', 0, 'exception'), binaryHabit)).toBe(0));
  it('blank -> 0', () => expect(heatLevel(undefined, binaryHabit)).toBe(0));
});

describe('heatLevel — count (regression)', () => {
  it('at floor -> 1', () => expect(heatLevel(entry('done', 10), countHabit)).toBe(1));
  it('over target -> 4', () => expect(heatLevel(entry('over', 30), countHabit)).toBe(4));
  it('two-thirds of the way -> 3', () => expect(heatLevel(entry('done', 24), countHabit)).toBe(3));
  it('partway -> 2', () => expect(heatLevel(entry('done', 18), countHabit)).toBe(2));
});
