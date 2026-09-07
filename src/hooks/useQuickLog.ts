import { useEffect, useState } from 'react';

import { TUNING } from '@/config/tuning';
import { useRepository } from '@/context/RepositoryContext';
import { newId } from '@/lib/device';
import type { Habit } from '@/models';

/**
 * The one-tap logging primitive — SPEC §6.1 / §6.2 (B1) and its undo toast (B6).
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
  logActivity(habitId: string, actual: number, opts?: { timestamp?: string }): Promise<void>;
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
  /** The habit the row belongs to. `undefined` only if it vanished mid-render. */
  habitOf(habitId: string): Habit | undefined;
}

/**
 * The toast's detail line (§6.2 B6 copy). It cannot be built from `floorUnit` alone:
 * a binary habit carries `floorUnit: 'time'`, so `+1${floorUnit}` would render
 * `+1time`. Its detail is the fixed `✓ 완료` instead.
 *
 * A missing habit falls back to the bare amount. A toast is not the place to surface
 * a data defect — the row was written either way, and undo still works.
 */
function detailOf(habit: Habit | undefined, actual: number): string {
  if (habit == null) return `+${actual}`;
  return habit.kind === 'binary' ? '✓ 완료' : `+${actual}${habit.floorUnit}`;
}

export function useQuickLog({
  today,
  now = () => new Date(),
  onChange,
  habitOf,
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
  useEffect(() => {
    if (toast == null) return;

    const timer = setTimeout(dismissToast, TUNING.undoToastMs);
    return () => clearTimeout(timer);
  }, [toast?.entryId]);

  async function logActivity(
    habitId: string,
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
      habitId,
      // `date` is the authoritative day (§3.3); `timestamp` only orders within it.
      date: today,
      timestamp: opts.timestamp ?? now().toISOString(),
      actual,
    });

    setToast({ entryId, message: '기록됨', detail: detailOf(habitOf(habitId), actual) });
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
    undoLast,
    dismissToast,
  };
}
