import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { PALETTES, type Palette, type ThemeName } from './tokens';

/** 'system' follows the OS; the explicit values are the manual override (§6.0). */
type ThemePreference = ThemeName | 'system';

interface ThemeContextValue {
  name: ThemeName;
  colors: Palette;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Cycles system → light → dark → system, for the header toggle. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const osScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('system');

  const value = useMemo<ThemeContextValue>(() => {
    const name: ThemeName = preference === 'system' ? (osScheme === 'dark' ? 'dark' : 'light') : preference;
    return {
      name,
      colors: PALETTES[name],
      preference,
      setPreference,
      toggle: () =>
        setPreference((p) => (p === 'system' ? 'light' : p === 'light' ? 'dark' : 'system')),
    };
  }, [osScheme, preference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}
