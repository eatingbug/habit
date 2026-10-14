import { useCallback, useEffect, useState } from 'react';

import { LOAD_FAILED_NOTE } from '@/config/copy';
import { useRepository } from '@/context/RepositoryContext';
import type { HabitRepository } from '@/data';
import { dateOf } from '@/domain/dates';
import { localToday } from '@/lib/device';
import type { Habit, HabitEntry } from '@/models';

import { useFailure, type Failure } from './failure';

/** 습관 하나의 이력을 담은 화면 상태. */
export interface HabitHistoryView {
  /** `null` 은 없는 습관이다. 못 읽은 경우는 `failure` 가 함께 선다. */
  habit: Habit | null;
  /** `createdAt` 부터 `today` 까지. 이 훅에는 범위를 좁힐 손잡이가 없다. */
  entries: HabitEntry[];
  /** 첫 로드에서만 `true` 다. */
  loading: boolean;
  /** 로딩 실패만 든다. 쓰기 실패는 화면 훅의 몫이다. */
  failure: Failure | null;
  /** 쓰기 뒤에 부른다. `loading` 을 올리지 않는다. 참조는 바뀌지 않는다. */
  reload(): void;
}

/**
 * 이력의 범위 규칙이 사는 유일한 곳. 생긴 날부터 오늘까지다.
 *
 * 연속·XP·삭제 결과는 `createdAt` 까지 거슬러 걷는다. 범위가 잘리면 오류 없이 틀린 값이
 * 나온다. 오늘 이후로 백필은 없고 `createdAt` 이전 기록도 없으므로(`isBackfillableDate`)
 * 이 범위가 곧 그 습관의 모든 기록 행이다. V1 은 기록이 적고 §7.3 은 성능을 기준에서 뺐다.
 */
export function fetchHistory(
  repository: HabitRepository,
  habit: Habit,
  today: string,
): Promise<HabitEntry[]> {
  return repository.getEntries(habit.id, dateOf(habit.createdAt), today);
}

/** 습관 하나와 그 이력. */
export interface HabitHistory {
  habit: Habit;
  entries: HabitEntry[];
}

/** 모든 습관의 이력을 담은 화면 상태. */
export interface HabitHistoriesView {
  /** 보관된 습관도 들어 있다. 거르기는 화면 훅의 몫이다. */
  histories: HabitHistory[];
  loading: boolean;
  failure: Failure | null;
  reload(): void;
}

interface Loading<T> {
  data: T;
  loading: boolean;
  failure: Failure | null;
  reload(): void;
}

/**
 * 두 진입점의 로딩 골격. `read` 는 호출자가 `useCallback` 으로 고정한다. `read` 가 바뀌면
 * (습관이나 `today` 가 바뀌면) 다시 읽고, 그 전의 늦은 응답은 버린다.
 */
function useLoading<T>(initial: T, read: (repository: HabitRepository) => Promise<T>): Loading<T> {
  const repository = useRepository();
  const { failure, report, clear } = useFailure();
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  // 쓰기 뒤에 올린다. 읽기는 아래 효과 하나뿐이므로 올리면 같은 읽기가 다시 돈다.
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    read(repository)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        clear();
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // 실패 기록과 `setLoading(false)` 는 한 쌍이다. 후자만 붙이면 무한 스피너가 "없는
        // 습관" 이나 "아직 습관이 없습니다" 로 바뀔 뿐이고, 그것이 더 나쁘다.
        setLoading(false);
        report(LOAD_FAILED_NOTE, reload);
      });

    return () => {
      cancelled = true;
    };
  }, [repository, read, version, reload]);

  return { data, loading, failure, reload };
}

const NO_HABIT: { habit: Habit | null; entries: HabitEntry[] } = { habit: null, entries: [] };
const NO_HISTORIES: HabitHistory[] = [];

/**
 * 습관 하나의 이력 (`CONTEXT.md`). 범위는 언제나 생긴 날부터 오늘까지다.
 */
export function useHistory(
  habitId: string,
  { today = localToday() }: { today?: string } = {},
): HabitHistoryView {
  const read = useCallback(
    async (repository: HabitRepository) => {
      const habit = await repository.getHabit(habitId);
      const entries = habit == null ? [] : await fetchHistory(repository, habit, today);
      return { habit, entries };
    },
    [habitId, today],
  );
  const { data, ...rest } = useLoading(NO_HABIT, read);
  return { ...data, ...rest };
}

/**
 * 모든 습관의 이력. 보관된 습관도 거르지 않는다.
 */
export function useHistories({ today = localToday() }: { today?: string } = {}): HabitHistoriesView {
  const read = useCallback(
    async (repository: HabitRepository) => {
      const habits = await repository.getHabits();
      return Promise.all(
        habits.map(async (habit) => ({
          habit,
          entries: await fetchHistory(repository, habit, today),
        })),
      );
    },
    [today],
  );
  const { data, ...rest } = useLoading(NO_HISTORIES, read);
  return { histories: data, ...rest };
}
