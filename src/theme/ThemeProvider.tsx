/**
 * theme/ThemeProvider.tsx — the adaptive light/dark theme context (SPEC §6.0).
 *
 * Resolves the active palette from the OS scheme (useColorScheme) unless the user has
 * overridden it via the header toggle (system → dark → light → system). Components read
 * the active palette through `useTheme()` / `useThemedStyles()`.
 */
import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { dark, light, type ColorTheme } from './tokens';

type Pref = 'system' | 'light' | 'dark';
type Scheme = 'light' | 'dark';

export interface ThemeValue {
  colors: ColorTheme;
  scheme: Scheme; // resolved (preference, or OS when preference is 'system')
  pref: Pref; // the user's explicit preference
  cycle: () => void; // system → dark → light → system
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const os = (useColorScheme() ?? 'light') as Scheme; // RNW can return null pre-hydration
  const [pref, setPref] = useState<Pref>('system');
  const scheme: Scheme = pref === 'system' ? os : pref;
  const colors = scheme === 'dark' ? dark : light;
  const value = useMemo<ThemeValue>(
    () => ({
      colors,
      scheme,
      pref,
      cycle: () => setPref((p) => (p === 'system' ? 'dark' : p === 'dark' ? 'light' : 'system')),
    }),
    [colors, scheme, pref],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used within ThemeProvider');
  return v;
}
