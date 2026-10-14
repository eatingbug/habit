/**
 * Redesign tokens — SPEC §6.0, ADR-0007.
 * Values are copied verbatim from `design/_tokens.redesign.css`, and keys are its custom
 * property names in camelCase (`--border-strong` → `borderStrong`, `--accent-ink` →
 * `accentInk`). `redesignTokens.test.ts` reads the CSS file and fails on any drift.
 *
 * Each color has a `fill` (the bare name, e.g. `accent`), an `ink` and a `tint`. Fills
 * are shared by both themes; only neutrals, `ink` and `tint` have dark values. As in the
 * CSS, `over` has only a fill and `stat` has no fill.
 */

import type { TextStyle } from 'react-native';

export type ThemeName = 'light' | 'dark';

export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  inset: string;
  text: string;
  muted: string;
  /** Never used for text (§6.0). */
  faint: string;
  border: string;
  borderStrong: string;
  scrim: string;

  accent: string;
  accentInk: string;
  accentTint: string;
  done: string;
  doneInk: string;
  doneTint: string;
  over: string;
  crit: string;
  critInk: string;
  critTint: string;
  /** `warn` fill is decoration only (§6.0). */
  warn: string;
  warnInk: string;
  warnTint: string;
  streak: string;
  streakInk: string;
  streakTint: string;
  statInk: string;
  statTint: string;

  /**
   * Depth (§6.0 Dark theme). Not colours, but they vary per theme in the same CSS blocks,
   * so they live here and `useTheme().redesign` stays one object. `shadow` and `lift` are
   * RN `boxShadow` strings; dark has none, and floating elements take an `edge` outline.
   */
  shadow: string;
  lift: string;
  edge: string;
}

/** Shared by both themes (§6.0 Dark theme). */
const fills = {
  accent: '#2563EB',
  done: '#1FA463',
  over: '#12804B',
  crit: '#D93A30',
  warn: '#F5B000',
  streak: '#D96400',
} as const;

const light: Palette = {
  bg: '#F4F6FB',
  surface: '#FFFFFF',
  surface2: '#F0F2F7',
  inset: '#EEF0F5',
  text: '#15171F',
  muted: '#4A4F60',
  faint: '#9AA0AE',
  border: '#E6E8EF',
  borderStrong: '#8A90A0',
  scrim: 'rgba(20,20,30,.45)',
  ...fills,
  accentInk: '#1746B8',
  accentTint: '#E8F0FF',
  doneInk: '#0B6B3E',
  doneTint: '#E3F6EC',
  critInk: '#A82A20',
  critTint: '#FDE5E2',
  warnInk: '#6A4B00',
  warnTint: '#FFF4D6',
  streakInk: '#8F4200',
  streakTint: '#FFF0E0',
  statInk: '#5B3FD0',
  statTint: '#EFEAFF',
  shadow: '0 2px 8px rgba(30,40,80,.06)',
  lift: '0 12px 36px rgba(0,0,0,.18)',
  edge: 'transparent',
};

const dark: Palette = {
  bg: '#0F1117',
  surface: '#181B23',
  surface2: '#1F232D',
  inset: '#232733',
  text: '#F2F4F8',
  muted: '#B4BAC8',
  faint: '#6B7180',
  border: '#2C313D',
  borderStrong: '#6B7282',
  scrim: 'rgba(0,0,0,.6)',
  ...fills,
  accentInk: '#8AB4FF',
  accentTint: '#1B2A4A',
  doneInk: '#5FD99A',
  doneTint: '#14301F',
  critInk: '#FF8A80',
  critTint: '#3A1A1A',
  warnInk: '#FFCF5C',
  warnTint: '#352A0A',
  streakInk: '#FFA45C',
  streakTint: '#3A2412',
  statInk: '#A894FF',
  statTint: '#261F45',
  shadow: 'none',
  lift: 'none',
  /** `var(--border)` in the CSS. */
  edge: '#2C313D',
};

export const PALETTES: Record<ThemeName, Palette> = { light, dark };

/** `--r-sm`, `--r-md`, `--r-lg`, and the CSS's `999px` pill. */
export const RADIUS = { sm: 12, md: 16, lg: 22, pill: 999 } as const;

/**
 * Type scale (§6.0 Type scale and shape). No monospace family: numbers use the regular
 * font with `fontVariant: ['tabular-nums']`. `bodyStrong` is `body` at the 600 weight
 * the CSS spells `.b`. RN takes absolute values, so `lineHeight` is the CSS ratio times
 * `fontSize`, rounded, and `letterSpacing` is the CSS `em` times `fontSize`.
 */
export const TYPE = {
  label: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 23 },
  bodyStrong: { fontSize: 15, fontWeight: '600', lineHeight: 23 },
  title: { fontSize: 17, fontWeight: '800', lineHeight: 21 },
  headline: { fontSize: 20, fontWeight: '800', lineHeight: 25 },
  display: { fontSize: 24, fontWeight: '800', lineHeight: 30, letterSpacing: -0.48 },
  number: { fontSize: 34, fontWeight: '900', lineHeight: 34 },
} as const satisfies Record<string, TextStyle>;

/** `--tap`. Every control is at least 44x44 (§6.0 Touch areas). */
export const TAP_TARGET = 44;

/** On a wide window the app is a centered column this wide, with `bg` either side. */
export const COLUMN_MAX_WIDTH = 480;
