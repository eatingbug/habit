/**
 * context/RepositoryContext.tsx — provides the one HabitRepository instance to the UI.
 *
 * This is the single dependency-injection seam: today it builds a LocalRepository over
 * the platform KV store; swapping to Supabase later is a one-line change here (SPEC §5.3),
 * with no domain or screen edits.
 */
import React, { createContext, useContext, useMemo } from 'react';
import type { HabitRepository } from '@/data/HabitRepository';
import { LocalRepository } from '@/data/LocalRepository';
import { createKV } from '@/data/kv/createKV';

const RepositoryContext = createContext<HabitRepository | null>(null);

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  // One repository per app lifetime. The KV seam picks AsyncStorage (native) or
  // localforage/IndexedDB (web) behind createKV().
  const repository = useMemo<HabitRepository>(() => new LocalRepository(createKV()), []);
  return <RepositoryContext.Provider value={repository}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): HabitRepository {
  const repository = useContext(RepositoryContext);
  if (!repository) {
    throw new Error('useRepository must be used within a RepositoryProvider');
  }
  return repository;
}
