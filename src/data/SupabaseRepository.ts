import type { FreeLog, Habit, HabitEntry, ReflectionSession } from '@/models';

import type { HabitRepository } from './HabitRepository';

const NOT_CONFIGURED = 'SupabaseRepository not yet configured';

/**
 * SPEC §5.3 stub. It exists to prove the seam holds: the day a backend is added, the
 * only edit outside this file is the one line in `RepositoryContext` that picks the
 * implementation. V1 is single-device and local-only, so nothing ever calls it.
 *
 * The methods are non-`async` on purpose — they throw synchronously, so a mistaken
 * call fails loudly at the call site instead of becoming an unhandled rejection.
 */
export class SupabaseRepository implements HabitRepository {
  getHabits(): Promise<Habit[]> {
    throw new Error(NOT_CONFIGURED);
  }

  getHabit(_id: string): Promise<Habit | null> {
    throw new Error(NOT_CONFIGURED);
  }

  upsertHabit(_habit: Habit): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }

  deleteHabit(_id: string): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }

  getEntries(_habitId: string, _from: string, _to: string): Promise<HabitEntry[]> {
    throw new Error(NOT_CONFIGURED);
  }

  upsertEntry(_entry: HabitEntry): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }

  deleteEntry(_id: string): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }

  getFreeLogs(_from: string, _to: string): Promise<FreeLog[]> {
    throw new Error(NOT_CONFIGURED);
  }

  upsertFreeLog(_log: FreeLog): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }

  deleteLog(_id: string): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }

  getReflectionSessions(_habitId: string): Promise<ReflectionSession[]> {
    throw new Error(NOT_CONFIGURED);
  }

  upsertReflectionSession(_session: ReflectionSession): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }
}
