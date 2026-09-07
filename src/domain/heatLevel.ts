import type { DayState, Habit, HabitEntry } from '@/models';

import type { ClassifiedDay } from './classify';
import { dayStates } from './classify';
import { dateRange } from './dates';

/**
 * Heatmap cell rendering — §6.0 / §6.1 / §6.4 mirror.
 *
 * The heatmap has to keep `pending` ≠ `missed` ≠ `partial` ≠ `skip` legible in both
 * themes (ADR-0001 §파급 7), and an unclassified day has to read as an empty cell
 * (ADR-0003 §파급 6). That is a domain rule about *what a day means*, so it lives
 * here rather than being re-derived in every screen: this module hands the UI data,
 * and the screen picks concrete colours from `src/theme/tokens.ts`.
 */

/** Which hue family the cell belongs to. Maps 1:1 onto `Palette` keys. */
export type HeatTone = 'empty' | 'neutral' | 'miss' | 'partial' | 'done' | 'over';

/**
 * How the hue is applied. The load-bearing case is `miss`: `missed` and `skip` share
 * the miss hue and are told apart by outline vs. fill — outline for "no reason known",
 * fill for "the user said why" (ADR-0001 §파급 7).
 */
export type HeatFill = 'none' | 'outline' | 'filled';

/**
 * Achievement intensity, 0–4, for the above-floor ramp (§7.1 `heatLevel.test.ts`):
 * 0 nothing achieved · 1 sub-floor (`partial`) · 2 floor met · 3 above the floor ·
 * 4 target met (`over`) or a binary `done`, whose floor *is* the whole thing.
 */
export type HeatIntensity = 0 | 1 | 2 | 3 | 4;

export interface HeatCell {
  date: string;
  /** Absent ⇔ the day is unclassified (pre-`createdAt`, or empty inside a pause). */
  state?: DayState;
  tone: HeatTone;
  fill: HeatFill;
  level: HeatIntensity;
}

/** The empty cell an out-of-scope date renders as (ADR-0003 §파급 6). */
function emptyCell(date: string): HeatCell {
  return { date, tone: 'empty', fill: 'none', level: 0 };
}

/**
 * One classified day → one rendering instruction.
 *
 * `skip` reads its fill from `day.isMiss` rather than re-testing the reason, so an
 * `exception` skip can never drift away from `isMissDay` (§4.1): an exception is not
 * a miss, so it must not paint as failure.
 */
export function heatLevel(habit: Habit, day: ClassifiedDay): HeatCell {
  const base = { date: day.date, state: day.state };

  switch (day.state) {
    case 'pending':
      return { ...base, tone: 'neutral', fill: 'none', level: 0 };
    case 'missed':
      return { ...base, tone: 'miss', fill: 'outline', level: 0 };
    case 'skip':
      return day.isMiss
        ? { ...base, tone: 'miss', fill: 'filled', level: 0 }
        : { ...base, tone: 'neutral', fill: 'none', level: 0 };
    case 'partial':
      return { ...base, tone: 'partial', fill: 'filled', level: 1 };
    case 'over':
      return { ...base, tone: 'over', fill: 'filled', level: 4 };
    case 'done':
      return { ...base, tone: 'done', fill: 'filled', level: doneLevel(habit, day.sum) };
  }
}

/**
 * The count ramp inside a floor-met day: exactly the floor is 2, anything above it 3.
 * `over` already took 4, so a count habit with no (usable) target tops out at 3 — the
 * top step is reserved for "cleared the target you set". A binary `done` gets 4
 * because its floor is the whole habit and it has no ramp to climb.
 */
function doneLevel(habit: Habit, sum: number): HeatIntensity {
  if (habit.kind !== 'count') return 4;
  return sum > habit.floor ? 3 : 2;
}

/**
 * A strip of cells, one per date in `[from, to]` inclusive and ascending.
 *
 * `dayStates` omits out-of-scope empty days, but the heatmap is a calendar strip and
 * must not lose alignment — so the omitted dates come back here as empty cells. Pass
 * `TUNING.heatmapDays` worth of range for the Dashboard row (§6.1).
 */
export function heatCells(
  habit: Habit,
  entries: HabitEntry[],
  from: string,
  to: string,
  today: string,
): HeatCell[] {
  const classified = new Map(
    dayStates(habit, entries, from, to, today).map((day) => [day.date, day]),
  );

  return dateRange(from, to).map((date) => {
    const day = classified.get(date);
    return day ? heatLevel(habit, day) : emptyCell(date);
  });
}
