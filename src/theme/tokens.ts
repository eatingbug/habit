/**
 * theme/tokens.ts — the adaptive design system (SPEC §6.0).
 *
 * Two palettes of identical shape (`light` / `dark`) + shared, color-agnostic tokens.
 * Visual source of truth: mvp/habiquest-linear.html (Linear/Notion minimal, single
 * indigo accent, hairline borders, depth via border + faint shadow — no gradients/glows).
 *
 * Components read the ACTIVE palette through `useThemedStyles(makeStyles)` (see
 * ThemeProvider). During the §6.0 migration a legacy `color` bridge (bottom of file)
 * keeps not-yet-migrated files compiling against the dark palette; it is deleted once
 * every consumer is on `useThemedStyles`.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export interface ColorTheme {
  bg: string;
  surface: string;
  surface2: string;
  inset: string;
  border: string;
  borderStrong: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentInk: string;
  accentWeak: string;
  // semantic day-state / status hues + their weak (chip-background) variants
  done: string;
  over: string;
  partial: string;
  skip: string;
  blank: string;
  good: string;
  warn: string;
  crit: string;
  doneWeak: string;
  overWeak: string;
  partialWeak: string;
  skipWeak: string;
  shadow: ViewStyle; // per-theme elevation (border + one faint shadow)
}

function shadowFor(scheme: 'light' | 'dark'): ViewStyle {
  const web =
    scheme === 'dark'
      ? '0 1px 2px rgba(0,0,0,.32),0 8px 26px rgba(0,0,0,.30)'
      : '0 1px 2px rgba(24,24,48,.05),0 6px 22px rgba(24,24,48,.05)';
  return Platform.select({
    web: { boxShadow: web } as unknown as ViewStyle, // RNW accepts boxShadow at runtime
    ios: {
      shadowColor: scheme === 'dark' ? '#000' : '#181830',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: scheme === 'dark' ? 0.3 : 0.06,
      shadowRadius: 12,
    },
    android: { elevation: 2 },
    default: {},
  }) as ViewStyle;
}

export const light: ColorTheme = {
  bg: '#FBFBFC',
  surface: '#FFFFFF',
  surface2: '#F5F5F8',
  inset: '#F0F0F4',
  border: '#E7E7EE',
  borderStrong: '#D9D9E1',
  text: '#1B1C20',
  muted: '#6E7079',
  faint: '#A2A4AE',
  accent: '#5A63D8',
  accentInk: '#4049C4',
  accentWeak: 'rgba(90,99,216,0.10)',
  done: '#3F9E72',
  over: '#2C875C',
  partial: '#C08A2E',
  skip: '#C25B54',
  blank: '#ECECF1',
  good: '#3F9E72',
  warn: '#C08A2E',
  crit: '#C25B54',
  doneWeak: 'rgba(63,158,114,0.12)',
  overWeak: 'rgba(44,135,92,0.12)',
  partialWeak: 'rgba(192,138,46,0.13)',
  skipWeak: 'rgba(194,91,84,0.12)',
  shadow: shadowFor('light'),
};

export const dark: ColorTheme = {
  bg: '#0D0E12',
  surface: '#15171C',
  surface2: '#1B1D23',
  inset: '#1B1D24',
  border: '#262933',
  borderStrong: '#343845',
  text: '#EBEBEF',
  muted: '#8C8F9B',
  faint: '#63666F',
  accent: '#828BF5',
  accentInk: '#9AA1F8',
  accentWeak: 'rgba(130,139,245,0.14)',
  done: '#54B487',
  over: '#41A472',
  partial: '#D3A24A',
  skip: '#D06B63',
  blank: '#20232B',
  good: '#54B487',
  warn: '#D3A24A',
  crit: '#D06B63',
  doneWeak: 'rgba(84,180,135,0.14)',
  overWeak: 'rgba(65,164,114,0.14)',
  partialWeak: 'rgba(211,162,74,0.14)',
  skipWeak: 'rgba(208,107,99,0.14)',
  shadow: shadowFor('dark'),
};

// ── Shared, color-agnostic tokens ──────────────────────────────────────────────
export const space = { xs: 4, sm: 8, md: 12, lg: 18, xl: 22, xxl: 28 } as const;
export const layout = { maxWidth: 1080 } as const;

export const radius = { cell: 3, sm: 7, r: 10, pill: 999 } as const;

// The mockup's small type scale (+ `label`, same size as `tag`, kept as a semantic name).
export const fontSize = {
  tag: 10.5,
  label: 10.5,
  micro: 11.5,
  meta: 12.5,
  small: 13.5,
  body: 16,
  title: 19,
} as const;

export const letterSpacing = { tight: -0.5, label: 1.6, tag: 0.8 } as const;

const SANS = Platform.select({
  web: '-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",Roboto,sans-serif',
  default: 'System',
}) as string;
const MONO = Platform.select({
  web: 'ui-monospace,"SF Mono",SFMono-Regular,"Cascadia Code","Roboto Mono",Menlo,Consolas,monospace',
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;

// System font stacks (no custom fonts). Weights via `weight.*` (system fonts honor fontWeight).
export const font = {
  sans: SANS,
  mono: MONO,
} as const;

export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;
