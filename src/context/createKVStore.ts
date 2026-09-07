import { Platform } from 'react-native';

import type { KVStore } from '@/data';

/**
 * Picks the platform's storage driver (SPEC §5.2). The `require`s are inside the
 * branches on purpose: a top-level `localforage` import would run IndexedDB driver
 * detection inside the native bundle, and neither driver should be loaded on the
 * platform that cannot use it.
 */
export function createKVStore(): KVStore {
  if (Platform.OS === 'web') {
    return (require('./LocalforageKV') as typeof import('./LocalforageKV')).localforageKV;
  }
  return (require('./AsyncStorageKV') as typeof import('./AsyncStorageKV')).asyncStorageKV;
}
