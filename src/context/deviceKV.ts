import { Platform } from 'react-native';

import { MemoryKV, type KVStore } from '@/data';

/**
 * A `KVStore` that can also read synchronously. `ThemeProvider` uses `getSync` for its
 * first render, so a reload does not flash the OS theme. `null` when there is nothing
 * to read, including on Node during the static web export.
 */
export interface DeviceKV extends KVStore {
  getSync(key: string): string | null;
}

/**
 * Device storage for settings that stay on this device, not on the server — today only
 * the theme choice (#126). Lives in `src/context` because this is the layer allowed to
 * know which platform it runs on (`src/__tests__/architecture.test.ts`).
 *
 * Web uses `localStorage`, which is what the Supabase session already uses
 * (`createSupabaseClient.ts`). Native gets a memory store and forgets on restart: no
 * native storage driver is installed (#57 removed it), and native cannot sign in, so
 * no settings screen is reachable there.
 *
 * `localStorage` is read inside each call, not at import: the static web export renders
 * on Node, where it does not exist.
 */
function localStorageKV(): DeviceKV {
  return {
    getSync: (key) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
    get: async (key) => localStorage.getItem(key),
    set: async (key, value) => localStorage.setItem(key, value),
    remove: async (key) => localStorage.removeItem(key),
  };
}

function memoryKV(): DeviceKV {
  return Object.assign(new MemoryKV(), { getSync: () => null });
}

export const deviceKV: DeviceKV = Platform.OS === 'web' ? localStorageKV() : memoryKV();
