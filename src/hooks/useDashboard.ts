import { useState } from 'react';

import {
  characterLevelLabel,
  DAY_WORDS,
  dayCellLabel,
  longDateLabel,
  monthDayLabel,
  needsAttentionLabel,
  starsToNextLevelLabel,
  statLevelLabel,
  statLineLabel,
  streakCountLabel,
  WEEKDAY_LABELS,
} from '@/config/copy';
import { TUNING } from '@/config/tuning';
import { isBackfillableDate } from '@/domain/backfill';
import { dayStates } from '@/domain/classify';
import { addDays, weekdayOf, windowEndingAt } from '@/domain/dates';
import { computeStatXP, levelForXP, type HabitWithEntries } from '@/domain/score';
import { aggregateStatusCount, deriveStatusLight, type StatusLight } from '@/domain/statusLight';
import { computeStreak } from '@/domain/streak';
import { localToday } from '@/lib/device';
import type { DayState, Habit, HabitEntry, SkipReason, Stat } from '@/models';

import type { Failure } from './failure';
import { useHistories } from './history';
import {
  labelOf,
  recordFromSheet as writeRecord,
  recordSheetView,
  type RecordSheetView,
  skipFromSheet as writeSkip,
  skipSheetView,
  type SkipSheetView,
} from './recordSheet';
import {
  logAffordances,
  useQuickLog,
  type QuickLogToast,
  type StreakCelebration,
} from './useQuickLog';

/**
 * The Dashboard's data path — SPEC §6.3, the `ReDashboard*` artboards (#129).
 *
 * The hook is the test seam (jest.config.js: hooks + an in-memory repository, no
 * component render tests). So every word, every order and every figure the screen shows
 * is made here, and the screen only renders:
 *
 * - the repository arrives through `RepositoryProvider`, never constructed here;
 * - `today` and `now` are parameters. Day-state depends on `today` (`pending` vs
 *   `missed`, ADR-0001), and the record sheet's time on `now`, so a test pins both.
 */

/** The dots under a row's head: the last 7 days, ending today (§6.3). */
const WEEK_DAYS = 7;

/** One of a row's 7-day dots. The whole cell is the touch area (§6.0). */
export interface DashboardDay {
  date: string;
  /**
   * The day-state mark, or `null` for a day with none: before `createdAt`, or an empty
   * day inside a pause (ADR-0003). Such a cell draws no mark and opens nothing.
   */
  state: DayState | null;
  /** 일 … 토, and 오늘 for the last one. */
  label: string;
  /** "10월 8일 목요일 기록 없음". Empty when `state` is `null`. */
  accessibilityLabel: string;
  /** Does a tap open the record sheet for this date? */
  tappable: boolean;
}

export interface DashboardRow {
  habit: Habit;
  /** "📖 독서". A row shows no stat (§6.3). */
  label: string;
  week: DashboardDay[];
  /**
   * "🔥 12" — consecutive floor-met days ending today (§4.2). Read from the whole
   * history, so a backfill re-joins the runs on either side of a filled day (ADR-0001).
   */
  streakLabel: string;
  /** The row's status light (§4.6), drawn as shape and word by `StatusLight`. */
  statusLight: StatusLight;
  /** Only a 🔴 row has 회고하기 (§6.3). A 🟡 reaches Reflection from Habit Detail. */
  reflectable: boolean;
}

/** One stat's figures (#17). The views below turn them into words and bar widths. */
interface StatProgress {
  stat: Stat;
  /** `levelForXP(computeStatXP(...))` — §4.2's one level definition. */
  level: number;
  /** The stat's cumulative XP, summed over every habit mapped to it, archived included. */
  xp: number;
  /** XP still owed to the next level, or `null` at the top level. */
  xpToNextLevel: number | null;
  /** The share of the current level's band that is done, 0–1. Full at the top level. */
  barFraction: number;
}

/** The level card (§6.3): a solid `accent` card. */
export interface LevelCardView {
  /** "캐릭터 레벨 4". */
  title: string;
  /** "💪 3 · 📖 2 · 🧘 4", or `null` with no habits (`ReDashboardEmpty`). */
  statLine: string | null;
  /** The bar's fill, "62%" — measured on the stat that will raise the character level next. */
  barWidth: BarWidth;
  /** "다음 레벨까지 별 120개". */
  nextLine: string;
}

/** One stat in the stat sheet (`ReDashboardStats`). */
export interface StatSheetRow {
  id: string;
  /** "💪 힘". */
  title: string;
  /** "레벨 3". */
  levelLabel: string;
  /** The bar's fill, "35%". */
  barWidth: BarWidth;
  /** The shown habits tied to the stat, "턱걸이 · 스쿼트". Empty when there is none. */
  habits: string;
  /** "다음 레벨까지 별 90개". */
  nextLine: string;
}

/** The shared record sheet (`./recordSheet`) for one date (§6.3 B1). */
export interface DashboardRecordSheet extends RecordSheetView {
  date: string;
}

/** The shared skip reason sheet (`./recordSheet`) for one date. */
export interface DashboardSkipSheet extends SkipSheetView {
  date: string;
}

/** The stat sheet the level card opens (`ReDashboardStats`). */
export interface StatsSheet {
  kind: 'stats';
  /** "캐릭터 레벨 4". */
  title: string;
  /** "다음 레벨까지 별 120개". */
  subtitle: string;
  rows: StatSheetRow[];
}

export type DashboardSheet = DashboardRecordSheet | DashboardSkipSheet | StatsSheet;

export interface DashboardView {
  /** "10월 10일 토요일" — over the title. */
  dateLabel: string;
  /** Sorted by status light: 손봐야 해요, 살펴보세요, then 괜찮아요 (§6.3). */
  rows: DashboardRow[];
  level: LevelCardView;
  /**
   * "손볼 습관 N개" — 🟡 and 🔴 among the shown habits, `aggregateStatusCount`'s two
   * counts summed. Paused habits count nothing by construction (ADR-0003). `null` with
   * no rows: a failed read must not claim "0개".
   */
  needsAttentionLabel: string | null;
  loading: boolean;
  /**
   * No habit to show, and the read did not fail: the empty screen (`ReDashboardEmpty`).
   * False while a failure is set, which would otherwise claim there are no habits (#51).
   */
  empty: boolean;
  /**
   * A failed read or a failed undo, or `null`. While it is set the screen says the
   * failure instead of the empty state: rows being empty then means "not read", not
   * "no habits" (#51). A failed record or skip is not here; those reject, and the sheet
   * says so and stays open.
   */
  failure: Failure | null;
  /** The open sheet, or `null`. Derived each render from what is open and the loaded rows. */
  sheet: DashboardSheet | null;
  /** A 7-day dot: the record sheet for that date. Opening writes nothing (#109). */
  openRecord(habitId: string, date: string): void;
  /** The record sheet's skip link: the skip reason sheet for the same date. */
  openSkip(habitId: string, date: string): void;
  /** The level card: the stat sheet. */
  openStats(): void;
  /** Close the open sheet, discarding its inputs. */
  closeSheet(): void;
  /** 기록하기: one activity row on the sheet's date, then close. Rejects on failure. */
  recordFromSheet(amount: number, note?: string): Promise<void>;
  /** A reason chip: one skip row on the sheet's date, then close. Rejects on failure. */
  skipFromSheet(reason: SkipReason, note?: string): Promise<void>;
  toast: QuickLogToast | null;
  undoLast(): Promise<void>;
  /** A backfill or today's log that raised the streak (§6.2 Streak celebration). */
  celebration: StreakCelebration | null;
  dismissCelebration(): void;
  /**
   * Read the repository again. The Dashboard stays mounted under every screen it
   * pushes, so a write made there reaches it only when the screen calls this on focus.
   */
  reload(): void;
}

/** A bar's fill as a width, "62%" — clamped to 0–100. */
export type BarWidth = `${number}%`;

function barWidthOf(fraction: number): BarWidth {
  return `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
}

/** A stat's four numbers, from its XP. See `StatProgress` for each. */
function statProgress(stat: Stat, all: HabitWithEntries[]): StatProgress {
  const xp = computeStatXP(stat.id, all);
  const level = levelForXP(xp);
  const thresholds = TUNING.statLevelThresholds;
  const next = thresholds[level + 1];

  if (next == null) return { stat, level, xp, xpToNextLevel: null, barFraction: 1 };

  const base = thresholds[level];
  return { stat, level, xp, xpToNextLevel: next - xp, barFraction: (xp - base) / (next - base) };
}

/**
 * The stat that raises the character level next: among the stats at the top level, the
 * one with the fewest 별 left. One already at the top level wins, so the card says so.
 */
function leadingStat(stats: StatProgress[], characterLevel: number): StatProgress | undefined {
  return stats
    .filter((stat) => stat.level === characterLevel)
    .sort((a, b) => (a.xpToNextLevel ?? -1) - (b.xpToNextLevel ?? -1))[0];
}

/** 🔴 first, then 🟡, then the rest. `Array.prototype.sort` is stable, so ties keep their order. */
const LIGHT_RANK: Record<StatusLight, number> = {
  intervention: 0,
  caution: 1,
  personal_best: 2,
  stable: 2,
};

type SheetIntent =
  | { kind: 'record' | 'skip'; habitId: string; date: string }
  | { kind: 'stats' };

export function useDashboard({
  today = localToday(),
  now = () => new Date(),
}: { today?: string; now?: () => Date } = {}): DashboardView {
  const { histories: all, loading, failure, reload } = useHistories(today);
  const [intent, setIntent] = useState<SheetIntent | null>(null);

  const quick = useQuickLog({ today, now, onChange: reload });

  const window = windowEndingAt(today, WEEK_DAYS);
  // §3.2 — archived habits are hidden. Paused ones stay, to be resumed (ADR-0003).
  const visible = all.filter(({ habit }) => habit.lifecycle !== 'archived');
  const history = new Map(visible.map(({ habit, entries }) => [habit.id, entries]));
  const rows = visible
    .map(({ habit, entries }) => rowOf(habit, entries, window, today))
    .sort((a, b) => LIGHT_RANK[a.statusLight] - LIGHT_RANK[b.statusLight]);
  const count = aggregateStatusCount(
    visible.map(({ habit }) => habit),
    Object.fromEntries(history),
    today,
  );
  // Stats read **every** habit, archived included: archiving must not claw back
  // what a recorded day earned (ADR-0003).
  const stats = TUNING.stats.map((stat) => statProgress(stat, all));
  const characterLevel = stats.reduce((highest, stat) => Math.max(highest, stat.level), 0);
  const leading = leadingStat(stats, characterLevel);
  const nextLine = starsToNextLevelLabel(
    leading == null ? TUNING.statLevelThresholds[1] : leading.xpToNextLevel,
  );
  const level: LevelCardView = {
    title: characterLevelLabel(characterLevel),
    statLine: rows.length === 0 ? null : statLineLabel(stats.map((s) => ({ icon: s.stat.icon, level: s.level }))),
    barWidth: barWidthOf(leading?.barFraction ?? 0),
    nextLine,
  };

  /** 오늘, 어제, or "10월 8일" — how the sheets name the date. */
  function dayWordOf(date: string): string {
    if (date === today) return DAY_WORDS.today;
    if (date === addDays(today, -1)) return DAY_WORDS.yesterday;
    return monthDayLabel(date);
  }

  /** The habit a record or skip sheet is about, when its date may be written. */
  function targetOf(habitId: string, date: string) {
    const row = rows.find((r) => r.habit.id === habitId);
    if (row == null || !isBackfillableDate(row.habit, date, today)) return null;
    const day = dayStates(row.habit, history.get(habitId) ?? [], date, date, today)[0];
    return { habit: row.habit, affordances: logAffordances(row.habit, day) };
  }

  function sheetOf(open: SheetIntent | null): DashboardSheet | null {
    if (open == null) return null;
    if (open.kind === 'stats') {
      return {
        kind: 'stats',
        title: level.title,
        subtitle: nextLine,
        rows: stats.map((s) => ({
          id: s.stat.id,
          title: `${s.stat.icon} ${s.stat.name}`,
          levelLabel: statLevelLabel(s.level),
          barWidth: barWidthOf(s.barFraction),
          habits: rows
            .filter((row) => row.habit.statId === s.stat.id)
            .map((row) => row.habit.name)
            .join(' · '),
          nextLine: starsToNextLevelLabel(s.xpToNextLevel),
        })),
      };
    }

    const target = targetOf(open.habitId, open.date);
    if (target == null) return null;
    const { habit, affordances } = target;
    const dayWord = dayWordOf(open.date);

    if (open.kind === 'skip') return { ...skipSheetView(habit, dayWord), date: open.date };
    return {
      ...recordSheetView({
        habit,
        affordances,
        dayWord,
        isToday: open.date === today,
        now,
        title: longDateLabel(open.date, weekdayOf(open.date)),
        eyebrow: labelOf(habit),
      }),
      date: open.date,
    };
  }

  const sheet = sheetOf(intent);

  async function recordFromSheet(amount: number, note?: string): Promise<void> {
    if (sheet?.kind !== 'record') return;
    await writeRecord(quick, sheet, amount, note, sheet.date);
    setIntent(null);
  }

  async function skipFromSheet(reason: SkipReason, note?: string): Promise<void> {
    if (sheet?.kind !== 'skip') return;
    await writeSkip(quick, sheet, reason, note, sheet.date);
    setIntent(null);
  }

  return {
    dateLabel: longDateLabel(today, weekdayOf(today)),
    rows,
    level,
    needsAttentionLabel: rows.length === 0 ? null : needsAttentionLabel(count.caution + count.intervention),
    loading,
    empty: !loading && rows.length === 0 && failure == null && quick.failure == null,
    // A failed undo is `useQuickLog`'s; the two share one banner.
    failure: failure ?? quick.failure,
    sheet,
    openRecord: (habitId, date) => setIntent({ kind: 'record', habitId, date }),
    openSkip: (habitId, date) => setIntent({ kind: 'skip', habitId, date }),
    openStats: () => setIntent({ kind: 'stats' }),
    closeSheet: () => setIntent(null),
    recordFromSheet,
    skipFromSheet,
    toast: quick.toast,
    undoLast: quick.undoLast,
    celebration: quick.celebration,
    dismissCelebration: quick.dismissCelebration,
    reload,
  };
}

/** One row from a habit's history: its dots, streak and light. */
function rowOf(habit: Habit, entries: HabitEntry[], window: string[], today: string): DashboardRow {
  const states = new Map(
    dayStates(habit, entries, window[0], window[window.length - 1], today).map((d) => [d.date, d.state]),
  );
  const statusLight = deriveStatusLight(habit, entries, today);

  return {
    habit,
    label: labelOf(habit),
    week: window.map((date) => {
      const state = states.get(date) ?? null;
      return {
        date,
        state,
        label: date === today ? DAY_WORDS.today : WEEKDAY_LABELS[weekdayOf(date)],
        accessibilityLabel: state == null ? '' : dayCellLabel(longDateLabel(date, weekdayOf(date)), state),
        tappable: state != null && isBackfillableDate(habit, date, today),
      };
    }),
    streakLabel: streakCountLabel(computeStreak(entries, habit, today)),
    statusLight,
    reflectable: statusLight === 'intervention',
  };
}
