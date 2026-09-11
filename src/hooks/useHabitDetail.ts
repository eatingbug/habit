import { useEffect, useState } from 'react';

import { TUNING } from '@/config/tuning';
import { useRepository } from '@/context/RepositoryContext';
import { isBackfillableDate, isBackfilledRow } from '@/domain/backfill';
import { dayStates, type ClassifiedDay } from '@/domain/classify';
import { dateOf, daysBetween, windowEndingAt } from '@/domain/dates';
import { deleteOutcome, type DeleteOutcome } from '@/domain/deleteEffect';
import { heatCells, type HeatCell } from '@/domain/heatLevel';
import { successRate } from '@/domain/rates';
import { computeStreak, showedUpDays } from '@/domain/streak';
import { weeklyActualTotals } from '@/domain/weekly';
import { localNoonOn, localToday } from '@/lib/device';
import type { DayState, Habit, HabitEntry, SkipReason, Stat } from '@/models';

import { logAffordances, useQuickLog, type LogAffordances, type QuickLogToast } from './useQuickLog';

/**
 * The habit detail screen's data path — SPEC §6.3.
 *
 * The hook is the ticket's test seam (jest.config.js: hooks + an in-memory repository,
 * `testMatch` is `<rootDir>/src/**`, and there are no component render tests). So
 * **every judgment the screen makes lives here** — bar heights and reference-line
 * positions as 0–100 numbers, which week wears the ⭐, which panel comes first, which
 * journal rows may have their time re-stamped, whether a delete deserves a confirm. A
 * condition written in `app/habit/[id].tsx` is a condition nothing asserts; the screen
 * applies *words* to these fields and decides nothing.
 *
 * Two parameters are injected for the usual reasons: `today` decides `pending` vs
 * `missed` (ADR-0001) and bounds every window, and `now` stamps a row's `timestamp`,
 * the domain's ordering key (§3.3). `new Date()` is read only at the UI edge, in this
 * file's defaults.
 *
 * **Nothing here stores a day's state.** The journal, the chart, the pills and the
 * heatmap are all recomputed from the rows on each load, which is why backfilling a
 * past date repairs it for free and deleting its last row un-repairs it (ADR-0001).
 */

/** The two stat pills the canvas keeps on this screen (`HabitDetail.body.html:10`/`:12`). */
export interface DetailPills {
  /** Consecutive floor-met days ending today (§4.2). */
  streak: number;
  /**
   * The number the **user** sees — `successRate` over `TUNING.windows.floorRate` days
   * (§4.4). `null` is the §4.4 min-sample guard: too few resolved days to say anything,
   * which the canvas's `82%` slot then reads as `—` rather than as a low score.
   *
   * `successRate`, not `floorCompletionRate`: the canvas labels this pill 성공률, and
   * `rates.ts` names `successRate` as the user-facing number and `floorCompletionRate`
   * as the one the diagnosis reads. A pill labelled 성공률 showing the diagnosis's
   * number would be a label that lies.
   */
  successRate: number | null;
}

/** One row of one journal day — a stored `HabitEntry` plus what may be done to it. */
export interface JournalRow {
  entry: HabitEntry;
  /**
   * Does this row carry the §6.3 noon pin — was it written by a backfill? Read off the
   * row's own date, never off the day being shown, so a row genuinely logged at 09:00
   * reads 09:00 (#14 D2).
   */
  backfilled: boolean;
  /**
   * May the user re-stamp this row's time? Not on a backfilled row: the noon pin *is*
   * that day's ordering basis (§6.3, §7.3), and rewriting it would reorder rows the
   * pin placed. Amount and note stay editable either way.
   *
   * A row logged by hand at exactly local noon is indistinguishable from a backfill and
   * loses its time reveal here too — see `isBackfilledRow`, which owns that limitation.
   * Telling them apart would take a stored discriminator on `HabitEntry`, which this
   * codebase does not add (ADR-0001: compute, don't store).
   */
  timeEditable: boolean;
}

/**
 * One day of the journal. The journal is a **date walk**, not a row walk: a past day
 * holding no rows still gets a line — `기록 없음 · 실패` — and can be filled from it
 * (canvas `HabitDetail.body.html:50`). Iterating stored rows would lose exactly the
 * days the screen exists to repair.
 */
export interface JournalDay {
  date: string;
  /**
   * Is this day `today`? The delete confirm names the day it changes, and calling
   * today `3월 29일` is exactly what `copy.ts`'s `오늘` default exists to avoid. The
   * condition is derived here; the screen picks the word.
   */
  isToday: boolean;
  /** The day's computed state — the chip's text key (§4.1, canvas `:46–50`). */
  state: DayState;
  /** The day's summed activity. */
  sum: number;
  /** Present only on an only-skip day — the chip's `못 함 · <사유>` half. */
  skipReason?: SkipReason;
  /**
   * The amount the chip says the day added up to (`성공 · 모두 5`). Absent on a binary
   * habit, which has no quantity to report (`함` / `안 함 · <사유>`), and on a day with
   * no activity at all.
   */
  chipAmount?: number;
  /** The day's rows, in the domain total order (§7.3). */
  rows: JournalRow[];
  /**
   * Show the recovery line (`지금 채워 넣으면 이 날이 회복됩니다`)? Only on `missed` —
   * a day with no rows at all. A `partial` is **not** a miss (CONTEXT glossary) and a
   * `skip` already carries the user's own reason, so neither is offered repair copy.
   */
  recoverable: boolean;
  /** May a row be appended to this date at all? (§6.3 range, `isBackfillableDate`.) */
  backfillable: boolean;
}

/** One bar of the growth chart. `height` is a percentage of the chart's scale. */
export interface GrowthBar {
  /** The week's summed actual (§4.6 C4). */
  total: number;
  /** 0–100. */
  height: number;
  /** 0 = the week `today` falls in, 1 = the week before it, … (the canvas's `이번`/`1`). */
  weeksAgo: number;
  /** The ⭐ week — the highest total, most recent on a tie, never a week of 0. */
  best: boolean;
}

/**
 * The weekly growth panel (§6.3 C4) as **geometry**: every number the screen needs is
 * already a percentage of one shared scale, so a reference line can never fall outside
 * the chart it annotates.
 */
export interface GrowthChart {
  /** Oldest first, `TUNING.growthChartWeeks` of them, fixed length (§4.6 C4). */
  bars: GrowthBar[];
  /** The weekly floor line's height, 0–100. */
  floorLine: number;
  /** The weekly target line's height, or `null` when no target is drawn. */
  targetLine: number | null;
  /** `floor × 7` — the week's worth of minimums the line stands for. */
  weeklyFloor: number;
  /**
   * `target × 7`, or `null` when the habit has no **effective** target: a `target`
   * absent, or `<= floor`, says nothing and is read as no target at all (§4.1's
   * defensive read). No line is drawn for it.
   */
  weeklyTarget: number | null;
  /** The best week's total — the canvas's `최고 70`. 0 when nothing was ever recorded. */
  best: number;
  /**
   * The week `today` falls in — the last bucket, and the canvas's `이번 주 37`
   * (`Established.body.html:17`). A running total: the week is not over.
   */
  thisWeek: number;
}

/**
 * The Forming expectation panel (§6.3 C7b). Progress is **repetitions**, never the
 * calendar: a shaky stretch has to read as "still forming", not "failing".
 */
export interface FormingExpectation {
  /** Engaged days since the habit was born — `showedUpDays` (§4.3 C3). Unclamped. */
  days: number;
  /** `TUNING.formingExpectationDays` — Lally's ~66. */
  expectedDays: number;
  /** `days / expectedDays`, **clamped to 1** so the bar cannot overflow past day 66. */
  ratio: number;
}

/** The design box's current hypothesis (§6.3, AC 8). */
export interface DesignBox {
  cue?: string;
  identity?: string;
  floor: number;
  floorUnit: string;
  target?: number;
  /**
   * Does the edit form show the 최소량/목표 inputs? False for a binary habit, whose
   * floor is always 1 and which may hold no target (§3.2) — its 최소량 row reads
   * `없음 — 했다 / 안 했다` instead (AC 8, canvas `YesNo.body.html:46`).
   */
  editsAmounts: boolean;
}

/**
 * A design edit. An **absent** field leaves the stored value alone; `null` (or a blank
 * string) clears it. The two are distinguished because a form that only offers 언제 and
 * 이유 must not silently erase a floor it never showed.
 */
export interface DesignPatch {
  cue?: string | null;
  identity?: string | null;
  /** Ignored on a binary habit — its floor is always 1 (§3.2). */
  floor?: number;
  floorUnit?: string;
  /** Ignored on a binary habit. `null` clears the target. */
  target?: number | null;
}

/** Per-field messages, keyed as the form's fields are. Empty ⇒ the patch is legal. */
export interface DesignErrors {
  floor?: string;
  floorUnit?: string;
  target?: string;
}

/**
 * What deleting one journal row costs, plus the two things the domain cannot know: the
 * habit the confirm names, and whether this screen should say a streak breaks.
 */
export interface DetailDeleteEffect extends DeleteOutcome {
  habit: Habit;
  entry: HabitEntry;
  /**
   * Say the streak figures (`연속 20일 → 4일`)? Only on a **past** date whose streak
   * actually changes. Today is excluded because an emptied today falls back to
   * `pending`, which breaks nothing (ADR-0001) — the same reason `app/today.tsx` shows
   * no streak line at all.
   *
   * Wider than "the day's last row", deliberately: deleting one of two activity rows
   * can drop a past day from `done` to `partial`, which empties nothing and erases no
   * miss, yet cuts the run just the same. The honest condition is the change itself.
   */
  showsStreak: boolean;
}

/**
 * Which panels the screen stacks, in order (D6).
 *
 * `established` puts the growth chart **above** the pills (`Established.body.html`):
 * once not-missing is nearly automatic, the question worth answering first is whether
 * the amount is still growing. `lifecycle` is a stored field, so this needs no status
 * light and does not wait on #20.
 */
export type DetailPanel = 'pills' | 'heatmap' | 'forming' | 'chart' | 'design' | 'journal';

export interface HabitDetailView {
  loading: boolean;
  /** `null` when the id names no stored habit — the screen says so and shows nothing. */
  habit: Habit | null;
  /** Absent when `habit.statId` names no configured stat — a data defect, not a state. */
  stat?: Stat;
  pills: DetailPills;
  /** The panels to render, in order. A panel with nothing to say is simply absent. */
  panelOrder: DetailPanel[];
  /**
   * The habit's **whole life** — `createdAt` through today, one line per date, newest
   * first (§6.3). Not the chart's twelve weeks: §6.3's backfill range is `createdAt`
   * 부터 오늘까지 and a day's own journal line is the only gesture that reaches an
   * **arbitrary** date — the ribbon is a read-only strip (its cells are far under
   * `TAP_TARGET`, `src/theme/tokens.ts:116`), and `nextBackfillDate` names one date,
   * the most recent gap. So a shorter walk would leave an older gap unreachable.
   * §7.3 rules volume/performance out as a V1 criterion; its stated reason is
   * rows-per-date, so it bounds the work per line rather than licensing the number of
   * lines — the walk's length is this hook's own call, and V1's histories are months.
   */
  journal: JournalDay[];
  /**
   * The date the `+ 지난 날 기록 추가` button fills (canvas `HabitDetail.body.html:53`):
   * the **most recent `missed` day** of the whole history, or `null` when there is
   * none — and then the screen shows no button, because there is no gap to fill.
   *
   * The most recent gap, not yesterday and not a picker: Today's own 어제 fast-path
   * (#14) already covers the newest day, so this button exists for what is left behind
   * it. A `missed` day is by construction in scope and before today, so it is always
   * inside the §6.3 backfill range.
   */
  nextBackfillDate: string | null;
  /**
   * `TUNING.heatmapDays` cells ending today, ascending — the ribbon the screen draws
   * (D14). Read-only, as the canvas's own ribbon is (`YesNo.body.html:31`,
   * `aria-hidden`): a cell is far under `TAP_TARGET` (`src/theme/tokens.ts:116`), so
   * the gesture that fills a past day is the journal's line for that date, not a cell.
   */
  heatmap: HeatCell[];
  /**
   * `null` for a binary habit: there is no quantity, so "how much per week" has no
   * meaning and the canvas `YesNo.body.html` draws no such chart (D5).
   */
  chart: GrowthChart | null;
  /** `null` unless `lifecycle === 'forming'`. */
  forming: FormingExpectation | null;
  design: DesignBox | null;
  /**
   * The date whose backfill composer is open, or `null`. Opening one is what a
   * journal day's line and the `+ 지난 날 기록 추가` button do; every write below goes
   * to this date, under the §6.3 rules (noon pin, increasing offsets, blocked before
   * birth and after today).
   */
  backfillDate: string | null;
  /**
   * What the open composer's date affords, read the way both other logging surfaces
   * read their day's — `null` when no composer is open. §4.1's precedence is the
   * point (`skippable`, the field the composer gates on): a date already
   * holding an activity row is not `skippable`, because a skip row written there
   * changes no state, no miss and no diagnosis, so the composer must not offer the
   * reason chips at all (`app/today.tsx`, `app/index.tsx` withhold theirs on the same
   * field).
   */
  composerAffordances: LogAffordances | null;
  /** Ignores a date the §6.3 range forbids, so a stale cell cannot open a bad composer. */
  openBackfill(date: string): void;
  closeBackfill(): void;
  /**
   * Append an activity row to `backfillDate` (or to today when no composer is open).
   * Defaults to the habit's floor — the one-tap "채우기" amount, and exactly "mark
   * done" for a binary habit, whose floor is 1 (§6.3).
   */
  fillDay(actual?: number): Promise<void>;
  /** Append a reason-bearing skip row to the same date (§6.3, ADR-0001). */
  skipDay(reason: SkipReason, opts?: { note?: string }): Promise<void>;
  /** Rewrite one journal row (§6.2 / #13). The caller passes the **whole** row. */
  editEntry(entry: HabitEntry): Promise<void>;
  /** Delete one journal row by id (#13 AC 4). */
  removeEntry(entryId: string): Promise<void>;
  /**
   * Does deleting this row need a result-aware confirm, and on what basis? `null`
   * means no — delete it immediately (#13 AC 4), and also the answer for an id no row
   * of this habit's loaded history carries.
   */
  deletePreview(entryId: string): DetailDeleteEffect | null;
  /**
   * Write the design box (AC 8). Resolves to per-field messages when the patch is
   * illegal and **nothing is written**, or to `null` when it is stored.
   */
  saveDesign(patch: DesignPatch): Promise<DesignErrors | null>;
  toast: QuickLogToast | null;
  undoLast(): Promise<void>;
}

/** The habit's effective target: count only, strictly above the floor (§3.2 / §4.1). */
function effectiveTarget(habit: Habit): number | undefined {
  if (habit.kind !== 'count') return undefined;
  if (habit.target == null || habit.target <= habit.floor) return undefined;
  return habit.target;
}

function journalDay(habit: Habit, day: ClassifiedDay, today: string): JournalDay {
  return {
    date: day.date,
    isToday: day.date === today,
    state: day.state,
    sum: day.sum,
    skipReason: day.skipReason,
    chipAmount: habit.kind === 'count' && day.sum > 0 ? day.sum : undefined,
    rows: day.entries.map((entry) => {
      // On today there is nothing to have backfilled, and a row logged by hand at
      // 12:00 sharp would otherwise be labelled — and frozen — as one.
      const backfilled = entry.date !== today && isBackfilledRow(entry, localNoonOn(entry.date));
      return { entry, backfilled, timeEditable: !backfilled };
    }),
    recoverable: day.state === 'missed',
    backfillable: isBackfillableDate(habit, day.date, today),
  };
}

function growthChart(habit: Habit, entries: HabitEntry[], today: string): GrowthChart | null {
  if (habit.kind !== 'count') return null;

  const totals = weeklyActualTotals(entries, habit, today, TUNING.growthChartWeeks);
  const target = effectiveTarget(habit);
  const weeklyFloor = habit.floor * 7;
  const weeklyTarget = target == null ? null : target * 7;

  // The scale covers the lines as well as the bars, so a reference line can never be
  // drawn outside the chart it annotates. `floor >= 1` (§3.2) keeps it positive.
  const scale = Math.max(...totals, weeklyFloor, weeklyTarget ?? 0);
  const percent = (value: number): number => (scale > 0 ? (value / scale) * 100 : 0);

  const best = Math.max(...totals);
  // Most recent on a tie, and no ⭐ at all on an all-zero history: a "best week" of
  // nothing recorded is not an achievement to mark.
  const bestIndex = best > 0 ? totals.lastIndexOf(best) : -1;

  return {
    bars: totals.map((total, index) => ({
      total,
      height: percent(total),
      weeksAgo: totals.length - 1 - index,
      best: index === bestIndex,
    })),
    floorLine: percent(weeklyFloor),
    targetLine: weeklyTarget == null ? null : percent(weeklyTarget),
    weeklyFloor,
    weeklyTarget,
    best,
    thisWeek: totals[totals.length - 1],
  };
}

function formingExpectation(
  habit: Habit,
  entries: HabitEntry[],
  today: string,
): FormingExpectation | null {
  if (habit.lifecycle !== 'forming') return null;

  // The habit's whole life, so the count is cumulative repetitions rather than a
  // rolling window: C7b measures how many times the behaviour has actually happened.
  const lifetime = daysBetween(dateOf(habit.createdAt), today) + 1;
  const days = showedUpDays(entries, habit, today, lifetime);
  const expectedDays = TUNING.formingExpectationDays;

  return { days, expectedDays, ratio: Math.min(1, days / expectedDays) };
}

function panelsFor(habit: Habit, hasChart: boolean, hasForming: boolean): DetailPanel[] {
  const chartFirst = habit.lifecycle === 'established' && hasChart;

  return [
    chartFirst ? 'chart' : null,
    'pills',
    'heatmap',
    hasForming ? 'forming' : null,
    !chartFirst && hasChart ? 'chart' : null,
    'design',
    'journal',
  ].filter((panel): panel is DetailPanel => panel != null);
}

/** A patched text field: blank and `null` both clear it, absent leaves it alone. */
function patchedText(current: string | undefined, next: string | null | undefined): string | undefined {
  if (next === undefined) return current;
  const trimmed = next?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : undefined;
}

interface Loaded {
  habit: Habit | null;
  /** The habit's rows from its birth through today — the range `computeStreak` walks. */
  entries: HabitEntry[];
}

const EMPTY: Loaded = { habit: null, entries: [] };

export function useHabitDetail(
  habitId: string,
  {
    today = localToday(),
    now = () => new Date(),
  }: { today?: string; now?: () => Date } = {},
): HabitDetailView {
  const repository = useRepository();
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [backfillDate, setBackfillDate] = useState<string | null>(null);
  /**
   * Bumped by a write, so the load effect is the single place that reads. `loading` is
   * raised only for the first load, never for a reload — as on the other two screens:
   * filling a past day must not blank the journal it just changed.
   */
  const [version, setVersion] = useState(0);

  function reload() {
    setVersion((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const habit = await repository.getHabit(habitId);
      // From birth, not from the journal window: `computeStreak` and `deleteOutcome`
      // walk back to `createdAt`, and a clipped range would report a run the user
      // never had. V1 keeps entry volume small and §7.3 makes performance a
      // non-criterion.
      const entries =
        habit == null
          ? []
          : await repository.getEntries(habit.id, dateOf(habit.createdAt), today);

      if (!cancelled) {
        setLoaded({ habit, entries });
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [repository, habitId, today, version]);

  const { habit, entries } = loaded;

  const quick = useQuickLog({
    // With no composer open the writes go to today, which is not a backfill — so the
    // §6.3 rules apply exactly when a past date is being filled.
    date: backfillDate ?? today,
    today,
    now,
    onChange: reload,
  });

  const journal =
    habit == null
      ? []
      : dayStates(habit, entries, dateOf(habit.createdAt), today, today)
          .map((day) => journalDay(habit, day, today))
          // Newest first — the canvas reads downward from the most recent day.
          .reverse();
  const chart = habit == null ? null : growthChart(habit, entries, today);
  const forming = habit == null ? null : formingExpectation(habit, entries, today);
  const heatWindow = windowEndingAt(today, TUNING.heatmapDays);

  function openBackfill(date: string): void {
    if (habit == null || !isBackfillableDate(habit, date, today)) return;
    setBackfillDate(date);
  }

  async function fillDay(actual?: number): Promise<void> {
    if (habit == null) throw new Error('useHabitDetail.fillDay: 습관을 아직 불러오지 못했습니다');
    // Binary has no amount: its floor is 1 and a row is always `actual: 1` (§3.3).
    await quick.logActivity(habit, habit.kind === 'count' ? (actual ?? habit.floor) : 1);
  }

  async function skipDay(reason: SkipReason, opts?: { note?: string }): Promise<void> {
    if (habit == null) throw new Error('useHabitDetail.skipDay: 습관을 아직 불러오지 못했습니다');
    await quick.logSkip(habit, reason, opts);
  }

  function deletePreview(entryId: string): DetailDeleteEffect | null {
    const entry = entries.find((row) => row.id === entryId);
    if (habit == null || entry == null) return null;

    const outcome = deleteOutcome(habit, entries, entry, today);
    const showsStreak = entry.date !== today && outcome.streakAfter < outcome.streakBefore;

    // The gate is this screen's, not the domain's: the journal warns on one more
    // consequence than Today does, because it holds the past dates on which a streak
    // can actually break (AC 9).
    if (!outcome.emptiesDay && !outcome.carriesMiss && !showsStreak) return null;

    return { habit, entry, showsStreak, ...outcome };
  }

  async function saveDesign(patch: DesignPatch): Promise<DesignErrors | null> {
    if (habit == null) {
      throw new Error('useHabitDetail.saveDesign: 습관을 아직 불러오지 못했습니다');
    }

    const amounts = habit.kind === 'count';
    const floor = amounts ? (patch.floor ?? habit.floor) : habit.floor;
    const floorUnit = amounts ? (patch.floorUnit ?? habit.floorUnit).trim() : habit.floorUnit;
    const target = amounts
      ? patch.target === undefined
        ? habit.target
        : (patch.target ?? undefined)
      : undefined;

    // The same three rules `app/habit/new.tsx` applies at creation, because a habit
    // that violates §3.2 is a data defect wherever it is written from. Messages are
    // that form's, so one wording serves both.
    const errors: DesignErrors = {};
    if (!Number.isFinite(floor) || floor < 1) {
      errors.floor = '최소량은 1 이상의 숫자로 적어 주세요.';
    }
    if (floorUnit.length === 0) errors.floorUnit = '단위를 적어 주세요 (예: 회, 쪽, 분).';
    if (target != null) {
      if (!Number.isFinite(target)) errors.target = '목표는 숫자로 적어 주세요.';
      // §3.2 (strict): a target at or below the floor says nothing, and `over` could
      // never be reached above it.
      else if (errors.floor == null && target <= floor) {
        errors.target = '목표는 최소량보다 커야 합니다.';
      }
    }
    if (Object.keys(errors).length > 0) return errors;

    await repository.upsertHabit({
      ...habit,
      cue: patchedText(habit.cue, patch.cue),
      identity: patchedText(habit.identity, patch.identity),
      floor,
      floorUnit,
      target,
    });
    reload();
    return null;
  }

  return {
    loading,
    habit,
    stat: habit == null ? undefined : TUNING.stats.find((s) => s.id === habit.statId),
    pills: {
      streak: habit == null ? 0 : computeStreak(entries, habit, today),
      successRate:
        habit == null ? null : successRate(entries, habit, today, TUNING.windows.floorRate),
    },
    panelOrder: habit == null ? [] : panelsFor(habit, chart != null, forming != null),
    journal,
    // The journal is already newest-first and covers the whole history, so the first
    // `missed` day in it is the most recent one.
    nextBackfillDate: journal.find((day) => day.state === 'missed')?.date ?? null,
    heatmap:
      habit == null
        ? []
        : heatCells(habit, entries, heatWindow[0], heatWindow[heatWindow.length - 1], today),
    chart,
    forming,
    design:
      habit == null
        ? null
        : {
            cue: habit.cue,
            identity: habit.identity,
            floor: habit.floor,
            floorUnit: habit.floorUnit,
            target: effectiveTarget(habit),
            editsAmounts: habit.kind === 'count',
          },
    backfillDate,
    composerAffordances:
      habit == null || backfillDate == null
        ? null
        : logAffordances(habit, dayStates(habit, entries, backfillDate, backfillDate, today)[0]),
    openBackfill,
    closeBackfill: () => setBackfillDate(null),
    fillDay,
    skipDay,
    editEntry: quick.editEntry,
    removeEntry: quick.removeEntry,
    deletePreview,
    saveDesign,
    toast: quick.toast,
    undoLast: quick.undoLast,
  };
}
