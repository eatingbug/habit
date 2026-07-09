/**
 * theme/heatLevel.ts — UI helper mapping a computed DayRecord to a heatmap day-state.
 *
 * This is a PRESENTATION concern, not domain logic, so it lives in theme/ (not src/domain).
 * Facts-only: the cell reflects the day's COMPUTED state (classifyDay), never a stored
 * per-row state. Five flat buckets (SPEC §6.0 / §6.1) — above-floor intensity is surfaced
 * in the growth chart, not shaded into the heatmap:
 *
 *   'blank'   — no rows (unknown) or an exception skip (excused; never a miss)
 *   'partial' — activity below the floor (distinct from blank and from skip)
 *   'done'    — floor met
 *   'over'    — target met (implies done)
 *   'skip'    — a diagnostic miss (non-exception skip)
 *
 * The color for each state is chosen by the consumer (habitviz) from the active theme.
 */
import type { DayRecord } from '../domain/util';

export type HeatState = 'blank' | 'partial' | 'done' | 'over' | 'skip';

export function heatLevel(rec: DayRecord | undefined): HeatState {
  if (!rec || rec.state === 'unknown') return 'blank';
  if (rec.state === 'skip') return rec.effectiveSkipReason === 'exception' ? 'blank' : 'skip';
  return rec.state; // 'partial' | 'done' | 'over'
}
