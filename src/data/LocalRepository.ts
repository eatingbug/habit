import type { FreeLog, Habit, HabitEntry, ReflectionSession } from '@/models';

import type { HabitRepository } from './HabitRepository';
import type { KVStore } from './KVStore';

/**
 * Local-only `HabitRepository` — SPEC §5.2.
 *
 * Storage strategy: each entity collection is one JSON array under a prefixed key.
 * Sufficient for V1's single-device, offline-only model (§5.3); revisit only if
 * performance ever needs structured queries.
 *
 * The driver is injected as a `KVStore` rather than imported, which keeps this file
 * pure TS and testable with `MemoryKV` alone (see the architecture test).
 *
 * `V1 is single-device and local-only` — deliberately **no** tombstones and no merge
 * semantics; §5.3 defers those to V2. A delete just removes the row. "Append-only"
 * here is the usage property (§6.2): new facts are appended, and a correction is an
 * edit or delete of one specific row by `id` — never a rewrite of a day.
 */

const PREFIX = 'habiquest';

const HABITS_KEY = `${PREFIX}:habits`;
const LOGS_KEY = `${PREFIX}:logs`;
const entriesKey = (habitId: string) => `${PREFIX}:entries:${habitId}`;
const reflectionsKey = (habitId: string) => `${PREFIX}:reflections:${habitId}`;

/**
 * Forward-compat (§5.2): a habit persisted before the `kind` discriminator existed
 * loads as a count habit. Applied on every habit read — `getHabit` too, not just
 * `getHabits` as §5.2's letter says, since a disagreement between the two would be a
 * defect in waiting.
 *
 * The spread preserves absent optionals as absent: `JSON.parse` never invents keys,
 * so `target`/`cue`/`identity`/`pauses` stay missing rather than becoming `null`.
 */
function normaliseHabit(habit: Habit): Habit {
  return habit.kind == null ? { ...habit, kind: 'count' } : habit;
}

/**
 * Date-range filtering compares the **`date`** field, which is authoritative for
 * day-grouping (§3.3) — never `timestamp`, which can fall on the neighbouring UTC day.
 *
 * Zero-padded 'YYYY-MM-DD' is lexicographically ordered, so plain string comparison is
 * correct and inclusive at both ends. That is why this file needs no date helper (and
 * so stays free of a `src/domain` import, which §2.2's direction forbids).
 */
function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/** Replace the row with the same `id`, or append it. Never duplicates an `id`. */
function upsertById<T extends { id: string }>(rows: T[], row: T): T[] {
  const at = rows.findIndex((r) => r.id === row.id);
  if (at < 0) return [...rows, row];
  const next = [...rows];
  next[at] = row;
  return next;
}

export class LocalRepository implements HabitRepository {
  constructor(private readonly kv: KVStore) {}

  private async readAll<T>(key: string): Promise<T[]> {
    const raw = await this.kv.get(key);
    return raw == null ? [] : (JSON.parse(raw) as T[]);
  }

  private async writeAll<T>(key: string, rows: T[]): Promise<void> {
    await this.kv.set(key, JSON.stringify(rows));
  }

  // --- Habits ---------------------------------------------------------------

  async getHabits(): Promise<Habit[]> {
    return (await this.readAll<Habit>(HABITS_KEY)).map(normaliseHabit);
  }

  async getHabit(id: string): Promise<Habit | null> {
    const found = (await this.readAll<Habit>(HABITS_KEY)).find((h) => h.id === id);
    return found == null ? null : normaliseHabit(found);
  }

  async upsertHabit(habit: Habit): Promise<void> {
    await this.writeAll(HABITS_KEY, upsertById(await this.readAll<Habit>(HABITS_KEY), habit));
  }

  /**
   * Deleting a habit **cascades** to its entries and reflection sessions.
   *
   * SPEC leaves this open; the cascade is chosen because the alternative leaves rows
   * that nothing can ever reach or clean up — and because `deleteEntry(id)` locates a
   * row by scanning the buckets of the habits that exist, so an orphaned bucket would
   * be undeletable. Archiving, not deleting, is the way to keep a habit's history
   * (§3.2 — archived habits keep their entries and are reversible).
   */
  async deleteHabit(id: string): Promise<void> {
    const habits = await this.readAll<Habit>(HABITS_KEY);
    await this.writeAll(
      HABITS_KEY,
      habits.filter((h) => h.id !== id),
    );
    await this.kv.remove(entriesKey(id));
    await this.kv.remove(reflectionsKey(id));
  }

  // --- Entries --------------------------------------------------------------

  async getEntries(habitId: string, from: string, to: string): Promise<HabitEntry[]> {
    const rows = await this.readAll<HabitEntry>(entriesKey(habitId));
    return rows.filter((e) => inRange(e.date, from, to));
  }

  /**
   * Writes into the bucket named by `entry.habitId`. Multiple rows may share a
   * `(habitId, date)` — the day's state is an aggregation (§3.3, §4.1) — so a row is
   * only ever matched by `id`; upserting one row never disturbs the day's others.
   */
  async upsertEntry(entry: HabitEntry): Promise<void> {
    const key = entriesKey(entry.habitId);
    await this.writeAll(key, upsertById(await this.readAll<HabitEntry>(key), entry));
  }

  /**
   * `deleteEntry` takes a bare `id` (§5.1), so the bucket has to be found: the habit
   * list enumerates every bucket that exists, and `deleteHabit`'s cascade guarantees
   * there are no others. Cheap at V1's habit counts, and it avoids a second copy of
   * the id → habit mapping that could drift out of sync.
   *
   * Precondition: the owning habit is in the habit list. It always is at runtime (the
   * composer cannot create a row for a habit that does not exist, and `deleteHabit`
   * removes the whole bucket), but a test fixture that writes an entry without its
   * habit will see this silently do nothing.
   */
  async deleteEntry(id: string): Promise<void> {
    for (const habit of await this.readAll<Habit>(HABITS_KEY)) {
      const key = entriesKey(habit.id);
      const rows = await this.readAll<HabitEntry>(key);
      if (!rows.some((e) => e.id === id)) continue;
      await this.writeAll(
        key,
        rows.filter((e) => e.id !== id),
      );
      return;
    }
  }

  // --- Free logs ------------------------------------------------------------

  /** Free logs are standalone — no `habitId` (§3.4) — so they live in one collection. */
  async getFreeLogs(from: string, to: string): Promise<FreeLog[]> {
    const rows = await this.readAll<FreeLog>(LOGS_KEY);
    return rows.filter((l) => inRange(l.date, from, to));
  }

  async upsertFreeLog(log: FreeLog): Promise<void> {
    await this.writeAll(LOGS_KEY, upsertById(await this.readAll<FreeLog>(LOGS_KEY), log));
  }

  async deleteLog(id: string): Promise<void> {
    const rows = await this.readAll<FreeLog>(LOGS_KEY);
    await this.writeAll(
      LOGS_KEY,
      rows.filter((l) => l.id !== id),
    );
  }

  // --- Reflection sessions --------------------------------------------------

  async getReflectionSessions(habitId: string): Promise<ReflectionSession[]> {
    return this.readAll<ReflectionSession>(reflectionsKey(habitId));
  }

  async upsertReflectionSession(session: ReflectionSession): Promise<void> {
    const key = reflectionsKey(session.habitId);
    await this.writeAll(key, upsertById(await this.readAll<ReflectionSession>(key), session));
  }
}
