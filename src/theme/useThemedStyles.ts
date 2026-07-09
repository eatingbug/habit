/**
 * theme/useThemedStyles.ts — memoized, theme-aware StyleSheet hook (SPEC §6.0).
 *
 * `StyleSheet.create` runs once at module import, freezing any color captured there. To
 * make styles adaptive, each component defines a MODULE-LEVEL `makeStyles = (c) => ...`
 * and calls `useThemedStyles(makeStyles)` inside render; the sheet is rebuilt (memoized)
 * whenever the active palette changes.
 */
import { useMemo } from 'react';
import { useTheme } from './ThemeProvider';
import type { ColorTheme } from './tokens';

export function useThemedStyles<T>(makeStyles: (c: ColorTheme) => T): T {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors, makeStyles]);
}
