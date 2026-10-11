import { useCallback, useEffect, useState } from 'react';

import {
  backfillTimeLabel,
  cardBadge,
  cardProgressLine,
  countChipLabel,
  cueLine,
  DAY_STATE_WORDS,
  foldLabel,
  FREE_LOG_NO_TEXT_NOTE,
  habitIcon,
  LOAD_FAILED_NOTE,
  LOG_TYPE_LABELS,
  longDateLabel,
  nowLabel,
  recordResultLine,
  recordSumLabel,
  rowRewardLine,
  SKIP_REASON_LABELS,
  skipSheetTitle,
  TODAY_COPY,
  yesterdayBannerTitle,
} from '@/config/copy';
import { useRepository } from '@/context/RepositoryContext';
import { isBackfilledRow, isBackfillableDate } from '@/domain/backfill';
import {
  type ClassifiedDay,
  dayStates,
  isFloorMet,
} from '@/domain/classify';
import { addDays, compareDates, dateOf, weekdayOf } from '@/domain/dates';
import { deleteOutcome, type DeleteOutcome } from '@/domain/deleteEffect';
import { sortByDomainOrder } from '@/domain/feed';
import { attributeDayXP, computeXP, type RowReward } from '@/domain/score';
import { localClock, localNoonOn, localToday, newId } from '@/lib/device';
import type { FreeLog, Habit, HabitEntry, LogType, SkipReason } from '@/models';

import { useFailure, type Failure } from './failure';
import {
  logAffordances,
  useQuickLog,
  type LogAffordances,
  type QuickLogToast,
  type StreakCelebration,
} from './useQuickLog';

/**
 * Today's recording path — SPEC §6.2.
 *
 * The hook is the ticket's test seam (jest.config.js: hooks + an in-memory repository,
 * no component render tests), so three things are deliberate:
 *
 * - the repository arrives through `RepositoryProvider`, never constructed here;
 * - `today` is a parameter. Day-state depends on it (`pending` vs `missed`,
 *   ADR-0001), so a test must be able to pin it;
 * - `date` — the day being looked at — is a second parameter, and a distinct one from
 *   `today`. `date` says which rows to read and which day to write to; `today`
 *   is the basis for `pending` vs `missed` and the §6.3 upper bound. The date control
 *   (§6.2 B4) moves the first and never the second: substituting `date` for `today` in
 *   the classifier would make every past day `pending` and quietly repeal ADR-0001;
 * - `now` is a parameter too. It stamps the row's `timestamp`, which is the domain's
 *   ordering key (§3.3), so pinning it is what makes the feed's order assertable.
 *
 * `new Date()` is therefore read only at the UI edge, in this file's defaults.
 *
 * **Nothing here stores a day's state.** Every state on screen is recomputed from the
 * rows by `dayStates` on each load, which is why appending a row is the whole of
 * recording — and why a later backfill repairs a past day for free (ADR-0001).
 */

export interface TodayHabitRow extends LogAffordances {
  habit: Habit;
  /**
   * Today for this habit, classified. **Absent** only when today is out of
   * classification scope *and* holds no rows — an empty paused day, on which the
   * engine has no opinion at all (ADR-0003). The habit is still selectable: logging
   * into a paused day is legitimate and still earns (§7.3).
   */
  day?: ClassifiedDay;
  /** The habit card's icon (`habitIcon`). */
  icon: string;
  /** "🕐 자기 전, 침대 옆에서", or `null` with no 언제·어디서. */
  cueLine: string | null;
  /** "✓ 했어요", "★ 목표까지 했어요" or "− 못 했어요", or `null` (`cardBadge`). */
  badge: string | null;
  /**
   * "6 / 10쪽", past the target "30쪽 · 목표 30쪽", or "아직이에요" on a yes/no habit
   * not done yet. `null` on a yes/no habit that is done, whose badge says it all.
   */
  progressLine: string | null;
  /** The bar's fill, 0..1 of the floor. `null` on a yes/no habit, which has no bar. */
  progressRatio: number | null;
  /** The floor is met today: ✓ button, `done` border and bar (§6.0 Visual rules). */
  floorMet: boolean;
  /** False only on a yes/no habit already done today: its ✓ button is disabled (§6.2). */
  canLog: boolean;
}

/** Which day a sheet writes to: today, or yesterday from the yesterday banner (B4). */
export type SheetDay = 'today' | 'yesterday';

/** One habit blank yesterday — a row of the yesterday list sheet (#135). */
export interface YesterdayBlank {
  habit: Habit;
  /** "📖 독서". */
  label: string;
}

/**
 * The yesterday banner (#135, §6.2): one banner over every habit whose yesterday is
 * `missed`. `null` when there is none, and on any date but today.
 */
export interface YesterdayBanner {
  count: number;
  /** "🌙 어제 명상 기록이 비어 있어요." or "🌙 어제 기록이 빈 습관 3개". */
  title: string;
  /**
   * The habit when exactly one is blank: 했어요 and 못 했어요 sit in the banner. `null`
   * with two or more: one 채우기 opens the list sheet.
   */
  single: Habit | null;
  blanks: YesterdayBlank[];
}

/** The record sheet (§6.2 Record sheet, `ReTodaySheet`), ready to render. */
export interface RecordSheetView {
  kind: 'record';
  habit: Habit;
  day: SheetDay;
  /** "📖 독서". */
  title: string;
  /** "지금 6쪽" on a count habit's today, else `null`. */
  sumLabel: string | null;
  isCount: boolean;
  unit: string;
  /** The stepper's start (B2). */
  defaultAmount: number;
  /** "지금 14:20", or "어제 12:00" for the noon-pinned backfill (B3). */
  timeLabel: string;
  /** "오늘 못 했어요 · 왜?", or `null` once the day holds activity (not skippable). */
  skipLabel: string | null;
  /** The one result line for the staged amount (C7a). */
  resultLine(amount: number): string;
}

/** The skip reason sheet (§6.2, `ReTodaySkip`). A reason chip records the skip at once. */
export interface SkipSheetView {
  kind: 'skip';
  habit: Habit;
  day: SheetDay;
  /** "🧘 명상". */
  eyebrow: string;
  /** "오늘 못 했어요 · 왜?" or "어제 못 했어요 · 왜?". */
  title: string;
}

/** The yesterday list sheet (`ReTodayYesterday`). */
export interface YesterdayListSheetView {
  kind: 'yesterdayList';
  /** "10월 9일 금요일". */
  eyebrow: string;
  title: string;
  blanks: YesterdayBlank[];
}

/**
 * The one sheet open on Today, or none. Derived each render from what is open and the
 * loaded rows, so a write that fills a blank shortens the list sheet with no patching.
 */
export type TodaySheet =
  | RecordSheetView
  | SkipSheetView
  | YesterdayListSheetView
  | { kind: 'freeLog' }
  | { kind: 'editEntry'; item: TodayHabitFeedItem }
  | { kind: 'editFree'; item: TodayFreeFeedItem };

/** What is open — the hook's only sheet state. Everything shown is derived from it. */
type SheetIntent =
  | { kind: 'record' | 'skip'; habitId: string; day: SheetDay; fromList: boolean }
  | { kind: 'yesterdayList' }
  | { kind: 'freeLog' }
  | { kind: 'edit'; id: string };

/** A habit row's line of the chronological feed (§6.2). */
export interface TodayHabitFeedItem {
  kind: 'habit';
  habit: Habit;
  entry: HabitEntry;
  /**
   * Was **this row** written by a backfill — a past-dated row carrying the §6.3 noon
   * pin? The feed shows its time column from the row's own stamp, so the note saying
   * the stamp is noon has to be true of the row, not of the date the screen happens to
   * be showing: a row genuinely logged at 09:00 yesterday sits in the same feed and
   * reads 09:00.
   *
   * Derived here rather than in the JSX for the usual reason: nothing under
   * `app/` is reachable by a test.
   */
  backfilled: boolean;
  /** What this row contributed, and the line that says so — see `TodayRowReward`. */
  reward: TodayRowReward;
  /** "07:10" — the row's local wall-clock time. */
  time: string;
  /** "📖 독서". */
  title: string;
  /** "6쪽", "✓ 했어요", or "못 했어요 · 깜빡함" on a skip row. */
  summary: string;
}

/**
 * A feed row's standing reward line (#37) — the canvas's `rewardtag` slot
 * (`design/parts/Today.body.html:88`), which every habit row has and only free logs
 * were filling (#16, `TodayFreeFeedItem.note`).
 *
 * The attribution rule is `attributeDayXP`'s — the delta this row caused when the day
 * is replayed in the §7.3 total order — and its docblock carries the decision and the
 * consequence that the row *crossing* the floor takes the floor XP. Decided here in the
 * hook rather than in the row's JSX for this file's standing reason: `jest.config.js`
 * matches `src/**` only, so `app/today.tsx` can be given words but no judgment.
 *
 * `xp` is on **every** habit row, skips included, because the sum over the feed's habit
 * rows is what has to equal `xpToday` — leaving a kind of row out would be assuming its
 * delta is zero rather than computing it.
 *
 * `line` is `null` for a **skip** row, and that is the coexistence decision: the canvas
 * puts the skip reason in this very slot (`design/parts/Today.logic.js:99`,
 * `reward: reason`), so the two are alternatives on one row, not two lines competing
 * for it. The row's memo and the backfill marker are unaffected — they are separate
 * lines the screen already stacks beneath this one.
 */
export interface TodayRowReward {
  /** This row's share of the day's XP. Can be 0 — most later rows of a day are. */
  xp: number;
  /** The reward line, or `null` when the row is a skip and shows its reason instead. */
  line: string | null;
  /**
   * Was the floor met as of this row? The canvas colours the slot by exactly this
   * condition — `rcls: after >= h.floor ? 'rewardtag' : 'rewardtag warn'`
   * (`design/parts/Today.logic.js:79`), i.e. `--good` vs `--partial`
   * (`design/_tokens.css:132–133`). The screen cannot derive it: it would need the
   * day's running sum through this row, which is what the replay above computes.
   */
  floorMet: boolean;
}

/**
 * A free log's line of the same feed (#16, §6.2 "habit entries and free logs
 * interleaved by timestamp"). It carries no habit and no amount: a `FreeLog` has no
 * `habitId` at all (§3.4, CONCEPT §9.4 deliberate decoupling).
 */
export interface TodayFreeFeedItem {
  kind: 'free';
  log: FreeLog;
  /**
   * The type's user-facing name (`LOG_TYPE_LABELS`). Resolved here rather than in the
   * row's JSX for the usual reason: `jest.config.js` matches `src/**` only, so a lookup
   * written in `app/` is one no test can reach.
   */
  label: string;
  /**
   * The row's single note line. The canvas's feed row has exactly one such slot
   * (`design/parts/Today.body.html:88`) and fills it with the user's text on one
   * instance (`Today.logic.js:20`) and with the no-score sentence on the other
   * (`:196`), so the two are alternatives: the text when there is one,
   * `FREE_LOG_NO_TEXT_NOTE` when there is not.
   *
   * A resolved string rather than a condition in the row's JSX, because choosing
   * between two sentences is a judgment and `jest.config.js` matches `src/**` only.
   */
  note: string;
  /** "07:10" — the log's local wall-clock time. */
  time: string;
  /** "✏️ 떠오른 생각". */
  title: string;
  /** The row's one line — `note`, under the name every feed row shares. */
  summary: string;
}

/**
 * One line of the chronological feed (§6.2), of either kind. A discriminated union
 * rather than one widened shape: the two rows share no field but the ordering pair,
 * and `kind` is what makes `tsc` name every place that has to tell them apart.
 */
export type TodayFeedItem = TodayHabitFeedItem | TodayFreeFeedItem;

/**
 * A feed item's id, across the two namespaces the feed now holds — a `HabitEntry.id`
 * or a `FreeLog.id`. One function because the screen reads it to key the list, to hold
 * the row being edited and to reopen it, and the merge below reads it to sort: four
 * copies of the same narrowing is one place for the two arms to drift apart.
 */
export function feedItemId(item: TodayFeedItem): string {
  return item.kind === 'free' ? item.log.id : item.entry.id;
}

/**
 * Why deleting one row deserves a confirm — the whole basis of the warning, derived so
 * that nothing is left for the JSX to judge. This repo has no component render
 * tests (jest.config.js), so a condition written in a screen is a condition nothing
 * asserts.
 *
 * Deliberately **not** a per-feed-item field: it is computed when the delete control is
 * pressed, because there is no reason to run the classifier once per visible row
 * (CLAUDE.md §2).
 *
 * The judgment itself is `src/domain/deleteEffect.ts`, shared with the habit journal
 * (#15), which asks the same question of past dates. This type only adds the habit the
 * confirm names.
 *
 * `app/today.tsx` renders **no** streak figure from `streakBefore`/`streakAfter`. This
 * feed only ever holds `date === today`, where an emptied day falls back to `pending`
 * rather than `missed` (ADR-0001, `streak.test.ts` — "keeps a pending today
 * transparent"), so nothing is broken and the honest number to quote would be "one
 * fewer day so far", which is not a warning. The `missed` reversal and the cut streak
 * belong to the screen that holds past-dated rows (#15).
 */
export interface DeleteEffect extends DeleteOutcome {
  habit: Habit;
}

/**
 * The date control (§6.2 B4) as **derived values**.
 *
 * Every judgment the stepper makes lives here rather than in the JSX: `testMatch` is
 * `<rootDir>/src/**` and there are no component render tests, so a condition written in
 * `app/today.tsx` is a condition nothing asserts. The screen applies *words* to these
 * fields (`design/parts/Backfill.body.html:15–23`) and decides nothing.
 */
export interface DateControl {
  /** The day being recorded. */
  date: string;
  /** True today — the §6.3 upper bound and the `pending`/`missed` basis (ADR-0001). */
  today: string;
  /**
   * Which of the three labels the date reads as (`Backfill.logic.js:67`): `오늘 · …`,
   * `어제 · …`, or the date alone. The *judgment* is here; the wording is the screen's.
   */
  kind: 'today' | 'yesterday' | 'other';
  /**
   * A non-today date — writes go through the §6.3 backfill rules (canvas `:65`), and
   * the `›` control is dead when it is false (canvas `:18`, i.e. `nextDate == null`).
   * One boolean, not three: `atToday` would be a second name for `!isBackfill` and a
   * third for `nextDate === null`, and three encodings of one fact are three chances
   * for a screen to read the stale one.
   */
  isBackfill: boolean;
  /**
   * Where `‹` and `›` move to, or `null` when the control is dead. `prevDate` stops at
   * `earliest`; `nextDate` stops at `today` — the future is blocked (§6.3).
   */
  prevDate: string | null;
  nextDate: string | null;
  /** Where the 어제 chip moves to; `null` when yesterday predates every habit on screen. */
  yesterdayDate: string | null;
  /**
   * The earliest selectable date: the **earliest `createdAt` among the visible habits**.
   * Per-habit range is per-habit (`isBackfillableDate`), but the stepper is
   * one control over several habits, so it takes the union and habits not yet created
   * on the chosen date simply drop out of `rows` — the footnote at
   * `Backfill.body.html:90` is what tells the user so. With no habits at all it equals
   * `today` and the stepper is pinned there.
   */
  earliest: string;
}

export interface TodayView {
  /**
   * The day being recorded — 'YYYY-MM-DD'. Today unless the date control stepped it
   * back (§6.2 B4), in which case every write to it is a backfill (§6.3).
   */
  date: string;
  /** The date control's derived state (§6.2 B4) — see `DateControl`. */
  dateControl: DateControl;
  /** "10월 10일 토요일" — the header above "오늘 할 일". */
  dateLabel: string;
  /** "✅ 3개 중 1개 했어요", or `null` with no habits. */
  countChip: string | null;
  /** "오늘 기록 2개" — the fold over `feed`. */
  foldLabel: string;
  /** The yesterday banner (#135), or `null` — see `YesterdayBanner`. */
  yesterdayBanner: YesterdayBanner | null;
  /** The open sheet, or `null` — see `TodaySheet`. */
  sheet: TodaySheet | null;
  /** `+` on a habit card, or 했어요 for yesterday (B4): the record sheet. */
  openRecord(habitId: string, day?: SheetDay): void;
  /** "{어느 날} 못 했어요 · 왜?", or 못 했어요 for yesterday: the skip reason sheet. */
  openSkip(habitId: string, day?: SheetDay): void;
  /** The banner's 채우기: the yesterday list sheet. */
  openYesterdayList(): void;
  /** "✏️ 끄적이기": the 끄적이기 sheet. */
  openFreeLog(): void;
  /** A feed row: its edit sheet, keyed on the row's id. */
  openFeedItem(id: string): void;
  /**
   * Close the open sheet. A record or skip sheet opened from the yesterday list goes
   * back to the list while it still has rows.
   */
  closeSheet(): void;
  /**
   * 기록하기 on the open record sheet: one activity row on its day (B1), today stamped
   * now and yesterday noon-pinned (B3, §6.3). Then the sheet closes, or returns to the
   * yesterday list while other habits are still blank. Rejects like `logActivity`.
   */
  recordFromSheet(amount: number, note?: string): Promise<void>;
  /** A reason chip on the open skip sheet: one skip row on its day at once (B5). */
  skipFromSheet(reason: SkipReason, note?: string): Promise<void>;
  /** The streak banner or milestone popup (§6.2) — see `StreakCelebration`. */
  celebration: StreakCelebration | null;
  dismissCelebration(): void;
  loading: boolean;
  /**
   * 실패한 **읽기**, 또는 `null`. 쓰기는 여기 오지 않는다 — 이 화면의 작성기·편집기가
   * 저마다 `try/catch` 로 카드 안에서 말하고, 실행취소만 `useQuickLog` 가 들고 있다.
   *
   * 읽기가 실패하면 `loading` 은 내려가되 화면은 빈 상태를 말하면 안 된다 — 서버가 단일
   * 원본이 된 뒤(ADR-0005) "아직 습관이 없습니다" 는 오프라인일 때 앱이 하는 거짓말이다.
   */
  failure: Failure | null;
  /**
   * The habits selectable **on `date`**, in repository order — the target selector's
   * options. Non-archived, and created on or before `date`: a habit that did
   * not exist yet cannot be backfilled into, and `isBackfillableDate` says so.
   */
  rows: TodayHabitRow[];
  /** The date's rows across all habits, in the domain total order (§7.3). */
  feed: TodayFeedItem[];
  /** Habits whose day is floor-met. `over` implies `done`, so both count (§4.1). */
  questsDone: number;
  /**
   * Everything recorded on `date` — the feed's length. Many habit rows per habit are
   * expected (§3.3), and free logs count too (#16): §6.2's tally is
   * "quests done / **logs** / XP earned today", and a free log is a log. The AC-4
   * exclusion list is XP·연속·하루 상태 — a count is none of those, and `questsDone`
   * and `xpToday` below are unchanged by a free log.
   */
  logCount: number;
  /**
   * XP the **selected day's** rows added, from the domain: `computeXP` over the history
   * with them minus `computeXP` over the history without them. Never a stored or
   * invented figure — the same before/after delta `describeLogEffect` takes (§4.2),
   * summed over the day instead of over one log.
   *
   * On a backfilled day the delta is measured against the whole history through
   * *today*, not through `date`: XP is run-keyed (streak bonuses, milestones), so what
   * the day's rows are worth is what removing them would cost overall.
   */
  xpToday: number;
  /**
   * Append one activity row (§6.2). Always a fresh `id`: multiple rows per
   * `(habit, day)` are expected and must never be merged or overwritten.
   *
   * Rejects `actual <= 0` — §3.3's invariant. A zero amount is not an activity row;
   * the state that means "didn't do it" is a skip row, which carries a reason.
   *
   * `opts.note` is the row's note (#77).
   */
  logActivity(habitId: string, actual: number, opts?: { note?: string }): Promise<void>;
  /**
   * Append one skip row for today — a reason chip's whole action (§6.2 B5), with the
   * note the user may have typed above the chips.
   *
   * Takes the **habit**, not a `habitId`, unlike `logActivity` above. That asymmetry
   * is deliberate: `logActivity(habitId, …)` is #10's published signature and is kept
   * as-is, whereas this is a new API, and the screen's chip row already holds the row
   * it is rendering — so there is no lookup and no "unknown habitId" branch to write.
   */
  logSkip(habit: Habit, reason: SkipReason, opts?: { note?: string }): Promise<void>;
  /**
   * Rewrite one existing row of the feed (#13, AC 1–3). Keyed on `entry.id`, so the
   * row count never grows; the caller passes the **whole** row, because the write
   * replaces the stored element — an omitted `timestamp` would silently reorder the
   * feed (§3.3).
   *
   * Rejects a row that breaks §3.3's discriminator, which is what makes the
   * activity ↔ skip transition safe. See `useQuickLog.editEntry`.
   */
  editEntry(entry: HabitEntry): Promise<void>;
  /**
   * Delete one **habit row** of the feed by id (#13, AC 4–6). Immediate and untoasted;
   * whether the screen should confirm first is `deletePreview`'s answer, not this
   * function's — so a caller that skips the check still deletes, exactly as AC 4
   * requires of the ordinary case.
   *
   * Throws on a free log's id rather than passing it to `deleteEntry`, which scans the
   * per-habit collections and silently no-ops on a miss
   * (`LocalRepository.deleteEntry`). A delete control that quietly does nothing is a
   * stored fact the user believes is gone; free logs go through `removeFreeLog`.
   */
  removeEntry(entryId: string): Promise<void>;
  /**
   * Does deleting this **habit row** need a result-aware confirm, and on what basis?
   * `null` means **no** — delete it immediately (AC 4), which is also the answer for
   * an id the feed does not hold and for a **free log's** id: a free log carries no
   * scoring weight (§3.4), so it can neither empty a habit's day nor erase a miss, and
   * #16 AC 6 asks for its delete to be immediate.
   *
   * The remaining row set is run back through the domain (`dayStates`, the shared walk that owns ADR-0003's scope rule) rather than
   * compared against a local rule of our own.
   */
  deletePreview(entryId: string): DeleteEffect | null;
  /**
   * Write one free log on **today** (#16 AC 1). Always a fresh `id`, and `date` is set
   * explicitly to today at creation — §3.4 makes `date` authoritative for grouping, so
   * it may never be left to be re-derived from `timestamp` in some other timezone.
   *
   * `opts.timestamp` is B3's time reveal, which §6.2 keeps for free logs; it orders the
   * row within the day and never contradicts its `date`. Rejects a call on a past date — see `freeLogAvailable`.
   */
  logFree(type: LogType, text: string, opts?: { timestamp?: string }): Promise<void>;
  /**
   * Rewrite one existing free log, keyed on `log.id` (#16 AC 5, AC 7 — `text`, `type`
   * and `timestamp` are all editable, §3.4). The caller passes the **whole** row for
   * the same reason `editEntry` does: the write replaces the stored element, so an
   * omitted `timestamp` would silently reorder the feed.
   */
  editFreeLog(log: FreeLog): Promise<void>;
  /**
   * Delete one free log by id — **immediate, no confirm** (#16 AC 6).
   *
   * §3.4 sends the reader to §6.2 for the delete rule, and §6.2 revised itself in
   * place ("*This revises the earlier blanket 'native Alert on every delete, no
   * undo-toast' rule*"): a deliberate delete is immediate for an ordinary row, and the
   * one guarded case is the **last remaining row of a date** or a **miss-bearing
   * skip**. A free log is neither — it carries no scoring weight (§3.4), so deleting
   * it empties no habit's day and erases no miss. Following §3.4's pointer therefore
   * yields "immediate", with nothing for `deletePreview` to warn about.
   */
  removeFreeLog(id: string): Promise<void>;
  /** The live 실행취소 toast for an append from the log form or the banner (B6). */
  toast: QuickLogToast | null;
  undoLast(): Promise<void>;
  /**
   * Read the repository again. Today is a tab and stays mounted (#126), so a write made
   * on another screen reaches it only when the screen calls this on focus.
   */
  reload(): void;
}

/**
 * One attributed row turned into the feed line — #37. The domain decides the number
 * (`attributeDayXP`) and `src/config/copy` owns the sentence; this is only the join,
 * plus the one judgment that is neither: a skip row shows its reason in this slot
 * instead (see `TodayRowReward`).
 */
function rowReward(habit: Habit, row: RowReward): TodayRowReward {
  return {
    xp: row.xp,
    floorMet: row.floorMet,
    line:
      row.entry.skipReason != null
        ? null
        : rowRewardLine({
            xp: row.xp,
            sum: row.sum,
            floor: habit.floor,
            floorMet: row.floorMet,
            crossedFloor: row.crossedFloor,
            crossedTarget: row.crossedTarget,
          }),
  };
}

/**
 * One habit card's words and marks (§6.2 Habit card, C7a). The sum is the domain's
 * (`progress.sum`), and the floor-met test is `isFloorMet`, so the card cannot disagree
 * with the count chip.
 */
function cardOf(habit: Habit, day: ClassifiedDay | undefined, affordances: LogAffordances) {
  const floorMet = isFloorMet(day?.state);
  const { sum, floor } = affordances.progress;
  const isCount = habit.kind === 'count';
  const cue = habit.cue?.trim();

  return {
    icon: habitIcon(habit),
    cueLine: cue != null && cue.length > 0 ? cueLine(cue) : null,
    badge: day == null ? null : cardBadge(day.state),
    progressLine: isCount
      ? cardProgressLine({
          sum,
          floor,
          unit: habit.floorUnit,
          target: day?.state === 'over' ? habit.target : undefined,
        })
      : floorMet || day?.state === 'skip'
        ? null
        : DAY_STATE_WORDS.pending,
    progressRatio: isCount ? Math.min(1, floor > 0 ? sum / floor : 0) : null,
    floorMet,
    canLog: isCount || !floorMet,
  };
}

/** "📖 독서" — a habit's icon and name, as sheets and rows head with it. */
function labelOf(habit: Habit): string {
  return `${habitIcon(habit)} ${habit.name}`;
}

/** A habit row's one summary line in the feed. */
function summaryOf(habit: Habit, entry: HabitEntry): string {
  if (entry.skipReason != null) {
    return `${DAY_STATE_WORDS.skip} · ${SKIP_REASON_LABELS[entry.skipReason]}`;
  }
  return habit.kind === 'binary' ? `✓ ${DAY_STATE_WORDS.done}` : `${entry.actual}${habit.floorUnit}`;
}

interface Loaded {
  rows: TodayHabitRow[];
  feed: TodayFeedItem[];
  xpToday: number;
  /** The stepper's lower bound — see `DateControl.earliest`. */
  earliest: string | null;
  /**
   * Each visible habit's rows from its birth through today, by habit id — the range
   * the load effect already reads for the XP delta, kept because `deleteOutcome`
   * recomputes the streak over exactly that range and `deletePreview` is synchronous.
   */
  history: Map<string, HabitEntry[]>;
}

const EMPTY: Loaded = {
  rows: [],
  feed: [],
  xpToday: 0,
  earliest: null,
  history: new Map(),
};

export function useToday({
  today = localToday(),
  date = today,
  now = () => new Date(),
}: { today?: string; date?: string; now?: () => Date } = {}): TodayView {
  const repository = useRepository();
  const { failure, report, clear } = useFailure();
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const [loading, setLoading] = useState(true);
  /**
   * Bumped by a write, so the load effect is the single place that reads.
   *
   * Note the deliberate difference from `useDashboard`: `loading` is raised only for
   * the first load, never for a reload. A log must not blank the tallies it just
   * changed, and "loading" here would describe a screen that is already on screen.
   */
  const [version, setVersion] = useState(0);

  // Stable, so the screen can hand it to `useFocusEffect`.
  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const habits = await repository.getHabits();
      // §3.2 — archived habits are gone from the logging surfaces. Paused ones are
      // not: pause is "later", not "over" (ADR-0003), and a paused day still records.
      const visible = habits.filter((habit) => habit.lifecycle !== 'archived');

      // The stepper's lower bound is the union over the habits on screen, so
      // it is taken before the per-date filter below narrows them.
      const earliest = visible
        .map((habit) => dateOf(habit.createdAt))
        .reduce<string | null>(
          (lowest, start) => (lowest == null || compareDates(start, lowest) < 0 ? start : lowest),
          null,
        );

      // A habit that did not exist on `date` is not shown at all, rather than
      // shown inert: `isBackfillableDate` is the domain's own answer to "may this habit
      // be written to on this day?", and a disabled row would need copy the canvas
      // does not have (its footnote `:90` already explains the absence).
      const selectable = visible.filter((habit) => isBackfillableDate(habit, date, today));

      const perHabit = await Promise.all(
        selectable.map(async (habit) => {
          // The XP delta is run-keyed (streak bonuses, milestones), so it needs the
          // habit's whole history **through today** — not merely through `date` — or a
          // backfill's worth would be measured against a truncated run. V1 keeps entry
          // volume small and §7.3 makes performance a non-criterion.
          const start = dateOf(habit.createdAt);
          const from = compareDates(start, date) < 0 ? start : date;
          const history = await repository.getEntries(habit.id, from, today);
          const rowsOnDate = history.filter((entry) => entry.date === date);
          const before = history.filter((entry) => entry.date !== date);

          return {
            habit,
            // `today` stays the last argument: it is what separates `pending`
            // from `missed`, and passing `date` would make every past day pending.
            day: dayStates(habit, rowsOnDate, date, date, today)[0],
            rowsOnDate,
            history,
            xp: computeXP(history, habit) - computeXP(before, habit),
            // #37 — the same two scores this `xp` is the difference of, taken one row
            // at a time. `before` is the baseline for both, so the rewards sum to `xp`.
            rewards: attributeDayXP(before, rowsOnDate, habit),
          };
        }),
      );

      const byId = new Map(selectable.map((habit) => [habit.id, habit]));
      const rewardById = new Map(
        perHabit.flatMap(({ habit, rewards }) =>
          rewards.map((row) => [row.entry.id, rowReward(habit, row)] as const),
        ),
      );
      const allRows = perHabit.flatMap((entry) => entry.rowsOnDate);
      // §3.4 — free logs are grouped by their own declared `date`, which is what
      // `getFreeLogs` filters on. They are read for **any** `date`, including a past
      // one: only *writing* them is today-only (`freeLogAvailable`).
      const freeLogs = await repository.getFreeLogs(date, date);

      const next: Loaded = {
        earliest,
        history: new Map(perHabit.map(({ habit, history }) => [habit.id, history])),
        rows: perHabit.map(({ habit, day }) => {
          const affordances = logAffordances(habit, day);
          return { habit, day, ...affordances, ...cardOf(habit, day, affordances) };
        }),
        // One sort over the habit rows **and** the free logs together, so the feed is
        // the domain's total order across both kinds (§6.2) — not a per-habit
        // concatenation, and not habit rows with free ones appended. The ordering pair
        // is lifted to the top level because that is all the two shapes share.
        // The ordering pair comes off each concrete row — `entry` or `log` — rather
        // than off the assembled item: at this point the two are still separate maps,
        // so neither arm has to ask what kind the other is. (`feedItemId` is for the
        // callers downstream, which hold a `TodayFeedItem` and nothing narrower.)
        feed: sortByDomainOrder([
          ...allRows.map((entry) => ({
            id: entry.id,
            timestamp: entry.timestamp,
            item: {
              kind: 'habit',
              habit: byId.get(entry.habitId) as Habit,
              entry,
              // On today there is nothing to have backfilled, and a row logged by hand
              // at 12:00 sharp would otherwise be labelled as one.
              backfilled:
                entry.date !== today && isBackfilledRow(entry, localNoonOn(entry.date)),
              reward: rewardById.get(entry.id) as TodayRowReward,
              time: localClock(entry.timestamp),
              title: labelOf(byId.get(entry.habitId) as Habit),
              summary: summaryOf(byId.get(entry.habitId) as Habit, entry),
            } satisfies TodayHabitFeedItem,
          })),
          ...freeLogs.map((log) => {
            const note = log.text.length > 0 ? log.text : FREE_LOG_NO_TEXT_NOTE;
            return {
              id: log.id,
              timestamp: log.timestamp,
              item: {
                kind: 'free',
                log,
                label: LOG_TYPE_LABELS[log.type],
                note,
                time: localClock(log.timestamp),
                title: `✏️ ${LOG_TYPE_LABELS[log.type]}`,
                summary: note,
              } satisfies TodayFreeFeedItem,
            };
          }),
        ]).map((row): TodayFeedItem => row.item),
        xpToday: perHabit.reduce((total, entry) => total + entry.xp, 0),
      };

      if (!cancelled) {
        setLoaded(next);
        clear();
        setLoading(false);
      }
    }

    load().catch(() => {
      if (cancelled) return;
      // 실패 기록과 `setLoading(false)` 는 한 쌍이다. 후자만 붙이면 무한 스피너가 "아직
      // 습관이 없습니다" 로 바뀔 뿐이고, 그것이 더 나쁘다 (`TodayView.failure`).
      setLoading(false);
      // 다시 시도는 `version` 카운터 — 읽기는 이 효과 하나뿐이다.
      report(LOAD_FAILED_NOTE, reload);
    });

    return () => {
      cancelled = true;
    };
  }, [repository, date, today, version]);

  function rowFor(habitId: string): TodayHabitRow | undefined {
    return loaded.rows.find((row) => row.habit.id === habitId);
  }

  const quick = useQuickLog({ date, today, now, onChange: reload });

  /**
   * #10's public signature, kept: the screen names a habit by id and this resolves it
   * from the loaded rows. A miss is a programmer error — the selector's options *are*
   * `rows` — so it throws rather than dropping the write on the floor.
   */
  async function logActivity(
    habitId: string,
    actual: number,
    opts?: { note?: string },
  ): Promise<void> {
    const row = rowFor(habitId);
    // Deliberately not user-facing Korean: the selector's options *are* `rows`, so a
    // miss is a bug in the caller, and `Composer`'s catch would otherwise show the
    // user "기록하지 못했어요" for a state that cannot occur. The one assertion string
    // in this file that should read as a defect report.
    if (row == null) throw new Error(`useToday.logActivity: unknown habitId ${habitId}`);

    await quick.logActivity(row.habit, actual, opts);
  }

  /** The feed's habit lines only — the ones `deleteEntry` and `deleteOutcome` know. */
  function habitItemFor(id: string): TodayHabitFeedItem | undefined {
    return loaded.feed.find(
      (item): item is TodayHabitFeedItem => item.kind === 'habit' && item.entry.id === id,
    );
  }

  function deletePreview(entryId: string): DeleteEffect | null {
    const item = habitItemFor(entryId);
    if (item == null) return null;

    const outcome = deleteOutcome(
      item.habit,
      loaded.history.get(item.habit.id) ?? [],
      item.entry,
      today,
    );

    // The **gate** is this screen's, not the domain's: `deleteOutcome` reports, and
    // Today asks for a confirm on the two consequences AC 5–6 name. The streak fields
    // are deliberately not part of it — see `DeleteEffect`.
    if (!outcome.emptiesDay && !outcome.carriesMiss) return null;

    return { habit: item.habit, ...outcome };
  }

  /**
   * The habit-delete path, guarded against the free-log ids the feed now also holds.
   * Not user-facing Korean, for the same reason `logActivity`'s throw is not: the only
   * caller is the row editor, which knows which kind of row it opened, so reaching
   * here with a free log's id is a defect in this app and not a state the user can
   * produce.
   */
  async function removeEntry(entryId: string): Promise<void> {
    const isFreeLog = loaded.feed.some(
      (item) => item.kind === 'free' && item.log.id === entryId,
    );
    if (isFreeLog) {
      throw new Error(`useToday.removeEntry: ${entryId} is a free log — use removeFreeLog`);
    }

    await quick.removeEntry(entryId);
  }

  /**
   * Every judgment the date control makes, derived here. `earliest` falls back
   * to `today` before the first load settles and when there are no habits at all, which
   * pins the stepper to today in both cases.
   */
  const earliest = loaded.earliest ?? today;
  const back = addDays(date, -1);
  const yesterday = addDays(today, -1);
  const dateControl: DateControl = {
    date,
    today,
    kind: date === today ? 'today' : date === yesterday ? 'yesterday' : 'other',
    isBackfill: date !== today,
    prevDate: compareDates(back, earliest) >= 0 ? back : null,
    nextDate: compareDates(date, today) < 0 ? addDays(date, 1) : null,
    yesterdayDate: compareDates(yesterday, earliest) >= 0 ? yesterday : null,
    earliest,
  };

  /**
   * The habits blank yesterday (#135): created by yesterday, and yesterday classified
   * `missed` through the domain over the loaded history. A paused yesterday has no
   * state at all (ADR-0003) and a reasoned skip is not blank, so neither is listed.
   *
   * Derived from the loaded snapshot, never held as state: a write reloads, and the
   * filled habit drops out of the list by itself. Withheld on any date but today — the
   * banner names 어제, which is only yesterday when the screen shows today.
   */
  const blanks: YesterdayBlank[] = dateControl.isBackfill
    ? []
    : loaded.rows
        .filter(
          (row) =>
            isBackfillableDate(row.habit, yesterday, today) &&
            dayStates(row.habit, loaded.history.get(row.habit.id) ?? [], yesterday, yesterday, today)[0]
              ?.state === 'missed',
        )
        .map((row) => ({ habit: row.habit, label: labelOf(row.habit) }));

  const yesterdayBanner: YesterdayBanner | null =
    blanks.length === 0
      ? null
      : {
          count: blanks.length,
          title: yesterdayBannerTitle(blanks.map((blank) => blank.habit.name)),
          single: blanks.length === 1 ? blanks[0].habit : null,
          blanks,
        };

  /**
   * May a **free log** be written to the day on screen? True only on today (#16).
   *
   * Reading a past day's free logs is unrestricted — they show in that day's feed —
   * but creating one is not: §6.2 B4 describes backfill entirely in habit terms, and
   * §6.3 is about repairing `missed` days — which a free log cannot do, since it
   * touches no day state at all. The §6.3 noon pin is `HabitEntry`-typed
   * (`nextBackfillTimestamp`), so a past-dated free log would need a second copy of
   * that convention for a need no AC states (CLAUDE.md §2).
   *
   * Taken off the date control rather than recomputed: "is the day on screen today?"
   * already has one encoding here (`isBackfill`), and a second would be free to drift.
   */
  const freeLogAvailable = !dateControl.isBackfill;

  async function logFree(
    type: LogType,
    text: string,
    opts: { timestamp?: string } = {},
  ): Promise<void> {
    if (!freeLogAvailable) {
      throw new Error(`useToday.logFree: ${date} is not today — free logs are today-only`);
    }

    await repository.upsertFreeLog({
      id: newId(),
      // Stated, never derived: §3.4 makes `date` authoritative for the day the log
      // belongs to, and `timestamp` is a UTC instant that lands on the neighbouring
      // day for anyone far enough east or west. The stamp must never contradict this.
      //
      // `today` and the screen's `date` are the **same string** wherever this runs —
      // the guard above withdraws the free path on any other day — so this is not a
      // behavioural choice and no test can tell the two apart. It is written as
      // `today` so the row's day does not quietly depend on that guard staying where
      // it is.
      date: today,
      timestamp: opts.timestamp ?? now().toISOString(),
      type,
      text: text.trim(),
    });
    reload();
  }

  async function editFreeLog(log: FreeLog): Promise<void> {
    await repository.upsertFreeLog({ ...log, text: log.text.trim() });
    reload();
  }

  async function removeFreeLog(id: string): Promise<void> {
    await repository.deleteLog(id);
    reload();
  }

  /**
   * The sheet state (§6.2): only *what is open*. The habit, its day's affordances and
   * the list's rows are read from the loaded snapshot each render.
   */
  const [intent, setIntent] = useState<SheetIntent | null>(null);

  /** The habit a record or skip sheet is about, on its day, with that day's affordances. */
  function sheetTarget(habitId: string, day: SheetDay) {
    if (day === 'yesterday') {
      const blank = blanks.find((b) => b.habit.id === habitId);
      if (blank == null) return null;
      const dayRow = dayStates(
        blank.habit,
        loaded.history.get(habitId) ?? [],
        yesterday,
        yesterday,
        today,
      )[0];
      return { habit: blank.habit, affordances: logAffordances(blank.habit, dayRow) };
    }
    const row = rowFor(habitId);
    return row == null ? null : { habit: row.habit, affordances: row as LogAffordances };
  }

  function sheetOf(open: SheetIntent | null): TodaySheet | null {
    if (open == null) return null;
    switch (open.kind) {
      case 'yesterdayList':
        return blanks.length === 0
          ? null
          : {
              kind: 'yesterdayList',
              eyebrow: longDateLabel(yesterday, weekdayOf(yesterday)),
              title: TODAY_COPY.yesterdayListTitle,
              blanks,
            };
      case 'freeLog':
        return { kind: 'freeLog' };
      case 'edit': {
        const item = loaded.feed.find((row) => feedItemId(row) === open.id);
        if (item == null) return null;
        return item.kind === 'habit' ? { kind: 'editEntry', item } : { kind: 'editFree', item };
      }
      case 'skip': {
        const target = sheetTarget(open.habitId, open.day);
        if (target == null) return null;
        return {
          kind: 'skip',
          habit: target.habit,
          day: open.day,
          eyebrow: labelOf(target.habit),
          title: skipSheetTitle(open.day === 'today' ? '오늘' : '어제'),
        };
      }
      case 'record': {
        const target = sheetTarget(open.habitId, open.day);
        if (target == null) return null;
        const { habit, affordances } = target;
        const dayWord = open.day === 'today' ? '오늘' : '어제';
        const isCount = habit.kind === 'count';
        const { sum } = affordances.progress;
        return {
          kind: 'record',
          habit,
          day: open.day,
          title: labelOf(habit),
          sumLabel: isCount && open.day === 'today' ? recordSumLabel(sum, habit.floorUnit) : null,
          isCount,
          unit: habit.floorUnit,
          defaultAmount: affordances.defaultAmount,
          // B3: a new row is stamped now, or at noon on a backfill.
          timeLabel: open.day === 'today' ? nowLabel(localClock(now())) : backfillTimeLabel(dayWord),
          skipLabel: affordances.skippable ? skipSheetTitle(dayWord) : null,
          resultLine: (amount: number) =>
            recordResultLine({
              sum,
              amount,
              floor: habit.floor,
              // The target the engine honours: count only, strictly above the floor.
              target: isCount && habit.target != null && habit.target > habit.floor ? habit.target : undefined,
              unit: habit.floorUnit,
              dayWord,
            }),
        };
      }
    }
  }

  const sheet = sheetOf(intent);

  /** Is the sheet opened next one of the yesterday list's own? */
  function cameFromList(): boolean {
    return intent?.kind === 'yesterdayList' || ((intent?.kind === 'record' || intent?.kind === 'skip') && intent.fromList);
  }

  function openRecord(habitId: string, day: SheetDay = 'today') {
    setIntent({ kind: 'record', habitId, day, fromList: cameFromList() });
  }

  function openSkip(habitId: string, day: SheetDay = 'today') {
    setIntent({ kind: 'skip', habitId, day, fromList: cameFromList() });
  }

  /**
   * Where a record or skip sheet goes once it is done or closed: back to the yesterday
   * list while another habit is still blank, else nowhere. Counted from the blanks
   * known now, less the one just filled, so it does not wait for the reload.
   */
  function after(open: SheetIntent, filled: string | null): SheetIntent | null {
    if (open.kind !== 'record' && open.kind !== 'skip') return null;
    if (!open.fromList) return null;
    return blanks.some((blank) => blank.habit.id !== filled) ? { kind: 'yesterdayList' } : null;
  }

  function closeSheet() {
    setIntent((open) => (open == null ? null : after(open, null)));
  }

  async function recordFromSheet(amount: number, note?: string): Promise<void> {
    if (sheet?.kind !== 'record' || intent == null) return;
    const opts = { note, date: sheet.day === 'yesterday' ? yesterday : undefined };
    await quick.logActivity(sheet.habit, amount, opts);
    setIntent(after(intent, sheet.day === 'yesterday' ? sheet.habit.id : null));
  }

  async function skipFromSheet(reason: SkipReason, note?: string): Promise<void> {
    if (sheet?.kind !== 'skip' || intent == null) return;
    const opts = { note, date: sheet.day === 'yesterday' ? yesterday : undefined };
    await quick.logSkip(sheet.habit, reason, opts);
    setIntent(after(intent, sheet.day === 'yesterday' ? sheet.habit.id : null));
  }

  const questsDone = loaded.rows.filter((row) => isFloorMet(row.day?.state)).length;

  return {
    date,
    dateControl,
    dateLabel: longDateLabel(date, weekdayOf(date)),
    countChip: loaded.rows.length === 0 ? null : countChipLabel(loaded.rows.length, questsDone),
    foldLabel: foldLabel(loaded.feed.length),
    yesterdayBanner,
    sheet,
    openRecord,
    openSkip,
    openYesterdayList: () => setIntent({ kind: 'yesterdayList' }),
    openFreeLog: () => setIntent({ kind: 'freeLog' }),
    openFeedItem: (id: string) => setIntent({ kind: 'edit', id }),
    closeSheet,
    recordFromSheet,
    skipFromSheet,
    celebration: quick.celebration,
    dismissCelebration: quick.dismissCelebration,
    loading,
    rows: loaded.rows,
    feed: loaded.feed,
    questsDone,
    logCount: loaded.feed.length,
    xpToday: loaded.xpToday,
    logActivity,
    logSkip: quick.logSkip,
    editEntry: quick.editEntry,
    removeEntry,
    deletePreview,
    logFree,
    editFreeLog,
    removeFreeLog,
    toast: quick.toast,
    failure: failure ?? quick.failure,
    undoLast: quick.undoLast,
    reload,
  };
}
