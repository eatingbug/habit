import { useEffect, useState } from 'react';

import { LOAD_FAILED_NOTE, WRITE_FAILED_NOTE } from '@/config/copy';
import { TUNING } from '@/config/tuning';
import { useRepository } from '@/context/RepositoryContext';
import { dayStates } from '@/domain/classify';
import { compareDates, dateOf, windowEndingAt } from '@/domain/dates';
import { heatCells, type HeatCell } from '@/domain/heatLevel';
import { computeStatXP, levelForXP, type HabitWithEntries } from '@/domain/score';
import { aggregateStatusCount, deriveStatusLight, type StatusLight } from '@/domain/statusLight';
import { computeStreak } from '@/domain/streak';
import { localToday } from '@/lib/device';
import type { Habit, SkipReason, Stat } from '@/models';

import { useFailure, type Failure } from './failure';
import {
  logAffordances,
  useQuickLog,
  type LogAffordances,
  type QuickLogToast,
} from './useQuickLog';

/**
 * The Dashboard's data path — SPEC §6.1.
 *
 * The hook is the ticket's test seam (jest.config.js: hooks + an in-memory repository,
 * no component render tests), so two things are deliberate:
 *
 * - the repository arrives through `RepositoryProvider`, never constructed here;
 * - `today` is a parameter. Day-state depends on it (`pending` vs `missed`,
 *   ADR-0001), so a test must be able to pin it. `new Date()` is read only at the UI
 *   edge, in this file's default.
 */

export interface DashboardRow extends LogAffordances {
  habit: Habit;
  /** Absent when `habit.statId` names no configured stat — a data defect, not a state. */
  stat?: Stat;
  /** `TUNING.heatmapDays` cells, ascending, ending today. */
  cells: HeatCell[];
  /**
   * Consecutive floor-met days ending today (§4.2) — the canvas's `🔥 N`
   * (`design/parts/Dashboard.body.html:38`).
   *
   * Never stored, always recomputed from the rows, which is what makes backfill a pure
   * repair: filling a `missed` date re-joins the runs on either side of it (ADR-0001,
   * #14). Read from the whole history, not the heatmap window — a run longer than
   * `TUNING.heatmapDays` would otherwise be silently clipped.
   */
  streak: number;
  /**
   * The row's 상태등 (§4.6) — `deriveStatusLight`, the whole diagnosis as one glyph.
   *
   * Derived here rather than in the screen for the reason `StatProgress` gives: the
   * screen has no test seam, and this is a judgment (which of four states a habit is
   * in), not a rendering. The screen only chooses the glyph for it.
   */
  statusLight: StatusLight;
}

/**
 * One stat card (§6.1, canvas `design/parts/Dashboard.body.html:11–15`) — #17 AC 1, AC 5.
 *
 * Every figure is resolved here and not in the screen: `jest.config.js` matches
 * `src/**` and there are no render tests, so a division written in JSX is arithmetic
 * nothing asserts. The screen applies words to these numbers.
 */
export interface StatProgress {
  stat: Stat;
  /** `levelForXP(computeStatXP(...))` — §4.2's one level definition (`.lv`). */
  level: number;
  /** The stat's cumulative XP, summed over every habit mapped to it. */
  xp: number;
  /**
   * XP still owed to the next level, or `null` at the **top** level, where there is no
   * next threshold — `levelForXP` stops at the last index of
   * `TUNING.statLevelThresholds`. Naively subtracting there would ship a negative
   * "다음 레벨까지", so the state is named instead of computed around.
   */
  xpToNextLevel: number | null;
  /**
   * The bar's fill, 0–1 — the share of the **current level's band** that is done, not
   * of the stat's whole XP. The canvas measures it the same way
   * (`design/parts/Dashboard.logic.js:66–68` divides by the band's own `span`). Full at
   * the top level, where the band has no width.
   */
  barFraction: number;
}

export interface DashboardView {
  rows: DashboardRow[];
  /**
   * The stat cards, one per `TUNING.stats` in its declared order — a stat with no
   * habits at all is still drawn, at level 0, because the canvas draws all three and a
   * card appearing only once a habit exists would read as a missing stat. Empty while
   * `loading`.
   */
  stats: StatProgress[];
  /**
   * The character header's `Lv.N` (canvas `design/parts/Dashboard.body.html:5`).
   * SPEC §4.2 defines the character level as the **highest** stat level; deriving it in
   * the screen would be a judgment no test can reach.
   */
  characterLevel: number;
  /**
   * 손볼 습관 N개 — the §4.6 aggregate the canvas puts beside the character block
   * (`design/parts/Dashboard.body.html:7`). `aggregateStatusCount`'s two counts summed:
   * 🟡 and 🔴 are both "손볼" — the chip is one number, and the two lights already
   * distinguish themselves on the rows below.
   *
   * Counted over the same non-archived habits the rows show. Paused habits contribute
   * nothing by construction — `deriveStatusLight` returns `stable` for them (ADR-0003).
   */
  shaky: number;
  loading: boolean;
  /**
   * 실패한 읽기나 실패한 한 번 누르기, 또는 `null`.
   *
   * **`loading` 이 거짓이라고 화면이 빈 것은 아니다.** 읽기가 실패해도 `loading` 은
   * 내려가야 하지만(안 그러면 "불러오는 중…" 이 영원히 남는다), 그렇다고 `rows` 가
   * 비었으니 "아직 습관이 없습니다" 라고 말하면 앱이 사용자 기록이 없다고 **주장하는**
   * 것이라 멈춘 것보다 나쁘다. 이 값이 있으면 화면은 빈 상태 대신 실패를 말한다.
   *
   * 한 번 누르기가 여기 있는 이유는 이 화면에만 받을 곳이 없기 때문이다. `app/today.tsx`
   * 와 `app/habit/[id].tsx` 의 작성기는 자기 `try/catch` 로 카드 안에서 실패를 말하지만,
   * 대시보드의 행 버튼은 `void logActivity(...)` 라 실패가 어디에도 닿지 않는다 — 이
   * 티켓이 "최악의 버그" 라고 부르는 바로 그 모양이다.
   */
  failure: Failure | null;
  /**
   * One-tap logging on the row (§6.1 B1) with its 실행취소 toast (B6) — the same
   * primitive Today's composer uses, so there is only one append/undo implementation.
   *
   * Takes the habit itself: the row the screen is rendering already holds it, so
   * there is nothing to look up and no "habit not found" branch to write.
   */
  logActivity(habit: Habit, actual: number): Promise<void>;
  /**
   * Reason-tag today as a skip (§6.1 B5) — what the long-press chips call. The same
   * primitive Today's chip row uses, so there is one skip-write implementation.
   */
  logSkip(habit: Habit, reason: SkipReason, opts?: { note?: string }): Promise<void>;
  toast: QuickLogToast | null;
  undoLast(): Promise<void>;
}

function statFor(statId: string): Stat | undefined {
  return TUNING.stats.find((stat) => stat.id === statId);
}

/** The card's four numbers, from the stat's XP. See `StatProgress` for each. */
function statProgress(stat: Stat, all: HabitWithEntries[]): StatProgress {
  const xp = computeStatXP(stat.id, all);
  const level = levelForXP(xp);
  const thresholds = TUNING.statLevelThresholds;
  const next = thresholds[level + 1];

  if (next == null) return { stat, level, xp, xpToNextLevel: null, barFraction: 1 };

  const base = thresholds[level];
  return {
    stat,
    level,
    xp,
    xpToNextLevel: next - xp,
    barFraction: (xp - base) / (next - base),
  };
}

export function useDashboard({ today = localToday() }: { today?: string } = {}): DashboardView {
  const repository = useRepository();
  const { failure, report, clear, attempt } = useFailure();
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [stats, setStats] = useState<StatProgress[]>([]);
  const [shaky, setShaky] = useState(0);
  const [loading, setLoading] = useState(true);
  /**
   * Bumped by a write, so the load effect is the single place that reads. `loading` is
   * raised only for the first load, never for a reload — matching `useToday`: a
   * one-tap log must not blank the row it just changed, and "loading" would describe a
   * row that is already on screen (§6.1: the row updates in place).
   */
  const [version, setVersion] = useState(0);

  function reload() {
    setVersion((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;

    const window = windowEndingAt(today, TUNING.heatmapDays);
    const from = window[0];
    const to = window[window.length - 1];

    async function load() {
      const habits = await repository.getHabits();

      const loaded = await Promise.all(
        habits.map(async (habit) => {
          // `computeStreak` walks back to `createdAt`, so the fetch starts at whichever
          // of the two is earlier; `heatCells` is given its own window either way.
          const start = dateOf(habit.createdAt);
          const entries = await repository.getEntries(
            habit.id,
            compareDates(start, from) < 0 ? start : from,
            to,
          );

          // The rows and the stat cards read the same fetch, from two angles: the row
          // is what the habit shows, `entries` is what its stat is owed.
          return {
            habit,
            entries,
            row: {
              habit,
              stat: statFor(habit.statId),
              cells: heatCells(habit, entries, from, to, today),
              streak: computeStreak(entries, habit, today),
              statusLight: deriveStatusLight(habit, entries, today),
              // The one-tap control reads a classified day, not a heat cell: a cell is
              // a *rendering* instruction, and deriving an affordance from one is how
              // this drifted away from Today's identical derivation once already.
              ...logAffordances(habit, dayStates(habit, entries, today, today, today)[0]),
            },
          };
        }),
      );

      if (!cancelled) {
        // §3.2 — archived habits are hidden from the Dashboard. Paused ones are not:
        // pause is "later", not "over" (ADR-0003), and it stays visible to be resumed.
        const visible = loaded.filter(({ habit }) => habit.lifecycle !== 'archived');
        setRows(visible.map(({ row }) => row));
        // The chip's number comes from the domain, not from counting `rows` here: the
        // rules for what counts (paused ignored, an entry-less habit absent rather than
        // an error) are `aggregateStatusCount`'s, and `statusLight.test.ts` is where
        // they are asserted.
        const shakyCount = aggregateStatusCount(
          visible.map(({ habit }) => habit),
          Object.fromEntries(visible.map(({ habit, entries }) => [habit.id, entries])),
          today,
        );
        setShaky(shakyCount.caution + shakyCount.intervention);
        // The stat cards read **every** habit, archived included. AC 5 calls the figure
        // cumulative XP, and ADR-0003's rule that a recorded day's earnings are never
        // clawed back applies here too: filtering the same list the rows use would drop
        // a user's stat level the moment they tidied a finished habit away.
        setStats(
          TUNING.stats.map((stat) =>
            statProgress(
              stat,
              loaded.map(({ habit, entries }) => ({ habit, entries })),
            ),
          ),
        );
        clear();
        setLoading(false);
      }
    }

    load().catch(() => {
      if (cancelled) return;
      // `setLoading(false)` 를 **실패 기록과 같이** 한다. 이것만 붙이면 무한 스피너가
      // "아직 습관이 없습니다" 로 바뀔 뿐이라 함정이다 (`DashboardView.failure`).
      setLoading(false);
      // 다시 시도는 이 훅이 이미 가진 `version` 카운터다 — 읽기는 이 효과 하나뿐이므로
      // 그것을 올리면 같은 읽기가 그대로 다시 돈다.
      report(LOAD_FAILED_NOTE, reload);
    });

    return () => {
      cancelled = true;
    };
  }, [repository, today, version]);

  const quick = useQuickLog({ today, onChange: reload });

  return {
    rows,
    stats,
    characterLevel: stats.reduce((highest, stat) => Math.max(highest, stat.level), 0),
    shaky,
    loading,
    // 실행취소의 실패는 `useQuickLog` 가 들고 있다 — 한 배너 자리를 둘이 나눠 쓴다.
    failure: failure ?? quick.failure,
    logActivity: (habit, actual) =>
      attempt(WRITE_FAILED_NOTE, () => quick.logActivity(habit, actual)),
    logSkip: (habit, reason, opts) =>
      attempt(WRITE_FAILED_NOTE, () => quick.logSkip(habit, reason, opts)),
    toast: quick.toast,
    undoLast: quick.undoLast,
  };
}
