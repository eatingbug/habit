import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { LocalRepository, type HabitRepository } from '@/data';

import { createKVStore } from './createKVStore';

/**
 * The app's single injection point for persistence — SPEC §8.
 *
 * Swapping the backend is the one-line change §5.3 promises: replace the
 * `new LocalRepository(createKVStore())` below with `new SupabaseRepository()`. No
 * domain or UI file changes, because everything above depends on `HabitRepository`.
 *
 * Tests inject their own instance through `repository` (a `LocalRepository` over
 * `MemoryKV`), which is why no hook ever constructs a repository itself.
 */
const RepositoryContext = createContext<HabitRepository | null>(null);

export function RepositoryProvider({
  children,
  repository,
}: {
  children: ReactNode;
  repository?: HabitRepository;
}) {
  const value = useMemo(
    () => repository ?? new LocalRepository(createKVStore()),
    [repository],
  );

  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): HabitRepository {
  const repository = useContext(RepositoryContext);
  if (repository == null) {
    throw new Error('useRepository must be used inside a RepositoryProvider');
  }
  return repository;
}
