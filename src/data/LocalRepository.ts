import type { HabitRepository } from "./HabitRepository";
import type { KVStore } from "./kv/KVStore";
import type { Habit, HabitEntry, FreeLog, ReflectionSession } from "../models";

const HABITS_KEY = "habiquest:habits";
const FREELOGS_KEY = "habiquest:freelogs";
const ENTRIES_PREFIX = "habiquest:entries:";
const REFLECTIONS_PREFIX = "habiquest:reflections:";

const entriesKey = (habitId: string) => ENTRIES_PREFIX + habitId;
const reflectionsKey = (habitId: string) => REFLECTIONS_PREFIX + habitId;

export class LocalRepository implements HabitRepository {
  constructor(private kv: KVStore) {}

  private parseCollection<T>(raw: string | null): T[] {
    if (raw == null) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  private async readCollection<T>(key: string): Promise<T[]> {
    return this.parseCollection<T>(await this.kv.getItem(key));
  }

  private async writeCollection<T>(key: string, items: T[]): Promise<void> {
    await this.kv.setItem(key, JSON.stringify(items));
  }

  private upsertById<T extends { id: string }>(items: T[], item: T): T[] {
    const idx = items.findIndex((x) => x.id === item.id);
    if (idx >= 0) {
      const next = items.slice();
      next[idx] = item;
      return next;
    }
    return [...items, item];
  }

  // ── Habits ───────────────────────────────────────────────────────────────
  async getHabits(): Promise<Habit[]> {
    const habits = await this.readCollection<Habit>(HABITS_KEY);
    // Forward-compat: habits persisted before the `kind` discriminator read back as 'count'.
    return habits.map((h) => (h.kind ? h : { ...h, kind: "count" as const }));
  }

  async getHabit(id: string): Promise<Habit | null> {
    const habits = await this.getHabits();
    return habits.find((h) => h.id === id) ?? null;
  }

  async upsertHabit(habit: Habit): Promise<void> {
    const habits = await this.getHabits();
    await this.writeCollection(HABITS_KEY, this.upsertById(habits, habit));
  }

  async deleteHabit(id: string): Promise<void> {
    const habits = await this.getHabits();
    await this.writeCollection(
      HABITS_KEY,
      habits.filter((h) => h.id !== id)
    );
    await this.kv.removeItem(entriesKey(id));
    await this.kv.removeItem(reflectionsKey(id));
  }

  // ── Entries ──────────────────────────────────────────────────────────────
  async getEntries(habitId: string, from: string, to: string): Promise<HabitEntry[]> {
    const entries = await this.readCollection<HabitEntry>(entriesKey(habitId));
    return entries
      .filter((e) => e.date >= from && e.date <= to)
      .sort((a, b) =>
        a.date === b.date
          ? a.timestamp.localeCompare(b.timestamp)
          : a.date.localeCompare(b.date)
      );
  }

  async upsertEntry(entry: HabitEntry): Promise<void> {
    const key = entriesKey(entry.habitId);
    const entries = await this.readCollection<HabitEntry>(key);
    await this.writeCollection(key, this.upsertById(entries, entry));
  }

  async deleteEntry(id: string): Promise<void> {
    const keys = await this.kv.getAllKeys();
    for (const key of keys) {
      if (!key.startsWith(ENTRIES_PREFIX)) continue;
      const entries = await this.readCollection<HabitEntry>(key);
      if (entries.some((e) => e.id === id)) {
        await this.writeCollection(
          key,
          entries.filter((e) => e.id !== id)
        );
        return;
      }
    }
  }

  // ── FreeLogs ─────────────────────────────────────────────────────────────
  async getFreeLogs(from: string, to: string): Promise<FreeLog[]> {
    const logs = await this.readCollection<FreeLog>(FREELOGS_KEY);
    return logs
      .filter((l) => {
        const date = l.timestamp.slice(0, 10);
        return date >= from && date <= to;
      })
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async upsertFreeLog(log: FreeLog): Promise<void> {
    const logs = await this.readCollection<FreeLog>(FREELOGS_KEY);
    await this.writeCollection(FREELOGS_KEY, this.upsertById(logs, log));
  }

  async deleteLog(id: string): Promise<void> {
    const logs = await this.readCollection<FreeLog>(FREELOGS_KEY);
    await this.writeCollection(
      FREELOGS_KEY,
      logs.filter((l) => l.id !== id)
    );
  }

  // ── ReflectionSessions ───────────────────────────────────────────────────
  async getReflectionSessions(habitId: string): Promise<ReflectionSession[]> {
    return this.readCollection<ReflectionSession>(reflectionsKey(habitId));
  }

  async upsertReflectionSession(session: ReflectionSession): Promise<void> {
    const key = reflectionsKey(session.habitId);
    const sessions = await this.readCollection<ReflectionSession>(key);
    await this.writeCollection(key, this.upsertById(sessions, session));
  }
}
