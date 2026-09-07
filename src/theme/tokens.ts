/**
 * Design tokens — SPEC §6.0.
 * Values are lifted verbatim from `design/_tokens.css`, which the visual-authority
 * rule (issue #2, "시각 기준") makes canonical for color/type/space; that file in turn
 * came from `mvp/habiquest-linear.html`, so the two agree.
 *
 * One token set, both themes first-class. No gradients, no glows: depth comes from a
 * hairline border plus a faint shadow.
 */

import { Platform } from 'react-native';

export type ThemeName = 'light' | 'dark';

export interface Palette {
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
  /** Day-state hues. `missed` and `skip` share the miss hue — outline vs. fill (§6.0). */
  done: string;
  over: string;
  partial: string;
  skip: string;
  blank: string;
  missed: string;
  good: string;
  warn: string;
  crit: string;
}

const light: Palette = {
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
  missed: 'rgba(194,91,84,0.16)',
  good: '#3F9E72',
  warn: '#C08A2E',
  crit: '#C25B54',
};

const dark: Palette = {
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
  missed: 'rgba(208,107,99,0.20)',
  good: '#54B487',
  warn: '#D3A24A',
  crit: '#D06B63',
};

export const PALETTES: Record<ThemeName, Palette> = { light, dark };

/** 8px rhythm (§6.0). */
export const SPACE = { xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 24 } as const;

/** Small radii, 6–10px (§6.0). */
export const RADIUS = { sm: 7, md: 10, pill: 999 } as const;

/** A small modular scale (§6.0). */
export const FONT_SIZE = { xs: 10, sm: 11, base: 12.5, md: 13.5, lg: 16, xl: 20, xxl: 28 } as const;

/**
 * The `--mono` / `--sans` stacks from `design/_tokens.css`. RN takes a single family
 * name rather than a stack, so each platform gets the one member it actually ships.
 *
 * `mono` is not decoration: §6.0 requires tabular numerals for counts and XP, so every
 * numeric readout pairs this family with `fontVariant: ['tabular-nums']`.
 */
export const FONT_FAMILY = {
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  }),
} as const;

/** Minimum tap target for a control that logs something (§6.0). */
export const TAP_TARGET = 44;
