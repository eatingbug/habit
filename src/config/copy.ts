import type { Habit, LogType, SkipReason } from '@/models';

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

/**
 * The four free-log type chips (§3.4, §6.2 "Free log path: type chips") — copy from
 * `design/parts/Today.logic.js:158`, the canvas's only source for them. Keyed in the
 * order §3.4 declares the `LogType` union, which is also the canvas's chip order, and
 * the chip row iterates these keys for the same reason `SKIP_REASON_LABELS`' consumers
 * do: a separate order array could silently omit a type while the `Record` still
 * type-checks.
 *
 * `win` reads `잘한 일` and `idea` reads `떠오른 생각` — the canvas's words, not the
 * 성취/아이디어 of the ticket's prose, which the canvas does not say anywhere.
 *
 * No emoji: the canvas seeds one on a single sample feed row
 * (`design/parts/Today.logic.js:20`) and defines none for the chips, so a set of four
 * would be copy we invented.
 */
export const LOG_TYPE_LABELS: Record<LogType, string> = {
  note: '메모',
  win: '잘한 일',
  mood: '기분',
  idea: '떠오른 생각',
};

/**
 * What a free log's feed row says on its note line when the user wrote no text — copy
 * from `design/parts/Today.logic.js:196`, the canvas's own `reward` for a
 * `feeditem freelog` row.
 *
 * The canvas's feed row has exactly one such slot (`design/parts/Today.body.html:88`,
 * `<span class="{{ f.rcls }}">{{ f.reward }}</span>`) and its two instances put
 * different things in it: the user's text on the seeded row (`Today.logic.js:20`) and
 * this sentence on a row just written (`:196`). So the two are alternatives, not two
 * lines — and the composer already carries the standing version of this hint
 * (`Today.body.html:58`), which is why repeating it under a row that says something is
 * not wanted either.
 *
 * Here rather than in the row's JSX because *which* of the two a row shows is a
 * judgment (`TodayFreeFeedItem.note`), and `jest.config.js` matches `src/**` only.
 */
export const FREE_LOG_NO_TEXT_NOTE = '점수에는 영향 없어요';

/**
 * The target selector's free option — the canvas's **first** tab
 * (`design/parts/Today.logic.js:135`, `{ id: 'free', label: '오늘 일기' }`).
 *
 * Beside the labels above rather than in the screen for the same reason: the option
 * list itself is `useToday.targetOptions`, and a hook cannot read copy that lives in
 * `app/`.
 */
export const FREE_TARGET_LABEL = '오늘 일기';

/** What `deleteConfirmLines` needs to know — see `useToday.DeleteEffect` for each. */
export interface DeleteConfirmFacts {
  habitName: string;
  /** The delete leaves no row at all for that `(habit, date)`. */
  emptiesDay: boolean;
  /** The delete erases a miss the day currently counts. */
  carriesMiss: boolean;
  /**
   * How the sentences name the day being changed. Defaults to `오늘`, which is the
   * only day `app/today.tsx` can delete from; the journal (§6.3) also holds past
   * dates and passes such a row's own date, because `오늘` would be false there.
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

/**
 * The toast's amount half (§6.2 B6 copy). It cannot be built from `floorUnit` alone:
 * a binary habit carries `floorUnit: 'time'`, so `+1${floorUnit}` would render
 * `+1time`. Its detail is the fixed `✓ 완료` instead.
 *
 * It sits here with the rest of the toast's copy rather than in the hook, so the
 * `+1time` guard has exactly one home.
 */
function detailOf(habit: Habit, actual: number): string {
  return habit.kind === 'binary' ? '✓ 완료' : `+${actual}${habit.floorUnit}`;
}

/** What the log-time toast needs to know about the log that just landed. */
export interface RewardToastFacts {
  /** The habit logged — `kind` and `floorUnit` shape the amount half of `detail`. */
  habit: Habit;
  /** The amount the row records. */
  actual: number;
  /**
   * The log's delta, as the primitives the cascade below reads — the caller takes them
   * off `describeLogEffect`'s `LogEffect` (§4.2 C1) and passes them one by one. The
   * type itself is not imported: see `rewardToastLines`. `savedAtRiskDay` is on
   * `LogEffect` and deliberately absent here — no line of this copy reads it.
   */
  xpGained: number;
  statLevelUp: boolean;
  streakMilestoneHit?: number;
  pushedToOver: boolean;
  floorCrossedToday: boolean;
  showedUp: boolean;
  /** Is the row on a date other than today? Only the "showed up" line reads this. */
  isBackfill: boolean;
  /**
   * The habit's stat's display name, or absent when `statId` names no configured stat
   * — the same data defect `useDashboard`'s optional `stat` describes. The level-up
   * line is then skipped rather than rendered with a hole in it, and the next branch
   * speaks instead.
   */
  statName?: string;
  /** The stat's level **after** this log — `computeStatLevel`, never recomputed here. */
  statLevel: number;
}

/**
 * The log-time toast's two derived slots — SPEC §4.2 C1 / §6.2, issue #17.
 *
 * Copy, not judgment about scoring: every fact arrives already decided by the domain. It sits
 * in `src/config` for the reason `deleteConfirmLines` does — `jest.config.js` matches
 * `src/**` only, so the same cascade written inside `app/` would be copy no test can
 * reach. And it takes **primitives** for that function's reason too: SPEC §2.2's
 * dependency rule puts `src/config` *below* `src/domain` ("Domain imports only models
 * and config"), so importing `LogEffect` here would invert that direction. The caller
 * is UI, may import both, and passes the fields this cascade reads.
 *
 * `detail` is the mono slot (`Toast`'s `.rx`): the amount, plus ` · +N XP` only when
 * the log actually earned some. A trailing `+0 XP` would be noise on a day whose XP
 * was already banked, and the honest word for that day is the `sub` line instead —
 * nothing goes unacknowledged.
 *
 * `sub` is one plain sentence, so the branches are a priority cascade, rarest first: a
 * level-up outranks a milestone, which outranks the day's own crossings. Copy is the
 * canvas's, from Today's four-way version (`design/parts/Today.logic.js:59`/`:63`) —
 * the one that has the sub-floor branch — plus the Dashboard's already-banked line
 * (`design/parts/Dashboard.logic.js:35`). One wording serves both screens, exactly as
 * the skip toast's does (see `logSkip` in `src/hooks/useQuickLog.ts`).
 *
 * Two lines are **캔버스 출처 없음 — 신규 문구**: the level-up and the milestone. The
 * canvas has no toast for either. `이어 간 날 {N}일 보너스` borrows its vocabulary from
 * `design/parts/YesNo.body.html:18` (`이어 간 날 보너스`), and the level-up line uses
 * the stat name and level the Dashboard's own stat card shows.
 *
 * **The one declared deviation:** the toast's main verb stays `기록됨` even on a log
 * that earned no XP, where both canvases swap their main line
 * (`design/parts/Dashboard.logic.js:35` → `이미 오늘 몫은 끝났어요`;
 * `design/parts/Today.logic.js:58` → `기록했어요 · XP 없음`). SPEC §6.2 B6 specifies that
 * literal string for the undo toast (`기록됨 +N {unit} · 실행취소`), the two canvases do
 * not agree with each other on what replaces it, and one wording serves both screens
 * here as the skip toast's already does. That day is acknowledged on `sub` instead.
 *
 * On a backfill the "showed up" line says `그 날` rather than the canvas's `오늘`
 * (`design/parts/Today.logic.js:59`), a mechanical substitution: it is the only
 * sentence here that names a day, and it would be plainly false beside a row filled
 * onto yesterday. The XP itself is not softened — a backfill earns for real (ADR-0001).
 */
export function rewardToastLines(facts: RewardToastFacts): { detail: string; sub?: string } {
  return {
    detail:
      detailOf(facts.habit, facts.actual) +
      (facts.xpGained > 0 ? ` · +${facts.xpGained} XP` : ''),
    sub:
      facts.statLevelUp && facts.statName != null
        ? `${facts.statName} 레벨 ${facts.statLevel}`
        : facts.streakMilestoneHit != null
          ? `이어 간 날 ${facts.streakMilestoneHit}일 보너스`
          : facts.pushedToOver
            ? '목표까지 넘었어요 🎯'
            : facts.floorCrossedToday
              ? '최소만큼 했어요 💪'
              : facts.showedUp
                ? `${facts.isBackfill ? '그 날' : '오늘'} 나타났어요`
                : facts.habit.kind === 'binary' && facts.xpGained === 0
                  ? 'XP는 하루 한 번만'
                  : '최소보다 더 했어요',
  };
}
