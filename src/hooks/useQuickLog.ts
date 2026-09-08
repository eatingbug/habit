import { useEffect, useState } from 'react';

import { SKIP_REASON_LABELS } from '@/config/copy';
import { TUNING } from '@/config/tuning';
import { useRepository } from '@/context/RepositoryContext';
import { type ClassifiedDay, isFloorMet } from '@/domain/classify';
import { newId } from '@/lib/device';
import type { Habit, SkipReason } from '@/models';

/**
 * The one-tap logging primitive — SPEC §6.1 / §6.2 (B1) and its undo toast (B6).
 *
 * This module owns the whole of "one tap logs" — both the **write** (`useQuickLog`)
 * and the **reading that shapes the control** (`logAffordances`). Splitting those was
 * the mistake the first cut made: the amount a tap appends was then computed
 * identically in two hooks, and "does today already hold activity?" ended up with two
 * different implementations whose equivalence nothing named.
 *
 * Both logging surfaces go through this hook: Today's composer and the Dashboard row.
 * There is deliberately **one** append/undo implementation, because the undo rule is
 * subtle enough that a second copy would eventually get it wrong — the id is minted
 * here, *before* the write, and carried on the toast, so 실행취소 deletes exactly the
 * row that was inserted. "Delete the newest row" would race a concurrent append and
 * throw away somebody else's fact.
 *
 * **No optimistic local mutation.** A write is followed by `onChange()`, and the
 * consuming hook reloads from the repository. The repository is a local KV, so the
 * reload is immediate; a speculative in-memory mutation would need a rollback path on
 * failure that nothing here asks for (CLAUDE.md §2). This is a decision, not a gap.
 *
 * The toast retires itself after `TUNING.undoToastMs`. Without a window it would
 * survive until the next append, leaving 실행취소 armed indefinitely — a press an hour
 * later would silently delete a row the user has long forgotten recording, which is a
 * stored fact lost (§7.3), not a cosmetic issue.
 *
 * `now` is a parameter for the same reason it is one on `useToday`: `timestamp` is the
 * domain's ordering key (§3.3), so a test has to be able to pin it.
 */

export interface QuickLogToast {
  /** The row 실행취소 will delete — minted before the write (§6.2 B6). */
  entryId: string;
  message: string;
  detail: string;
}

export interface QuickLog {
  /**
   * The live undo toast, or `null`. Replaced by each append, cleared by an undo or by
   * `TUNING.undoToastMs` elapsing.
   */
  toast: QuickLogToast | null;
  /**
   * Append one activity row. `opts.timestamp` overrides the default "now" — the B3
   * time reveal. `date` is always the day being recorded; `timestamp` only orders
   * within it (§3.3).
   *
   * Rejects `actual <= 0` — §3.3's invariant. A zero amount is not an activity row;
   * the state that means "didn't do it" is a skip row, which carries a reason.
   */
  logActivity(habit: Habit, actual: number, opts?: { timestamp?: string }): Promise<void>;
  /**
   * Append one **skip** row for today: `actual: 0` plus a reason (§3.3's row
   * discriminator, §6.2 B5). One chip tap is the whole gesture, so this takes the
   * reason directly — there is no confirm step and no second prompt.
   *
   * Deliberately **not** routed through `logActivity`: that function's `actual > 0`
   * guard is a §3.3 invariant, and loosening it so this could reuse it would let
   * `logActivity(habit, 0)` write a **reason-less zero row** — a row the domain says
   * cannot exist. The two functions share only the "mint the id, write, toast,
   * onChange" shape, which is four lines each and not worth an extraction (CLAUDE.md
   * §2).
   *
   * `opts.note` is the optional free-text note the user fills in *before* tapping a
   * chip, so the gesture stays two taps. It takes no `date`: this hook records today,
   * and reason-tagging a past day is backfill's job (#14).
   */
  logSkip(habit: Habit, reason: SkipReason, opts?: { note?: string }): Promise<void>;
  /**
   * Delete the row the toast names, by id. A no-op with no toast — including after
   * the toast's window elapsed, which is the whole point of the window.
   */
  undoLast(): Promise<void>;
  /** Retire the toast without touching the row. The auto-dismiss timer's own path. */
  dismissToast(): void;
}

export interface QuickLogOptions {
  /** The day being recorded — 'YYYY-MM-DD'. */
  today: string;
  now?: () => Date;
  /** Called after both the append and the undo, so the consumer reloads. */
  onChange: () => void;
}

/**
 * The toast's detail line (§6.2 B6 copy). It cannot be built from `floorUnit` alone:
 * a binary habit carries `floorUnit: 'time'`, so `+1${floorUnit}` would render
 * `+1time`. Its detail is the fixed `✓ 완료` instead.
 */
function detailOf(habit: Habit, actual: number): string {
  return habit.kind === 'binary' ? '✓ 완료' : `+${actual}${habit.floorUnit}`;
}

/**
 * What a one-tap control on a habit's day should do and say it does (§6.1 B1). Both
 * `TodayHabitRow` and `DashboardRow` extend this, so these two fields are documented
 * in one place instead of drifting apart in two row types.
 */
export interface LogAffordances {
  /**
   * Does the day already hold at least one **activity** row? The control then reads
   * `+1 더` rather than offering the whole minimum again.
   *
   * On a **binary** habit this is also the "already done" reading: its floor is 1, so
   * any activity row makes the day `done` and the control is shown completed and
   * disabled.
   */
  hasActivityToday: boolean;
  /**
   * What one tap appends: the `floor` on the day's first record, otherwise 1 — the
   * second tap is "+1 더", not a second whole minimum. Binary is always 1.
   */
  oneTapAmount: number;
  /**
   * The reason representing today when today is a **skip-only** day — what the chip
   * row shows as selected.
   *
   * Read straight off `day.skipReason`, which needs no extra condition: `dayStates`
   * populates it only when the day's state is `skip` (`classify.ts`), and §4.1's
   * precedence means a day holding any activity row is never in that state. So a day
   * an activity row covers already arrives here with no reason — the skip it holds
   * has no bearing on classification, misses or diagnosis, and must not be shown as
   * the day's answer.
   *
   * Derived here rather than in each screen for the same reason the two fields above
   * are: `TodayHabitRow` and `DashboardRow` both extend `LogAffordances`, so neither
   * screen reads `day.skipReason` itself and the two cannot drift.
   */
  skipReasonToday?: SkipReason;
}

/**
 * The one derivation behind both one-tap controls — Today's composer and the
 * Dashboard row. `day` is optional because an empty paused day has no state at all
 * (ADR-0003) and is still loggable.
 *
 * The activity test is read off the **day's state**, which is legitimate only because
 * of §4.1's precedence: activity overrides skip, so `partial`/`done`/`over` are
 * exactly the states a day with ≥1 activity row can hold, and `skip`/`missed`/
 * `pending` are exactly those it cannot. A day carrying only a reason-tagged skip is
 * therefore still on its first record and still offers the full minimum.
 */
export function logAffordances(habit: Habit, day: ClassifiedDay | undefined): LogAffordances {
  const hasActivityToday = day != null && (day.state === 'partial' || isFloorMet(day.state));

  return {
    hasActivityToday,
    // Binary has no amount: its floor is 1 and a row is always `actual: 1` (§3.3).
    oneTapAmount: habit.kind === 'count' && !hasActivityToday ? habit.floor : 1,
    skipReasonToday: day?.skipReason,
  };
}

export function useQuickLog({
  today,
  now = () => new Date(),
  onChange,
}: QuickLogOptions): QuickLog {
  const repository = useRepository();
  const [toast, setToast] = useState<QuickLogToast | null>(null);

  function dismissToast() {
    setToast(null);
  }

  /**
   * The undo window. Keyed on the toast's `entryId`, so a second append **restarts**
   * it rather than inheriting the first one's remaining time, and the cleanup cancels
   * the timer of a toast that was undone or replaced. Retiring goes through
   * `dismissToast`, so there is one way for a toast to end.
   */
  const liveToastId = toast?.entryId;
  useEffect(() => {
    if (liveToastId == null) return;

    const timer = setTimeout(dismissToast, TUNING.undoToastMs);
    return () => clearTimeout(timer);
  }, [liveToastId]);

  async function logActivity(
    habit: Habit,
    actual: number,
    opts: { timestamp?: string } = {},
  ): Promise<void> {
    if (!(actual > 0)) {
      throw new RangeError('활동 기록의 양은 0보다 커야 합니다 — 0은 건너뛰기입니다 (§3.3).');
    }

    // Minted here, not by the repository: the toast has to name the row before the
    // write so undo can never resolve to a different one.
    const entryId = newId();

    await repository.upsertEntry({
      id: entryId,
      habitId: habit.id,
      // `date` is the authoritative day (§3.3); `timestamp` only orders within it.
      date: today,
      timestamp: opts.timestamp ?? now().toISOString(),
      actual,
    });

    setToast({ entryId, message: '기록됨', detail: detailOf(habit, actual) });
    onChange();
  }

  async function logSkip(
    habit: Habit,
    reason: SkipReason,
    opts: { note?: string } = {},
  ): Promise<void> {
    // Same shape as `logActivity`: minted before the write, so the toast names the
    // row undo will delete and can never resolve to a different one.
    const entryId = newId();
    const note = opts.note?.trim();

    await repository.upsertEntry({
      id: entryId,
      habitId: habit.id,
      date: today,
      timestamp: now().toISOString(),
      actual: 0,
      skipReason: reason,
      // Absent, not empty: a stored '' would be indistinguishable from a real note.
      note: note != null && note.length > 0 ? note : undefined,
    });

    setToast({ entryId, message: '못 한 날로 기록했어요', detail: SKIP_REASON_LABELS[reason] });
    onChange();
  }

  async function undoLast(): Promise<void> {
    if (toast == null) return;

    await repository.deleteEntry(toast.entryId);
    // Cleared before the reload: a second press must not try to delete a gone row.
    dismissToast();
    onChange();
  }

  return {
    toast,
    logActivity,
    logSkip,
    undoLast,
    dismissToast,
  };
}
