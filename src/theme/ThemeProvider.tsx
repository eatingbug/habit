import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Appearance } from 'react-native';

import { deviceKV, type DeviceKV } from '@/context/deviceKV';
import type { KVStore } from '@/data';

import { PALETTES, type Palette, type ThemeName } from './redesignTokens';

/** 'system' follows the OS; the explicit values are the manual override (§6.0). */
export type ThemePreference = ThemeName | 'system';

/**
 * The device storage key for the choice. It never goes to the server (#123).
 * `app/+html.tsx` reads it too, to paint the page background before JS loads.
 */
export const PREFERENCE_KEY = 'habiquest.theme';

function isPreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

interface ThemeContextValue {
  name: ThemeName;
  /** The palette (`redesignTokens.ts`) for `name`. */
  redesign: Palette;
  preference: ThemePreference;
  /** Applies at once and is kept on the device (#126). */
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The stored choice when the storage can read synchronously, else `null`. */
function storedPreferenceSync(
  storage: KVStore & Partial<Pick<DeviceKV, 'getSync'>>,
): ThemePreference | null {
  try {
    const stored = storage.getSync?.(PREFERENCE_KEY) ?? null;
    return isPreference(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Nothing outside this provider writes the key, so there is nothing to subscribe to. */
function subscribeNever() {
  return () => {};
}

/** What react-native's `useColorScheme` subscribes to. */
function subscribeOsScheme(onChange: () => void) {
  const subscription = Appearance.addChangeListener(onChange);
  return () => subscription.remove();
}

/**
 * `storage` is for tests, as `RepositoryProvider`'s `repository` is: they pass a
 * `MemoryKV`. The app uses the device's own storage.
 */
export function ThemeProvider({
  children,
  storage = deviceKV,
}: {
  children: ReactNode;
  storage?: KVStore & Partial<Pick<DeviceKV, 'getSync'>>;
}) {
  // Not `useColorScheme`: on web it reads `matchMedia` on the first client render, so
  // hydration picks dark while the static HTML was rendered light. React keeps the
  // mismatched server styles, and the page background stays light (#150). The server
  // snapshot (`null`, light) matches that HTML, and React re-renders with the OS scheme
  // right after hydration. The static HTML has painted light by then; `app/+html.tsx`
  // covers that first paint. Native has no hydration, so it behaves as `useColorScheme` does.
  const osScheme = useSyncExternalStore(subscribeOsScheme, Appearance.getColorScheme, () => null);
  /** A choice made in this session, or one the async read delivered. */
  const [chosen, setChosen] = useState<ThemePreference | null>(null);

  // On web `localStorage` reads synchronously, so the stored theme applies before the
  // first paint: a reload shows no frame on the OS theme. `useSyncExternalStore` rather
  // than a `useState` initializer, because the static web export renders on Node with
  // no storage. The server snapshot (`null`) keeps hydration matching that HTML, and
  // React re-renders with the client snapshot right after hydration.
  const storedSync = useSyncExternalStore(
    subscribeNever,
    () => storedPreferenceSync(storage),
    () => null,
  );
  const preference = chosen ?? storedSync ?? 'system';

  // A storage with no synchronous read delivers the choice after the first render.
  // A storage failure keeps 'system': the theme is a convenience, not a record.
  useEffect(() => {
    let cancelled = false;
    storage
      .get(PREFERENCE_KEY)
      .then((stored) => {
        if (!cancelled && isPreference(stored)) setChosen((current) => current ?? stored);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setPreference = useCallback(
    (p: ThemePreference) => {
      setChosen(p);
      storage.set(PREFERENCE_KEY, p).catch(() => {});
    },
    [storage],
  );

  const value = useMemo<ThemeContextValue>(() => {
    const name: ThemeName = preference === 'system' ? (osScheme === 'dark' ? 'dark' : 'light') : preference;
    return {
      name,
      redesign: PALETTES[name],
      preference,
      setPreference,
    };
  }, [osScheme, preference, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}
