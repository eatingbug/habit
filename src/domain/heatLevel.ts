import type { DayState, Habit, HabitEntry } from '@/models';

import { dayStates } from './classify';
import { dateRange } from './dates';

/**
 * Heatmap cells — §6.5 Heatmap.
 *
 * An unclassified day has to read as an empty cell (ADR-0003 §파급 6). That is a domain
 * rule about *what a day means*, so it lives here rather than being re-derived in every
 * screen: this module hands the UI each date and its state, and the screen draws it.
 */

export interface HeatCell {
  date: string;
  /** Absent ⇔ the day is unclassified (pre-`createdAt`, or empty inside a pause). */
  state?: DayState;
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
    return day ? { date, state: day.state } : { date };
  });
}
