import type { HabitRepository } from "./HabitRepository";
import type { Habit, HabitEntry, FreeLog, ReflectionSession } from "../models";

export class SupabaseRepository implements HabitRepository {
  async getHabits(): Promise<Habit[]> {
    throw new Error("SupabaseRepository not yet configured");
  }
  async getHabit(_id: string): Promise<Habit | null> {
    throw new Error("SupabaseRepository not yet configured");
  }
  async upsertHabit(_habit: Habit): Promise<void> {
    throw new Error("SupabaseRepository not yet configured");
  }
  async deleteHabit(_id: string): Promise<void> {
    throw new Error("SupabaseRepository not yet configured");
  }
  async getEntries(_habitId: string, _from: string, _to: string): Promise<HabitEntry[]> {
    throw new Error("SupabaseRepository not yet configured");
  }
  async upsertEntry(_entry: HabitEntry): Promise<void> {
    throw new Error("SupabaseRepository not yet configured");
  }
  async deleteEntry(_id: string): Promise<void> {
    throw new Error("SupabaseRepository not yet configured");
  }
  async getFreeLogs(_from: string, _to: string): Promise<FreeLog[]> {
    throw new Error("SupabaseRepository not yet configured");
  }
  async upsertFreeLog(_log: FreeLog): Promise<void> {
    throw new Error("SupabaseRepository not yet configured");
  }
  async deleteLog(_id: string): Promise<void> {
    throw new Error("SupabaseRepository not yet configured");
  }
  async getReflectionSessions(_habitId: string): Promise<ReflectionSession[]> {
    throw new Error("SupabaseRepository not yet configured");
  }
  async upsertReflectionSession(_session: ReflectionSession): Promise<void> {
    throw new Error("SupabaseRepository not yet configured");
  }
}
