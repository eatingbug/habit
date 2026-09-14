import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  DiagnosisFlag,
  FreeLog,
  Habit,
  HabitDesignSnapshot,
  HabitEntry,
  HabitKind,
  Lifecycle,
  LogType,
  PauseInterval,
  ReflectionAction,
  ReflectionSession,
  SkipReason,
} from '@/models';

import type { HabitRepository } from './HabitRepository';

/**
 * The server-backed `HabitRepository` — ADR-0005, which makes Supabase Postgres the
 * single source of truth and retires §5.3's "V1 is single-device, local-only".
 *
 * **Nothing constructs this yet.** `RepositoryContext` still builds a
 * `LocalRepository`; wiring the session, the client and the auth-driven rebuild is
 * #51. Until then the only caller is the live round-trip suite in
 * `tests/policy/supabase-repository.test.mjs`, which is where every claim below is
 * actually checked — none of the jest suites execute this file.
 *
 * **Both collaborators are injected**, exactly as `LocalRepository(kv)` takes its
 * driver: the client, and the device's UTC offset. That is what keeps every import
 * here `import type` and keeps `src/data` pure and clock-free (SPEC §2.2) — the
 * layer that knows which platform it is running on, and what time it is, is
 * `src/context` (see `src/__tests__/architecture.test.ts`).
 *
 * **No user argument, anywhere.** `getHabits()` returns *my* habits because of the
 * RLS policies in `supabase/migrations/20260914120000_core_schema_and_rls.sql`, not
 * because of anything in this file — and writes never mention `user_id` at all,
 * because `20260914140000_user_id_defaults_to_auth_uid.sql` gives the column a
 * `default auth.uid()`. The `with check (auth.uid() = user_id)` clause is still the
 * boundary; the default only decides what happens when the client stays silent.
 *
 * **Failures throw.** A non-2xx must never become an empty array or a silent `void`:
 * a swallowed write is a tap the user believes was recorded. Presenting that failure
 * is #51's job — `src/hooks/` currently has no `catch` at all — and this file's job
 * ends at raising it.
 */

/**
 * Column names are snake_case and three of them are renamed outright, so the mapping
 * layer below is mandatory rather than a nicety (ADR-0005 · migration header):
 * `HabitEntry.date`/`FreeLog.date` → `local_date`, `.timestamp` → `logged_at`,
 * `FreeLog.text` → `body`. `date`, `timestamp` and `text` are all Postgres type
 * keywords.
 *
 * These row types are declared rather than generated: without them the untyped
 * `SupabaseClient` hands back `any` and `tsc` would check the mappers against
 * nothing.
 */
type HabitRow = {
  id: string;
  name: string;
  stat_id: string;
  kind: HabitKind;
  floor: number;
  floor_unit: string;
  target: number | null;
  cue: string | null;
  identity: string | null;
  lifecycle: Lifecycle;
  created_at: string;
  pauses: PauseInterval[];
};

type HabitEntryRow = {
  id: string;
  habit_id: string;
  local_date: string;
  logged_at: string;
  actual: number;
  skip_reason: SkipReason | null;
  note: string | null;
  utc_offset_minutes: number;
};

type FreeLogRow = {
  id: string;
  local_date: string;
  logged_at: string;
  type: LogType;
  body: string;
  utc_offset_minutes: number;
};

type ReflectionSessionRow = {
  id: string;
  habit_id: string;
  week_of: string;
  flags: DiagnosisFlag[];
  suggested_action: ReflectionAction;
  chosen_action: ReflectionAction;
  design_before: HabitDesignSnapshot;
  design_after: HabitDesignSnapshot;
  committed_at: string | null;
};

/**
 * `supabase-js` never rejects — it resolves `{ data, error }` — so every one of the
 * twelve methods has to ask. Called twelve times, which is what makes it a shared
 * rule rather than an abstraction invented for one caller (CLAUDE.md §2).
 */
function raiseIfFailed(method: string, error: { message: string } | null): void {
  if (error != null) throw new Error(`SupabaseRepository.${method}: ${error.message}`);
}

/**
 * PostgREST renders `timestamptz` as `+00:00`; the models store `Z`. Normalising on
 * read is not cosmetic: `restampedAtLocalTime` (`src/lib/device.ts`) decides whether a
 * row was edited by **comparing the two stamps as strings**, so an un-normalised read
 * would make every reopened time reveal rewrite a row the user never touched — the
 * exact behaviour #13 closed.
 */
function isoUtc(stamp: string): string {
  return new Date(stamp).toISOString();
}

/**
 * An absent optional must come back **absent**, never `null`: `LocalRepository`'s
 * `JSON.parse` never invents keys, and a `cue: null` would compare unequal, render as
 * the string "null" and defeat every `x != null` guard above this layer.
 */
function present<K extends string, V>(key: K, value: V | null): { [P in K]?: V } {
  return (value == null ? {} : { [key]: value }) as { [P in K]?: V };
}

/**
 * Writes name **every** column, including the ones that are absent. PostgREST merges
 * duplicate-key upserts column by column, so a write that omitted `note` would leave
 * yesterday's note behind on an edit that cleared it — where `LocalRepository`'s
 * upsert replaces the whole object. Absent optionals therefore go out as explicit
 * `null`.
 *
 * `user_id` is deliberately not among them — see the class docblock.
 *
 * No `kind` backfill on read, unlike `LocalRepository.normaliseHabit`: the column is
 * `kind text not null check (kind in ('count','binary'))`, so a row without a `kind`
 * cannot exist. Defending against an impossible row is what CLAUDE.md §2 forbids.
 */
function toHabitRow(habit: Habit): HabitRow {
  return {
    id: habit.id,
    name: habit.name,
    stat_id: habit.statId,
    kind: habit.kind,
    floor: habit.floor,
    floor_unit: habit.floorUnit,
    target: habit.target ?? null,
    cue: habit.cue ?? null,
    identity: habit.identity ?? null,
    lifecycle: habit.lifecycle,
    created_at: habit.createdAt,
    pauses: habit.pauses ?? [],
  };
}

/**
 * `pauses` is the one optional that cannot round-trip through `null`: the column is
 * `not null default '[]'`, so an absent `pauses` is stored as `[]` and would read back
 * as `[]` where `LocalRepository` gives `undefined`. Stripping the empty array back to
 * an absent key is what keeps #51's one-line swap from changing behaviour.
 */
function fromHabitRow(row: HabitRow): Habit {
  return {
    id: row.id,
    name: row.name,
    statId: row.stat_id,
    kind: row.kind,
    floor: row.floor,
    floorUnit: row.floor_unit,
    lifecycle: row.lifecycle,
    createdAt: isoUtc(row.created_at),
    ...present('target', row.target),
    ...present('cue', row.cue),
    ...present('identity', row.identity),
    ...present('pauses', row.pauses.length === 0 ? null : row.pauses),
  };
}

function fromHabitEntryRow(row: HabitEntryRow): HabitEntry {
  return {
    id: row.id,
    habitId: row.habit_id,
    date: row.local_date,
    timestamp: isoUtc(row.logged_at),
    actual: row.actual,
    ...present('skipReason', row.skip_reason),
    ...present('note', row.note),
  };
}

function fromFreeLogRow(row: FreeLogRow): FreeLog {
  return {
    id: row.id,
    date: row.local_date,
    timestamp: isoUtc(row.logged_at),
    type: row.type,
    text: row.body,
  };
}

function fromReflectionSessionRow(row: ReflectionSessionRow): ReflectionSession {
  return {
    id: row.id,
    habitId: row.habit_id,
    weekOf: row.week_of,
    flags: row.flags,
    suggestedAction: row.suggested_action,
    chosenAction: row.chosen_action,
    designBefore: row.design_before,
    designAfter: row.design_after,
    ...present('committedAt', row.committed_at == null ? null : isoUtc(row.committed_at)),
  };
}

export class SupabaseRepository implements HabitRepository {
  private readonly client: SupabaseClient;
  private readonly utcOffsetMinutes: number;

  /**
   * Fields are declared and assigned rather than written as parameter properties:
   * `tests/policy/` imports this `.ts` file directly under
   * `node --test --experimental-strip-types`, and a parameter property is
   * `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` there — type erasure cannot emit the
   * assignment a parameter property implies.
   *
   * `utcOffsetMinutes` is the device's offset **east-positive** (KST = `+540`), the
   * convention ADR-0005 and the column comment both pin down;
   * `src/lib/device.ts`'s `deviceUtcOffsetMinutes()` produces it. Getting the sign
   * backwards is exactly why #31 is open, so the value arrives already flipped and
   * this file never touches `getTimezoneOffset()`.
   */
  constructor(client: SupabaseClient, utcOffsetMinutes: number) {
    this.client = client;
    this.utcOffsetMinutes = utcOffsetMinutes;
  }

  // --- Habits ---------------------------------------------------------------

  /**
   * Reads are ordered explicitly. Postgres returns rows in whatever order it likes
   * without an `order by`, and `LocalRepository` returns insertion order, which in
   * practice is creation order — so `created_at ASC, id ASC` is the closest stable
   * stand-in. Nothing depends on it: persisted order is explicitly not part of the
   * contract (`LocalRepository.test.ts`) and everything that cares re-sorts
   * (`sortByDomainOrder`, §7.3). But "arbitrary" is not a contract worth shipping,
   * and the round-trip suite needs reads to be repeatable.
   */
  async getHabits(): Promise<Habit[]> {
    const { data, error } = await this.client
      .from('habits')
      .select('*')
      .order('created_at')
      .order('id');
    raiseIfFailed('getHabits', error);
    return ((data ?? []) as HabitRow[]).map(fromHabitRow);
  }

  /** `maybeSingle`, not `single`: "no such habit" is `null` here, not an error (§5.1). */
  async getHabit(id: string): Promise<Habit | null> {
    const { data, error } = await this.client.from('habits').select('*').eq('id', id).maybeSingle();
    raiseIfFailed('getHabit', error);
    return data == null ? null : fromHabitRow(data as HabitRow);
  }

  async upsertHabit(habit: Habit): Promise<void> {
    const { error } = await this.client.from('habits').upsert(toHabitRow(habit));
    raiseIfFailed('upsertHabit', error);
  }

  /**
   * One DELETE. Both `habit_entries.habit_id` and `reflection_sessions.habit_id` are
   * `on delete cascade`, so the server performs the same cascade `LocalRepository`
   * performs by hand — and for the same reason, given there in its docblock: the
   * alternative leaves rows nothing can ever reach.
   */
  async deleteHabit(id: string): Promise<void> {
    const { error } = await this.client.from('habits').delete().eq('id', id);
    raiseIfFailed('deleteHabit', error);
  }

  // --- Entries --------------------------------------------------------------

  /**
   * `[from, to]` is **inclusive at both ends**, matching `LocalRepository.inRange`,
   * and the filter is on `local_date` — the authoritative day (§3.3) — never on
   * `logged_at`, which can land on the neighbouring UTC day.
   */
  async getEntries(habitId: string, from: string, to: string): Promise<HabitEntry[]> {
    const { data, error } = await this.client
      .from('habit_entries')
      .select('*')
      .eq('habit_id', habitId)
      .gte('local_date', from)
      .lte('local_date', to)
      .order('logged_at')
      .order('id');
    raiseIfFailed('getEntries', error);
    return ((data ?? []) as HabitEntryRow[]).map(fromHabitEntryRow);
  }

  /**
   * `utc_offset_minutes` is stamped on **every** write, corrections included. The
   * frozen twelve methods (#47) offer no way to tell a create from an edit, and the
   * column records the provenance of the write that produced the row's current
   * content — so the offset of the device doing the correcting is the honest answer.
   * The column is `not null` with no default precisely so a missing offset is a loud
   * write failure rather than a quiet lie (ADR-0005).
   */
  async upsertEntry(entry: HabitEntry): Promise<void> {
    const row: HabitEntryRow = {
      id: entry.id,
      habit_id: entry.habitId,
      local_date: entry.date,
      logged_at: entry.timestamp,
      actual: entry.actual,
      skip_reason: entry.skipReason ?? null,
      note: entry.note ?? null,
      utc_offset_minutes: this.utcOffsetMinutes,
    };
    const { error } = await this.client.from('habit_entries').upsert(row);
    raiseIfFailed('upsertEntry', error);
  }

  /**
   * A bare `id` is enough here, where `LocalRepository` has to scan buckets to find
   * the habit that owns the row: the table is flat and the id is its primary key.
   */
  async deleteEntry(id: string): Promise<void> {
    const { error } = await this.client.from('habit_entries').delete().eq('id', id);
    raiseIfFailed('deleteEntry', error);
  }

  // --- Free logs ------------------------------------------------------------

  async getFreeLogs(from: string, to: string): Promise<FreeLog[]> {
    const { data, error } = await this.client
      .from('free_logs')
      .select('*')
      .gte('local_date', from)
      .lte('local_date', to)
      .order('logged_at')
      .order('id');
    raiseIfFailed('getFreeLogs', error);
    return ((data ?? []) as FreeLogRow[]).map(fromFreeLogRow);
  }

  async upsertFreeLog(log: FreeLog): Promise<void> {
    const row: FreeLogRow = {
      id: log.id,
      local_date: log.date,
      logged_at: log.timestamp,
      type: log.type,
      body: log.text,
      utc_offset_minutes: this.utcOffsetMinutes,
    };
    const { error } = await this.client.from('free_logs').upsert(row);
    raiseIfFailed('upsertFreeLog', error);
  }

  async deleteLog(id: string): Promise<void> {
    const { error } = await this.client.from('free_logs').delete().eq('id', id);
    raiseIfFailed('deleteLog', error);
  }

  // --- Reflection sessions --------------------------------------------------

  async getReflectionSessions(habitId: string): Promise<ReflectionSession[]> {
    const { data, error } = await this.client
      .from('reflection_sessions')
      .select('*')
      .eq('habit_id', habitId)
      .order('week_of')
      .order('id');
    raiseIfFailed('getReflectionSessions', error);
    return ((data ?? []) as ReflectionSessionRow[]).map(fromReflectionSessionRow);
  }

  /**
   * `flags`, `design_before` and `design_after` go over as objects, not strings:
   * they are `jsonb` columns, so PostgREST stores the JSON value directly and reads
   * it back already parsed. `week_of` is a week boundary rather than a device-local
   * calendar day, which is why this table carries no `utc_offset_minutes`.
   */
  async upsertReflectionSession(session: ReflectionSession): Promise<void> {
    const row: ReflectionSessionRow = {
      id: session.id,
      habit_id: session.habitId,
      week_of: session.weekOf,
      flags: session.flags,
      suggested_action: session.suggestedAction,
      chosen_action: session.chosenAction,
      design_before: session.designBefore,
      design_after: session.designAfter,
      committed_at: session.committedAt ?? null,
    };
    const { error } = await this.client.from('reflection_sessions').upsert(row);
    raiseIfFailed('upsertReflectionSession', error);
  }
}
