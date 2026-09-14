import type { FreeLog, Habit, HabitEntry, ReflectionSession } from '@/models';

/**
 * The single persistence seam — SPEC §5.1, given verbatim there.
 *
 * Everything above it (hooks, screens) depends on this interface only. §5.3 called that
 * a **one-line** swap in `RepositoryContext`, and it is no longer one line: ADR-0005
 * (`## "한 줄 교체" 약속이 깨진다`) records why — 저장소를 만들려면 세션이 필요하고,
 * 세션은 비동기로 확인되며, 로그인·로그아웃마다 저장소가 다시 만들어져야 한다.
 *
 * 깨지지 않은 절반이 이 파일이다: **도메인과 UI 는 정말로 바뀌지 않았다.** 이 인터페이스가
 * 불변이었기 때문이고, 그것이 §5.1 이 살아남은 이유다.
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
