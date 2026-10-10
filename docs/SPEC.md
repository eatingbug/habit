# Habiquest — Implementation Specification

**Status:** Draft v3.2 · 2026-10-10 (§6 rewritten to the redesign artboards, ADR-0007) · Draft v3.1 · 2026-07-08 (recording review pass — correctness A1–A6; easier logging B1–B6; gradual-growth C1–C7; skip-reasons load-bearing D; adaptive Linear/Notion visual language §6.0)
**Companion document:** [`CONCEPT.md`](./CONCEPT.md) (product spec — read this first)
**Scope of this document:** Engineering decisions, architecture, data model, domain
engine contract, surface definitions, acceptance criteria, and project layout for
the first real implementation of Habiquest.

---

## 1. Goal & Scope

### 1.1 One-line goal

> Build a cross-platform Expo (iOS/Android/Web, TypeScript) habit app that thinly
> implements `CONCEPT.md`'s full closed loop with browser-local persistence behind a
> Supabase-swappable repository, proving the loop closes via engine unit tests plus
> a manual create→log→flag→reflect→design-change walkthrough.

### 1.2 In scope (thin, whole closed loop)

- **Stage 1 — Design:** habit creation (measurement type — count or yes/no;
  floor / unit / target required for count, omitted for yes/no; cue / identity
  optional at creation — see CONCEPT §5 for the deliberate late-introduction rationale).
- **Stage 2 — Perform → Record:** habit entry logging (count: timestamp + actual;
  yes/no: a single "done" = `actual: 1`). **Multiple entries per (habit, day) are
  allowed** — entries store raw facts only and the day's state
  `pending / missed / partial / done / over / skip` is **computed** from the day's summed
  `actual` (§4.1). **Low-friction logging:** one log form with a primary `기록` (B1), a
  smart-default amount (B2), a collapsed time picker for free logs and edits (B3), a
  "yesterday" fast-path (B4), one-tap skip-reason chips (B5), undo-toast for new
  rows (B6). skip-with-reason (4 categories, now diagnostic — Part D); per-entry edit &
  delete; backfill (bounded by `createdAt`); heatmap; never-miss-twice detection **plus a
  proactive `atRiskToday` save (C2)**; immediate attributed log-time reward
  (`describeLogEffect`, C1); within-day progress-to-floor (C7a).
- **Stage 3 — Reflect:** per-habit, entered via a status light; week mirror;
  rule-based diagnosis (4 rules, 4 components); pre-selected recommended action with
  visible reasoning; commit → writes the design change → loop closes.
- **Daily log layer (§9):** free logs (Note / Win / Mood / Idea); unified composer
  on Today (free log *or* habit entry); chronological Today feed.
- **Status lights (§7, minimal):** per-habit 🟢 / 🟡 / 🔴; aggregate count on
  Dashboard; 🔴 is the Reflection entry point.
- **Progression (§10):** XP is the single currency — base XP from floor completion
  (both kinds), above-floor intensity + target bonus for count habits, decaying
  streak-milestone XP for yes/no habits; **stat level = cumulative-XP threshold
  lookup** (no max-performance-based XP). Plus a non-XP **engagement ("showed up")
  streak** that rewards sub-floor `partial` days without XP (C3), and a **weekly-actual
  growth chart** that makes gradual growth visible (C4).
- **Lifecycle (§3.3):** `forming` → `established` → `paused`; demotion path.
- **All 4 surfaces:** Dashboard, Today, Habit Detail, Reflection.
- Visual reference: the redesign artboards in `design/` and the tokens in
  `design/_tokens.redesign.css` (§6.0, ADR-0007).

### 1.3 Explicitly deferred (named here so they are not forgotten)

| Deferred | CONCEPT ref | Note |
|---|---|---|
| Portfolio overload — Forming-slot soft cap + Focus Mode | §8 | V2; the §7 aggregate count already surfaces the raw signal |
| LLM-based reflection | §11.1 | V2; rule engine ships exactly the four-component contract LLM will later refine |
| Supabase backend / accounts / multi-device sync | §11 | `SupabaseRepository` class stub only; no live credentials |
| Image attachments in journals/logs | §11.2 | V2+ |
| Concrete §12 numbers (stat taxonomy, XP curve, thresholds) | §12 | All values live in `config/tuning.ts` as named, documented placeholders |

---

## 2. Architecture

### 2.1 Stack

| Concern | Choice |
|---|---|
| Cross-platform framework | **Expo SDK** (React Native + `react-native-web`) |
| Language | **TypeScript** (strict mode) |
| Navigation | **`expo-router`** (file-based) |
| Web rendering | `react-native-web` (same JS bundle, no separate web codebase) |
| Local storage — native | `@react-native-async-storage/async-storage` |
| Local storage — web | `IndexedDB` (via `idb` or `localforage` wrapper) |
| Remote storage (future) | Supabase — JS SDK; `SupabaseRepository` class, not wired |
| Testing | **Jest** (Expo preset) + `@testing-library/react-native` for domain |
| State management | React Context + `useReducer`; no external state library in V1 |

### 2.2 Three-layer architecture

```
┌─────────────────────────────────────────┐
│  UI  (screens, components)              │  React Native / expo-router
│  — rendering only, no business logic    │
├─────────────────────────────────────────┤
│  Domain  (pure TypeScript)              │  Framework-free, fully testable
│  — classify · score · diagnose          │
│  — lifecycle · statusLight              │
├─────────────────────────────────────────┤
│  Data  (HabitRepository interface)      │  Swappable
│  LocalRepository  →  SupabaseRepository │
└─────────────────────────────────────────┘
         ↑ dependencies point inward ↑
```

**Dependency rule:** UI imports Domain and Data; Domain imports only models and
config; Data imports only models. Nothing in Domain or Data imports React.

### 2.3 `config/tuning.ts` — the §12 placeholder file

Every open number from CONCEPT §12 lives here as a named, documented constant.
Changing a threshold requires editing exactly one file. Example structure:

```typescript
// config/tuning.ts
export const TUNING = {
  // §12.2 — Stat taxonomy (1:N habit→stat, leaning default)
  stats: [
    { id: 'strength',     name: 'Strength',     icon: '💪' },
    { id: 'intelligence', name: 'Intelligence',  icon: '📖' },
    { id: 'willpower',    name: 'Willpower',     icon: '🧘' },
    // TODO §12.2: finalize list and cardinality
  ],

  // §12.3 — Progression math (PLACEHOLDER values — adjust empirically).
  // XP is the single currency; cumulative XP drives stat level (levelForXP).
  xpPerFloorCompletion: 60,   // base "showed up" XP per floor-met day (both kinds)
  xpBonusTargetExceed:  60,   // count: bonus when over target
  xpPerAboveFloorUnit:  6,    // count: XP per unit above the floor (intensity → XP)
  xpStreakBonus: { 7: 120, 30: 300 },          // count: once-only longevity bonus
  binaryStreakMilestones: {                    // yes/no: run-length → base bonus XP
    5: 90, 10: 180, 20: 300, 30: 450, 60: 720, 100: 1200,
  },
  binaryMilestoneDecay:  0.5, // yes/no: each re-achievement worth half the previous
  milestoneBonusEpsilon: 1,   // drop a decayed award rounding below this to 0
  statLevelThresholds: [     // cumulative XP to reach each level (index = level)
    0, 420, 1200, 2700, 5400, 9000, 14000, 21000,  // TODO §12.3: tune via playtest
  ],

  // §12.4 — Status-light thresholds (PLACEHOLDER)
  statusLight: {
    cautionMinFlags:         1,    // 🟡 at >= this many flags
    interventionConsecMiss:  2,    // 🔴 (Forming) after this many consecutive misses
    establishedDeclWeeks:    3,    // 🔴 (Established) after N weeks of declining actual …
    establishedDeclineFloorGuard: true, // …but ONLY when latest week's total <= target (C5 — don't punish settling from a peak)
  },

  // §12.4 — Forming → Established transition (PLACEHOLDER)
  // NOTE (C7b): 30d is well under Lally's ~66-day median formation window. Either raise
  // toward the evidence, or keep 30d@80% as the mode-switch but retain light Forming
  // scaffolding past day 30 (don't strip support while automaticity is still weak).
  formingToEstablishedDays:  30,   // days of sustained floor-rate above threshold
  formingToEstablishedRate:  0.80, // floor-completion rate threshold (80%)

  // §12.5 — Reflection trigger (PLACEHOLDER: fixed Sunday; adaptive later)
  reflectionWeekday: 0,  // 0 = Sunday

  // §12.4 — Diagnosis thresholds (PLACEHOLDER)
  diagnosis: {
    lowFloorRateThreshold:     0.60,  // below this → "floor may be too high"
    stagnationAboveFloorWeeks: 3,     // zero above-floor for N weeks → stagnation
    lowCompletionForCuePrompt: 0.50,  // below this + empty cue → "fill cue first"
    minEngagedDaysForRate:     5,     // Rules 1 & 4 stay silent below this many engaged days (§4.4)
    cueSkipThreshold:          2,     // ≥ this many cue-skips in window → cue flag (§4.4 / Part D)
    floorSkipThreshold:        2,     // ≥ this many floor-skips in window → reinforce floor flag
    identitySkipThreshold:     2,     // ≥ this many identity-skips in window → identity flag

    // ADR-0002 — a run of `missed` days asks before it diagnoses (§4.4 / §6.7)
    missedRunForBackfillPrompt:  3,    // consecutive `missed` days → show the bulk-backfill prompt
    missedRateForBackfillPrompt: 0.40, // or this share of the last 14 days being `missed`
  },
} as const;
```

---

## 3. Data Model

Entity types live in `src/models/`. All IDs are `string` (UUID v4). Dates are ISO
strings (`YYYY-MM-DD`); timestamps are UTC ISO-8601 strings.

### 3.1 `Stat`
```typescript
interface Stat {
  id:   string;   // e.g. 'strength'
  name: string;   // 'Strength'
  icon: string;   // '💪'
}
```
Populated from `TUNING.stats`; not stored per-user in V1.

### 3.2 `Habit`
```typescript
interface Habit {
  id:         string;
  name:       string;
  statId:     string;            // FK → Stat.id
  kind:       'count' | 'binary'; // 'count' = numeric amount; 'binary' = yes/no
  floor:      number;            // 1 for binary habits
  floorUnit:  string;            // e.g. 'reps', 'pages', 'min'; 'time' for binary
  target?:    number;            // optional stretch goal (count only; undefined for binary)
  cue?:       string;            // optional at creation (§5)
  identity?:  string;            // optional at creation (§5)
  lifecycle:  'forming' | 'established' | 'paused' | 'archived';
  createdAt:  string;            // ISO-8601 UTC
  pauses?:    PauseInterval[];   // ADR-0003 — non-overlapping, `from` ASC, append-only
}

interface PauseInterval {
  from: string;   // 'YYYY-MM-DD' — first paused date
  to?:  string;   // 'YYYY-MM-DD' — first re-active date; absent ⇒ still paused
}
```

**Pause intervals (ADR-0003).** Half-open `[from, to)` — the resume date is active again.
`lifecycle === 'paused'` ⟺ the last interval has no `to` (the open interval is
authoritative). **`'archived'`** rides the same machinery — the reflection `archive`
action (§4.5) appends an open interval too, so an archived habit stops classifying days
and accrues no misses. It differs only in reading: archived habits are hidden from the
Dashboard and read as "done with," where paused reads as "later." Both keep their entries
and are reversible. Inside a pause interval, only the **`missed` default is suppressed**: an
*empty* day is not classified at all (like a pre-`createdAt` date), while a day that holds
real rows classifies normally, so pausing never claws back XP or a streak already earned.

**Creation / edit invariants** (enforced by the create/edit form; assumed by the engine):
- `floor >= 1`.
- `target`, when present, satisfies **`target > floor` (strict)** — `over` means
  "beyond a stretch goal that is itself above the floor," so a target at or below the
  floor is meaningless; it is rejected at input and defensively ignored by
  `classifyDay` (§4.1).
- **Binary** habits satisfy `floor === 1` **and** `target === undefined`.

### 3.3 `HabitEntry` — facts-only; day-state is computed

An entry is a **raw fact** ("at this time I did this amount" or "I skipped, for this
reason"). It does **not** store a classified state. Multiple entries may exist for
the same `(habitId, date)`; the day's state is computed by aggregation (§4.1).

```typescript
type SkipReason = 'cue' | 'floor' | 'exception' | 'identity';

interface HabitEntry {
  id:          string;           // append-only event id (UUID)
  habitId:     string;           // FK → Habit.id
  date:        string;           // 'YYYY-MM-DD' — AUTHORITATIVE for day-grouping
  timestamp:   string;           // ISO-8601 UTC — ordering & latest-skip tiebreak only
  actual:      number;           // activity row: > 0 · skip row: 0
  skipReason?: SkipReason;       // present ⇔ this is a skip row (actual is 0)
  note?:       string;
}
```

- **`date` is authoritative** for which calendar day an entry belongs to;
  `timestamp` is metadata used only for ordering and the latest-skip tiebreak
  (§4.1). Timezone is **not** stored — `date` is trusted as the user's declared
  local day (V1 is single-device, so DST/travel cannot shift entries between days).
- **Row discriminator:** an **activity row** has `actual > 0` and no `skipReason`;
  a **skip row** has `actual: 0` and a `skipReason`. There is no separate `state`
  or `kind` field on the row — the presence of `skipReason` distinguishes them.
- **`actual > 0` invariant** for activity rows: there is **no per-row floor check**.
  An individual row may be below `floor`; the floor comparison happens only on the
  day-level sum (§4.1). A count entry of `0` is meaningless — the composer routes it
  to a skip (with reason) or to deletion. Yes/No activity rows are fixed `actual: 1`;
  "undoing" a yes/no done is a row **delete**, not an `actual: 0` row.

**Day-state (computed, never stored):**
```typescript
type DayState = 'pending' | 'missed' | 'partial' | 'done' | 'over' | 'skip';
```
See §4.1 for the `classifyDay` aggregation that produces it.

**Absence of any row** for a `(habitId, date)` resolves by date (ADR-0001): it is
`pending` when `date === today` (the day is still open) and **`missed` — a miss —**
for any earlier date on or after the habit's `createdAt`. A day with only skip rows
is `skip`; a `skip` with a non-`exception` reason is also a miss (CONCEPT §3.2).
A day with positive activity below floor is `partial` (not a miss — see §4.1).

**Backfill repairs a `missed` day.** Because day-state is computed and never stored,
appending an activity row to a past date reclassifies that day and every derived
quantity that ran through it — streak, success rate, miss count — recovers with it.

**Yes/No habits** store each "done" as an `actual: 1` activity row and never produce
`over` — the day resolves to `done` whenever ≥1 activity row exists.

### 3.4 `FreeLog`
```typescript
type LogType = 'note' | 'win' | 'mood' | 'idea';

interface FreeLog {
  id:        string;
  date:      string;    // 'YYYY-MM-DD' — set at creation; authoritative for grouping
  timestamp: string;    // ISO-8601 UTC; user can select time (§9.1)
  type:      LogType;
  text:      string;
}
```
Standalone — **no `habitId` link** (CONCEPT §9.4 deliberate decoupling). `date` is
set at creation (consistent with `HabitEntry`'s date-authoritative grouping) so the
Today feed groups free logs by their declared local day, not a timezone-derived one.
Free logs carry no scoring weight; `text`, `type`, and `timestamp` are all editable,
and they use the same per-entry Alert-confirm delete as habit entries (§6.2).

### 3.5 `ReflectionSession`
```typescript
interface DiagnosisFlag {
  component: 'cue' | 'floor' | 'identity' | 'load';
  severity:  'ok' | 'warning' | 'critical';
  message:   string;
  evidence:  string;    // cited data points (no LLM in V1)
}

type ReflectionAction =
  | 'adjust_cue'  | 'lower_floor'  | 'raise_target'
  | 'fill_cue'    | 'fill_identity'| 'pause'
  | 'archive'     | 'keep';

interface HabitDesignSnapshot {
  floor:     number;
  floorUnit: string;
  target?:   number;
  cue?:      string;
  identity?: string;
}

interface ReflectionSession {
  id:            string;
  habitId:       string;          // FK → Habit.id
  weekOf:        string;          // 'YYYY-MM-DD' (Monday of the reflected week)
  flags:         DiagnosisFlag[];
  suggestedAction: ReflectionAction;    // pre-selected by the engine
  chosenAction:  ReflectionAction;      // set by user on commit
  designBefore:  HabitDesignSnapshot;
  designAfter:   HabitDesignSnapshot;   // filled on commit
  committedAt?:  string;               // ISO-8601 UTC; null until committed
}
```

### 3.6 Computed (not stored)
**Day-state** (`classifyDay`, §4.1), streak, **engagement streak** (§4.3), floor-rate,
XP, **per-log effect** (`describeLogEffect`, §4.2), **weekly actual totals** (§4.6), stat
level, and status light are **derived by domain functions** on each render pass. They may
be memoised in React state but are never persisted independently — they must be
re-derivable from the stored entities (raw entry rows) alone.

---

## 4. Domain Engine

All domain logic lives in `src/domain/`. Every file is **pure TypeScript** — no
React, no AsyncStorage, no Supabase. Each module ships with a `*.test.ts` file.

### 4.1 Day-level classification (aggregation) — `domain/classify.ts`

Day-state is **computed from all of a day's entries**, never stored on a row.
`classifyDay` is the single authoritative classifier; it replaces the old per-row
`classifyEntry`/`RangeError` contract.

```typescript
// Is this date one the engine is allowed to have an opinion about? (ADR-0003)
// false for dates before `habit.createdAt` and for dates inside a `PauseInterval`.
function isDateInScope(habit: Habit, date: string): boolean

function classifyDay(
  entries: HabitEntry[], habit: Habit, date: string, today: string
): DayState
```

> **Scope lives in one predicate, not in the classifier's return type.** `classifyDay`
> stays **total** — it always returns a `DayState`. Everything that walks a date range
> (`computeStreak`, `engagementStreak`, `milestoneBonusXP`, `successRate`,
> `floorCompletionRate`, `consecutiveMissCount`, `atRiskToday`, the heatmap, the §6.7
> backfill prompt) calls `isDateInScope` **first** and simply skips out-of-scope dates.
> The alternative — a `DayState | undefined` return — would copy the same transparency
> rule into eight call sites; a fourth `'out_of_scope'` union member would push a value
> with no rendering into every UI switch and conflate two different questions ("what
> happened that day?" vs. "does that day count?"). One predicate, one rule, one test.
>
> **Exception, per ADR-0003:** an out-of-scope date that *holds rows* still classifies
> normally — the scope check only suppresses the empty-day `missed` default, so pausing
> never claws back XP or a streak already earned. Consumers therefore skip a date only
> when it is both out of scope **and** has no rows.
`entries` are all rows for one `(habitId, date)`. The classifier needs `date` and
`today` to tell an open day from a missed one (ADR-0001). Algorithm:

1. Partition into **activity rows** (`actual > 0`, no `skipReason`) and **skip rows**
   (`actual: 0`, `skipReason` present).
2. If there are **no rows** → `'pending'` when `date === today`, else `'missed'` —
   **unless the date is out of classification scope**, in which case the day has no state
   at all. Out of scope = before `habit.createdAt`, or inside a `PauseInterval`
   (ADR-0003). Note the asymmetry: an out-of-scope date with rows still classifies
   normally — the scope check only suppresses the empty-day `missed` default.
3. If there is **≥1 activity row**, compute `sum = Σ actual` (the aggregation
   function is always **SUM** in V1 — see note) and classify by the sum; skip rows
   are ignored ("positive activity overrides skip"). Classify `done` first, then
   *upgrade* to `over` — so **`over` always implies `done`** (never the reverse):
   - `0 < sum < floor` → `'partial'`
   - `sum >= floor` → `'done'`
   - …and additionally `'over'` when the habit has an **effective target**
     (`kind === 'count'` **and** `target !== undefined` **and** `target > floor`)
     and `sum >= target`.
4. If there are **only skip rows** → `'skip'`.

> **Defensive target read (fixes an ordering hazard).** `done` is tested *before*
> `over`, and `over` is only ever reached as an upgrade of a floor-met day. A corrupt
> `target <= floor`, or *any* `target` on a binary habit, is treated as **no target**,
> so a bad record can never emit a phantom `over` while below the floor (the old
> "check `sum >= target` first" phrasing misclassified a `floor 5, target 3, sum 4`
> day as `over`). See the `target > floor` invariant (§3.2, §7.3).

```typescript
function effectiveSkipReason(entries: HabitEntry[]): SkipReason | undefined
```
For an only-skip day with differing reasons, the **most recent skip row's** reason
represents the day — "latest intent wins." "Most recent" is defined by the domain's
**total order `(timestamp ASC, then id ASC)`** (§7.3 invariant), *not* by array or
storage read order — so the result is deterministic even when same-day backfilled rows
share the noon timestamp (§6.5 gives them strictly increasing sub-noon offsets, with
`id ASC` as the final tiebreak).

> **`partial` (new state) — exactly three engine effects.** Removing the per-row
> floor check means a positive-but-sub-floor day can now exist. It is classified
> `partial`, whose engine effects are **exactly these three, and no others**:
> (1) earns **0 XP** (floor not met; §4.2); (2) is **transparent** to the streak and
> to never-miss-twice — it never breaks a streak and never counts as a miss (§4.3),
> which now makes it strictly better than leaving the day unrecorded;
> (3) **lowers `floorCompletionRate`** as an intended non-completion so the "floor too
> high" diagnosis can fire (§4.4, Rule 1). Heatmap renders it with a distinct shade.
>
> **Scoped fairness rule.** Honestly logging a shortfall (`partial`) must never leave
> the user worse off than logging nothing (`missed`) **for XP, streak, or
> miss-count** — and it is not, on any of the three. Since ADR-0001 made an unrecorded
> day a miss, `partial` is now *strictly* better than silence on streak and miss-count,
> not merely no worse. It *does* intentionally lower
> `floorCompletionRate` (effect 3); that lowering is the helpful "your floor may be
> too high" signal, not a penalty, so it must **not** leak into surfaces where a lower
> rate *hurts* the user (Established→Forming demotion, caution light) — see §4.4 /
> §4.6 / §4.7 for the split. On top of this "never worse" floor, `engagementStreak`
> (§4.3) makes a `partial` day *strictly better* than an unrecorded one — reinforcing
> showing up without granting XP.

> **SUM-only (V1 scope).** Day aggregation is always the sum of `actual`. This fits
> additive count habits (glasses, pages, minutes). Measurement / "lower-is-better"
> habits (e.g. weight) and non-SUM aggregations (LAST/MAX/AVG) are **out of scope**;
> the current floor/target comparison only supports `sum >= target`.

```typescript
function isMissDay(state: DayState, entries: HabitEntry[]): boolean
```
- `'missed'` → **`true`** (a miss with no reason — ADR-0001)
- `'pending'` → `false`; `'partial'` → `false`; `'done'`/`'over'` → `false`
- `'skip'` → `true` **only when** `effectiveSkipReason !== 'exception'`

A `missed` day is a miss for the **streak, the miss count and the success rate**, but
it attributes **no component** — only a reasoned `skip` does that (§4.4 Rule 5).

**Yes/No** habits: any activity row (`actual: 1`) makes the day `'done'`; multiple
"done" rows are idempotent (the day is still `done`, XP awarded once — §4.2).

### 4.2 Scoring — `domain/score.ts`

```typescript
function computeXP(entries: HabitEntry[], habit: Habit): number
function milestoneBonusXP(entries: HabitEntry[]): number   // yes/no streak milestones
function computeStreak(entries: HabitEntry[], today: string): number
function levelForXP(xp: number): number

// A stat's level is a function of the STAT, not of one habit: it sums the XP of every
// habit mapped to that stat, then looks the level up. Anything that reports a level must
// use this, so the log-time toast and the Dashboard can never disagree.
type HabitWithEntries = { habit: Habit; entries: HabitEntry[] };
function computeStatXP(statId: string, all: HabitWithEntries[]): number
function computeStatLevel(statId: string, all: HabitWithEntries[]): number

// C1 — what THIS log just unlocked, for immediate log-time feedback (§6.2)
type LogEffect = {
  xpGained:          number;
  floorCrossedToday: boolean;   // day went pending/missed/partial → done
  pushedToOver:      boolean;
  statLevelUp:       boolean;
  streakMilestoneHit?: number;  // milestone reached (incl. decayed re-achievement)
  showedUp:          boolean;   // a partial log — engagement, not floor XP (C3)
  savedAtRiskDay:    boolean;   // this log resolved an atRiskToday save window (§4.3)
};
// `siblings` = the other habits mapped to the same stat (with their entries), needed so
// `statLevelUp` is computed on the stat's total XP rather than this habit's alone.
// `siblings` is REQUIRED (pass `[]` when the stat holds no other habit). Making it
// optional would let a caller silently fall back to this habit's XP alone — the exact
// bug this signature exists to prevent, and one no type error would catch.
function describeLogEffect(
  before: HabitEntry[], after: HabitEntry[], habit: Habit, siblings: HabitWithEntries[]
): LogEffect
```

All scoring operates on **day aggregates** (entries grouped by `date`, summed),
not individual rows.

- **XP** — the single progression currency; branches on `habit.kind`. Both kinds
  earn floor-met days × `TUNING.xpPerFloorCompletion` (a `done`/`over` day counts
  once regardless of how many activity rows it has). **Count** habits add
  target-exceeded days × `TUNING.xpBonusTargetExceed`, above-floor intensity
  (`Σ_days (daySum − floor) × TUNING.xpPerAboveFloorUnit`, over `done`/`over` days),
  and once-only `TUNING.xpStreakBonus` milestones (keyed on the longest run).
  **Binary** habits add `milestoneBonusXP` instead. A `partial` day earns **no**
  floor-completion XP (floor not met) and contributes no intensity.
- **`milestoneBonusXP`** (binary) — walks runs of `done` days (`pending`, `partial` &
  exception-skip days transparent; a `missed` day or a non-exception `skip` resets the
  run — ADR-0001; backfilling the missed day restores it). Each
  milestone in `TUNING.binaryStreakMilestones` fires once per run that reaches it;
  the k-th time a milestone is reached awards `base × TUNING.binaryMilestoneDecay^(k-1)`
  (rounded; dropped below `TUNING.milestoneBonusEpsilon`). A pure function of the
  entries — idempotent; binary XP for any day is awarded at most once.
- **Streak** = consecutive days whose day-state is `done`/`over`, working backward
  from `today`. `pending`, `partial`, and exception-skip days are **transparent**
  (neither extend nor break the streak); a `missed` day **and** a non-exception `skip`
  day break it (ADR-0001). Backfilling a `missed` day re-joins the runs on either side
  of it — the streak is recomputed, never stored, so recovery is automatic.
- **`levelForXP`** = highest index in `TUNING.statLevelThresholds` whose threshold
  ≤ the XP.
- **Stat level** = `levelForXP(computeStatXP(statId, all))` — the summed cumulative XP of
  **every habit mapped to that stat** drives the level (character level = the highest stat
  level). Habit→Stat is 1:N, so a per-habit level would disagree with the Dashboard the
  moment two habits share a stat; there is exactly one level definition and everything
  reads it, including `describeLogEffect.statLevelUp`.
- **`describeLogEffect`** (C1) = a **pure delta**: it diffs `computeXP` / level / streak
  between `before` and `after` a single log and tags *which* term moved — `statLevelUp` over
  the **stat's** total XP (`siblings` included), the rest over this habit (floor crossed,
  above-floor intensity, target, streak milestone, stat level-up), plus `showedUp` for a
  `partial` and `savedAtRiskDay` when the log closed a §4.3 save window. Because scoring
  is already a pure function of the whole entry set, the delta is exact and essentially
  free. It powers the Today log-time reward (§6.2) — it *computes* reward but never
  stores it (a computed-but-undelivered reward is a dead reward).

### 4.3 Never-miss-twice & engagement — `domain/streak.ts`

```typescript
function consecutiveMissCount(entries: HabitEntry[], asOfDate: string): number
function needsNeverMissTwiceIntervention(entries: HabitEntry[], asOfDate: string): boolean
function atRiskToday(entries: HabitEntry[], today: string): boolean          // C2
function engagementStreak(entries: HabitEntry[], today: string): number      // C3
function showedUpDays(entries: HabitEntry[], window: number): number         // C3 (cumulative)
```
Counts consecutive **miss days** — a `missed` day, or a `skip` day whose effective
reason is non-`exception` — working backward from `asOfDate`. `done`/`over`/`pending`/
`partial` and exception-skip days do **not** increment the count; a `partial` day never
registers as a miss, while an unrecorded past day now does (ADR-0001). `needsNeverMissTwiceIntervention` returns `true`
when the count reaches `TUNING.statusLight.interventionConsecMiss`. The UI reads
this to show the 🔴 status light and the "don't miss twice" nudge.

- **`atRiskToday` (C2) — the proactive save.** Returns `true` when the most recent
  *resolved* day (`today − 1`) is a non-exception miss — including an unrecorded
  `missed` day — or a streak just broke, **and** today is still `pending`/`partial`. This is the open save window — *before* the second
  miss completes — that `needsNeverMissTwiceIntervention` (which fires only *after* two
  misses) misses. When `true`, Today shows an amber, opportunity-framed save banner
  ("어제 놓쳤어요 — 오늘 최소 한 번이면 이어갈 수 있어요") wired to a one-tap log of the
  day's remaining amount (§6.2). In-app only. Fulfils CONCEPT §5's "intervene at the moment of the second
  *risk*, not just declare the principle."
- **`engagementStreak` / `showedUpDays` (C3) — reward showing up, not XP.** Consecutive
  (and cumulative-in-window) days with **any real engagement** — `done`/`over`/**`partial`**
  — distinct from the floor-`computeStreak` (which counts `done`/`over` only). This makes a
  `partial` day **strictly better than an unrecorded one** (satisfying the scoped fairness
  rule §3.2) **without granting XP** — `partial` stays 0 XP (§4.2).
  Foregrounded in Forming (Habit Detail §6.5; the C1 log acknowledgment reads
  "나타남 · 7일째"), because in formation the decisive quantity is repetitions-in-context
  (Lally: early reps move the automaticity curve most), not perfect floor days.

### 4.4 Diagnosis engine — `domain/diagnose.ts`

```typescript
function diagnose(habit: Habit, entries: HabitEntry[], asOfDate: string): DiagnosisFlag[]

// the two rates below — deliberately different populations (see next block)
function successRate(entries: HabitEntry[], habit: Habit, asOfDate: string, window: number): number | null
function floorCompletionRate(entries: HabitEntry[], habit: Habit, asOfDate: string, window: number, opts?: { excludePartial?: boolean }): number | null
```
Both return `null` for "not enough data" (below the min-sample guard, or no engaged days);
`excludePartial` serves the demotion consumer (§4.7). Both need `habit` and `asOfDate`
because day-state now depends on the date and on pause scope (ADR-0001 / ADR-0003).

Runs all four rules in order; returns an array of `DiagnosisFlag` (may be empty).
All rules read **day-states** (§4.1), not rows.

**Two rates, deliberately different (ADR-0001).**

- **`successRate(entries, window)`** — the number the **user** sees ("성공률") =
  `done`/`over` days ÷ (`done` + `over` + `partial` + non-exception `skip` +
  **`missed`**) within the window. `pending` and exception-skip days are excluded.
  An unrecorded day lowers it, and backfilling that day raises it back.
- **`floorCompletionRate(entries, window)`** — the number the **diagnosis** reads =
  `done`/`over` days ÷ "engaged" days, where engaged days = `done` + `over` +
  `partial` + non-exception `skip`. `pending`, exception-skip **and `missed`** days are
  excluded from both sides.

The split is the point. Rule 1 asks *"when you tried, could you reach the floor?"* — a
`missed` day says nothing about the floor, so letting it into that denominator would
make forgotten logging read as "your floor is too high," which is the false signal the
old blank-exclusion rule existed to prevent.

> **`missed` never attributes a component, and gets no rule of its own (ADR-0002).**
> A `missed` day conflates two opposite worlds — *doing it but not logging* (the
> **record** loop is broken) and *quietly stopped* (the **design** or the **load** is)
> — and the data cannot tell them apart, so any flag built on it would be a guess.
> Instead, a run of them triggers the **bulk-backfill prompt** (§6.7): the system asks
> before it diagnoses, and the answer separates the two worlds. Once the days are
> filled in — or marked not-done, which attaches a reason — the four rules below
> diagnose correctly on their own. This was a missing-**data** problem, not a
> missing-**rule** one. A `partial` day still lowers both rates
(it is a non-completion the user attempted) without being a miss — this is what lets
Rule 1 fire when the floor is chronically out of reach.

> **Minimum-sample guard (avoids n=1 false positives).** The rate reports a
> "not-enough-data" state (treated as healthy — no flag) until the window holds at
> least `TUNING.diagnosis.minEngagedDaysForRate` (default 5) engaged days. Without it,
> a single honest `partial` gives `0/1 = 0%` and would trip Rule 1 (28-day) and
> Rule 4 (14-day) off one data point — flagging an honest early logger while a `missed`
> day (excluded from this rate, §4.4) is never flagged. Rules 1 and 4 do not fire below
> the guard.

> **Rate role split (upholds the scoped fairness rule, §3.2/§4.1).** `partial` lowers
> this rate deliberately. That is *helpful* where a low rate prompts a fix — Rule 1's
> "lower your floor," and the 🟡 caution light it raises, are intended **opportunities**
> (§7.4), not penalties. But where a low rate would instead **cost** the user status —
> the Established→Forming demotion (§4.7) — that consumer must use a **partial-excluded**
> rate (engaged days = `done` + `over` + non-exception `skip` + `missed`; `partial` in
> neither numerator nor denominator), so an honest partial-logger is never *evicted from
> Established* (principle 11) while a silent non-logger is. Property to hold (§7.3):
> converting any day `missed → partial` (or `→ done`) must never worsen **any** outcome —
> streak, success rate, miss count, demotion or 🔴 intervention. Backfill is pure repair.

**Rule 1 — Floor too high**
```
if (floorCompletionRate(entries, window=28) < TUNING.diagnosis.lowFloorRateThreshold)
  → { component: 'floor', severity: 'warning',
      message: 'Your floor may be too high.',
      evidence: `${Math.round(rate*100)}% floor-completion in the last 28 days` }
```

**Rule 2 — Cue clustering** *(non-exception `skip` days only)*
```
if (non-exception `skip` days cluster on the same weekday in the last 28 days
    — 2+ on day X, 0 on others)
  → { component: 'cue', severity: 'warning',
      message: `Your ${dayName} cue keeps failing.`,
      evidence: `${n} of your ${total} marked-not-done days fell on ${dayName}s` }
```

> **`missed` days are excluded from the clustering — deliberately.** The earlier wording
> said "misses," which under ADR-0001 would include unrecorded days and so break the
> §7.3 invariant (*a `missed` day never produces a component attribution*). It would also
> manufacture exactly the false signal ADR-0001 names by example — *"you keep missing
> Tuesdays"* read off days that say nothing about **why**. Rule 2 therefore reads the same
> population as `floorCompletionRate`'s reason-bearing side: non-`exception` `skip` days.
> A weekday cluster of unrecorded days is handled by the bulk-backfill prompt (§6.7), and
> once those days are resolved into `skip` rows they enter this rule normally.

**Rule 3 — Stagnation** *(count habits only)*
```
if (habit.kind === 'count'
    && floor met in all of last N weeks, but above-floor actual = 0 for all N weeks)
  → { component: 'load', severity: 'warning',
      message: 'Floor is solid, but no growth in ${N} weeks.',
      evidence: '0 above-floor reps recorded in ${N} weeks' }
  where N = TUNING.diagnosis.stagnationAboveFloorWeeks
```
Skipped for yes/no habits — they have no above-floor amount, so the rule would
otherwise fire perpetually (and pin them to a permanent 🟡 caution light).

**Rule 4 — Fill cue / identity first**
```
if (!habit.cue || !habit.identity)
  && floorCompletionRate(entries, window=14) < TUNING.diagnosis.lowCompletionForCuePrompt
  → { component: habit.cue ? 'identity' : 'cue', severity: 'critical',
      message: `No ${field} set — this is likely why the habit isn't sticking.`,
      evidence: `${Math.round(rate*100)}% completion and ${field} is empty` }
```

**Rule 5 — Skip-reason attribution (Part D — makes the pre-classified skip load-bearing)**

Each of the four skip reasons *is* a user-declared, pre-classified diagnosis (CONCEPT §5),
but no Rule 1–4 reads the reason **category** (Rule 2 only clusters misses by weekday), so
in the current spec the reason beyond `exception` was collected but inert. Rule 5 counts
skip rows by reason in the 28-day window and raises the matching component directly,
complementing the pattern rules:

```
const c = countSkipsByReason(entries, window=28)   // exception excluded (never a miss)
if (c.cue      >= TUNING.diagnosis.cueSkipThreshold)      → { component: 'cue',      severity: 'warning', evidence: `${c.cue} cue skips in 28 days` }
if (c.floor    >= TUNING.diagnosis.floorSkipThreshold)    → { component: 'floor',    severity: 'warning', evidence: `${c.floor} 'too hard' skips in 28 days` }  // reinforces Rule 1
if (c.identity >= TUNING.diagnosis.identitySkipThreshold) → { component: 'identity', severity: 'warning', evidence: `${c.identity} 'no meaning' skips in 28 days` }
```

- `exception` skips are never counted (consistent with `isMissDay`).
- Flags stack with Rules 1–4, **deduped by component** — the higher severity wins, so a
  Rule 4 `critical` cue is not downgraded by a Rule 5 `warning`.
- Habit-data only (skip rows + their reasons) — principle 8 holds; free logs never enter.

### 4.5 Recommended-action mapping — `domain/recommend.ts`

```typescript
function suggestAction(flags: DiagnosisFlag[], habit: Habit): ReflectionAction
```

Priority order (first matching rule wins):

| Condition | Suggested action |
|---|---|
| Any `critical` flag on `cue` | `'fill_cue'` |
| Any `critical` flag on `identity` | `'fill_identity'` |
| Any `warning` flag on `floor` | `'lower_floor'` |
| Any `warning` flag on `cue` | `'adjust_cue'` (`'fill_cue'` when no cue is set) |
| Any `warning` flag on `identity` | `'fill_identity'` (revisit your "why") |
| Any `warning` flag on `load` (stagnation) | `'raise_target'` |
| No flags at all | `'keep'` |

> **Note (Part D).** Rule 5 can raise a `warning` on `identity` (repeated "no meaning"
> skips) even when an identity is already set; `fill_identity` then reads as "revisit
> your why." A dedicated `adjust_identity` action is a future refinement (cf. the yes/no
> limitation below).

> **Yes/No limitation (resolved, #21):** `lower_floor` and `raise_target` are
> meaningless for a yes/no habit (floor is fixed at 1, no target). `offeredActions`
> hides both for yes/no habits, and `lower_floor` for any floor of 1. `suggestAction`
> skips a rule whose action is not offered. The mirror shows ✓ instead of a number.

### 4.6 Status-light derivation — `domain/statusLight.ts`

```typescript
type StatusLight = 'stable' | 'caution' | 'intervention' | 'personal_best';

// C4/C5 — day-summed actual per ISO week, most-recent last; also drives the §6.5 growth chart
function weeklyActualTotals(entries: HabitEntry[], weeks: number): number[]
function deriveStatusLight(
  habit:   Habit,
  entries: HabitEntry[],
  today:   string,
): StatusLight
```

Logic (weekly "total actual" and trends come from `weeklyActualTotals`, i.e.
**day-summed** values):
- `intervention` — `Forming` + consecutive miss ≥ threshold **OR** `Established` +
  declining actual trend over `TUNING.statusLight.establishedDeclWeeks` weeks **and** the
  latest week's total is at/below target (**absolute-level guard**,
  `TUNING.statusLight.establishedDeclineFloorGuard`, **C5**). The guard stops a habit that
  merely settled back from an unsustainable peak (e.g. 12→8 with target 8) from being
  reproached with a 🔴 — the "requirements rise as you improve → churn" anti-pattern §10
  forbids. A decline still comfortably above target resolves to `stable` (at most `caution`).
- `caution` — `flags.length >= TUNING.statusLight.cautionMinFlags` (flag-driven; a Rule 1
  caution is an intended *opportunity*, §7.4 — see the rate role split, §4.4).
- `personal_best` — **lifecycle-aware (C6):**
  - `Established` → this week's **total actual** > any prior week's (an intensity best).
  - `Forming` → a **consistency** best: best floor-completion week yet, or a new longest
    streak. So the encouraging ⭐ light reaches the cohort that needs it most and stays
    faithful to Forming foregrounding the floor (CONCEPT §7.1 wants positive lighting, not
    only nags).
- `stable` — everything else.

```typescript
function aggregateStatusCount(
  habits: Habit[],
  entriesByHabit: Record<string, HabitEntry[]>,
  today: string,
): { caution: number; intervention: number }
```
Powers the Dashboard "shaky habits · N" aggregate (CONCEPT §7.3).

### 4.7 Lifecycle transitions — `domain/lifecycle.ts`

```typescript
function evaluateLifecycle(habit: Habit, entries: HabitEntry[], today: string): Habit['lifecycle']
```

Transitions:
- `forming` → `established`: floor-completion rate ≥ `TUNING.formingToEstablishedRate`
  for `TUNING.formingToEstablishedDays` consecutive days (PLACEHOLDER thresholds). The
  standard (partial-inclusive) rate is fine here — a `partial`-lowered rate only keeps
  the user in Forming longer, which is *more* scaffolding, not a penalty.
- `established` → `forming` (demotion): the **partial-excluded** floor-completion rate
  (§4.4 — `partial` in neither numerator nor denominator) falls below threshold for the
  same window. The partial-excluded rate is **required** by the scoped fairness rule
  (§3.2): an honest `partial`-logger must not be evicted from Established (principle 11)
  when a silent non-logger would not be.
- `* → paused`: explicit user action only (not triggered automatically). Appends a
  `PauseInterval { from: today }` (ADR-0003).
- `* → archived`: explicit user action only — the reflection `archive` action (§4.5).
  Appends an open `PauseInterval` exactly as `paused` does; the habit is additionally
  hidden from the Dashboard. Reversible (resume closes the interval).
- `paused → forming/established`: explicit resume action only. Closes the open interval
  with `to: today`; the pre-pause streak re-joins because the gap was never classified.

---

## 5. Repository Interface

### 5.1 `HabitRepository` interface — `src/data/HabitRepository.ts`

```typescript
interface HabitRepository {
  // Habits
  getHabits(): Promise<Habit[]>;
  getHabit(id: string): Promise<Habit | null>;
  upsertHabit(habit: Habit): Promise<void>;
  deleteHabit(id: string): Promise<void>;

  // Entries
  getEntries(habitId: string, from: string, to: string): Promise<HabitEntry[]>;
  upsertEntry(entry: HabitEntry): Promise<void>;
  deleteEntry(id: string): Promise<void>;

  // Free logs
  getFreeLogs(from: string, to: string): Promise<FreeLog[]>;
  upsertFreeLog(log: FreeLog): Promise<void>;
  deleteLog(id: string): Promise<void>;

  // Reflection sessions
  getReflectionSessions(habitId: string): Promise<ReflectionSession[]>;
  upsertReflectionSession(session: ReflectionSession): Promise<void>;
}
```

### 5.2 `LocalRepository` — `src/data/LocalRepository.ts`
Implements `HabitRepository` using:
- `@react-native-async-storage/async-storage` on native (iOS/Android).
- `localforage` on web (IndexedDB under the hood).

Storage strategy: JSON-serialise each entity collection under a prefixed key
(`habiquest:habits`, `habiquest:entries:{habitId}`, etc.). Sufficient for V1;
revisit if performance requires structured queries.

Forward-compat: `getHabits` backfills a missing `kind` to `'count'` on read, so
any habit persisted before the discriminator existed loads as a count habit.

### 5.3 `SupabaseRepository` stub — `src/data/SupabaseRepository.ts`
Class stub implementing `HabitRepository`. All methods throw
`'SupabaseRepository not yet configured'`. Swapped in by changing one line in the
app's DI/context provider — no domain or UI code changes needed.

**V1 is single-device, local-only** — offline is the default and only mode; there is
no sync in V1. Entries and free logs are kept **append-only** locally (a cheap property
that costs nothing; corrections are edit/delete of a specific row, §6.2).

> **Multi-device sync — deferred to V2.** Merge semantics (how two devices reconcile
> rows and deletes) are **not designed here** — specifying union-by-id, tombstones, or
> conflict resolution now would lock decisions with zero V1 validation and introduce a
> concept (tombstones) that has no V1 runtime (a local delete just removes the row).
> Two forward risks are noted so they are not forgotten when sync is actually built:
> (1) a hard delete on one device can resurrect on a naive union merge — needs a real
> delete-propagation design; (2) `date` is the device-local calendar day, so the same
> physical evening logged on two devices in different offsets can split one `done` into
> two sub-floor `partial` days — capturing a per-row UTC offset **at write time** is the
> (deferred) insurance, since that provenance is unrecoverable on an append-only model
> once the row is written.

---

## 6. UI Surfaces

### 6.0 Visual baseline and principles

Visual baseline:

- The visual source of truth is the redesign artboards in `design/` (ADR-0007).
- Templates live in `design/parts/redesign/`. `node design/build.mjs` builds each one twice: `<Name>.dc.html` (light) and `<Name>.dark.dc.html` (dark).
- The canvas page `리디자인 (#89)` in `design/canvas.json` lays them out.
- Concrete values (colors, type sizes, radii, touch areas) live in `design/_tokens.redesign.css`. This section names roles and rules only.
- The artboards are static drawings. A board that shows a tooltip shows its `?` pressed.
- `mvp/habiquest-linear.html` and the earlier boards were deleted. They are no longer a reference.

Principles:

- Clarity: a grade-school child can read each screen at a glance. Users are still adults.
- Each screen answers one question. Only the core information for that question is on screen.
- Explanations move to `?` tooltips (§6.8).
- A feature may be hidden or moved behind a tap. No feature is deleted.
- Domain rules do not change. `CONTEXT.md` terms do not change.
- Colors are bright and many. Each color has a `fill`, an `ink` and a `tint`.
- State is never told by color alone. A shape and words go with the color.
- Game elements (별, 연속, status lights) are drawn clearly.
- Light and dark are both first-class themes.

Readability (#92):

- Body text is 17 or larger. Label text is 14 or larger. There is no smaller step.
- Text contrast is at least 4.5:1. The target is 7:1. Large text is at least 3:1.
- Status marks and control borders are at least 3:1 against their background.
- `allowFontScaling` stays on.

Color tokens (#96, #98):

- `fill` is for dots, buttons and large areas. A status mark in `fill` is at least 3:1. White text on `fill` is at least 4.5:1.
- `ink` is for text and icons. It is at least 4.5:1.
- `tint` is for chip and banner backgrounds. Only `ink` goes on a `tint`.
- Colors: `accent`, `done`, `over`, `crit`, `warn`, `streak`, `stat`. `warn` `fill` is decoration only. `stat` has no `fill`.
- Neutrals: `bg`, `surface`, `surface2`, `inset`, `text`, `muted`, `faint`, `border`, `borderStrong`, `scrim`.
- `faint` is never used for text.
- No gradients. The level card is a solid `accent` `fill` in both themes.

Type scale and shape (#96):

| Token | Size | Weight | Use |
|---|---|---|---|
| `label` | 14 | 700 | chips, pill names, legends, tab labels, tooltips |
| `body` | 17 | 400, 600 | body text, 언제·어디서, journal rows, buttons |
| `title` | 20 | 800 | habit names, card titles, sheet titles |
| `headline` | 24 | 800 | section heads, modal titles, pill numbers |
| `display` | 30 | 800 | screen titles |
| `number` | 44 | 900 | hero numbers, the stepper |

- Line height is 1.5 for body text and 1.25 for titles.
- Numbers use the regular font with `tabular-nums`. No monospace font.
- Radii: `sm`, `md`, `lg` and `pill`. `TAP_TARGET` is 48.

Dark theme (#98):

- The background is a dark grey with a blue cast.
- `fill` values are shared by both themes. Only neutrals, `ink` and `tint` have dark values.
- Dark contrast is measured against `surface`.
- A pair under 7:1 is used for short labels only.
- Dark uses no shadows. Depth comes from surface steps and borders.

Day-state marks (#93, #96):

| State | Mark | Screen word |
|---|---|---|
| `done` | `done` `fill`, white ✓ | 했어요 |
| `over` | `over` `fill`, white ★ | 목표까지 했어요 |
| `partial` | white face, `done` `fill` border, ½ | 조금 했어요 |
| `skip` | `inset` face, `muted` − | 못 했어요 |
| `missed` | white face, `crit` `fill` border, ! | 기록 없음 |
| `pending` | `borderStrong` dashed border | 아직이에요 |

- Every screen that shows a day-state uses these marks.
- A state name never uses the word 실패.

Visual rules (#112):

- Tooltips and toasts use a `text` background with `surface` text. The pair inverts with the theme.
- Status lights: 괜찮아요 ●, 살펴보세요 ◆, 손봐야 해요 ▲. A best record adds ★.
- Every habit icon sits on the `accent` `tint`. There is no per-habit color.
- A progress bar is `accent` before the floor is met and `done` after.
- In dark, floating elements have no shadow. They carry a `border` color outline.
- A `scrim` lies behind sheets, menus and popups.

Icons (#103):

- The screen frame uses Lucide line icons (`lucide-react-native`). Frame: the tab bar, ⚙️, ⋯, `?`, close, back and the 끄적이기 button.
- Line icons are 24 with a stroke of 2. They are `muted`. The selected tab is `accent` `ink`.
- Meaningful content uses emoji: stats, 🔥 streak, habit icons.
- The status marks ✓ ★ ½ − ! are text glyphs.
- Tab bar items and buttons pair an icon with a word.
- Only four buttons are icon-only: ⚙️, ⋯, close and `?`. Each has an accessible name.
- No illustrations. An empty screen shows one large emoji, one sentence and one button.

Touch areas (#92, #109, #112):

- Every control is at least 48x48.
- Exception: a date grid cell is at least 44 wide and 48 tall.
- A date grid cell's touch area is the whole cell, mark and weekday label included.
- The `?` icon keeps its drawn size. Its touch area grows to 48x48.
- In a pill, the whole pill is the touch area of its `?`.

Screen words (#93, #102, #111):

- All copy uses 해요체.
- XP is called 별: "이번 주 별", "+60 ⭐", "다음 레벨까지 별 120개".
- The engagement streak is called "조금이라도 한 날".
- 연속, 최소량 and 오늘 몫 keep their names.
- `cue` is called 언제·어디서 on every screen, diagnosis included. The Today card shows its value with no label: "🕐 자기 전, 침대 옆에서".
- `identity` is called 이유.
- "스탯" becomes "능력치".
- The skip reason chip "깜빡함" keeps its name.
- Status lights keep "괜찮아요", "살펴보세요", "손봐야 해요".
- These keep their words, with 해요체 and 별 applied: "손볼 습관 N개", "오늘의 습관", "캐릭터", "잠깐 쉬기", "보관하기", "최소량 줄이기".

### 6.1 Tab bar

Artboards: the tab bar at the bottom of `ReToday`, `ReDashboard` and `ReJournal`.

- Three tabs, in order: 오늘, 대시보드, 글 모음 (#90, #100).
- Icons: 오늘 `sun`, 대시보드 `layout-grid`, 글 모음 `notebook-pen`. Each icon has a `label` word under it.
- The selected tab is `accent` `ink`. The others are `muted`.
- Other screens open from the Dashboard (#95):
  - Settings: ⚙️ at the top right.
  - Habit Detail: tap a habit row.
  - New habit: the 습관 만들기 button at the bottom.
  - Reflection: the 회고하기 button on a 🔴 habit.

### 6.2 Today (`app/(tabs)/today.tsx`)

Artboards: `ReToday` (yesterday missed), `ReTodaySheet` (record sheet), `ReTodaySkip` (skip reason sheet), `ReTodayFreeLog` (끄적이기 sheet), `ReTodayStreak` (streak banner and toast), `ReTodayMilestone` (milestone popup).

On screen (#90, #91):

- The question: 지금 무엇을 하면 되나.
- Top: the date, the title "오늘 할 일" and a count chip ("✅ 3개 중 1개 했어요").
- Yesterday-missed banner: shown only when yesterday was missed. It has a `?` and the button "어제 했어요 · 채우기".
- Habit card: icon, name, the 언제·어디서 value, today's progress ("6 / 10쪽") with a progress bar, and a large `+` button.
- A card whose floor is met shows "✓ 했어요" and a ✓ button. A card past its target shows "★ 목표까지 했어요".
- 별 appear only in the toast and the celebration right after a log.
- No 7-day strip on Today.
- Today's records fold under "오늘 기록 N개", closed by default.
- The "✏️ 끄적이기" button sits at the bottom.

Record sheet (`ReTodaySheet`, #90, #91):

- The `+` button opens a bottom sheet.
- Head: icon, name and today's sum ("지금 6쪽"). Close button.
- A stepper with the amount, and one result line ("이걸로 오늘 몫을 채워요 ✓").
- The time button "지금 14:20 · 시각 바꾸기".
- A memo field ("메모 (선택)").
- The primary button "기록하기".
- The text button "오늘 못 했어요 · 왜?" opens the skip reason sheet.

Skip reason sheet (`ReTodaySkip`, #120):

- A bottom sheet, not a modal.
- Head: the habit and "오늘 못 했어요 · 왜?".
- The memo field is on top. The line "이유를 누르면 바로 기록돼요." follows.
- Four reason chips at the bottom: 깜빡함, 너무 힘듦, 예외, 안 내킴. Tapping a chip records the skip at once.

끄적이기 sheet (`ReTodayFreeLog`, #91, #120):

- Head: "✏️ 끄적이기" with a `?`.
- Four kind chips: 메모, 잘한 일, 기분, 떠오른 생각. Picking one is optional. The default is 떠오른 생각.
- A text field, the time button "지금 14:20 · 날짜와 시각 바꾸기" and the button "남기기".

Streak celebration (`ReTodayStreak`, `ReTodayMilestone`, #97, #99):

- One condition: the habit's current streak went up. Today's logs and backfills both follow it.
- Usually a banner drops from the top. It shows the habit name, its streak and this week's days.
- On day 5, 10, 20, 30, 60 and 100 a popup with confetti shows instead. It closes by itself after 3 seconds. These days match the `binaryStreakMilestones` bonus days. Count habits use the same days.
- A milestone popup shows its bonus 별 line only when that day earns the bonus.
- The banner does not block logging.
- Several habits reaching their floor on one day get one banner each.
- A new banner replaces the open one at once. There is no queue.
- A backfill that raises the streak changes the banner copy: "어제를 채워서 13일 연속이 됐어요".
- A backfill that crosses a milestone also shows the popup.
- A backfill that leaves the streak unchanged shows nothing.
- Passing the target adds a ★ line to the same banner: "목표까지 넘겼어요 · 별 +N". It uses no confetti.
- One log that meets both floor and target shows one banner with two lines.
- With a milestone popup, the ★ line goes inside the popup.
- One habit and one date celebrate once. Deleting and re-adding a record does not celebrate again.
- A log that does not raise the streak shows no banner. The undo toast confirms it.
- When banner and toast show together, the toast has no streak. It holds the amount, 별 and 실행취소.

Undo toast copy (#99):

| Case | Second line | Third line |
|---|---|---|
| `partial` | the amount | 조금이라도 했어요 · 최소량까지 3쪽 남았어요 |
| `skip`, exception reason | the reason | 예외라서 연속은 그대로예요 |
| `skip`, other reason | the reason | 쉬었어요 · 이유: 피곤해요 |
| another log on a day already celebrated | +2쪽 · 별 +12 | 더 했어요 |

- The `partial` toast uses the default toast colors.
- A `skip` with another reason never says the streak broke. The streak pill shows it.
- A log that earns no 별 drops the 별 part of the second line.

Behaviour rules (moved from v3.1 §6.2):

- **Unified composer:**
  - **Date control (B4).** Defaults to **오늘 (today)**, with a one-tap **어제
    (yesterday)** toggle and a stepper back to the habit's `createdAt` (future blocked,
    §6.5). A non-today entry is a **backfill** and follows the §6.5 rules (noon-based
    timestamp, append-only). This makes Today the single logging surface for the two
    dominant cases — today, and "did it last night, forgot to log" — so forgotten days
    are recovered where the thought occurs and `missed` days stop accumulating —
    under ADR-0001 an unfilled day is a broken streak, so this is the repair path. Older gaps still use Habit-Detail backfill.
  - Target selector: "Free log" or one of the user's habits.
  - Free log path: type chips (Note / Win / Mood / Idea) + optional note.
  - **One log form (#79).** Today's habit card and Habit Detail's fill panel render the
    same form: amount, optional note, one primary `기록` button, then the skip chips.
    *(Revised: the one-tap "✓ 최소 실행 (+floor)", the quick-add chips, the staged
    preview, the target nudge and the new-entry time reveal are gone. Reason: several
    paths to the same write made logging harder (#76).)*
  - **Habit path (count):**
    - **One primary `기록` (B1).** It appends one activity row with the staged amount and
      the note. It is the form's only primary control.
    - The numeric `actual` input is **pre-filled with a smart default (B2)**: the habit's
      `floor` for the day's first entry, else the day's last amount. Most logs are one
      tap on `기록`. `actual` **must be `> 0`**; a **sub-floor amount is valid** (it sums
      toward the day → `partial`); `0` is not an activity row — route to a skip instead.
    - **Progress-to-floor (C7a).** The form's title shows the day's **running sum**
      against the floor ("오늘 3/5회"). Turns log-as-you-go into visible progress
      (goal-gradient).
  - **Habit path (yes/no):** a single "✓ 완료" (no amount; `actual: 1`) + optional note.
    Once the day holds an activity row it reads "✓ 했어요" and is disabled.
  - **Skip path (B5).** A row of **one-tap reason chips** (깜빡함 `cue` / 너무 힘듦 `floor`
    / 예외 `exception` / 안 내킴 `identity`) — tapping a chip logs the skip (two taps total),
    replacing the old dropdown. Optional free-text note. (Reasons are diagnostic — Part D.)
  - **Time.** Defaults to **now**; the hour/minute picker is **collapsed behind a small
    "🕑 지금 HH:MM" affordance (B3)** and revealed only to override (rare — `timestamp` is
    ordering/tiebreak only, §3.3). Applies to free logs and to editing an existing
    entry. *(Revised: a new habit entry is always stamped now, or noon on a backfill.
    Reason: the override is rare, and the log form stays simpler without it.)*
  - Log button — calls `upsertEntry` or `upsertFreeLog` (always a fresh `id`; the
    composer never overwrites another day's rows — multiple per day are expected).
  - **Log-time reward feedback (C1).** On a successful log, Today shows an immediate,
    attributed confirmation from `describeLogEffect` (§4.2): "바닥 달성 · +60 XP 💪",
    "목표 초과", a level-up moment, a milestone amount, or a **"나타남 (showed up)"**
    acknowledgment for a `partial` — never silence. In-app only (no push).
- Chronological Today feed (habit entries and free logs interleaved by timestamp).
- **Edit & delete (per entry):**
  - Tap a feed item → re-opens the composer pre-filled, preserving the row's `id`
    (edits that one row only; never spawns a duplicate).
  - Editable fields: `actual` (count), `timestamp` (via the reveal), `note`, and
    skip↔activity mode (incl. `skipReason`); free logs additionally allow `type`.
  - **Undo, not confirm, for new rows (B6).** Every new row saved through the log form
    (the Dashboard's modal §6.3, Today, and Habit Detail) shows a
    transient **undo toast** ("기록됨 +N {unit} · 실행취소"); Undo deletes the
    just-appended row by `id` (append-only → a clean single-row delete). The toast also
    serves as the "it registered" confirmation a save otherwise lacks.
    *(Revised: B6 covered one-tap appends only. Reason: the one-tap is gone, and every
    new row now comes from the log form (#80).)*
  - **Deliberate deletes** (edit-form / swipe) are **immediate** for an ordinary row
    (undo = re-log; append-only keeps this low-stakes). The one guarded case is deleting
    the **last remaining row of a date** or a **miss-bearing skip**: show a
    **consequence-aware** confirm ("이 날이 비워지고 N일 스트릭이 끊깁니다") — that reverts
    the day to `missed` — a miss — and can break a streak or erase a recorded miss. There
    is no "clear whole day" action.
  - *(This revises the earlier blanket "native Alert on every delete, no undo-toast"
    rule — scoped now: undo-toast for new rows saved through the log form, a
    consequence-aware confirm only for the destructive edge cases.)*

- Revised (#91): on Today, a past day is filled only from the yesterday-missed banner. Older days are filled from the Dashboard 7-day dots (§6.3) and Habit Detail (§6.5).
- Revised (#90, #91): each habit card has its own `+` button that opens the record sheet. A free log opens from the 끄적이기 button.
- Revised (#120): the skip reason chips sit in their own sheet. "오늘 못 했어요 · 왜?" in the record sheet opens it.
- Revised (#93, #97, #99): XP is called 별 on screen. A streak rise shows the banner or popup above. Any other log changes only the undo toast copy.

### 6.3 Dashboard (`app/index.tsx` or `app/(tabs)/dashboard.tsx`)

Artboards: `ReDashboard`, `ReDashboardStats` (stat sheet), `ReDashboardEmpty` (no habits), `ReSettings` (settings).

On screen (#95, #101, #109, #111):

- The question: 잘 되고 있나, 무엇을 손봐야 하나.
- Top: the date, the title "대시보드" and ⚙️.
- Level card: a solid `accent` `fill` card.
  - "캐릭터 레벨 N" with a `?`.
  - One stat line: "💪 3 · 📖 2 · 🧘 4".
  - A progress bar and "다음 레벨까지 별 N개".
- The head "손볼 습관 N개". It has no `?`.
- Habit rows, sorted by status light with 🔴 on top.
- A row holds the status light (shape and word), the icon and name, "🔥 N" streak and a `?` at its head.
- Under the head sit the last 7 days as dots, each with its weekday. The last one reads 오늘.
- A row shows no stat.
- Only a 🔴 row has the "회고하기" button.
- The "습관 만들기" button sits at the bottom.

Actions:

- Tap a row: Habit Detail.
- Tap a dot: the record sheet for that date. The sheet head shows the date in large type. Only the sheet's 기록 button saves. A stray tap changes no data (#109).
- The dot is drawn at 36. Its touch area is the whole cell (§6.0).
- Tap the level card: the stat sheet (`ReDashboardStats`).
  - One progress bar per stat, with the stat's level.
  - Under each bar, the habit names tied to that stat and the 별 left to its next level.
  - The sheet head shows the character level and the 별 left to the next level.
- The character level rule does not change.

Empty (`ReDashboardEmpty`):

- "🌱", "아직 습관이 없어요" and the button "습관 만들기".

Settings (`ReSettings`, #95, #120):

- Opened by ⚙️. A back button and the title "설정".
- "테마": 자동, 라이트, 다크.
- "보관한 습관 N개": the path to see archived habits and bring them back.
- "로그아웃".

Behaviour rules (moved from v3.1 §6.1):

- **`기록` on the row (B1).** One button per row opens today's log form (§6.2) in a
  modal: amount, optional note, `기록`, and the skip chips (B5). A successful save
  closes the modal and updates the row's heatmap/streak/light in place, with the B6
  undo toast. A failed save keeps the modal open, with the inputs and an error banner.
  Closing without saving discards the inputs. The button reads `기록`; on a count
  habit whose floor is met today it takes the pale selected shape and stays pressable;
  on a binary habit done today it reads `✓ 했어요` and is disabled.
  *(Revised: the one-tap "+floor" / "+1 더" / "✓" and the long-press skip chips are
  gone. Reason: a Dashboard log now takes two taps instead of one, but there is one
  path to record (#80).)*
- Tapping a 🔴 (or 🟡) navigates to `reflect/[habitId]`; tapping the row navigates to
  `habit/[habitId]`.
- Aggregate status count ("shaky habits · N").

- Revised (#95, #109): a row has no `기록` button. A dot opens the record sheet for its date.
- Revised (#95): a 🔴 row carries the 회고하기 button that opens Reflection.
- Revised (#93, #111): the aggregate count reads "손볼 습관 N개".

### 6.4 글 모음

Artboard: `ReJournal`.

On screen (#100):

- The third tab. It gathers free logs and memos.
- A memo shows its habit name and that day's state mark.
- Entries group by date, newest date on top.
- A row of filter chips sits on top: 전체, 끄적이기, then each habit name.
- A free log's kind is not a filter.
- The list is read-only.
- Tap a free log: Today for that date.
- Tap a memo: that habit's Habit Detail, at that date in the journal.

### 6.5 Habit Detail (`app/habit/[id].tsx`)

Artboards: `ReDetailForming` (forming), `ReDetailEstablished` (established, ⋯ menu open), `ReDetailRed` (손봐야 해요, yes/no habit), `ReDetailPause` (pause confirm sheet).

On screen, in order (#94, #110):

1. Head: back, ⋯, the habit icon, the name, the status light with a `?`.
2. A 🔴 habit: the "회고하기" button.
3. One hero card.
   - Forming: the 자리 잡는 중 ring, counted in days done ("34일", "보통 66일"), with a `?`. Beside it, the 연속 number and the next step ("오늘 4쪽 더 하면 3일").
   - Established: the 주마다 한 양 bar chart with a `?` and "이번 주 N".
4. Pills: 연속, 최고 연속 and 성공률, each with a `?`.
5. The heatmap "최근 3주" with a `?` and a legend of the six day-states.
6. The design card.
7. The journal.

Numbers (#94):

- 연속, 최고 연속 and 성공률 always show. 최고 연속 shows for both habit kinds.
- 조금이라도 한 날 shows as a fourth pill only when it is larger than 연속.
- 이번 주 별 is hidden on this screen.

Heatmap (#109):

- 7 columns by 3 rows: the last 21 days. It ends today, in the bottom-right cell.
- One weekday row sits on top.
- Cells are drawn at 40 in 48-tall rows.
- Tap a cell: the record sheet for that date, as on the Dashboard (§6.3).
- Days older than 3 weeks are filled from the journal's "+ 지난 날 기록 추가".
- `TUNING.heatmapDays` goes from 20 to 21 in the implementation issue.

Design card (#94, #101, #110):

- Title "지금 이렇게 하기로 했어요" and the "수정" button, which opens the edit form.
- Rows: 언제·어디서, 최소량, 목표 and 능력치 ("📖 지능"). 최소량 and 목표 have a `?`.
- "이유 보기" expands the 이유.
- An empty 언제·어디서 keeps "이것부터 정해 보세요" on screen.
- The stat shows only here. The head has no stat chip.

Journal (#94):

- The last 3 days show. "더 보기" opens the rest.

⋯ menu (#94, #120):

- "⏸ 잠깐 쉬기" and "🗄 보관하기".
- 잠깐 쉬기 opens a confirm sheet (`ReDetailPause`): the habit, the title "잠깐 쉴까요?", `LIFECYCLE_NOTE` as body, and the buttons "잠깐 쉬기" and "그대로 둘게요".
- 보관하기 opens a confirm sheet of the same pattern: the title "보관할까요?", `LIFECYCLE_NOTE` as body, and the buttons "보관하기" and "그대로 둘게요". It has no artboard.

Behaviour rules (moved from v3.1 §6.3):

- **Growth panel (C4, count habits).** A bar/sparkline of **weekly summed actual**
  (`weeklyActualTotals`, last 8–12 weeks) with the **floor** and **target** as reference
  lines and a ⭐ on the best week. For **Established** habits this is the *primary* panel
  (above streak/XP) — it realizes the "monitor the actual trend" value-prop that was
  previously computed for the status light but never rendered, and it is reused as the
  **visible evidence** for Rule 3 stagnation and the Established decline light
  (§4.4/§4.6), turning "0 above-floor reps in N weeks" from text into a picture.
- **Forming expectation (C7b).** While `Forming`, show a light expectation affordance —
  "형성 중 — 대개 ~2개월(Lally)" — with progress measured by **accumulated repetitions**
  (showed-up / floor days), not the calendar, so a shaky stretch reads as "still forming,"
  not "failing." (See §2.3 `formingToEstablishedDays` reconciliation.)
- **Design box:** Cue / Floor / Identity — current hypothesis. Edit affordance.
  For yes/no habits the floor cell reads "Yes / No" and the edit form hides
  floor/target.
- Journal: entries as a timeline. A day may show **multiple rows**; each row shows
  its time, `actual`, and note (yes/no shows "✓ done", no amount), and is
  individually editable/deletable (§6.2). The day's computed state chip
  (`partial` / `done` / `over` / `skip`) reflects the aggregate (§4.1).
  **Backfill** entry: tap a past-date in the heatmap (or a "+ add past entry"
  button) to **append** a row to that date (yes/no backfill is a single "mark done").
  Backfill rules:
  - Allowed range: from the habit's `createdAt` date up to **today**; pre-creation
    and **future** dates are blocked.
  - A backfilled row's `timestamp` is the target date at **noon (`T12:00` local)** —
    not the moment of entry — so it groups onto the correct day and orders sanely.
    Multiple same-day backfills get **strictly increasing sub-noon offsets**
    (`T12:00:00`, `T12:00:01`, …) in creation order, so the domain total order
    `(timestamp ASC, then id ASC)` (§7.3) is well-defined and `effectiveSkipReason`
    (§4.1) is deterministic — plain "creation sequence" is otherwise unimplementable
    (UUIDs are not monotonic).
  - Backfill **appends** (it does not overwrite) — same-day "duplicates" are
    intentional under the multi-entry model; edit/delete a specific row to correct.

### 6.6 New habit

Artboards: `ReNewHabit` (count), `ReNewHabitYesNo` (yes/no).

On screen (#102, #103, #110):

- One screen. A close button, the title "습관 만들기" and one line under it: "나중에 언제든 고칠 수 있어요".
- Fields, in order: 이름, 측정 방식, 최소량 and 목표, 언제·어디서, 능력치, 이유.
- 목표, 언제·어디서 and 이유 carry "· 선택".
- Each field's explanation moves to a `?` beside its name. Placeholder examples stay inside the fields.
- 이름 has an icon button on its left. It picks the habit icon. An empty icon falls back to the stat's icon.
- 측정 방식 offers "횟수 · 양" and "예 · 아니오".
- A yes/no habit hides the empty 최소량 and 목표 fields. Their explanation moves to the 측정 방식 tooltip.
- 능력치 is required. One stat is picked by default, so the user can move on without picking.
- The button "습관 만들기" sits at the bottom.

### 6.7 Reflection (`app/reflect/[id].tsx`)

Artboard: `ReReflection`.

On screen (#102, #109, #111):

- A back button and the title "명상, 잠깐 볼까요".
- The recover-first question on top ("이 3일, 하셨나요?") with a `?`. Each date has "했어요" and "안 했어요". The line "했어요를 누르면 그날이 성공으로 바뀌고 연속도 다시 이어져요." follows.
- "최근 7일은 이랬어요" with a `?`. The 7 cells use the common day-state marks (§6.0) and share the width equally. Journal notes follow.
- "이렇게 보여요" with a `?`. Only the most severe diagnosis card is open. The rest fold under "다른 점 N개 더 보기".
- The open card always shows its evidence in the body.
- The recommended action: "✓ 이렇게 해 볼까요: …", its explanation, the alternatives and the button "이대로 고칠게요".
- The closing evidence sentence at the bottom is gone. "직접 표시한 날만 보고…" moved to the `?` of 이렇게 보여요.

Diagnosis copy (#102, #111):

| Place | Copy |
|---|---|
| `cue` badge | 언제·어디서 |
| `identity` badge | 이유 |
| Rule 2 message | {요일} 언제·어디서가 자꾸 어긋나요. |
| Rule 4 message (`cue`) | 언제·어디서가 비어 있어요. 습관이 붙지 않는 가장 큰 이유일 수 있어요. |
| Rule 4 message (`identity`) | 이유가 비어 있어요. 습관이 붙지 않는 가장 큰 이유일 수 있어요. |
| Rule 4 evidence | …, 언제·어디서 미설정 / 이유 미설정 |
| Rule 5 message (`cue`) | 깜빡해서 못 한 날이 반복돼요. |
| Rule 5 evidence label (`cue`) | 깜빡함 |
| Prescription | 할 시간 정하기 → 언제·어디서 정하기 |
| Prescription | 할 시간 바꾸기 → 언제·어디서 바꾸기 |

Behaviour rules (moved from v3.1 §6.4):

- Entry point: tap a 🔴 or 🟡 status light on the Dashboard.
- **Recover-first prompt (ADR-0002).** When the habit's recent history holds a run of
  `missed` days — `TUNING.diagnosis.missedRunForBackfillPrompt` consecutive, or more
  than `missedRateForBackfillPrompt` of the last 14 days — the screen opens with a
  **bulk-backfill question above the mirror**, not with a diagnosis:
  *"이 5일, 하셨나요?"* Each listed date offers **one tap to fill it** (appends
  `actual = floor`, noon-pinned per §6.5) and **one tap for "안 했어요"** (appends a
  skip; the reason chips follow). Present the two choices with **equal visual weight** —
  making "fill" the easy path biases the data it is meant to collect. In-app only, on
  entering reflection: never a push (§7.4 alert blindness). Filling repairs the day and
  every quantity computed through it (ADR-0001); marking not-done attaches a reason and
  so feeds Rule 5. Either way the diagnosis below runs on data instead of a guess.
- **Mirror:** 7-day heatmap grid showing this week's **day-states**
  (`pending` / `missed` / `partial` / `done` / `over` / `skip`), each visually distinct so
  the user can tell "never logged it (missed — a miss, no reason)" from "logged but fell
  short (partial — not a miss)" from "marked not-done (skip — a miss, reason known)" from
  "today, still open (pending)" — plus any journal notes.
- **Diagnosis flags:** pre-computed, rule-based cards. Each shows:
  - Component (CUE / FLOOR / IDENTITY / LOAD), severity badge.
  - Human-readable message.
  - **Evidence** (the cited data — always visible, not hidden), rule-specific:
    floor-completion %, weekday miss clustering, the **growth chart / weekly totals** for
    Rule 3 stagnation and the decline light (§4.6, C4), and **skip-reason counts** for
    Rule 5 (Part D). This is the guardrail against rubber-stamping (CONCEPT §6.2 rule 4).
- **Recommended action** — pre-selected button (with explanation). User can switch.
  (For yes/no habits, `lower_floor`/`raise_target` are hidden — see §4.5.)
- **Commit button** — writes:
  1. Updated `Habit` record (design change).
  2. `ReflectionSession` record (`designBefore`, `designAfter`, `chosenAction`,
     `committedAt`).
  - After commit: navigate back to Dashboard; status light should have updated.

- Revised (#94, #95): Reflection opens from the 회고하기 button of a 🔴 habit, on the Dashboard and on Habit Detail.

### 6.8 `?` tooltips

Rules (#90, #93, #111, #112):

- A `?` sits beside each number or symbol that is hard to read alone. One `?` per item.
- A tooltip opens on hover or tap.
- A tooltip is 해요체 and two sentences at most.
- Result guidance right before or after an action stays out of tooltips. It stays as one sentence in the sheet or modal.
- Picking a skip reason is an action, not a tooltip. It stays in its sheet.
- Tooltip colors and touch areas follow §6.0.
- The 측정 방식 tooltip has one copy, whatever the selection.
- "손볼 습관 N개" has no `?`. The status light `?` explains the same thing.
- The 능력치 tooltips may change with the outcome of #116.

Copy:

| Place | Copy |
|---|---|
| 연속 | 최소량을 채운 날이 이어진 날수예요. 기록 없이 지나간 날이나 이유를 골라 못 했다고 찍은 날이 있으면 0부터 다시 세요. |
| 조금이라도 한 날 | 최소량에 못 미쳐도 조금이라도 한 날까지 세요. 기록 없는 날이나 이유를 골라 못 했다고 찍은 날이 있으면 0부터 다시 세요. |
| 성공률 | 최근 28일 중 최소량을 채운 날의 비율이에요. 예외로 찍은 날은 빼고, 5일이 쌓이기 전에는 —로 보여요. |
| 최고 연속 (Habit Detail pill) | 지금까지 가장 길게 이어진 연속이에요. 연속이 끊겨도 줄지 않아요. |
| 별과 레벨 | 최소량을 채우면 별을 받아요. 별이 모이면 레벨이 올라요. |
| 캐릭터 레벨 (Dashboard) | 능력치 가운데 가장 높은 레벨이에요. 습관을 하면 그 습관의 능력치에 별이 쌓여요. |
| 상태등 | 최근 기록을 보고 습관이 잘 굴러가는지 알려 줘요. 손봐야 해요가 뜨면 회고하기로 원인을 찾아요. |
| 7일 점 (Dashboard row head) | 점을 누르면 그날 기록을 채울 수 있어요. 테두리만 있는 점은 기록 없는 날이고, 실패로 세요. |
| 자리 잡기 | 날짜가 아니라 실제로 한 날로 세요. 보통 두 달쯤 걸리니 더뎌도 괜찮아요. |
| 주마다 한 양 (Habit Detail) | 막대 하나가 한 주 동안 한 양을 모두 더한 값이에요. 가로선은 하루 최소량과 목표를 7일로 곱한 기준이에요. |
| 최소량 (form) | 아무리 바빠도 할 수 있는 양이에요. 이만큼 하면 그날 몫을 한 거예요. |
| 목표 (form) | 최소량보다 큰 선택 목표예요. 넘기면 별을 더 받지만 안 해도 괜찮아요. |
| 측정 방식 (New habit) | 횟수 · 양은 한 만큼 적고, 최소량을 채우면 그날 몫을 해요. 예 · 아니오는 했는지만 보고, 이어 간 날이 쌓이면 별을 더 받아요. |
| 언제·어디서 (New habit) | 습관을 시작할 때와 곳이에요. 비워 둬도 되고, 잘 안 될 때 먼저 정해 보자고 물어볼게요. |
| 능력치 (New habit) | 이 습관으로 받은 별이 쌓이는 갈래예요. 가장 높은 능력치 레벨이 캐릭터 레벨이 돼요. |
| 이유 (New habit) | 어떤 사람이 되고 싶어서 하는지 적어요. 내키지 않는 날 다시 꺼내 보면 이어 가기 쉬워요. |
| 어제 놓침 배너 (Today) | 하루 놓치는 건 괜찮아요. 어제 했는데 기록만 못 했다면 지금 채워요. |
| 끄적이기 시트 (Today) | 떠오른 생각이나 방금 한 일을 적어요. 별이나 연속에는 영향이 없어요. |
| 회고 백필 질문 | 기록 없이 지나간 날은 했는지 못 했는지 알 수 없어요. 그래서 원인을 짚기 전에 먼저 물어봐요. |
| 회고 7일 칸 | ! 칸은 기록 없이 지나간 날이고, − 칸은 이유를 골라 못 했다고 찍은 날이에요. 둘 다 실패로 세지만 이유는 − 칸만 알 수 있어요. |
| 이렇게 보여요 (Reflection) | 직접 남긴 기록만 보고 원인을 짚어요. 기록 없이 지나간 날은 이유를 몰라서 빼요. |

---

## 7. Acceptance Criteria

### 7.1 Engine unit tests (automated)

File: `src/domain/**/*.test.ts`

| Test suite | Cases to cover |
|---|---|
| `classify.test.ts` | **`isDateInScope`: false before `createdAt` and inside a `PauseInterval` (half-open `[from, to)` — the resume date is in scope again), true otherwise; an empty in-pause day is skipped by consumers while an in-pause day that holds rows still classifies normally (ADR-0003)**; `classifyDay`: no rows → `pending` when the date is today, `missed` when it is past (ADR-0001); sum ≥ floor → done; sum ≥ target → over; `0 < sum < floor` → partial; only-skip → skip; **`done` precedes `over` and `over ⇒ done`; defensive `target <= floor` (and any binary target) → not `over`**; activity row overrides skip rows on the same day; `effectiveSkipReason` = latest skip **under the `(timestamp ASC, id ASC)` total order (equal-timestamp determinism; permutation-invariant)**; `isMissDay` (`missed` → miss; skip non-exception → miss; partial/pending/exception → not a miss); backfilling a `missed` date reclassifies it and clears the miss; yes/no multiple "done" rows idempotent |
| `score.test.ts` | count XP on day-sums (base + target bonus + above-floor intensity + streak milestone); partial day earns 0 floor XP; binary XP (base + decaying milestones, **once per day** for multiple done rows); `milestoneBonusXP` decay / `missed`-resets-run (and backfill restores it) / break-rebuild / idempotent; `levelForXP` boundaries; **stat level sums every habit mapped to the stat; the discriminating case — two habits on one stat, neither crossing a threshold alone, together crossing it — must make `describeLogEffect.statLevelUp` true, which only the `siblings` path can satisfy**; **`describeLogEffect` delta: floor-crossed / pushed-to-over / level-up / milestone / `showedUp` on partial / `savedAtRiskDay`** |
| `streak.test.ts` | **out-of-scope days are transparent: an empty day inside a `PauseInterval` neither extends nor breaks a streak, and resuming re-joins the pre-pause run; a paused habit never fires `atRiskToday` and accrues no `consecutiveMissCount` (ADR-0003)**; 0, 1, 2 consecutive misses; **`missed` days break the streak and backfilling one re-joins the runs on either side**; `partial` and `pending` days do not break streak; exception skip does not count; **`engagementStreak` counts done/over/partial (⊇ `computeStreak`); `atRiskToday` true iff `today−1` miss/break AND today pending/partial; `showedUpDays`** |
| `diagnose.test.ts` | each of the 4 rules fires on exact threshold; rules below threshold do not fire; **Rule 2 clusters non-exception `skip` days only — a weekday cluster made purely of `missed` days raises no flag (§7.3 invariant), and the same days converted to `skip` rows do raise it**; Rule 3 suppressed for binary; **Rule 5 skip-reason attribution (cue/floor/identity thresholds; exception never counted; component dedup keeps higher severity)**; **min-sample guard: Rules 1 & 4 silent below `minEngagedDaysForRate`**; empty flags for healthy habit |
| `recommend.test.ts` | priority order — critical cue > critical identity > floor warning > cue warning > stagnation; keep on empty flags |
| `statusLight.test.ts` | Forming 🔴 at consecutive-miss threshold; **Established 🔴 on decline ONLY with latest week ≤ target (decline floor-guard); decline from a peak (all > target) → not 🔴**; 🟡 on one flag; **lifecycle-aware `personal_best` (Established = intensity best; Forming = consistency/streak best)**; `weeklyActualTotals` shape; stable on healthy |
| `backfillPrompt.test.ts` | ADR-0002: prompt fires at the consecutive-`missed` threshold and at the 14-day rate threshold, and not below either; it lists only `missed` dates on/after `createdAt`; filling a listed date reclassifies it and re-runs the streak (never a new day-state row); marking not-done writes a skip with the chosen reason; **no diagnosis flag is ever emitted for `missed` days themselves** |
| `lifecycle.test.ts` | Forming→Established at threshold; **demotion uses the partial-excluded rate incl. `missed` (`missed`→partial never demotes)**; Paused only on explicit action |
| `heatLevel.test.ts` | binary done → full cell (4); non-exception skip → miss (filled); **`missed` → miss (outline), visually distinct from both `skip` and `pending`**; exception / `pending` → neutral; **partial → distinct sub-floor shade**; count above-floor ramp regression |

All tests must pass with `npm test` (Expo / Jest preset). The loop proof
(`src/__tests__/loop.test.ts`) additionally covers a binary habit end-to-end
(create → 5 done → milestone XP feeds the level → persist → reload).

### 7.2 Manual UI walkthrough (proves the loop closes)

Perform on web (`npx expo start --web`) then on a native simulator:

1. **Create** a habit: name "Pull-ups", stat Strength, floor 1, unit "reps". No
   cue or identity. Save.
2. **Log (multi-entry, same day).** On Today, log Pull-ups **twice** — actual=1,
   then actual=2. Verify the Today feed shows **two rows** but the Dashboard heatmap
   shows a **single `done` cell** for today (sum 3 ≥ floor) — proving same-day
   aggregation. Edit one row and delete the other; confirm the day reclassifies live.
3. **Create the failure signal.** Backfill the previous **two** days as **skip
   (reason "cue")** with no activity. The habit now has consecutive non-exception
   misses and a low recent completion rate; with no cue set, its status light turns
   🔴.
4. **Tap the 🔴** → navigate to Reflection for that habit.
5. **Verify diagnosis:** Rule 4 fires ("No cue set …") with evidence text visible;
   suggested action is `fill_cue`, pre-selected. The mirror renders the distinct
   day-states (today `done`, the two skip days as misses, the unlogged past days `missed`).
6. **Commit:** enter a cue ("After morning coffee"), keep action as `fill_cue`.
7. **Verify** the habit's `cue` field in the repository is updated (check Habit
   Detail → Design box shows the new cue).
8. **Reload** the app/page. Verify the cue persists (LocalRepository round-trip).
9. **Verify** the status light is no longer 🔴 (Rule 4 no longer fires once a cue
   is set, assuming completion rate recovers above threshold).

**Partial check (optional).** Create a count habit with floor=5. Log two entries
one day (actual=2, then actual=1 → sum 3). Verify the day renders as **`partial`**
(a shade distinct from `missed` and from a `skip`), the streak is unaffected, and it is
**not** counted as a miss — but it lowers the 28-day floor-completion rate.

**Yes/No variant.** Create a yes/no habit (the floor / unit / target fields are
hidden). Log it via "✓ Mark done" for 5 straight days → the stat XP jumps by the
5-day milestone bonus and the level bar advances (proving XP → level). Log a miss,
rebuild to 5 again → the re-achievement bonus is the decayed (×0.5) amount. The
feed shows "✓ done" (not "1 time"); a healthy yes/no habit shows no stagnation
flag.

### 7.3 Recording subsystem — acceptance criteria

Scenarios (assert against `classifyDay` / scoring) and invariants (properties that
must hold for any entry set). Volume/performance is **not** a V1 criterion
(entries-per-day is assumed small).

**Scenarios** (count habit `floor = 5`, `target = 8` unless noted):

| Given | Day entries | Expect |
|---|---|---|
| two activity rows | `actual: 2`, `actual: 4` | `done`, sum 6 |
| activity reaches target | `actual: 5`, `actual: 4` | `over`, sum 9 |
| positive but sub-floor | `actual: 2`, `actual: 1` | `partial`, sum 3 |
| morning skip, evening done | `skip(cue)`, `actual: 5` | `done` (activity overrides skip) |
| only skips, mixed reasons | `skip(cue)@09:00`, `skip(floor)@21:00` | `skip`, effective reason `floor` (latest) |
| no rows, date is today | — | `pending` |
| no rows, date is past | — | `missed` (a miss) |
| backfill a row onto a `missed` date | (was 0 rows) | day → `partial`/`done`/`over`; streak and rates recover |
| binary, multiple dones | `actual: 1`, `actual: 1` | `done`; XP awarded once |
| delete last row of a past date | (was `done`, now 0 rows) | day → `missed` (a miss) |
| corrupt `target <= floor` (defensive) | `floor 5, target 3`, `actual: 4` | `partial` (target ignored; sum 4 < floor, **not** `over`) |
| same-noon backfilled skips | `skip(cue)@T12:00:00`, `skip(floor)@T12:00:01` | `skip`, effective reason `floor` (total order `timestamp ASC, id ASC`) |
| below min-sample | 1 engaged day, `partial` | Rule 1 / Rule 4 **do not** fire ("gathering data") |
| engagement vs floor streak | 10 straight `partial` days | `engagementStreak` = 10, `computeStreak` = 0, XP unchanged (partial = 0) |
| at-risk save window | `today−1` = miss (incl. `missed`), today = `pending` | `atRiskToday` = true; a floor log today sets `describeLogEffect.savedAtRiskDay` |
| decline from peak (guarded) | Established, weekly totals `12,11,10,9`, target 8 | **no 🔴** (all > target — decline floor-guard, C5) |
| decline toward floor | Established, weekly totals `9,8,7,6`, target 8 | 🔴 intervention (latest ≤ target) |
| skip-reason threshold (Rule 5) | 2 `cue` skips in 28d | cue-component warning fires |
| weekday cluster of unrecorded days | 3 `missed` Tuesdays, nothing else | **no Rule 2 flag** (`missed` never attributes a component) |
| the same days marked not-done | 3 `skip(cue)` Tuesdays | Rule 2 cue warning fires |
| paused fortnight, no rows | `pauses: [{from: D, to: D+14}]`, no entries in it | those days unclassified; streak spans the gap; no miss, no `atRiskToday` |
| paused fortnight with a logged day | same, one `done` row inside it | that day still `done` and still earns XP (pause suppresses only the empty-day default) |

**Invariants:**
- A day with **≥1 activity row (`actual > 0`)** never classifies as `skip`.
- A `missed` day **never** produces a diagnosis flag or a component attribution
  (ADR-0002); it only counts toward the streak break, the miss count and `successRate`.
- A `partial` or `pending` day is **never** a miss (never breaks streak / never
  increments `consecutiveMissCount`).
- **Pause never costs (ADR-0003).** An unclassified day (pre-`createdAt`, or an empty day
  inside a `PauseInterval`) is **transparent** — it neither extends nor breaks a streak,
  is excluded from both sides of every rate, never registers as a miss, and never fires
  `atRiskToday`. Adding a pause interval must not lower XP, streak, or any rate for days
  that already hold rows.
- **Engagement ⊇ floor.** `engagementStreak` counts `done`/`over`/`partial`;
  `computeStreak` counts `done`/`over` only — so `engagementStreak >= computeStreak`
  always, and a `partial` day extends engagement but never XP or the floor-streak (C3).
- **`over ⇒ done`** — an `over` day always met the floor. A **binary** habit has
  `floor === 1` and no `target`, so its summed `actual: 1` rows can never emit `over`.
- Binary XP for any single day is awarded **at most once**, regardless of row count.
- **Scoped fairness (property).** Converting any single day `missed → partial` never
  worsens a lifecycle **demotion** (§4.7) or a **🔴 intervention** (§4.6) outcome (a
  🟡 caution may appear — it is an opportunity, not harm; §7.4).
- **Total order.** A day's rows are ordered by `(timestamp ASC, then id ASC)`;
  `classifyDay`, scoring, and streak are **invariant under any array permutation** of a
  day's rows, and `effectiveSkipReason` is deterministic even under equal timestamps.
- **Min-sample.** Rule 1 and Rule 4 do not fire until the window holds ≥
  `TUNING.diagnosis.minEngagedDaysForRate` engaged days.
- Day-state is a **pure function** of that day's stored rows (recomputable; no
  stored `state`). Editing/deleting a row never requires touching another row.
- `date` alone determines a row's day; changing `timestamp` within the same `date`
  changes ordering only, never the day a row belongs to.
- Every activity row satisfies `actual > 0`; every skip row satisfies
  `actual === 0 && skipReason != null`.

---

## 8. Proposed Project Layout

```
habiquest/
├── app/                          # expo-router screens
│   ├── (tabs)/
│   │   ├── _layout.tsx           # tab bar
│   │   ├── index.tsx             # Dashboard
│   │   └── today.tsx             # Today
│   ├── habit/
│   │   └── [id].tsx              # Habit Detail
│   └── reflect/
│       └── [id].tsx              # Reflection
│
├── src/
│   ├── models/                   # TypeScript interfaces (Stat, Habit, HabitEntry, …)
│   │
│   ├── domain/                   # Pure TS — unit-tested, no React
│   │   ├── classify.ts  + classify.test.ts
│   │   ├── score.ts     + score.test.ts
│   │   ├── streak.ts    + streak.test.ts
│   │   ├── diagnose.ts  + diagnose.test.ts
│   │   ├── recommend.ts + recommend.test.ts
│   │   ├── statusLight.ts + statusLight.test.ts
│   │   ├── lifecycle.ts + lifecycle.test.ts
│   │   └── backfill.ts  + backfillPrompt.test.ts   # ADR-0002 bulk-backfill query
│   │
│   ├── data/                     # Repository layer
│   │   ├── HabitRepository.ts    # Interface
│   │   ├── LocalRepository.ts    # AsyncStorage / IndexedDB implementation
│   │   └── SupabaseRepository.ts # Stub — throws 'not yet configured'
│   │
│   ├── config/
│   │   └── tuning.ts             # All §12 placeholder constants
│   │
│   └── context/
│       └── RepositoryContext.tsx # React Context — provides HabitRepository instance
│
├── assets/                       # Icons, splash, etc.
├── app.json
├── tsconfig.json
├── babel.config.js
└── package.json
```

---

## 9. Open Questions Carried Forward

These match CONCEPT §12 and remain unresolved; answers live in `config/tuning.ts`
as placeholders until tuned via playtest data.

1. **Naming** — "Habiquest" leading but not final (CONCEPT §12.1).
2. **Stat taxonomy & cardinality** — list of stats; 1:N vs N:N habit→stat
   (CONCEPT §12.2).
3. **Floor / level math** — XP curve and stat-level formula. *(Direction resolved
   in §4.2 — XP is the single currency, level = XP threshold lookup, yes/no uses
   decaying milestones; concrete values remain placeholders.)* (CONCEPT §12.3).
4. **Thresholds** — status-light tiers, Forming→Established, Forming-count overload
   (CONCEPT §12.4).
5. **Reflection trigger** — fixed weekday vs. adaptive (CONCEPT §12.5).
6. **Success metrics** — north-star KPI, loop-closure metrics (CONCEPT §12.6).

---

## 10. Next Step

With this spec approved, the next action is one of:

- **`ooo seed`** — crystallize this spec into an Ouroboros Seed for structured
  execution tracking.
- **Direct implementation** — scaffold the Expo project, then implement domain
  engine first (TDD), then repository, then UI surfaces.

Either way, implement domain engine **first** — it has no dependencies and its
tests immediately verify the core loop logic before any UI exists.
