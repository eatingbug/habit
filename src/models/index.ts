/**
 * Domain models (SPEC §3).
 *
 * All IDs are string (UUID v4). Dates are ISO calendar strings ('YYYY-MM-DD');
 * timestamps are UTC ISO-8601 strings. These are plain data interfaces — no logic,
 * no Date objects — so they JSON round-trip losslessly through the repository.
 */

// ── §3.1 Stat ────────────────────────────────────────────────────────────────
export interface Stat {
  id: string; // e.g. 'strength'
  name: string; // 'Strength'
  icon: string; // '💪'
}

// ── §3.2 Habit ───────────────────────────────────────────────────────────────
export type Lifecycle = 'forming' | 'established' | 'paused';

// Creation invariants (SPEC §3.2, enforced by the creation form / repository):
//   floor >= 1; target, when present, is strictly > floor (so `over ⇒ done`);
//   binary ⇒ floor === 1 && target === undefined.
export interface Habit {
  id: string;
  name: string;
  statId: string; // FK → Stat.id
  kind: 'count' | 'binary'; // 'count' = numeric amount; 'binary' = yes/no (floor 1, no target)
  floor: number; // can't-fail minimum; creation invariant: floor >= 1
  floorUnit: string; // e.g. 'reps', 'pages', 'min'
  target?: number; // optional stretch goal; when present, strictly > floor
  cue?: string; // optional at creation (§5)
  identity?: string; // optional at creation (§5)
  lifecycle: Lifecycle;
  createdAt: string; // ISO-8601 UTC
}

// ── §3.3 HabitEntry ──────────────────────────────────────────────────────────
export type SkipReason = 'cue' | 'floor' | 'exception' | 'identity';

/**
 * Multi-entry recording model (SPEC §3.3 / §4.1). Entries are FACTS ONLY; a day's
 * outcome is COMPUTED from that day's rows (see DayState / classifyDay), never stored.
 *  - activity row: `actual > 0`, no skipReason.
 *  - skip row:     `actual === 0` + a skipReason.
 * Multiple rows may share a (habitId, date); the day's amount is the SUM of activity rows.
 */
export interface HabitEntry {
  id: string;
  habitId: string; // FK → Habit.id
  date: string; // 'YYYY-MM-DD' (local calendar date) — authoritative for day grouping
  timestamp: string; // ISO-8601 UTC (when logged) — sort / tiebreak only
  actual: number; // 0 for skip; the logged amount otherwise
  /** Present only on skip rows (actual === 0). Absent on activity rows. */
  skipReason?: SkipReason;
  note?: string;
}

/**
 * Computed outcome of a single (habitId, date) — a pure function of that day's rows
 * (SPEC §4.1). Never stored.
 *  - `unknown` — no rows (blank); never a miss.
 *  - `partial` — activity but sum < floor; not a miss, not a completion (lowers floor rate).
 *  - `done`    — sum >= floor.
 *  - `over`    — sum >= target (target strictly > floor); implies done.
 *  - `skip`    — only skip rows; a miss iff the effective reason is non-`exception`.
 */
export type DayState = 'unknown' | 'partial' | 'done' | 'over' | 'skip';

// ── §3.4 FreeLog ─────────────────────────────────────────────────────────────
// Standalone — no habitId link (CONCEPT §9.4 deliberate decoupling).
export type LogType = 'note' | 'win' | 'mood' | 'idea';

export interface FreeLog {
  id: string;
  date?: string; // 'YYYY-MM-DD'; authoritative for day grouping. Defaulted from timestamp on read.
  timestamp: string; // ISO-8601 UTC; user can select time (§9.1)
  type: LogType;
  text: string;
}

// ── §3.5 ReflectionSession ───────────────────────────────────────────────────
export type DiagnosisComponent = 'cue' | 'floor' | 'identity' | 'load';
export type Severity = 'ok' | 'warning' | 'critical';

export interface DiagnosisFlag {
  component: DiagnosisComponent;
  severity: Severity;
  message: string;
  evidence: string; // cited data points (no LLM in V1)
}

export type ReflectionAction =
  | 'adjust_cue'
  | 'lower_floor'
  | 'raise_target'
  | 'fill_cue'
  | 'fill_identity'
  | 'pause'
  | 'archive'
  | 'keep';

export interface HabitDesignSnapshot {
  floor: number;
  floorUnit: string;
  target?: number;
  cue?: string;
  identity?: string;
}

export interface ReflectionSession {
  id: string;
  habitId: string; // FK → Habit.id
  weekOf: string; // 'YYYY-MM-DD' (Monday of the reflected week)
  flags: DiagnosisFlag[];
  suggestedAction: ReflectionAction; // pre-selected by the engine
  chosenAction: ReflectionAction; // set by user on commit
  designBefore: HabitDesignSnapshot;
  designAfter: HabitDesignSnapshot; // filled on commit
  committedAt?: string; // ISO-8601 UTC; undefined until committed
}

// ── §4.6 StatusLight (computed, not stored) ──────────────────────────────────
export type StatusLight = 'stable' | 'caution' | 'intervention' | 'personal_best';
