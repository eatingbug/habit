import type { SkipReason } from '@/models';

/**
 * User-facing strings that no single layer can own.
 *
 * `deleteConfirmLines` is copy a **component** renders, assembled from conditions a
 * **hook** derives (`useToday.deletePreview`) — and a pure function in `app/` is
 * unreachable by any test, since `jest.config.js` matches `src/**` only. So it sits
 * here, where the three conditionals that *are* the judgment can be asserted.
 *
 * The skip reason labels are needed by a **hook** (`useQuickLog` puts one on the undo
 * toast's detail line) and by a **component** (`SkipReasonChips` renders all four).
 * Neither can own them: a hook importing a component is a layer inversion, and a hook
 * importing the component that renders the chips would be exactly that. `src/config/`
 * already holds user-facing names for this reason — `TUNING.stats` carries the
 * canvas's 힘/지능/의지.
 *
 * Deliberately **not** in `tuning.ts`: that file declares itself to hold only the open
 * *numbers* to be tuned empirically, and these are fixed copy from the design canvas.
 */

/**
 * The four reason chips (SPEC §6.2 B5) — copy from
 * `design/parts/RowSkip.body.html:21–24`, which is the only canvas source carrying
 * all four. `design/parts/Today.logic.js:150–153` holds just three (안 내킴 is
 * missing) and its long forms (`깜빡함 — 할 시간이 안 정해짐`) therefore do not exist
 * for every reason, so the short labels are what both surfaces use.
 *
 * Declaration order **is** the on-screen order (the canvas's chip order, unchanged),
 * and consumers iterate these keys rather than a separate order array: such an array
 * could silently omit a reason — the `Record` would still type-check while the chip
 * vanished from the row. Every key is non-numeric, so JS guarantees `Object.keys`
 * returns them in this order.
 */
export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  cue: '깜빡함',
  floor: '너무 힘듦',
  exception: '예외',
  identity: '안 내킴',
};

/** What `deleteConfirmLines` needs to know — see `useToday.DeleteEffect` for each. */
export interface DeleteConfirmFacts {
  habitName: string;
  /** The delete leaves no row at all for that `(habit, date)`. */
  emptiesDay: boolean;
  /** The delete erases a miss the day currently counts. */
  carriesMiss: boolean;
  /**
   * How the sentences name the day being changed. Defaults to `오늘`, which is the
   * only day `app/today.tsx` can delete from; the journal (§6.3) holds past-dated
   * rows and passes that row's own date, because `오늘` would be false there.
   */
  dayLabel?: string;
  /**
   * The run before and after the delete, both figures, when the caller has decided
   * the user should be told (`useHabitDetail.showsStreak`). Absent ⇒ no streak clause:
   * on today there is nothing to break, since an emptied today falls back to `pending`
   * (ADR-0001), which is why `app/today.tsx` never passes them.
   *
   * Both numbers, never their difference: `20일 → 4일` says which is which.
   */
  streakBefore?: number;
  streakAfter?: number;
  /**
   * The day's new reading, already resolved to screen copy by the caller — the state →
   * label map is the screen's (`stateLabel`), so this file takes the label, not a
   * `DayState`. **Absent** for a paused date the engine has no opinion about
   * (ADR-0003), and the line is then omitted rather than guessed.
   */
  stateAfterLabel?: string;
}

/**
 * The delete confirm's body (SPEC §6.2 / #13 AC 5–6), one clause per consequence.
 *
 * Takes primitives rather than a `DeleteEffect`: `src/config` importing a hook's type
 * would invert the layer direction (§2.2).
 *
 * **캔버스 출처 없음 — 신규 문구.** `design/parts/` holds no delete confirm at all.
 * 근거: `design/parts/Backfill.body.html:67` is the canvas's one consequence notice,
 * and it names **what changes** before anything else ("원래 있던 기록을 지우지 않고
 * 옆에 더해집니다. 실패로 잡혀 있던 날이면 성공으로 바뀌고 …"). These lines follow
 * that register, in the same order: what is lost first, then the day's new reading.
 *
 * The miss clause deliberately carries **no day-state label**. `stateLabel('skip')`
 * reads `못 함`, and the two clauses can appear together (a miss-carrying skip with
 * another row surviving): "…'못 함' 기록이 사라져요. 지운 뒤 오늘: 못 함" would use
 * one term for the 미스 being erased and for the day's surviving state, one sentence
 * apart, which is the mixing `CONTEXT.md`'s glossary forbids. It would also give the
 * label a second source, three lines below a docblock promising the map stays the
 * screen's. So the clause names what the row was **counted as** (실패) and what stops
 * — never how the day now reads.
 *
 * Every clause is the caller's to ask for, and two of them are asked for by only one
 * screen:
 * - the streak figures, which need a **past** date whose run actually changes. Today
 *   is still open, so emptying it leaves it `pending` and breaks nothing (ADR-0001) —
 *   `app/today.tsx` passes neither number and gets no such clause.
 * - the day's new reading, omitted without a `stateAfterLabel`: the engine has no
 *   opinion about an empty paused day (ADR-0003), so neither does the sentence.
 *
 * The day is never called `missed`. A day whose last row is deleted is repairable by
 * the same gesture that emptied it, and the clauses say what is lost, not that the day
 * has failed.
 */
export function deleteConfirmLines(facts: DeleteConfirmFacts): string[] {
  const lines: string[] = [];
  const day = facts.dayLabel ?? '오늘';
  if (facts.emptiesDay) {
    lines.push(`이 기록을 지우면 ${day} ${facts.habitName}에 남는 기록이 없어요.`);
  }
  if (facts.carriesMiss) {
    lines.push('실패로 세던 기록이 바로 이 줄이라, 지우면 그 실패는 더 세지 않아요.');
  }
  if (facts.streakBefore != null && facts.streakAfter != null) {
    lines.push(`연속 날수가 다시 계산돼요 — ${facts.streakBefore}일 → ${facts.streakAfter}일.`);
  }
  if (facts.stateAfterLabel != null) {
    lines.push(`지운 뒤 ${day}: ${facts.stateAfterLabel}`);
  }
  return lines;
}
