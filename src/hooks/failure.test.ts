import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import {
  LOAD_FAILED_NOTE,
  SAVE_FAILED_NOTE,
  WRITE_FAILED_NOTE,
} from '@/config/copy';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository } from '@/data';
import type { FreeLog, Habit, HabitEntry, ReflectionSession } from '@/models';

import { useDashboard } from './useDashboard';
import { useHabitDetail } from './useHabitDetail';
import { useToday } from './useToday';

/**
 * 실패 경로 — ADR-0005 가 서버를 단일 원본으로 만든 뒤 **일상적으로** 일어나는 일들
 * (오프라인, 토큰 만료, 프로젝트 정지). `LocalRepository` 는 사실상 실패하지 않으므로
 * 이 스위트가 없으면 훅의 `catch` 는 아무도 밟지 않는 코드다.
 *
 * 네트워크는 필요 없다. 실패는 **주입된다** — 아래 `Flaky` 는 진짜 `LocalRepository` 를
 * 감싸고 `failing` 동안만 reject 한다. 같은 더블로 "실패했다" 와 "다시 시도하니 됐다" 를
 * 둘 다 볼 수 있는 것이 감싸는 이유다.
 */

const TODAY = '2026-03-01';

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: '독서',
    statId: 'intellect',
    kind: 'count',
    floor: 5,
    floorUnit: '쪽',
    lifecycle: 'forming',
    createdAt: `2026-02-26T09:00:00.000Z`,
    ...over,
  };
}

/** `failing` 인 동안 모든 호출이 reject 한다. 끄면 안쪽의 진짜 저장소가 답한다. */
class Flaky implements HabitRepository {
  failing = true;

  constructor(private readonly inner: HabitRepository) {}

  private guard<T>(run: () => Promise<T>): Promise<T> {
    return this.failing ? Promise.reject(new Error('network')) : run();
  }

  getHabits(): Promise<Habit[]> {
    return this.guard(() => this.inner.getHabits());
  }
  getHabit(id: string): Promise<Habit | null> {
    return this.guard(() => this.inner.getHabit(id));
  }
  upsertHabit(h: Habit): Promise<void> {
    return this.guard(() => this.inner.upsertHabit(h));
  }
  deleteHabit(id: string): Promise<void> {
    return this.guard(() => this.inner.deleteHabit(id));
  }
  getEntries(habitId: string, from: string, to: string): Promise<HabitEntry[]> {
    return this.guard(() => this.inner.getEntries(habitId, from, to));
  }
  upsertEntry(entry: HabitEntry): Promise<void> {
    return this.guard(() => this.inner.upsertEntry(entry));
  }
  deleteEntry(id: string): Promise<void> {
    return this.guard(() => this.inner.deleteEntry(id));
  }
  getFreeLogs(from: string, to: string): Promise<FreeLog[]> {
    return this.guard(() => this.inner.getFreeLogs(from, to));
  }
  upsertFreeLog(log: FreeLog): Promise<void> {
    return this.guard(() => this.inner.upsertFreeLog(log));
  }
  deleteLog(id: string): Promise<void> {
    return this.guard(() => this.inner.deleteLog(id));
  }
  getReflectionSessions(habitId: string): Promise<ReflectionSession[]> {
    return this.guard(() => this.inner.getReflectionSessions(habitId));
  }
  upsertReflectionSession(session: ReflectionSession): Promise<void> {
    return this.guard(() => this.inner.upsertReflectionSession(session));
  }
}

async function flakyWith(habits: Habit[] = [habit()]): Promise<Flaky> {
  const inner = new LocalRepository(new MemoryKV());
  for (const h of habits) await inner.upsertHabit(h);
  return new Flaky(inner);
}

function wrapperFor(repository: HabitRepository) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(RepositoryProvider, { repository, children });
  };
}

describe('읽기 실패 — 무한 스피너도, 빈 상태라는 거짓말도 아니다 (#51)', () => {
  it('대시보드: 불러오기가 실패하면 loading 은 내려가고 실패가 남는다', async () => {
    const repository = await flakyWith();
    const { result } = renderHook(() => useDashboard({ today: TODAY }), {
      wrapper: wrapperFor(repository),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // 이 두 줄이 함정을 고정한다: `loading` 만 내리면 화면은 "아직 습관이 없습니다" 가
    // 되고, `rows` 가 비어 있는 것은 실패해도 사실이므로 그것만으로는 아무 것도 못 잡는다.
    expect(result.current.rows).toEqual([]);
    expect(result.current.failure?.message).toBe(LOAD_FAILED_NOTE);
  });

  it('대시보드: 다시 시도가 통하면 행이 오고 실패는 사라진다', async () => {
    const repository = await flakyWith();
    const { result } = renderHook(() => useDashboard({ today: TODAY }), {
      wrapper: wrapperFor(repository),
    });
    await waitFor(() => expect(result.current.failure).not.toBeNull());

    repository.failing = false;
    act(() => result.current.failure?.retry());

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.failure).toBeNull();
  });

  it('오늘: 불러오기가 실패하면 loading 은 내려가고 실패가 남는다', async () => {
    const repository = await flakyWith();
    const { result } = renderHook(() => useToday({ today: TODAY }), {
      wrapper: wrapperFor(repository),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([]);
    expect(result.current.failure?.message).toBe(LOAD_FAILED_NOTE);
  });

  it('습관 상세: 불러오기가 실패하면 habit 은 null 이지만 "없는 습관" 은 아니다', async () => {
    const repository = await flakyWith();
    const { result } = renderHook(() => useHabitDetail('h1', { today: TODAY }), {
      wrapper: wrapperFor(repository),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // `habit == null` 하나만으로 화면이 "습관을 찾을 수 없습니다" 라고 말하면 안 되는 이유
    // 가 바로 이 조합이다 — 없는 게 아니라 못 읽은 것이다.
    expect(result.current.habit).toBeNull();
    expect(result.current.failure?.message).toBe(LOAD_FAILED_NOTE);
  });

  it('습관 상세: 다시 시도가 통하면 습관이 오고 실패는 사라진다', async () => {
    const repository = await flakyWith();
    const { result } = renderHook(() => useHabitDetail('h1', { today: TODAY }), {
      wrapper: wrapperFor(repository),
    });
    await waitFor(() => expect(result.current.failure).not.toBeNull());

    repository.failing = false;
    act(() => result.current.failure?.retry());

    await waitFor(() => expect(result.current.habit?.id).toBe('h1'));
    expect(result.current.failure).toBeNull();
  });
});

describe('쓰기 실패 — 삼켜지지 않는다 (#51)', () => {
  /**
   * 대시보드의 기록 모달(#80). 쓰기는 reject 한다. 모달 안의 `LogForm` 이 그것을 받아
   * 폼 안에서 말하고, 모달은 닫히지 않는다. 훅이 또 잡으면 한 실패에 배너가 둘이 뜨고,
   * 폼은 성공으로 읽어 모달을 닫는다.
   */
  it('기록이 실패하면 reject 하고 토스트도 화면 배너도 없다', async () => {
    const repository = await flakyWith();
    repository.failing = false;
    const { result } = renderHook(() => useDashboard({ today: TODAY }), {
      wrapper: wrapperFor(repository),
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    repository.failing = true;
    await act(async () => {
      await expect(result.current.logActivity(habit(), 5, { note: '메모' })).rejects.toThrow(
        'network',
      );
    });

    expect(result.current.failure).toBeNull();
    // **기록됐다고 말하지 않는다.** 실패한 쓰기 뒤의 `기록됨` 토스트가 이 앱이 낼 수 있는
    // 최악의 버그다 — 사용자는 기록했다고 믿고 연속은 끊긴다.
    expect(result.current.toast).toBeNull();
  });

  it('건너뛰기가 실패해도 같다', async () => {
    const repository = await flakyWith();
    repository.failing = false;
    const { result } = renderHook(() => useDashboard({ today: TODAY }), {
      wrapper: wrapperFor(repository),
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    repository.failing = true;
    await act(async () => {
      await expect(result.current.logSkip(habit(), 'cue')).rejects.toThrow('network');
    });

    expect(result.current.failure).toBeNull();
    expect(result.current.toast).toBeNull();
  });

  /**
   * 실행취소는 `useQuickLog` 안에서 잡는 유일한 기록 쓰기다 — 세 화면 모두 호출부가
   * `void undoLast()` 이고 토스트에는 실패를 담을 자리가 없기 때문이다.
   */
  it('실행취소가 실패하면 실패가 보이고 토스트는 살아 있다', async () => {
    const repository = await flakyWith();
    repository.failing = false;
    const { result } = renderHook(() => useDashboard({ today: TODAY }), {
      wrapper: wrapperFor(repository),
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    await act(() => result.current.logActivity(habit(), 5));
    expect(result.current.toast).not.toBeNull();

    repository.failing = true;
    await act(() => result.current.undoLast());

    expect(result.current.failure?.message).toBe(WRITE_FAILED_NOTE);
    // 지워지지 않았으므로 실행취소는 아직 유효하다. 토스트를 접으면 사용자는 남아 있는
    // 기록을 지울 손잡이를 잃는다.
    expect(result.current.toast).not.toBeNull();
  });

  /**
   * 생애주기 전환. 설계 편집기와 달리 잠깐 쉬기·보관하기 버튼은 `run()` 을 그대로 부르는
   * 자리라 `app/habit/[id].tsx` 에 받을 `catch` 가 없다.
   */
  it('보관하기가 실패하면 실패가 보이고 습관은 그대로 살아 있다', async () => {
    const repository = await flakyWith();
    repository.failing = false;
    const { result } = renderHook(() => useHabitDetail('h1', { today: TODAY }), {
      wrapper: wrapperFor(repository),
    });
    await waitFor(() => expect(result.current.habit).not.toBeNull());

    const archive = result.current.lifecycleActions.find((action) => action.kind === 'archive');
    repository.failing = true;
    await act(() => archive?.run() ?? Promise.resolve());

    expect(result.current.failure?.message).toBe(SAVE_FAILED_NOTE);
    expect(result.current.habit?.lifecycle).toBe('forming');
  });
});
