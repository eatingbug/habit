/**
 * config/tuning.ts — the §12 placeholder file.
 *
 * Every open number from CONCEPT §12 / SPEC §2.3 lives here as a named, documented
 * constant. Changing a threshold requires editing exactly this one file. All values
 * are PLACEHOLDERS to be tuned empirically via playtest data (CONCEPT §12, SPEC §9).
 */
export const TUNING = {
  // §12.2 — Stat taxonomy (1:N habit→stat, leaning default).
  // TODO §12.2: finalize the list and cardinality.
  stats: [
    { id: 'strength', name: '힘', icon: '💪' },
    { id: 'intelligence', name: '지능', icon: '📖' },
    { id: 'willpower', name: '의지', icon: '🧘' },
  ],

  // §10 / §12.3 — Progression math (PLACEHOLDER values — adjust empirically).
  // XP is the single progression currency; cumulative XP drives stat level (levelForXP).
  xpPerFloorCompletion: 60, // base "showed up" XP per floor-met day (both kinds)
  xpBonusTargetExceed: 60, // count: additional XP on top of base when target exceeded (over)
  xpPerAboveFloorUnit: 6, // count: XP per unit above the floor (intensity → XP)
  xpStreakBonus: {
    // count: once-only longevity bonus, keyed on the longest run reaching each milestone
    7: 120,
    30: 300,
  } as Record<number, number>,
  // binary (yes/no): bonus XP when a streak run reaches each milestone (run-length → base).
  // Re-achieving a milestone after the streak breaks awards base * binaryMilestoneDecay^(k-1).
  binaryStreakMilestones: {
    5: 90,
    10: 180,
    20: 300,
    30: 450,
    60: 720,
    100: 1200,
  } as Record<number, number>,
  binaryMilestoneDecay: 0.5, // each repeat of a milestone is worth half the previous one
  milestoneBonusEpsilon: 1, // a single decayed award rounding below this is dropped to 0
  statLevelThresholds: [
    // cumulative XP required to reach each level (index = level). Calibrated for the XP
    // scale (~60 XP per floor-met day → ~420 for a consistent week).
    0, 420, 1200, 2700, 5400, 9000, 14000, 21000,
  ],

  // Week-boundary math. Used by statusLight (personal_best / declining trend),
  // diagnose (stagnation), and ReflectionSession.weekOf. SPEC §3.5 says weekOf is the
  // Monday of the reflected week, so weeks start on Monday. This is distinct from the
  // reflection *nudge* day below.
  weekStartsOn: 1, // 0 = Sunday, 1 = Monday

  // §12.5 — Reflection trigger (PLACEHOLDER: fixed Sunday nudge; adaptive later).
  reflectionWeekday: 0, // 0 = Sunday — the nudge day, NOT the week boundary

  // §12.4 — Status-light thresholds (PLACEHOLDER).
  statusLight: {
    cautionMinFlags: 1, // 🟡 at >= this many diagnosis flags
    interventionConsecMiss: 2, // 🔴 (Forming) after this many consecutive misses
    establishedDeclWeeks: 3, // 🔴 (Established) after N complete weeks of declining actual
  },

  // §12.4 — Forming → Established transition (PLACEHOLDER). Demotion reuses the same
  // window + rate symmetrically (no hysteresis in V1).
  formingToEstablishedDays: 30, // trailing-window length in days
  formingToEstablishedRate: 0.8, // floor-completion rate threshold (80%)

  // §12.4 — Diagnosis thresholds (PLACEHOLDER). Window/count numbers that the SPEC §4.4
  // prose hardcoded are promoted to named constants here.
  diagnosis: {
    minEngagedDaysForRate: 5, // A3: Rule 1 / Rule 4 stay silent below this many engaged days
    floorRateWindowDays: 28, // Rule 1 / Rule 3 floor-rate window
    lowFloorRateThreshold: 0.6, // Rule 1: below this → "floor may be too high"
    cueClusterWindowDays: 28, // Rule 2 window
    cueClusterMinMisses: 2, // Rule 2: >= this many misses on a single weekday
    stagnationAboveFloorWeeks: 3, // Rule 3: zero above-floor for N weeks → stagnation
    cuePromptWindowDays: 14, // Rule 4 completion window
    lowCompletionForCuePrompt: 0.5, // Rule 4: below this + empty cue/identity → fill it first
  },
} as const;

export type Tuning = typeof TUNING;
