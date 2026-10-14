import { useCallback, useEffect, useState } from 'react';

import { LOAD_FAILED_NOTE } from '@/config/copy';
import { useRepository } from '@/context/RepositoryContext';
import type { HabitRepository } from '@/data';
import { dateOf } from '@/domain/dates';
import type { HabitWithEntries } from '@/domain/score';
import { localToday } from '@/lib/device';
import type { Habit, HabitEntry } from '@/models';

import { useFailure, type Failure } from './failure';

/**
 * 습관 하나의 이력 — `createdAt` 부터 `today` 까지. 범위 규칙은 여기 한 곳에만 있다.
 *
 * 범위가 잘리면 `computeStreak` 과 XP 가 오류 없이 틀린다. 둘 다 `createdAt` 까지 거슬러
 * 걷기 때문이다. `isBackfillableDate` 가 `createdAt` 이전 기록을 막으므로 이 범위가 전부다.
 */
export function readHistory(
  repository: HabitRepository,
  habit: Habit,
  today: string,
): Promise<HabitEntry[]> {
  return repository.getEntries(habit.id, dateOf(habit.createdAt), today);
}

interface Loading {
  loading: boolean;
  /** 로딩 실패만. 쓰기 실패는 각 화면 훅의 `useFailure` 가 든다. */
  failure: Failure | null;
  /** 참조가 바뀌지 않는다. 화면이 `useFocusEffect` 에 그대로 넘긴다. */
  reload: () => void;
}

export interface Histories extends Loading {
  /** 모든 습관과 그 이력. 보관된 습관도 있다. 거르기는 화면 훅의 몫이다. */
  histories: HabitWithEntries[];
}

export interface History extends Loading {
  /** 없는 습관이면, 그리고 첫 로드 전에는 `null`. */
  habit: Habit | null;
  entries: HabitEntry[];
}

const NONE: HabitWithEntries[] = [];

/**
 * 두 진입점이 공유하는 골격. `habitId` 가 있으면 그 습관 하나를 (없으면 빈 목록을),
 * 없으면 모든 습관을 읽는다.
 *
 * - `loading` 은 첫 로드에서만 켠다. 기록이 방금 바꾼 화면을 비우면 안 된다.
 * - 실패를 기록할 때 `loading` 도 끈다. 그러지 않으면 끝없는 스피너가 된다.
 * - 성공한 로드는 로딩 실패를 지운다.
 * - 언마운트, `today`·`habitId` 변경, 다시 읽기 뒤에 도착한 앞선 결과는 버린다.
 */
function useLoad(today: string, habitId?: string): Histories {
  const repository = useRepository();
  const { failure, report, clear } = useFailure();
  const [histories, setHistories] = useState(NONE);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const habits =
        habitId == null
          ? await repository.getHabits()
          : [await repository.getHabit(habitId)].filter((habit): habit is Habit => habit != null);
      const next = await Promise.all(
        habits.map(async (habit) => ({ habit, entries: await readHistory(repository, habit, today) })),
      );

      if (cancelled) return;
      setHistories(next);
      clear();
      setLoading(false);
    }

    load().catch(() => {
      if (cancelled) return;
      setLoading(false);
      report(LOAD_FAILED_NOTE, reload);
    });

    return () => {
      cancelled = true;
    };
  }, [repository, habitId, today, version]);

  return { histories, loading, failure, reload };
}

/** 모든 습관과 각 습관의 이력. */
export function useHistories(today: string = localToday()): Histories {
  return useLoad(today);
}

const NO_ENTRIES: HabitEntry[] = [];

/** 습관 하나와 그 이력. 없는 습관이면 `habit` 은 `null` 이다. */
export function useHistory(habitId: string, today: string = localToday()): History {
  const { histories, ...rest } = useLoad(today, habitId);
  return { habit: histories[0]?.habit ?? null, entries: histories[0]?.entries ?? NO_ENTRIES, ...rest };
}
