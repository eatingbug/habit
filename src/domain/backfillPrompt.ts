import type { Habit, HabitEntry } from '@/models';

import { TUNING } from '@/config/tuning';

import { dayStates } from './classify';
import { windowEndingAt } from './dates';

/**
 * ADR-0002's recover-first prompt (§6.4) as a pure query.
 *
 * A run of `missed` days is not diagnosed, it is *asked about*. `missed` conflates two
 * opposite worlds — "doing it, not recording it" and "walked away" — and no rule can
 * tell them apart, so attaching a component to a `missed` day would be a guess dressed
 * as a diagnosis. The prompt collects the missing data instead; once the days hold rows
 * the existing four rules work as designed.
 *
 * The answers are written by `./backfill`'s row constructors, which share nothing with
 * this query — hence two modules.
 */

/** The §6.4 prompt as data. Deliberately carries no component/severity/flag: a
 *  `missed` day never produces a diagnosis flag or an attribution (§7.3). */
export interface BackfillPrompt {
  /** ADR-0002 trigger: a long enough `missed` run, or too high a `missed` rate. */
  shouldPrompt: boolean;
  /** The `missed` dates to offer, ascending. Only ever `missed` days in scope. */
  dates: string[];
  /** Longest consecutive `missed` run in the window (out-of-scope days transparent). */
  missedRun: number;
  /** `missed` share of the window's *decided* days — unclassified days are excluded
   *  from both sides of every rate (§7.3), and `pending` is excluded too, as it is
   *  from `successRate` (ADR-0001 §2): the day is not over yet. */
  missedRate: number;
  /** The prompt's own wording — ADR-0002's "이 5일, 하셨나요?". */
  question: string;
}

/**
 * Should reflection open with the recover-first question, and about which days?
 *
 * The window is `TUNING.windows.missedRate` days ending at `today`. Both the run and
 * the rate are measured over `dayStates`, so a paused habit's empty days are absent
 * from the walk entirely: they are neither listed nor counted, and a pause therefore
 * can never conjure this prompt (ADR-0003 §파급 5).
 */
export function backfillPrompt(
  habit: Habit,
  entries: HabitEntry[],
  today: string,
): BackfillPrompt {
  const window = windowEndingAt(today, TUNING.windows.missedRate);
  const days = dayStates(habit, entries, window[0], today, today);

  const dates: string[] = [];
  let missedRun = 0;
  let current = 0;
  for (const day of days) {
    if (day.state === 'missed') {
      dates.push(day.date);
      current += 1;
      missedRun = Math.max(missedRun, current);
    } else {
      current = 0;
    }
  }

  const decided = days.filter((day) => day.state !== 'pending').length;
  const missedRate = decided === 0 ? 0 : dates.length / decided;

  // ADR-0002 comparators: the run fires at the threshold (이상), the rate strictly
  // above it (초과).
  const shouldPrompt =
    missedRun >= TUNING.diagnosis.missedRunForBackfillPrompt ||
    missedRate > TUNING.diagnosis.missedRateForBackfillPrompt;

  return {
    shouldPrompt,
    dates,
    missedRun,
    missedRate,
    question: `이 ${dates.length}일, 하셨나요?`,
  };
}
