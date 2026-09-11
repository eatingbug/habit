/**
 * Every open number from CONCEPT §12 / SPEC §2.3 lives here as a named, documented
 * constant. Changing a threshold means editing exactly one file.
 *
 * All values are PLACEHOLDERS to be tuned empirically — the `TODO §12.x` markers name
 * what still needs a decision.
 */
export const TUNING = {
  // §12.2 — Stat taxonomy (1:N habit→stat, leaning default).
  // TODO §12.2: finalize the list and its cardinality.
  // Names follow `mvp/habiquest-linear.html` and the `design/` canvas, which the
  // visual-authority rule makes canonical for user-facing copy.
  stats: [
    { id: 'strength', name: '힘', icon: '💪' },
    { id: 'intelligence', name: '지능', icon: '📖' },
    { id: 'willpower', name: '의지', icon: '🧘' },
  ],

  // §12.3 — Progression math. XP is the single currency; cumulative XP drives stat level.
  /** Base "showed up" XP for a floor-met day (both habit kinds). */
  xpPerFloorCompletion: 60,
  /** count: bonus when the day's sum clears the target. */
  xpBonusTargetExceed: 60,
  /** count: XP per unit above the floor — intensity becomes XP. */
  xpPerAboveFloorUnit: 6,
  /** count: once-only longevity bonus, keyed on the longest run. */
  xpStreakBonus: { 7: 120, 30: 300 } as Record<number, number>,
  /** yes/no: run-length → base bonus XP. */
  binaryStreakMilestones: {
    5: 90,
    10: 180,
    20: 300,
    30: 450,
    60: 720,
    100: 1200,
  } as Record<number, number>,
  /** yes/no: each re-achievement of a milestone is worth half the previous one. */
  binaryMilestoneDecay: 0.5,
  /** A decayed award that rounds below this is dropped to 0 — rewards must not inflate. */
  milestoneBonusEpsilon: 1,
  /** Cumulative XP needed to reach each level (index = level).
   *  TODO §12.3: tune via playtest. */
  statLevelThresholds: [0, 420, 1200, 2700, 5400, 9000, 14000, 21000],

  // §12.4 — Status-light thresholds.
  statusLight: {
    /** 🟡 at this many diagnosis flags or more. */
    cautionMinFlags: 1,
    /** 🔴 (Forming) after this many consecutive miss days. */
    interventionConsecMiss: 2,
    /** 🔴 (Established) after this many weeks of declining actual … */
    establishedDeclWeeks: 3,
    /** …but ONLY when the latest week's total is at/below target (C5) — don't
     *  reproach a habit that merely settled back from an unsustainable peak. */
    establishedDeclineFloorGuard: true,
  },

  // §12.4 — Forming → Established transition.
  // NOTE (C7b): 30d is well under Lally's ~66-day median formation window. We keep
  // 30d@80% as the mode switch but retain light Forming scaffolding past day 30
  // (issue #20) rather than stripping support while automaticity is still weak.
  formingToEstablishedDays: 30,
  formingToEstablishedRate: 0.8,
  /**
   * The repetitions the §6.3 Forming expectation panel measures progress against —
   * Lally et al. (2010)'s ~66-day median to automaticity, the number the C7b note
   * above reconciles the 30-day mode switch with. Progress is counted in
   * `showedUpDays`, never in calendar days: a shaky stretch is "still forming", not
   * "failing" (canvas `design/parts/HabitDetail.body.html:17` — `41일째 / 보통 66일`).
   */
  formingExpectationDays: 66,

  // §12.5 — Reflection trigger. TODO §12.5: adaptive later.
  /** 0 = Sunday. */
  reflectionWeekday: 0,

  // §12.4 — Diagnosis thresholds.
  diagnosis: {
    /** Rule 1: below this floor-completion rate → "your floor may be too high". */
    lowFloorRateThreshold: 0.6,
    /** Rule 3: zero above-floor actual for this many weeks → stagnation. */
    stagnationAboveFloorWeeks: 3,
    /** Rule 4: below this completion rate + an empty cue/identity → fill it first. */
    lowCompletionForCuePrompt: 0.5,
    /** Rules 1 & 4 stay silent below this many engaged days (§4.4 min-sample guard). */
    minEngagedDaysForRate: 5,
    /** Rule 5: this many cue skips in the window → cue flag. */
    cueSkipThreshold: 2,
    /** Rule 5: this many 'too hard' skips → reinforce the floor flag. */
    floorSkipThreshold: 2,
    /** Rule 5: this many 'no meaning' skips → identity flag. */
    identitySkipThreshold: 2,

    // ADR-0002 — a run of `missed` days asks before it diagnoses (§4.4 / §6.4).
    /** Consecutive `missed` days that trigger the bulk-backfill prompt. */
    missedRunForBackfillPrompt: 3,
    /** …or this share of the last 14 days being `missed`. */
    missedRateForBackfillPrompt: 0.4,
  },

  /** Windows the diagnosis rules read, in days (§4.4). */
  windows: {
    floorRate: 28,
    cueCluster: 28,
    skipReason: 28,
    cuePrompt: 14,
    missedRate: 14,
  },

  /** Weeks of history the growth chart draws (§6.3, C4). */
  growthChartWeeks: 12,

  /** Heatmap width on the Dashboard row (§6.1). */
  heatmapDays: 20,

  /**
   * How long the 실행취소 toast stays live after a one-tap append (§6.2 B6).
   * TODO §12.x: tune the duration empirically.
   *
   * The **number** is a placeholder; the **mechanism** is not. Without a window the
   * toast survives until the next append, so 실행취소 stays armed indefinitely and a
   * press an hour later silently deletes a row the user has long forgotten recording.
   * Losing a stored fact that way is a §7.3 concern, not a polish item.
   */
  undoToastMs: 6000,
} as const;
