/** Domain entities — SPEC §3. All ids are UUID v4 strings. */

/** SPEC §3.1 — populated from `TUNING.stats`; not stored per-user in V1. */
export interface Stat {
  id: string;
  name: string;
  icon: string;
}

/** ADR-0003 — half-open `[from, to)`: the resume date is active again. */
export interface PauseInterval {
  /** 'YYYY-MM-DD' — first paused date. */
  from: string;
  /** 'YYYY-MM-DD' — first re-active date; absent ⇒ still paused. */
  to?: string;
}

export type HabitKind = 'count' | 'binary';

export type Lifecycle = 'forming' | 'established' | 'paused' | 'archived';

/** SPEC §3.2. */
export interface Habit {
  id: string;
  name: string;
  /** FK → Stat.id */
  statId: string;
  kind: HabitKind;
  /** Always 1 for binary habits. */
  floor: number;
  /** e.g. 'reps', 'pages', 'min'; 'time' for binary. */
  floorUnit: string;
  /** Optional stretch goal, count only. Must satisfy `target > floor` (strict). */
  target?: number;
  /** Optional at creation (§5 — deliberate late introduction). */
  cue?: string;
  /** Optional at creation (§5). */
  identity?: string;
  lifecycle: Lifecycle;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ADR-0003 — non-overlapping, `from` ASC, append-only. */
  pauses?: PauseInterval[];
}

export type SkipReason = 'cue' | 'floor' | 'exception' | 'identity';

/**
 * SPEC §3.3 — a raw fact, never a classified state. Multiple rows may share a
 * `(habitId, date)`; the day's state is computed by aggregation (§4.1).
 *
 * Row discriminator: an **activity row** has `actual > 0` and no `skipReason`; a
 * **skip row** has `actual: 0` and a `skipReason`. There is no `state`/`kind` field.
 */
export interface HabitEntry {
  id: string;
  habitId: string;
  /** 'YYYY-MM-DD' — AUTHORITATIVE for day-grouping. */
  date: string;
  /** ISO-8601 UTC — ordering & latest-skip tiebreak only. */
  timestamp: string;
  /** activity row: > 0 · skip row: 0 */
  actual: number;
  /** present ⇔ this is a skip row. */
  skipReason?: SkipReason;
  note?: string;
}

/** SPEC §3.3 — computed, never stored. */
export type DayState = 'pending' | 'missed' | 'partial' | 'done' | 'over' | 'skip';

export type LogType = 'note' | 'win' | 'mood' | 'idea';

/** SPEC §3.4 — standalone; deliberately no `habitId` link (CONCEPT §9.4). */
export interface FreeLog {
  id: string;
  /** 'YYYY-MM-DD' — set at creation; authoritative for grouping. */
  date: string;
  timestamp: string;
  type: LogType;
  text: string;
}

export type DiagnosisComponent = 'cue' | 'floor' | 'identity' | 'load';

export type Severity = 'ok' | 'warning' | 'critical';

/** SPEC §3.5. */
export interface DiagnosisFlag {
  component: DiagnosisComponent;
  severity: Severity;
  message: string;
  /** Cited data points — always rendered, never hidden (§6.4). */
  evidence: string;
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

/** SPEC §3.5. */
export interface ReflectionSession {
  id: string;
  habitId: string;
  /** 'YYYY-MM-DD' — Monday of the reflected week. */
  weekOf: string;
  flags: DiagnosisFlag[];
  /** Pre-selected by the engine. */
  suggestedAction: ReflectionAction;
  /** Set by the user on commit. */
  chosenAction: ReflectionAction;
  designBefore: HabitDesignSnapshot;
  designAfter: HabitDesignSnapshot;
  /** ISO-8601 UTC; absent until committed. */
  committedAt?: string;
}
