import {
  backfillTimeLabel,
  habitIcon,
  nowLabel,
  recordResultLine,
  recordSumLabel,
  skipSheetTitle,
} from '@/config/copy';
import { localClock, restampedAtLocalTime } from '@/lib/device';
import type { Habit, HabitEntry, SkipReason } from '@/models';

import type { LogAffordances, QuickLog } from './useQuickLog';
import type { EntryDraft } from './useToday';

/**
 * The record and skip reason sheets' views and writes, shared by every hook that opens
 * them — Today, the Dashboard and Habit Detail (SPEC §6.2 "One log form", §6.3 B1).
 * One builder, so the sheets cannot drift into two wordings of the same day. The edit
 * sheet's row assembly (`draftedEntry`) is shared here too.
 */

/** "📖 독서" — a habit's icon and name, as sheets and rows head with it. */
export function labelOf(habit: Habit): string {
  return `${habitIcon(habit)} ${habit.name}`;
}

/** The record sheet (§6.2 Record sheet, `ReTodaySheet`), ready to render. */
export interface RecordSheetView {
  kind: 'record';
  habit: Habit;
  /** A muted line above the title: the habit, when the title is a date (Dashboard dots). */
  eyebrow?: string;
  /** "📖 독서", or the date in large type: "10월 8일 목요일". */
  title: string;
  /** "지금 6쪽" on a count habit's today, else `null`. */
  sumLabel: string | null;
  isCount: boolean;
  unit: string;
  /** The stepper's start (B2). */
  defaultAmount: number;
  /** "지금 14:20", or the noon pin of a backfill: "어제 12:00", "10월 8일 12:00" (B3). */
  timeLabel: string;
  /** "{어느 날} 못 했어요 · 왜?", or `null` once the day holds activity (not skippable). */
  skipLabel: string | null;
  /** The one result line for the staged amount (C7a). */
  resultLine(amount: number): string;
}

/** The skip reason sheet (§6.2, `ReTodaySkip`). A reason chip records the skip at once. */
export interface SkipSheetView {
  kind: 'skip';
  habit: Habit;
  /** "🧘 명상". */
  eyebrow: string;
  /** "{어느 날} 못 했어요 · 왜?". */
  title: string;
}

/** The target the engine honours: count only, strictly above the floor (§3.2). */
function honouredTarget(habit: Habit): number | undefined {
  return habit.kind === 'count' && habit.target != null && habit.target > habit.floor
    ? habit.target
    : undefined;
}

export function recordSheetView({
  habit,
  affordances,
  dayWord,
  isToday,
  now,
  title = labelOf(habit),
  eyebrow,
}: {
  habit: Habit;
  /** The day's affordances (`logAffordances`). */
  affordances: LogAffordances;
  /** 오늘, 어제 or "10월 8일" — how the sheet names the day. */
  dayWord: string;
  /** Is the day today? A new row is then stamped now, else noon-pinned (B3). */
  isToday: boolean;
  now: () => Date;
  title?: string;
  eyebrow?: string;
}): RecordSheetView {
  const isCount = habit.kind === 'count';
  const { sum } = affordances.progress;
  return {
    kind: 'record',
    habit,
    eyebrow,
    title,
    sumLabel: isCount && isToday ? recordSumLabel(sum, habit.floorUnit) : null,
    isCount,
    unit: habit.floorUnit,
    defaultAmount: affordances.defaultAmount,
    timeLabel: isToday ? nowLabel(localClock(now())) : backfillTimeLabel(dayWord),
    skipLabel: affordances.skippable ? skipSheetTitle(dayWord) : null,
    resultLine: (amount: number) =>
      recordResultLine({
        sum,
        amount,
        floor: habit.floor,
        target: honouredTarget(habit),
        unit: habit.floorUnit,
        dayWord,
      }),
  };
}

export function skipSheetView(habit: Habit, dayWord: string): SkipSheetView {
  return { kind: 'skip', habit, eyebrow: labelOf(habit), title: skipSheetTitle(dayWord) };
}

/**
 * 기록하기 on the open record sheet: one activity row with the sheet's note. `date`
 * names the day, or is left out for the hook's own date. Rejects on a failed write, so
 * the sheet stays open and says so.
 */
export function recordFromSheet(
  quick: Pick<QuickLog, 'logActivity'>,
  sheet: RecordSheetView,
  amount: number,
  note: string | undefined,
  date: string | undefined,
): Promise<void> {
  return quick.logActivity(sheet.habit, amount, { note, date });
}

/** A reason chip on the open skip sheet: one skip row at once (B5). Same contract. */
export function skipFromSheet(
  quick: Pick<QuickLog, 'logSkip'>,
  sheet: SkipSheetView,
  reason: SkipReason,
  note: string | undefined,
  date: string | undefined,
): Promise<void> {
  return quick.logSkip(sheet.habit, reason, { note, date });
}

/**
 * An edit sheet's row as the draft would store it, or `null` when the draft cannot be
 * stored: no reason on a skip, no positive amount on a count activity, or a time that
 * is not a time of day. §3.3's discriminator moves both fields together, and the stamp
 * is the original unless the time fields read another clock (B3, #127 decision: an
 * edit keeps its time). Shared by Today's and Habit Detail's edit sheets.
 */
export function draftedEntry(entry: HabitEntry, habit: Habit, draft: EntryDraft): HabitEntry | null {
  const amount = Number(draft.amount);
  const isCount = habit.kind === 'count';
  if (draft.kind === 'skip' && draft.reason == null) return null;
  if (draft.kind === 'activity' && isCount && !(draft.amount.trim().length > 0 && amount > 0)) return null;
  const timestamp =
    draft.time == null
      ? entry.timestamp
      : restampedAtLocalTime(entry.timestamp, entry.date, draft.time.hour, draft.time.minute);
  if (timestamp == null) return null;
  const note = draft.note.trim();
  return {
    ...entry,
    timestamp,
    actual: draft.kind === 'skip' ? 0 : isCount ? amount : 1,
    skipReason: draft.kind === 'skip' ? draft.reason : undefined,
    note: note.length > 0 ? note : undefined,
  };
}
