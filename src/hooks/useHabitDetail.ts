import { useEffect, useState } from 'react';

import {
  dailyAmountLabel,
  DAY_WORDS,
  dayCellLabel,
  dayStateBadge,
  daysLabel,
  deleteConfirmLines,
  DAY_STATE_WORDS,
  DETAIL_COPY,
  editTimeLabel,
  expectedDaysLabel,
  floorLineLabel,
  habitIcon,
  journalDayTitle,
  journalRowSummary,
  LIFECYCLE_LABELS,
  LIFECYCLE_NOTE,
  LOAD_FAILED_NOTE,
  longDateLabel,
  monthDayLabel,
  nextStepLine,
  SAVE_FAILED_NOTE,
  SCREEN_WORDS,
  statLabel,
  targetLineLabel,
  TODAY_COPY,
  TOOLTIPS,
  weeklyTotalLabel,
  weeksAgoLabel,
  WEEKDAY_LABELS,
} from '@/config/copy';
import { TUNING } from '@/config/tuning';
import { useRepository } from '@/context/RepositoryContext';
import { isBackfillableDate, isBackfilledRow } from '@/domain/backfill';
import { dayStates, isFloorMet, type ClassifiedDay } from '@/domain/classify';
import { addDays, dateOf, daysBetween, weekdayOf, windowEndingAt } from '@/domain/dates';
import { deleteOutcome, type DeleteOutcome } from '@/domain/deleteEffect';
import { heatCells } from '@/domain/heatLevel';
import { archiveHabit, pauseHabit, resumeHabit } from '@/domain/lifecycle';
import { successRate } from '@/domain/rates';
import { deriveStatusLight, type StatusLight } from '@/domain/statusLight';
import { computeStreak, engagementStreak, longestStreak, showedUpDays } from '@/domain/streak';
import { weeklyActualTotals } from '@/domain/weekly';
import { localClock, localNoonOn, localToday } from '@/lib/device';
import type { DayState, Habit, HabitEntry, SkipReason, Stat } from '@/models';

import { useFailure, type Failure } from './failure';
import { logAffordances, useQuickLog, type QuickLogToast, type StreakCelebration } from './useQuickLog';
import {
  labelOf,
  recordFromSheet as writeRecord,
  recordSheetView,
  skipFromSheet as writeSkip,
  skipSheetView,
  type RecordSheetView,
  type SkipSheetView,
} from './recordSheet';
import { draftedEntry, type EditEntrySheetView, type EntryDraft } from './useToday';

/**
 * The Habit Detail screen's data path — SPEC §6.5, the `ReDetail*` artboards (#128).
 *
 * The hook is the screen's test seam (jest.config.js: hooks + an in-memory repository,
 * no component render tests). So **every judgment and every word the screen shows
 * lives here**: which pills show, the hero card's kind and its lines, the heatmap's
 * weekday row, each journal day's head, the design card's rows, the ⋯ menu's items and
 * the one sheet that is open. The screen applies these fields and decides nothing.
 *
 * Two parameters are injected for the usual reasons: `today` decides `pending` vs
 * `missed` (ADR-0001) and bounds every window, and `now` stamps a row's `timestamp`,
 * the domain's ordering key (§3.3). `new Date()` is read only at the UI edge, in this
 * file's defaults.
 *
 * **Nothing here stores a day's state.** The journal, the hero, the pills and the
 * heatmap are all recomputed from the rows on each load, which is why backfilling a
 * past date repairs it for free and deleting its last row un-repairs it (ADR-0001).
 */

/** The head (§6.5 Head): back, ⋯, the icon, the name and the status light with its `?`. */
export interface DetailHead {
  /** The habit's icon — its stat's icon until the habit carries one (`habitIcon`). */
  icon: string;
  name: string;
  /** The status light (§4.6). `StatusLight` draws its shape and word. */
  light: StatusLight;
  /** The status light's tooltip (§6.8). */
  lightHelp: string;
  /** "회고하기" on a 🔴 habit only (§6.5 item 2), else `null`. */
  reflectLabel: string | null;
  /** "⏸ 쉬는 중이에요" or "🗄 보관한 습관이에요" on a stopped habit, else `null`. */
  stoppedNote: string | null;
}

/** One bar of the growth chart. `height` is a percentage of the chart's scale. */
export interface GrowthBar {
  /** The week's summed actual (§4.6 C4). */
  total: number;
  /** 0–100. */
  height: number;
  /** 0 = the week `today` falls in, 1 = the week before it, … */
  weeksAgo: number;
  /** The ⭐ week — the highest total, most recent on a tie, never a week of 0. */
  best: boolean;
}

/**
 * The weekly growth chart (§6.5 C4) as **geometry**: every number the screen needs is
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
  /** The best week's total. 0 when nothing was ever recorded. */
  best: number;
  /** The week `today` falls in — the last bucket. A running total: the week is not over. */
  thisWeek: number;
}

/**
 * The one hero card (§6.5 item 3). Which one is read off the habit's phase: its
 * lifecycle, or for a stopped habit the lifecycle it resumes to.
 * - `forming`: the 자리 잡는 중 ring, counted in days done, beside 연속 and the next step.
 * - `weekly`: an established count habit's 주마다 한 양 bars.
 * - `streak`: an established yes/no habit, which has no amount per week to chart, keeps
 *   연속 and the next step alone (#128 decision; no artboard draws it).
 */
export type DetailHero =
  | {
      kind: 'forming';
      /** Days done over the usual 66, clamped to 1 so the ring cannot overflow. */
      ratio: number;
      /** "34일" — unclamped. */
      daysLabel: string;
      /** "보통 66일". */
      expectedLabel: string;
      streak: number;
      /** "오늘 4쪽 더 하면 3일" (`nextStepLine`). */
      nextStep: string;
    }
  | {
      kind: 'weekly';
      chart: GrowthChart;
      /** "이번 주 72회". */
      totalLabel: string;
      /** "최소 35". */
      floorLabel: string;
      /** "목표 70", or `null` with no target line. */
      targetLabel: string | null;
      /** "11주 전" — the oldest bar's week. */
      startLabel: string;
      /** "이번 주". */
      endLabel: string;
    }
  | { kind: 'streak'; streak: number; nextStep: string };

/** One pill (§6.5 Numbers). The whole pill is the touch area of its `?` (§6.0). */
export interface DetailPill {
  key: 'streak' | 'longestStreak' | 'successRate' | 'engagementStreak';
  label: string;
  value: string;
  unit?: string;
  /** The tooltip (§6.8). */
  help: string;
}

/** One heatmap cell. */
export interface DetailHeatCell {
  date: string;
  /** Absent ⇔ the day is unclassified (before `createdAt`, or empty inside a pause). */
  state?: DayState;
  /** "3월 28일 했어요" — the cell's accessible name. */
  label: string;
  /** May the cell open the record sheet for its date (§6.3 range, `isBackfillableDate`)? */
  tappable: boolean;
}

/** The 최근 3주 heatmap (§6.5 Heatmap): 7 columns by 3 rows, today bottom-right. */
export interface DetailHeatmap {
  /** The weekday row on top — the weekdays of the first 7 cells. */
  weekdays: string[];
  /** `TUNING.heatmapDays` cells, ascending, ending today. */
  cells: DetailHeatCell[];
}

/** The design card's rows (§6.5 Design card), already worded. */
export interface DesignCard {
  /** The 언제·어디서 value, or "아직 안 정했어요. 이것부터 정해 보세요". */
  cue: string;
  /** Is 언제·어디서 empty? The screen draws the line in `crit` ink then. */
  cueEmpty: boolean;
  /** "하루 10쪽", or `null` on a yes/no habit. */
  floor: string | null;
  /** "하루 30쪽", or `null` on a yes/no habit or with no target that counts. */
  target: string | null;
  /** "📖 지능", or `null` when `statId` names no configured stat. */
  stat: string | null;
  /** The 이유 behind "이유 보기", or `null` when none was written. */
  identity: string | null;
}

/** The design edit sheet's current hypothesis (§6.5, AC 8). */
export interface DesignBox {
  cue?: string;
  identity?: string;
  floor: number;
  floorUnit: string;
  target?: number;
  /** Does the edit sheet show the 최소량/목표 inputs? False for a yes/no habit (§3.2). */
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

/** One row of one journal day — a stored `HabitEntry` plus its words. */
export interface JournalRow {
  entry: HabitEntry;
  /** "07:10" — the row's local wall-clock time. */
  time: string;
  /** "+6쪽", "✓ 했어요" or "못 했어요 · 예외" (`journalRowSummary`). */
  summary: string;
  /** Does this row carry the §6.3 noon pin — was it written by a backfill? */
  backfilled: boolean;
  /** May the user re-stamp this row's time? Not on a backfilled row (§6.3, §7.3). */
  timeEditable: boolean;
}

/**
 * One day of the journal. The journal is a **date walk**, not a row walk: a past day
 * holding no rows still gets a line and can be filled from it.
 */
export interface JournalDay {
  date: string;
  isToday: boolean;
  /** The day's computed state (§4.1). */
  state: DayState;
  /** "10월 10일 (오늘)". */
  title: string;
  /** "½ 조금 했어요" — the state's mark glyph and word (§6.0). */
  badge: string;
  /** The day's rows, in the domain total order (§7.3). */
  rows: JournalRow[];
  /** May a row be appended to this date at all? (§6.3 range, `isBackfillableDate`.) */
  backfillable: boolean;
}

/**
 * What deleting one journal row costs, plus the two things the domain cannot know: the
 * habit the confirm names, and whether this screen should say a streak breaks.
 */
export interface DetailDeleteEffect extends DeleteOutcome {
  habit: Habit;
  entry: HabitEntry;
  /** Say the streak figures? Only on a **past** date whose streak actually changes. */
  showsStreak: boolean;
}

/** One item of the ⋯ menu (§6.5 ⋯ menu). */
export interface DetailMenuItem {
  key: 'reflect' | 'pause' | 'archive' | 'resume' | 'unarchive';
  label: string;
  /** `crit` draws the word in `crit` ink (🗄 보관하기 on `ReDetailEstablished`). */
  tone: 'plain' | 'crit';
}

/** The record sheet for one date (§6.2), opened from a cell or a journal day. */
export interface DetailRecordSheet extends RecordSheetView {
  date: string;
}

/** The skip reason sheet for one date. */
export interface DetailSkipSheet extends SkipSheetView {
  date: string;
}

/** A journal row reopened in Today's edit sheet, with this screen's confirm lines. */
export interface DetailEditSheet extends EditEntrySheetView {
  /** The delete confirm's lines, naming the row's own day; `null` when 삭제 is immediate. */
  deleteLines: string[] | null;
}

/** The 잠깐 쉬기 or 보관하기 confirm sheet (`ReDetailPause`). */
export interface DetailConfirmSheet {
  kind: 'confirm';
  action: 'pause' | 'archive';
  /** "💪 턱걸이". */
  eyebrow: string;
  /** "잠깐 쉴까요?" or "보관할까요?". */
  title: string;
  /** `LIFECYCLE_NOTE`. */
  body: string;
  confirmLabel: string;
  keepLabel: string;
}

/** The design card's edit sheet (수정). */
export interface DetailDesignSheet {
  kind: 'design';
  eyebrow: string;
  title: string;
  design: DesignBox;
}

/** The one sheet open on this screen, or none. Derived each render from what is open. */
export type DetailSheet =
  | DetailRecordSheet
  | DetailSkipSheet
  | DetailEditSheet
  | DetailConfirmSheet
  | DetailDesignSheet;

export interface HabitDetailView {
  loading: boolean;
  /**
   * 실패한 읽기나 실패한 **생애주기 전환**, 또는 `null`. 읽기가 실패하면 `habit` 은 `null`
   * 이 되고, 화면은 "없는 습관" 대신 이 실패를 말한다.
   */
  failure: Failure | null;
  /** `null` when the id names no stored habit — the screen says so and shows nothing. */
  habit: Habit | null;
  /** Absent when `habit.statId` names no configured stat — a data defect, not a state. */
  stat?: Stat;
  head: DetailHead | null;
  hero: DetailHero | null;
  /** 연속, 최고 연속, 성공률, and 조금이라도 한 날 only when it is larger than 연속. */
  pills: DetailPill[];
  heatmap: DetailHeatmap;
  designCard: DesignCard | null;
  /** The edit sheet's starting values. */
  design: DesignBox | null;
  /** The habit's **whole life**, one line per date, newest first. */
  journal: JournalDay[];
  /** The days on screen: the last 3, or all after 더 보기 (§6.5 Journal). */
  journalShown: JournalDay[];
  /** "더 보기" while days are hidden, else `null`. */
  journalMoreLabel: string | null;
  showMoreJournal(): void;
  /** The most recent `missed` day, which `+ 지난 날 기록 추가` fills, or `null`. */
  nextBackfillDate: string | null;
  /** "+ 지난 날 기록 추가" when there is a gap to fill, else `null`. */
  backfillLabel: string | null;
  /** The ⋯ menu: 회고하기 first in every state, then the lifecycle items. */
  menu: DetailMenuItem[];
  /**
   * A menu item. 잠깐 쉬기 and 보관하기 open their confirm sheet; 다시 시작 and 다시
   * 꺼내기 run at once; 회고하기 is the screen's navigation and a no-op here.
   */
  pickMenu(key: DetailMenuItem['key']): Promise<void>;
  sheet: DetailSheet | null;
  /** Ignores a date the §6.3 range forbids, so a stale cell cannot open a bad sheet. */
  openRecord(date: string): void;
  openSkip(date: string): void;
  /** A journal row's edit sheet. */
  openEntry(entryId: string): void;
  openDesign(): void;
  /** Close the open sheet. Writes nothing — only the sheets' own buttons write (#109). */
  closeSheet(): void;
  /** 기록하기: append one activity row to the sheet's date, then close (§6.3). */
  recordFromSheet(amount: number, note: string): Promise<void>;
  /** A reason chip: append a skip row to the sheet's date, then close. */
  skipFromSheet(reason: SkipReason, note: string): Promise<void>;
  /** The open edit sheet's row as the draft would store it, or `null`. */
  editedEntry(draft: EntryDraft): HabitEntry | null;
  saveEntryFromSheet(draft: EntryDraft): Promise<void>;
  removeEntryFromSheet(): Promise<void>;
  /** The confirm sheet's main button: pause or archive, then close. */
  confirmFromSheet(): Promise<void>;
  /**
   * Does deleting this row need a result-aware confirm, and on what basis? `null`
   * means no — and also the answer for an id no row of this habit carries.
   */
  deletePreview(entryId: string): DetailDeleteEffect | null;
  /**
   * Write the design (AC 8). Resolves to per-field messages when the patch is illegal
   * and **nothing is written**, or to `null` when it is stored, which closes the sheet.
   */
  saveDesign(patch: DesignPatch): Promise<DesignErrors | null>;
  toast: QuickLogToast | null;
  undoLast(): Promise<void>;
  celebration: StreakCelebration | null;
  dismissCelebration(): void;
  /** Re-read, e.g. on returning from Reflection. */
  reload(): void;
}

/** The journal days shown before 더 보기 (§6.5 Journal). */
const JOURNAL_RECENT_DAYS = 3;

/** The habit's effective target: count only, strictly above the floor (§3.2 / §4.1). */
function effectiveTarget(habit: Habit): number | undefined {
  if (habit.kind !== 'count') return undefined;
  if (habit.target == null || habit.target <= habit.floor) return undefined;
  return habit.target;
}

function journalDay(habit: Habit, day: ClassifiedDay, today: string): JournalDay {
  const isToday = day.date === today;
  return {
    date: day.date,
    isToday,
    state: day.state,
    title: journalDayTitle(day.date, isToday),
    badge: dayStateBadge(day.state),
    rows: day.entries.map((entry) => {
      // On today there is nothing to have backfilled, and a row logged by hand at
      // 12:00 sharp would otherwise be labelled — and frozen — as one.
      const backfilled = !isToday && isBackfilledRow(entry, localNoonOn(entry.date));
      return {
        entry,
        time: localClock(entry.timestamp),
        summary: journalRowSummary({
          isCount: habit.kind === 'count',
          actual: entry.actual,
          unit: habit.floorUnit,
          skipReason: entry.skipReason,
        }),
        backfilled,
        timeEditable: !backfilled,
      };
    }),
    backfillable: isBackfillableDate(habit, day.date, today),
  };
}

/** Also the Reflection screen's weekly-totals evidence (§6.7, `useReflection`). */
export function growthChart(habit: Habit, entries: HabitEntry[], today: string): GrowthChart | null {
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
  // Most recent on a tie, and no ⭐ at all on an all-zero history.
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

/**
 * The habit's phase for the hero: its lifecycle, or for a stopped habit the lifecycle
 * the open pause resumes to (ADR-0003), so pausing does not swap the card.
 */
function phaseOf(habit: Habit): 'forming' | 'established' {
  if (habit.lifecycle === 'paused' || habit.lifecycle === 'archived') {
    return habit.pauses?.[habit.pauses.length - 1]?.resumeTo ?? 'forming';
  }
  return habit.lifecycle;
}

function heroOf(habit: Habit, entries: HabitEntry[], today: string, streak: number, longest: number): DetailHero {
  const todayRow = dayStates(habit, entries, today, today, today)[0];
  const nextStep = nextStepLine({
    floorMet: todayRow != null && isFloorMet(todayRow.state),
    streak,
    hadRun: longest > 0,
    isCount: habit.kind === 'count',
    sum: todayRow?.sum ?? 0,
    floor: habit.floor,
    unit: habit.floorUnit,
  });

  if (phaseOf(habit) === 'forming') {
    // The habit's whole life, so the count is cumulative repetitions rather than a
    // rolling window: C7b measures how many times the behaviour has actually happened.
    const lifetime = daysBetween(dateOf(habit.createdAt), today) + 1;
    const days = showedUpDays(entries, habit, today, lifetime);
    const expected = TUNING.formingExpectationDays;
    return {
      kind: 'forming',
      ratio: Math.min(1, days / expected),
      daysLabel: daysLabel(days),
      expectedLabel: expectedDaysLabel(expected),
      streak,
      nextStep,
    };
  }

  const chart = growthChart(habit, entries, today);
  if (chart == null) return { kind: 'streak', streak, nextStep };
  return {
    kind: 'weekly',
    chart,
    totalLabel: weeklyTotalLabel(chart.thisWeek, habit.floorUnit),
    floorLabel: floorLineLabel(chart.weeklyFloor),
    targetLabel: chart.weeklyTarget == null ? null : targetLineLabel(chart.weeklyTarget),
    startLabel: weeksAgoLabel(chart.bars[0].weeksAgo),
    endLabel: DETAIL_COPY.thisWeek,
  };
}

function pillsOf(streak: number, longest: number, rate: number | null, engagement: number): DetailPill[] {
  const pills: DetailPill[] = [
    { key: 'streak', label: SCREEN_WORDS.streak, value: `${streak}`, unit: DETAIL_COPY.days, help: TOOLTIPS.streak },
    {
      key: 'longestStreak',
      label: DETAIL_COPY.bestStreak,
      value: `${longest}`,
      unit: DETAIL_COPY.days,
      help: TOOLTIPS.bestStreak,
    },
    {
      key: 'successRate',
      label: DETAIL_COPY.successRate,
      // `null` is the §4.4 min-sample guard: `—`, never a 0% that reads as a score.
      value: rate == null ? DETAIL_COPY.noRate : `${Math.round(rate * 100)}`,
      unit: rate == null ? undefined : DETAIL_COPY.percent,
      help: TOOLTIPS.successRate,
    },
  ];
  // §6.5 Numbers: the fourth pill only when it says something 연속 does not.
  if (engagement > streak) {
    pills.push({
      key: 'engagementStreak',
      label: SCREEN_WORDS.engagementStreak,
      value: `${engagement}`,
      unit: DETAIL_COPY.days,
      help: TOOLTIPS.engagementStreak,
    });
  }
  return pills;
}

function menuOf(habit: Habit): DetailMenuItem[] {
  const reflect: DetailMenuItem = { key: 'reflect', label: DETAIL_COPY.reflect, tone: 'plain' };
  // A stopped habit gets the single way back, named for how the stop reads — the same
  // `resumeHabit` either way (#19).
  if (habit.lifecycle === 'paused') {
    return [reflect, { key: 'resume', label: LIFECYCLE_LABELS.resume, tone: 'plain' }];
  }
  if (habit.lifecycle === 'archived') {
    return [reflect, { key: 'unarchive', label: LIFECYCLE_LABELS.unarchive, tone: 'plain' }];
  }
  return [
    reflect,
    { key: 'pause', label: DETAIL_COPY.menuPause, tone: 'plain' },
    { key: 'archive', label: DETAIL_COPY.menuArchive, tone: 'crit' },
  ];
}

/**
 * The same three rules `app/habit/new.tsx` applies at creation, because a habit that
 * violates §3.2 is a data defect wherever it is written from — the design sheet here
 * and the Reflection commit (`useReflection`).
 */
export function designErrors(floor: number, floorUnit: string, target: number | undefined): DesignErrors {
  const errors: DesignErrors = {};
  if (!Number.isFinite(floor) || floor < 1) {
    errors.floor = '최소량은 1 이상의 숫자로 적어 주세요.';
  }
  if (floorUnit.length === 0) errors.floorUnit = '단위를 적어 주세요 (예: 회, 쪽, 분).';
  if (target != null) {
    if (!Number.isFinite(target)) errors.target = '목표는 숫자로 적어 주세요.';
    // §3.2 (strict): a target at or below the floor says nothing.
    else if (errors.floor == null && target <= floor) {
      errors.target = '목표는 최소량보다 커야 합니다.';
    }
  }
  return errors;
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

/** What is open — the hook's only sheet state. Everything shown is derived from it. */
type SheetIntent =
  | { kind: 'record' | 'skip'; date: string }
  | { kind: 'entry'; id: string }
  | { kind: 'confirm'; action: 'pause' | 'archive' }
  | { kind: 'design' };

export function useHabitDetail(
  habitId: string,
  {
    today = localToday(),
    now = () => new Date(),
  }: { today?: string; now?: () => Date } = {},
): HabitDetailView {
  const repository = useRepository();
  const { failure, report, clear, attempt } = useFailure();
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [intent, setIntent] = useState<SheetIntent | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  /**
   * Bumped by a write, so the load effect is the single place that reads. `loading` is
   * raised only for the first load, never for a reload: filling a past day must not
   * blank the journal it just changed.
   */
  const [version, setVersion] = useState(0);

  function reload() {
    setVersion((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const habit = await repository.getHabit(habitId);
      // From birth: `computeStreak` and `deleteOutcome` walk back to `createdAt`, and a
      // clipped range would report a run the user never had.
      const entries =
        habit == null ? [] : await repository.getEntries(habit.id, dateOf(habit.createdAt), today);

      if (!cancelled) {
        setLoaded({ habit, entries });
        clear();
        setLoading(false);
      }
    }

    load().catch(() => {
      if (cancelled) return;
      // 실패 기록과 `setLoading(false)` 는 한 쌍이다. 후자만 붙이면 무한 스피너가 "습관을
      // 찾을 수 없어요" 로 바뀔 뿐이고, 그것이 더 나쁘다.
      setLoading(false);
      report(LOAD_FAILED_NOTE, reload);
    });

    return () => {
      cancelled = true;
    };
  }, [repository, habitId, today, version]);

  const { habit, entries } = loaded;

  const quick = useQuickLog({ date: today, today, now, onChange: reload });

  const journal =
    habit == null
      ? []
      : dayStates(habit, entries, dateOf(habit.createdAt), today, today)
          .map((day) => journalDay(habit, day, today))
          // Newest first — the board reads downward from the most recent day.
          .reverse();
  const journalShown = journalOpen ? journal : journal.slice(0, JOURNAL_RECENT_DAYS);
  // The journal is newest-first and covers the whole history, so the first `missed`
  // day in it is the most recent one.
  const nextBackfillDate = journal.find((day) => day.state === 'missed')?.date ?? null;

  const streak = habit == null ? 0 : computeStreak(entries, habit, today);
  const longest = habit == null ? 0 : longestStreak(entries, habit);
  const stat = habit == null ? undefined : TUNING.stats.find((s) => s.id === habit.statId);

  const heatWindow = windowEndingAt(today, TUNING.heatmapDays);
  const heatmap: DetailHeatmap =
    habit == null
      ? { weekdays: [], cells: [] }
      : {
          weekdays: heatWindow.slice(0, 7).map((date) => WEEKDAY_LABELS[weekdayOf(date)]),
          cells: heatCells(habit, entries, heatWindow[0], heatWindow[heatWindow.length - 1], today).map(
            (cell) => ({
              date: cell.date,
              state: cell.state,
              label:
                cell.state == null
                  ? monthDayLabel(cell.date)
                  : dayCellLabel(monthDayLabel(cell.date), cell.state),
              tappable: isBackfillableDate(habit, cell.date, today),
            }),
          ),
        };

  const design: DesignBox | null =
    habit == null
      ? null
      : {
          cue: habit.cue,
          identity: habit.identity,
          floor: habit.floor,
          floorUnit: habit.floorUnit,
          target: effectiveTarget(habit),
          editsAmounts: habit.kind === 'count',
        };

  /** 오늘, 어제, or "3월 24일" — how the sheets name a date (B4). */
  function dayWordOf(date: string): string {
    if (date === today) return DAY_WORDS.today;
    if (date === addDays(today, -1)) return DAY_WORDS.yesterday;
    return monthDayLabel(date);
  }

  function deletePreview(entryId: string): DetailDeleteEffect | null {
    const entry = entries.find((row) => row.id === entryId);
    if (habit == null || entry == null) return null;

    const outcome = deleteOutcome(habit, entries, entry, today);
    const showsStreak = entry.date !== today && outcome.streakAfter < outcome.streakBefore;

    // The journal warns on one more consequence than Today does, because it holds the
    // past dates on which a streak can actually break (AC 9).
    if (!outcome.emptiesDay && !outcome.carriesMiss && !showsStreak) return null;

    return { habit, entry, showsStreak, ...outcome };
  }

  function sheetOf(open: SheetIntent | null): DetailSheet | null {
    if (open == null || habit == null) return null;
    switch (open.kind) {
      case 'record':
        return {
          ...recordSheetView({
            habit,
            affordances: logAffordances(habit, dayStates(habit, entries, open.date, open.date, today)[0]),
            dayWord: dayWordOf(open.date),
            isToday: open.date === today,
            now,
            // The date in large type, the habit above it (§6.3, as on the Dashboard).
            title: longDateLabel(open.date, weekdayOf(open.date)),
            eyebrow: labelOf(habit),
          }),
          date: open.date,
        };
      case 'skip':
        return { ...skipSheetView(habit, dayWordOf(open.date)), date: open.date };
      case 'entry': {
        const day = journal.find((d) => d.rows.some((row) => row.entry.id === open.id));
        const row = day?.rows.find((r) => r.entry.id === open.id);
        if (day == null || row == null) return null;
        const effect = deletePreview(row.entry.id);
        const dayWord = dayWordOf(day.date);
        return {
          kind: 'editEntry',
          item: {
            kind: 'habit',
            habit,
            entry: row.entry,
            backfilled: row.backfilled,
            time: row.time,
            title: longDateLabel(day.date, weekdayOf(day.date)),
            summary: row.summary,
          },
          clock: row.time,
          timeLabel: row.backfilled ? TODAY_COPY.backfillTime : editTimeLabel(row.time),
          timeEditable: row.timeEditable,
          deleteEffect: effect,
          deleteLines:
            effect == null
              ? null
              : deleteConfirmLines({
                  habitName: habit.name,
                  emptiesDay: effect.emptiesDay,
                  carriesMiss: effect.carriesMiss,
                  dayLabel: dayWord,
                  streakBefore: effect.showsStreak ? effect.streakBefore : undefined,
                  streakAfter: effect.showsStreak ? effect.streakAfter : undefined,
                  stateAfterLabel: effect.stateAfter == null ? undefined : DAY_STATE_WORDS[effect.stateAfter],
                }),
        };
      }
      case 'confirm':
        return {
          kind: 'confirm',
          action: open.action,
          eyebrow: labelOf(habit),
          title: open.action === 'pause' ? DETAIL_COPY.pauseTitle : DETAIL_COPY.archiveTitle,
          body: LIFECYCLE_NOTE,
          confirmLabel: LIFECYCLE_LABELS[open.action],
          keepLabel: TODAY_COPY.keep,
        };
      case 'design':
        return design == null
          ? null
          : { kind: 'design', eyebrow: labelOf(habit), title: DETAIL_COPY.designTitle, design };
    }
  }

  const sheet = sheetOf(intent);

  function openRecord(date: string): void {
    if (habit == null || !isBackfillableDate(habit, date, today)) return;
    setIntent({ kind: 'record', date });
  }

  function openSkip(date: string): void {
    if (habit == null || !isBackfillableDate(habit, date, today)) return;
    setIntent({ kind: 'skip', date });
  }

  async function recordFromSheet(amount: number, note: string): Promise<void> {
    if (sheet?.kind !== 'record') return;
    await writeRecord(quick, sheet, amount, note, sheet.date);
    setIntent(null);
  }

  async function skipFromSheet(reason: SkipReason, note: string): Promise<void> {
    if (sheet?.kind !== 'skip') return;
    await writeSkip(quick, sheet, reason, note, sheet.date);
    setIntent(null);
  }

  function editedEntry(draft: EntryDraft): HabitEntry | null {
    if (sheet?.kind !== 'editEntry') return null;
    return draftedEntry(sheet.item.entry, sheet.item.habit, draft);
  }

  async function saveEntryFromSheet(draft: EntryDraft): Promise<void> {
    const entry = editedEntry(draft);
    if (entry == null) throw new RangeError('useHabitDetail.saveEntryFromSheet: the draft cannot be stored');
    await quick.editEntry(entry);
    setIntent(null);
  }

  async function removeEntryFromSheet(): Promise<void> {
    if (sheet?.kind !== 'editEntry') return;
    await quick.removeEntry(sheet.item.entry.id);
    setIntent(null);
  }

  /**
   * A lifecycle write: `lifecycle.ts`'s pure transition plus the write and the reload.
   * Caught here: the confirm sheet and the menu call this as is, so a failure would
   * otherwise reach nowhere — and a habit the user believes archived would stay put.
   */
  async function runLifecycle(next: (subject: Habit, day: string) => Habit): Promise<void> {
    if (habit == null) return;
    const subject = habit;
    await attempt(SAVE_FAILED_NOTE, async () => {
      await repository.upsertHabit(next(subject, today));
      reload();
    });
  }

  async function confirmFromSheet(): Promise<void> {
    if (sheet?.kind !== 'confirm') return;
    const { action } = sheet;
    setIntent(null);
    await runLifecycle(action === 'pause' ? pauseHabit : archiveHabit);
  }

  async function pickMenu(key: DetailMenuItem['key']): Promise<void> {
    if (key === 'pause' || key === 'archive') setIntent({ kind: 'confirm', action: key });
    else if (key === 'resume' || key === 'unarchive') await runLifecycle(resumeHabit);
  }

  async function saveDesign(patch: DesignPatch): Promise<DesignErrors | null> {
    if (habit == null) {
      throw new Error('useHabitDetail.saveDesign: 습관을 아직 불러오지 못했어요');
    }

    const amounts = habit.kind === 'count';
    const floor = amounts ? (patch.floor ?? habit.floor) : habit.floor;
    const floorUnit = amounts ? (patch.floorUnit ?? habit.floorUnit).trim() : habit.floorUnit;
    const target = amounts
      ? patch.target === undefined
        ? habit.target
        : (patch.target ?? undefined)
      : undefined;

    const errors = designErrors(floor, floorUnit, target);
    if (Object.keys(errors).length > 0) return errors;

    await repository.upsertHabit({
      ...habit,
      cue: patchedText(habit.cue, patch.cue),
      identity: patchedText(habit.identity, patch.identity),
      floor,
      floorUnit,
      target,
    });
    setIntent((open) => (open?.kind === 'design' ? null : open));
    reload();
    return null;
  }

  const light = habit == null ? null : deriveStatusLight(habit, entries, today);
  const target = habit == null ? undefined : effectiveTarget(habit);

  return {
    loading,
    habit,
    stat,
    head:
      habit == null || light == null
        ? null
        : {
            icon: habitIcon(habit),
            name: habit.name,
            light,
            lightHelp: TOOLTIPS.statusLight,
            reflectLabel: light === 'intervention' ? DETAIL_COPY.reflect : null,
            stoppedNote:
              habit.lifecycle === 'paused'
                ? DETAIL_COPY.paused
                : habit.lifecycle === 'archived'
                  ? DETAIL_COPY.archived
                  : null,
          },
    hero: habit == null ? null : heroOf(habit, entries, today, streak, longest),
    pills:
      habit == null
        ? []
        : pillsOf(
            streak,
            longest,
            successRate(entries, habit, today, TUNING.windows.floorRate),
            engagementStreak(entries, habit, today),
          ),
    heatmap,
    designCard:
      habit == null
        ? null
        : {
            cue: habit.cue ?? DETAIL_COPY.cueEmpty,
            cueEmpty: habit.cue == null || habit.cue.length === 0,
            floor: habit.kind === 'count' ? dailyAmountLabel(habit.floor, habit.floorUnit) : null,
            target: target == null ? null : dailyAmountLabel(target, habit.floorUnit),
            stat: stat == null ? null : statLabel(stat),
            identity: habit.identity ?? null,
          },
    design,
    journal,
    journalShown,
    journalMoreLabel: journalShown.length < journal.length ? DETAIL_COPY.more : null,
    showMoreJournal: () => setJournalOpen(true),
    nextBackfillDate,
    backfillLabel: nextBackfillDate == null ? null : DETAIL_COPY.backfill,
    menu: habit == null ? [] : menuOf(habit),
    pickMenu,
    sheet,
    openRecord,
    openSkip,
    openEntry: (id: string) => setIntent({ kind: 'entry', id }),
    openDesign: () => setIntent({ kind: 'design' }),
    closeSheet: () => setIntent(null),
    recordFromSheet,
    skipFromSheet,
    editedEntry,
    saveEntryFromSheet,
    removeEntryFromSheet,
    confirmFromSheet,
    deletePreview,
    saveDesign,
    toast: quick.toast,
    failure: failure ?? quick.failure,
    undoLast: quick.undoLast,
    celebration: quick.celebration,
    dismissCelebration: quick.dismissCelebration,
    reload,
  };
}
