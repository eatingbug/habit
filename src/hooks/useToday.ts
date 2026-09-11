import { useEffect, useState } from 'react';

import { FREE_LOG_NO_TEXT_NOTE, FREE_TARGET_LABEL, LOG_TYPE_LABELS } from '@/config/copy';
import { useRepository } from '@/context/RepositoryContext';
import { isBackfilledRow, isBackfillableDate } from '@/domain/backfill';
import {
  type ClassifiedDay,
  classifyDay,
  dayStates,
  isFloorMet,
  sortDayRows,
} from '@/domain/classify';
import { addDays, compareDates, dateOf } from '@/domain/dates';
import { deleteOutcome, type DeleteOutcome } from '@/domain/deleteEffect';
import { sortByDomainOrder } from '@/domain/feed';
import { computeXP } from '@/domain/score';
import { localNoonOn, localToday, newId } from '@/lib/device';
import type { DayState, FreeLog, Habit, HabitEntry, LogType, SkipReason } from '@/models';

import {
  logAffordances,
  useQuickLog,
  type LogAffordances,
  type QuickLogToast,
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
 *   `today` (#14 D1). `date` says which rows to read and which day to write to; `today`
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
  /**
   * What the amount field starts prefilled with (B2). The day's first record gets the
   * habit's `floor` — "I did my minimum" is the dominant case; from the second record
   * on it gets the day's last amount, because a second log is usually another helping
   * of the same size.
   */
  defaultAmount: number;
  /**
   * The quick-add chips (B2): `+1` / `+최소량` / `직전값`, in that order and deduped —
   * `직전값` is absent on the day's first record because there is no previous amount.
   */
  quickChips: number[];
  /** The day's progress-to-floor line (C7a). `remaining` clamps at 0. */
  progress: { sum: number; floor: number; remaining: number };
  /**
   * True when the day is floor-met and the habit has no **effective** target, so the
   * screen can suggest setting one (C7a: "최소량을 넘기면 … 목표를 넌지시 권한다").
   * A `target <= floor` counts as no target, mirroring §4.1's defensive read.
   */
  suggestTarget: boolean;
}

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
   * Derived here rather than in the JSX for the usual reason (#14 D2): nothing under
   * `app/` is reachable by a test.
   */
  backfilled: boolean;
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
 * The target selector's free option. The value is the canvas's own tab id
 * (`design/parts/Today.logic.js:135`); habit ids are UUIDs, so it can never collide
 * with one.
 */
export const FREE_TARGET = 'free';

/** One option of the composer's target selector — a habit, or the free path. */
export interface TargetOption {
  value: string;
  label: string;
}

/**
 * Why deleting one row deserves a confirm — the whole basis of the warning, derived so
 * that nothing is left for the JSX to judge (#13 D2). This repo has no component render
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
 * The date control (§6.2 B4) as **derived values** — #14 D2.
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
   * The earliest selectable date: the **earliest `createdAt` among the visible habits**
   * (#14 D3). Per-habit range is per-habit (`isBackfillableDate`), but the stepper is
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
  loading: boolean;
  /**
   * The habits selectable **on `date`**, in repository order — the target selector's
   * options. Non-archived, and (#14 D3) created on or before `date`: a habit that did
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
   * `opts.timestamp` is the B3 time reveal: it overrides the default "now" for
   * ordering only — `date` is still today (§3.3).
   */
  logActivity(habitId: string, actual: number, opts?: { timestamp?: string }): Promise<void>;
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
   * What the day would become if `staged` were appended now (C7a) — the composer's
   * "→ 5/5 성공" preview. `null` only when `habitId` names no visible habit.
   *
   * The state comes from the real `classifyDay` over the day's rows plus a synthetic
   * one, never from a local `sum >= floor` comparison: a second copy of that rule is
   * how `over` and the defensive `target <= floor` read eventually drift apart (§4.1).
   */
  previewOf(habitId: string, staged: number): { sum: number; state: DayState } | null;
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
   * Computed the same way `previewOf` is: the remaining row set is run back through the
   * domain (`dayStates`, the shared walk that owns ADR-0003's scope rule) rather than
   * compared against a local rule of our own.
   */
  deletePreview(entryId: string): DeleteEffect | null;
  /**
   * May a **free log** be written to the day on screen? True only on today (#16).
   *
   * Reading a past day's free logs is unrestricted — they show in that day's feed —
   * but creating one is not: the canvas names the composer's free tab `오늘 일기`
   * (`design/parts/Today.logic.js:135`), §6.2 B4 describes the date control entirely
   * in habit terms ("A non-today entry is a **backfill** and follows the §6.3 rules"),
   * and §6.3 is about repairing `missed` days — which a free log cannot do, since it
   * touches no day state at all. The §6.3 noon pin is `HabitEntry`-typed
   * (`nextBackfillTimestamp`), so a past-dated free log would need a second copy of
   * that convention for a need no AC states (CLAUDE.md §2).
   *
   * A field rather than a condition in the JSX: `jest.config.js` matches `src/**` only,
   * so the screen hides the free tab when this is false and decides nothing itself.
   */
  freeLogAvailable: boolean;
  /**
   * What the composer's target selector offers on `date`, the free tab **first** as on
   * the canvas (`design/parts/Today.logic.js:135`). One list over both kinds, so the
   * screen's "is there anything to choose between?" test counts them together: gating
   * on the habits alone would hide the free tab on a one-habit install, which is the
   * commonest screen there is.
   *
   * Derived here and not in the screen because the list encodes two judgments —
   * whether the free path is on offer at all (`freeLogAvailable`) and which habits
   * exist on `date` (`rows`) — and `jest.config.js` matches `src/**` only, so a list
   * assembled in `app/` is one no test can reach. Which option is *selected* is UI
   * state and stays in the screen.
   */
  targetOptions: TargetOption[];
  /**
   * Does the screen's selection land on the free path? Asked rather than stored,
   * because a selection can go stale under the date control: `FREE_TARGET` held from
   * today and then stepped back would otherwise leave the screen with no composer at
   * all, since the free option is withdrawn on a past date. With no habits on `date`
   * the free path is the only one there is, so a null selection resolves to it too.
   */
  resolvesToFree(selectedId: string | null): boolean;
  /**
   * Write one free log on **today** (#16 AC 1). Always a fresh `id`, and `date` is set
   * explicitly to today at creation — §3.4 makes `date` authoritative for grouping, so
   * it may never be left to be re-derived from `timestamp` in some other timezone.
   *
   * `opts.timestamp` is B3's time reveal, which §6.2 says "applies to habit entries and
   * free logs alike"; it orders the row within the day and never contradicts its
   * `date`. Rejects a call on a past date — see `freeLogAvailable`.
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
  /** The live 실행취소 toast for a one-tap/quick-chip append (B6). */
  toast: QuickLogToast | null;
  undoLast(): Promise<void>;
}

/**
 * A day's **activity** rows only, in the domain total order (§7.3) — skip rows carry
 * `actual: 0`, which is not a legal staged amount and must never become a default or
 * a chip. Order comes from `sortDayRows`, never from the repository's array order.
 */
function activityRows(entries: HabitEntry[]): HabitEntry[] {
  return sortDayRows(entries.filter((entry) => entry.actual > 0 && entry.skipReason == null));
}

/**
 * Everything the composer reads off one habit's day — the prefilled amount, the quick
 * chips, the progress line and the target nudge — plus the shared one-tap affordances.
 */
function composerReadings(habit: Habit, day: ClassifiedDay | undefined) {
  const activity = activityRows(day?.entries ?? []);
  // The day's sum is the domain's (`dayStates`), never a second reduce of our own: two
  // sums drift, and the visible failure is one line contradicting the next.
  const sum = day?.sum ?? 0;
  const previous = activity[activity.length - 1]?.actual;

  return {
    ...logAffordances(habit, day),
    defaultAmount: previous ?? habit.floor,
    // Binary has no amount to stage, so it has no chips.
    quickChips:
      habit.kind === 'count'
        ? [...new Set([1, habit.floor, ...(previous == null ? [] : [previous])])]
        : [],
    progress: { sum, floor: habit.floor, remaining: Math.max(0, habit.floor - sum) },
    // C7a's second half. `target != null && target > floor` mirrors `effectiveTarget`
    // in `src/domain/classify.ts` — the same defensive read, not a new rule; a
    // `target <= floor` is meaningless and reads as no target at all (§3.2 / §4.1).
    //
    // The 최고기록 half of the nudge is deliberately **not** here: `personal_best`
    // already exists in the parked `statusLight.ts` and lands with #20. A second
    // implementation would be the duplication that module was written to prevent.
    suggestTarget:
      habit.kind === 'count' &&
      !(habit.target != null && habit.target > habit.floor) &&
      isFloorMet(day?.state),
  };
}

interface Loaded {
  rows: TodayHabitRow[];
  feed: TodayFeedItem[];
  xpToday: number;
  /** The stepper's lower bound (#14 D3) — see `DateControl.earliest`. */
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

  function reload() {
    setVersion((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const habits = await repository.getHabits();
      // §3.2 — archived habits are gone from the logging surfaces. Paused ones are
      // not: pause is "later", not "over" (ADR-0003), and a paused day still records.
      const visible = habits.filter((habit) => habit.lifecycle !== 'archived');

      // #14 D3 — the stepper's lower bound is the union over the habits on screen, so
      // it is taken before the per-date filter below narrows them.
      const earliest = visible
        .map((habit) => dateOf(habit.createdAt))
        .reduce<string | null>(
          (lowest, start) => (lowest == null || compareDates(start, lowest) < 0 ? start : lowest),
          null,
        );

      // #14 D3 — a habit that did not exist on `date` is not shown at all, rather than
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
            // `today` stays the last argument (#14 D1): it is what separates `pending`
            // from `missed`, and passing `date` would make every past day pending.
            day: dayStates(habit, rowsOnDate, date, date, today)[0],
            rowsOnDate,
            history,
            xp: computeXP(history, habit) - computeXP(before, habit),
          };
        }),
      );

      const byId = new Map(selectable.map((habit) => [habit.id, habit]));
      const allRows = perHabit.flatMap((entry) => entry.rowsOnDate);
      // §3.4 — free logs are grouped by their own declared `date`, which is what
      // `getFreeLogs` filters on. They are read for **any** `date`, including a past
      // one: only *writing* them is today-only (`freeLogAvailable`).
      const freeLogs = await repository.getFreeLogs(date, date);

      const next: Loaded = {
        earliest,
        history: new Map(perHabit.map(({ habit, history }) => [habit.id, history])),
        rows: perHabit.map(({ habit, day }) => ({
          habit,
          day,
          ...composerReadings(habit, day),
        })),
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
            } satisfies TodayHabitFeedItem,
          })),
          ...freeLogs.map((log) => ({
            id: log.id,
            timestamp: log.timestamp,
            item: {
              kind: 'free',
              log,
              label: LOG_TYPE_LABELS[log.type],
              note: log.text.length > 0 ? log.text : FREE_LOG_NO_TEXT_NOTE,
            } satisfies TodayFreeFeedItem,
          })),
        ]).map((row): TodayFeedItem => row.item),
        xpToday: perHabit.reduce((total, entry) => total + entry.xp, 0),
      };

      if (!cancelled) {
        setLoaded(next);
        setLoading(false);
      }
    }

    void load();

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
    opts?: { timestamp?: string },
  ): Promise<void> {
    const row = rowFor(habitId);
    // Deliberately not user-facing Korean: the selector's options *are* `rows`, so a
    // miss is a bug in the caller, and `Composer`'s catch would otherwise show the
    // user "기록하지 못했어요" for a state that cannot occur. The one assertion string
    // in this file that should read as a defect report.
    if (row == null) throw new Error(`useToday.logActivity: unknown habitId ${habitId}`);

    await quick.logActivity(row.habit, actual, opts);
  }

  function previewOf(habitId: string, staged: number): { sum: number; state: DayState } | null {
    const row = rowFor(habitId);
    if (row == null) return null;

    // A paused day holds no `ClassifiedDay` at all (ADR-0003), but it is still
    // loggable — so the rows come from `day?.entries ?? []`, not from a `day != null`
    // gate that would leave the composer with no preview.
    const entries = row.day?.entries ?? [];
    const synthetic: HabitEntry = {
      id: 'preview',
      habitId,
      date,
      // A preview is never stored, so the exact stamp only has to fall on the day —
      // the real one comes from `nextBackfillTimestamp` at write time (§6.3). Local
      // noon, not `${date}T12:00Z`: a UTC stamp lands on the neighbouring day for
      // anyone far enough east or west, and the preview would classify the wrong one.
      timestamp: date === today ? now().toISOString() : localNoonOn(date),
      actual: staged,
    };

    return {
      // The one sum, from `progress` — which takes it from the domain's `day.sum`.
      sum: row.progress.sum + staged,
      state: classifyDay([...entries, synthetic], row.habit, date, today),
    };
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
   * #14 D2 — every judgment the date control makes, derived here. `earliest` falls back
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

  // Taken off the date control rather than recomputed: "is the day on screen today?"
  // already has one encoding here (`isBackfill`), and a second would be free to drift.
  const freeLogAvailable = !dateControl.isBackfill;

  const targetOptions: TargetOption[] = [
    ...(freeLogAvailable ? [{ value: FREE_TARGET, label: FREE_TARGET_LABEL }] : []),
    ...loaded.rows.map((row) => ({ value: row.habit.id, label: row.habit.name })),
  ];

  function resolvesToFree(selectedId: string | null): boolean {
    return freeLogAvailable && (selectedId === FREE_TARGET || loaded.rows.length === 0);
  }

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

  return {
    date,
    dateControl,
    loading,
    rows: loaded.rows,
    feed: loaded.feed,
    questsDone: loaded.rows.filter(
      (row) => isFloorMet(row.day?.state),
    ).length,
    logCount: loaded.feed.length,
    xpToday: loaded.xpToday,
    logActivity,
    logSkip: quick.logSkip,
    editEntry: quick.editEntry,
    removeEntry,
    previewOf,
    deletePreview,
    freeLogAvailable,
    targetOptions,
    resolvesToFree,
    logFree,
    editFreeLog,
    removeFreeLog,
    toast: quick.toast,
    undoLast: quick.undoLast,
  };
}
