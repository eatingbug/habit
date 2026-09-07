import type { FreeLog, Habit, HabitEntry, ReflectionSession } from '@/models';

/**
 * The single persistence seam — SPEC §5.1, given verbatim there.
 *
 * Everything above it (hooks, screens) depends on this interface only, which is what
 * lets `SupabaseRepository` replace `LocalRepository` by editing one line in
 * `RepositoryContext` with no domain or UI change (§5.3).
 */
export interface HabitRepository {
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
