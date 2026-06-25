# Habiquest — Implementation Specification

**Status:** Draft v2 · 2026-06-24 (yes/no habit type + unified XP→level progression)
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
  yes/no: a single "done" = `actual: 1`); entry states `done / over / skip / blank`;
  skip-with-reason (4 categories); backfill (past-date entries); heatmap
  visualization; never-miss-twice detection.
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
  lookup** (no max-performance-based XP).
- **Lifecycle (§3.3):** `forming` → `established` → `paused`; demotion path.
- **All 4 surfaces:** Dashboard, Today, Habit Detail, Reflection.
- Visual reference: `mvp/habiquest-demo_2.html` (existing HTML demo). Replace its
  seeded data with real domain + repository; preserve the look and layout.

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
    establishedDeclWeeks:    3,    // 🔴 (Established) after N weeks of declining actual
  },

  // §12.4 — Forming → Established transition (PLACEHOLDER)
  formingToEstablishedDays:  30,   // days of sustained floor-rate above threshold
  formingToEstablishedRate:  0.80, // floor-completion rate threshold (80%)

  // §12.5 — Reflection trigger (PLACEHOLDER: fixed Sunday; adaptive later)
  reflectionWeekday: 0,  // 0 = Sunday

  // §12.4 — Diagnosis thresholds (PLACEHOLDER)
  diagnosis: {
    lowFloorRateThreshold:     0.60,  // below this → "floor may be too high"
    stagnationAboveFloorWeeks: 3,     // zero above-floor for N weeks → stagnation
    lowCompletionForCuePrompt: 0.50,  // below this + empty cue → "fill cue first"
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
  lifecycle:  'forming' | 'established' | 'paused';
  createdAt:  string;            // ISO-8601 UTC
}
```

### 3.3 `HabitEntry`
```typescript
type EntryState     = 'done' | 'over' | 'skip';
type SkipReason     = 'cue' | 'floor' | 'exception' | 'identity';

interface HabitEntry {
  id:          string;
  habitId:     string;           // FK → Habit.id
  date:        string;           // 'YYYY-MM-DD' (local calendar date)
  timestamp:   string;           // ISO-8601 UTC (when logged)
  actual:      number;           // 0 for skip
  state:       EntryState;
  skipReason?: SkipReason;       // required when state === 'skip'
  note?:       string;
}
```

**Blank = absence of a row.** A day with no `HabitEntry` for a given habit is
treated as `unknown` by the domain engine — never as a miss. Only `skip` with a
non-`exception` reason counts as a diagnostic miss (CONCEPT §3.2).

**Yes/No habits** store each "done" as `actual: 1, state: 'done'` and never produce
`'over'` — `classifyEntry(1, 1, undefined) → 'done'` on the same path as count.

### 3.4 `FreeLog`
```typescript
type LogType = 'note' | 'win' | 'mood' | 'idea';

interface FreeLog {
  id:        string;
  timestamp: string;    // ISO-8601 UTC; user can select time (§9.1)
  type:      LogType;
  text:      string;
}
```
Standalone — **no `habitId` link** (CONCEPT §9.4 deliberate decoupling).

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
Streak, floor-rate, XP, stat level, and status light are **derived by domain
functions** on each render pass. They may be memoised in React state but are never
persisted independently — they must be re-derivable from the stored entities alone.

---

## 4. Domain Engine

All domain logic lives in `src/domain/`. Every file is **pure TypeScript** — no
React, no AsyncStorage, no Supabase. Each module ships with a `*.test.ts` file.

### 4.1 Classification — `domain/classify.ts`

```typescript
function classifyEntry(actual: number, floor: number, target?: number): EntryState
```
- `actual >= floor` → `'done'`; `actual >= target` (if set) → `'over'`
- A caller-provided `skip` reason supersedes classification (the `HabitEntry.state`
  is always `'skip'` when the user marks a day as skipped).
- **Yes/No** habits reuse this unchanged: `classifyEntry(1, 1, undefined) → 'done'`
  (no target → no `'over'`).

```typescript
function isMiss(entry: HabitEntry | undefined): boolean
```
- `undefined` (blank) → `false` (unknown is not a miss)
- `state === 'skip' && skipReason !== 'exception'` → `true`
- anything else → `false`

### 4.2 Scoring — `domain/score.ts`

```typescript
function computeXP(entries: HabitEntry[], habit: Habit): number
function milestoneBonusXP(entries: HabitEntry[]): number   // yes/no streak milestones
function computeStreak(entries: HabitEntry[], today: string): number
function levelForXP(xp: number): number
function computeStatLevel(entries: HabitEntry[], habit: Habit): number
```

- **XP** — the single progression currency; branches on `habit.kind`. Both kinds
  earn floor-met days × `TUNING.xpPerFloorCompletion`. **Count** habits add
  target-exceeded days × `TUNING.xpBonusTargetExceed`, above-floor intensity
  (`sum(actual − floor) × TUNING.xpPerAboveFloorUnit`), and once-only
  `TUNING.xpStreakBonus` milestones (keyed on the longest run). **Binary** habits
  add `milestoneBonusXP` instead.
- **`milestoneBonusXP`** (binary) — walks runs of done/over (blanks & exception
  skips transparent; a logged miss resets the run). Each milestone in
  `TUNING.binaryStreakMilestones` fires once per run that reaches it; the k-th time
  a milestone is reached awards `base × TUNING.binaryMilestoneDecay^(k-1)` (rounded;
  dropped below `TUNING.milestoneBonusEpsilon`). A pure function of the entries —
  idempotent under recomputation; a merely-blank gap is forgiven (one long run).
- **Streak** = consecutive days with `state !== 'skip'` (non-exception) working
  backward from `today`. Blank days are excluded from the count (not breaks).
- **`levelForXP`** = highest index in `TUNING.statLevelThresholds` whose threshold
  ≤ the XP.
- **Stat level** = `levelForXP(computeXP(entries, habit))` — cumulative XP drives
  the level. The Dashboard sums each stat's per-habit XP, then looks up the level
  (and the character level = the highest stat level).

### 4.3 Never-miss-twice — `domain/streak.ts`

```typescript
function consecutiveMissCount(entries: HabitEntry[], asOfDate: string): number
function needsNeverMissTwiceIntervention(entries: HabitEntry[], asOfDate: string): boolean
```
Returns `true` when the consecutive miss count reaches
`TUNING.statusLight.interventionConsecMiss`. The UI reads this to show the 🔴
status light and to surface the "don't miss twice" nudge message.

### 4.4 Diagnosis engine — `domain/diagnose.ts`

```typescript
function diagnose(habit: Habit, entries: HabitEntry[], asOfDate: string): DiagnosisFlag[]
```

Runs all four rules in order; returns an array of `DiagnosisFlag` (may be empty).

**Rule 1 — Floor too high**
```
if (floorCompletionRate(entries, window=28) < TUNING.diagnosis.lowFloorRateThreshold)
  → { component: 'floor', severity: 'warning',
      message: 'Your floor may be too high.',
      evidence: `${Math.round(rate*100)}% floor-completion in the last 28 days` }
```

**Rule 2 — Cue clustering**
```
if (skips cluster on the same weekday in the last 28 days — 2+ misses on day X, 0 on others)
  → { component: 'cue', severity: 'warning',
      message: `Your ${dayName} cue keeps failing.`,
      evidence: `${n} of your ${total} misses fell on ${dayName}s` }
```

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
| Any `warning` flag on `cue` | `'adjust_cue'` |
| Any `warning` flag on `load` (stagnation) | `'raise_target'` |
| No flags at all | `'keep'` |

> **Yes/No limitation (known, deferred):** `lower_floor` and `raise_target` are
> meaningless for a yes/no habit (floor is fixed at 1, no target). `suggestAction`
> and the Reflection action list do not yet special-case `kind` — hiding those two
> actions for yes/no habits (and the numeric mirror values) is a planned refinement.

### 4.6 Status-light derivation — `domain/statusLight.ts`

```typescript
type StatusLight = 'stable' | 'caution' | 'intervention' | 'personal_best';

function deriveStatusLight(
  habit:   Habit,
  entries: HabitEntry[],
  today:   string,
): StatusLight
```

Logic:
- `intervention` — `Forming` + consecutive miss ≥ threshold **OR** `Established` +
  declining actual trend over `TUNING.statusLight.establishedDeclWeeks` weeks.
- `caution` — `flags.length >= TUNING.statusLight.cautionMinFlags`.
- `personal_best` — `Established` + this week's total actual > any prior week's.
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
  for `TUNING.formingToEstablishedDays` consecutive days (PLACEHOLDER thresholds).
- `established` → `forming` (demotion): floor-completion rate falls below threshold
  for the same window.
- `* → paused`: explicit user action only (not triggered automatically).
- `paused → forming/established`: explicit resume action only.

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

---

## 6. UI Surfaces

Visual language, colours, and typography come directly from
`mvp/habiquest-demo_2.html`. Replace seeded arrays with live data from the
repository; all business logic stays in the domain layer.

### 6.1 Dashboard (`app/index.tsx` or `app/(tabs)/dashboard.tsx`)
- Stat cards: level (from cumulative XP), XP bar, "to next level" label.
- Quest Log: per-habit row with name, stat tag, cue summary, streak, 20-day
  heatmap, **status light** (🟢 / 🟡 / 🔴). Tapping a 🔴 navigates to
  `reflect/[habitId]`; tapping a row navigates to `habit/[habitId]`.
- Aggregate status count ("shaky habits · N").

### 6.2 Today (`app/(tabs)/today.tsx`)
- Date header + tally (quests done / logs / XP earned today).
- **Unified composer:**
  - Target selector: "Free log" or one of the user's habits.
  - Free log path: type chips (Note / Win / Mood / Idea) + optional note.
  - Habit path (count): numeric actual input + unit + floor hint + optional note.
  - Habit path (yes/no): a single "✓ Mark done" (no amount) + optional note.
  - Time picker: separate hour (`00`–`23`) and minute (`00`, `10`, … `50`) selects;
    defaults to current time rounded down to nearest 10 minutes.
  - Log button — calls `upsertEntry` or `upsertFreeLog`.
- Chronological Today feed (habit entries and free logs interleaved by timestamp).

### 6.3 Habit Detail (`app/habit/[id].tsx`)
- Header: name, stat tag.
- Stat pills: streak, floor-rate (28-day), XP/week.
- **Design box:** Cue / Floor / Identity — current hypothesis. Edit affordance.
  For yes/no habits the floor cell reads "Yes / No" and the edit form hides
  floor/target.
- Journal: last N entries as a timeline, each showing date, state chip
  (done / over / skip), actual, note (yes/no shows "✓ done", no amount).
  **Backfill** entry: tap a past-date in the heatmap (or a "+ add past entry"
  button) to log retroactively (yes/no backfill is a single "mark done").

### 6.4 Reflection (`app/reflect/[id].tsx`)
- Entry point: tap a 🔴 or 🟡 status light on the Dashboard.
- **Mirror:** 7-day heatmap grid showing this week's states (done / over / miss) +
  any journal notes.
- **Diagnosis flags:** pre-computed, rule-based cards. Each shows:
  - Component (CUE / FLOOR / IDENTITY / LOAD), severity badge.
  - Human-readable message.
  - **Evidence** (the cited data — always visible, not hidden). This is the
    guardrail against rubber-stamping (CONCEPT §6.2 rule 4).
- **Recommended action** — pre-selected button (with explanation). User can switch.
  (For yes/no habits, `lower_floor`/`raise_target` are not yet hidden — see §4.5.)
- **Commit button** — writes:
  1. Updated `Habit` record (design change).
  2. `ReflectionSession` record (`designBefore`, `designAfter`, `chosenAction`,
     `committedAt`).
  - After commit: navigate back to Dashboard; status light should have updated.

---

## 7. Acceptance Criteria

### 7.1 Engine unit tests (automated)

File: `src/domain/**/*.test.ts`

| Test suite | Cases to cover |
|---|---|
| `classify.test.ts` | actual < floor → done; actual ≥ target → over; skip with reason; skip exception not a miss; blank undefined not a miss |
| `score.test.ts` | count XP (base + target bonus + above-floor intensity + streak milestone); binary XP (base + decaying milestones); `milestoneBonusXP` decay / blank-forgiven / break-rebuild / idempotent; `levelForXP` boundaries; stat level = XP threshold lookup |
| `streak.test.ts` | 0, 1, 2 consecutive misses; blank days do not break streak; exception skip does not count |
| `diagnose.test.ts` | each of the 4 rules fires on exact threshold; rules below threshold do not fire; Rule 3 suppressed for binary habits; empty flags for healthy habit |
| `recommend.test.ts` | priority order — critical cue > critical identity > floor warning > cue warning > stagnation; keep on empty flags |
| `statusLight.test.ts` | Forming 🔴 at consecutive-miss threshold; Established 🔴 on declining trend; 🟡 on one flag; stable on healthy |
| `lifecycle.test.ts` | Forming→Established at threshold; demotion path; Paused only on explicit action |
| `heatLevel.test.ts` | binary done → full cell (4); non-exception skip → miss; exception / blank → neutral; count above-floor ramp regression |

All tests must pass with `npm test` (Expo / Jest preset). The loop proof
(`src/__tests__/loop.test.ts`) additionally covers a binary habit end-to-end
(create → 5 done → milestone XP feeds the level → persist → reload).

### 7.2 Manual UI walkthrough (proves the loop closes)

Perform on web (`npx expo start --web`) then on a native simulator:

1. **Create** a habit: name "Pull-ups", stat Strength, floor 1, unit "reps". No
   cue or identity. Save.
2. **Log** three entries on Today: actual=0 (skip, reason "cue"), actual=1 (done),
   actual=3 (over). Verify heatmap on Dashboard updates.
3. **Confirm** the habit's status light on Dashboard has turned 🔴 (after the skip).
4. **Tap the 🔴** → navigate to Reflection for that habit.
5. **Verify diagnosis:** Rule 4 fires ("No cue set …") with evidence text visible.
   Suggested action is `fill_cue`, pre-selected.
6. **Commit:** enter a cue ("After morning coffee"), keep action as `fill_cue`.
7. **Verify** the habit's `cue` field in the repository is updated (check Habit
   Detail → Design box shows the new cue).
8. **Reload** the app/page. Verify the cue persists (LocalRepository round-trip).
9. **Verify** the status light is no longer 🔴 (Rule 4 no longer fires once a cue
   is set, assuming completion rate recovers above threshold).

**Yes/No variant.** Create a yes/no habit (the floor / unit / target fields are
hidden). Log it via "✓ Mark done" for 5 straight days → the stat XP jumps by the
5-day milestone bonus and the level bar advances (proving XP → level). Log a miss,
rebuild to 5 again → the re-achievement bonus is the decayed (×0.5) amount. The
feed shows "✓ done" (not "1 time"); a healthy yes/no habit shows no stagnation
flag.

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
│   │   └── lifecycle.ts + lifecycle.test.ts
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
