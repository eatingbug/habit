import type { Habit, HabitEntry, FreeLog, ReflectionSession } from "../models";

export interface HabitRepository {
  getHabits(): Promise<Habit[]>;
  getHabit(id: string): Promise<Habit | null>;
  upsertHabit(habit: Habit): Promise<void>;
  deleteHabit(id: string): Promise<void>;
  getEntries(habitId: string, from: string, to: string): Promise<HabitEntry[]>;
  upsertEntry(entry: HabitEntry): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  getFreeLogs(from: string, to: string): Promise<FreeLog[]>;
  upsertFreeLog(log: FreeLog): Promise<void>;
  deleteLog(id: string): Promise<void>;
  getReflectionSessions(habitId: string): Promise<ReflectionSession[]>;
  upsertReflectionSession(session: ReflectionSession): Promise<void>;
}
