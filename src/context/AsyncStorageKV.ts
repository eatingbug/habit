import AsyncStorage from '@react-native-async-storage/async-storage';

import type { KVStore } from '@/data';

/**
 * Native (iOS/Android) `KVStore` — SPEC §5.2. Lives in `src/context` because this is
 * the only layer allowed to import a platform module; `src/data` stays pure.
 */
export const asyncStorageKV: KVStore = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};
