import { useCallback, useEffect, useState } from 'react';

import {
  archivedCountLabel,
  archivedRowLabel,
  LOAD_FAILED_NOTE,
  SAVE_FAILED_NOTE,
} from '@/config/copy';
import { useRepository } from '@/context/RepositoryContext';
import { resumeHabit } from '@/domain/lifecycle';
import { localToday } from '@/lib/device';
import type { Habit } from '@/models';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';

import { useFailure, type Failure } from './failure';

/**
 * The Settings screen's data path — SPEC §6.3 Settings, `ReSettings` (#126).
 *
 * As in `useDashboard`, the repository arrives through `RepositoryProvider` and `today`
 * is a parameter, so a test can pin the date `resumeHabit` closes the pause with.
 */
export interface SettingsView {
  /** The archived habits, in repository order. Empty while `loading`. */
  archived: Habit[];
  /**
   * The settings row's whole line, "보관한 습관 N개" (`archivedRowLabel`). No number
   * while loading or after a failed read: an unread list is not "0개".
   */
  archivedLabel: string;
  /** The row's trailing "N개" alone, as the artboard draws it. Empty when unknown. */
  archivedCountLabel: string;
  loading: boolean;
  /** A failed read or restore, or `null`. Same contract as `DashboardView.failure`. */
  failure: Failure | null;
  /**
   * 다시 꺼내기 — the existing `resumeHabit`, saved through `upsertHabit`. The habit
   * leaves `archived` and shows on the Dashboard and Today again.
   */
  restore(habit: Habit): Promise<void>;
  /** 자동 · 라이트 · 다크. The choice is kept on the device (`ThemeProvider`). */
  theme: ThemePreference;
  setTheme(theme: ThemePreference): void;
  /** Read the repository again, for a screen that regains focus. */
  reload(): void;
}

export function useSettings({ today = localToday() }: { today?: string } = {}): SettingsView {
  const repository = useRepository();
  const { preference, setPreference } = useTheme();
  const { failure, report, clear, attempt } = useFailure();
  const [archived, setArchived] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;

    repository
      .getHabits()
      .then((habits) => {
        if (cancelled) return;
        setArchived(habits.filter((habit) => habit.lifecycle === 'archived'));
        clear();
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        report(LOAD_FAILED_NOTE, reload);
      });

    return () => {
      cancelled = true;
    };
  }, [repository, version]);

  function restore(habit: Habit): Promise<void> {
    return attempt(SAVE_FAILED_NOTE, async () => {
      await repository.upsertHabit(resumeHabit(habit, today));
      reload();
    });
  }

  const count = loading || failure != null ? null : archived.length;

  return {
    archived,
    archivedLabel: archivedRowLabel(count),
    archivedCountLabel: archivedCountLabel(count),
    loading,
    failure,
    restore,
    theme: preference,
    setTheme: setPreference,
    reload,
  };
}
