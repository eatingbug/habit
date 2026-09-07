import localforage from 'localforage';

import type { KVStore } from '@/data';

const store = localforage.createInstance({ name: 'habiquest' });

/**
 * Web `KVStore` — localforage over IndexedDB (SPEC §5.2). Values are strings, exactly
 * as on native, so the two platforms hold byte-identical JSON.
 */
export const localforageKV: KVStore = {
  get: async (key) => (await store.getItem<string>(key)) ?? null,
  set: async (key, value) => {
    await store.setItem(key, value);
  },
  remove: (key) => store.removeItem(key),
};
