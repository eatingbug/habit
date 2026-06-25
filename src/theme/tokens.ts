/**
 * theme/tokens.ts — typed translation of the demo's CSS `:root` (mvp/habiquest-demo_2.html).
 *
 * Exact hex values from the demo. Font families are named ONE-PER-WEIGHT on purpose:
 * Android ignores `fontWeight` on custom fonts, so each weight must be its own family
 * (the names match the @expo-google-fonts export keys registered in app/_layout.tsx).
 */

export const color = {
  bg: '#0c0f16',
  bg2: '#11151f',
  panel: '#161b27',
  panel2: '#1c2231',
  line: '#262d3d',
  ink: '#e8e4d8',
  inkDim: '#9aa0b0',
  inkFaint: '#5c6478',
  gold: '#d8b15a',
  goldDeep: '#a37e2c',
  // heat ramp (green0 = empty/base, green4 = strongest)
  green0: '#1a2230',
  green1: '#1f4a35',
  green2: '#2c7048',
  green3: '#46a064',
  green4: '#74d68a',
  red: '#d6655a',
  amber: '#e0a93f',
  blue: '#6b9bd8',
  // tinted surfaces lifted from the demo
  heatMiss: '#241a1d', // .heat i.miss background
  mirrorMiss: '#2a1c1f', // .dot.miss background
} as const;

/** Font family names — must match the keys passed to useFonts() in app/_layout.tsx. */
export const font = {
  serifRegular: 'Fraunces_400Regular',
  serifSemiBold: 'Fraunces_600SemiBold',
  serifBlack: 'Fraunces_900Black',
  serifItalic: 'Fraunces_500Medium_Italic',
  mono: 'JetBrainsMono_400Regular',
  monoBold: 'JetBrainsMono_700Bold',
  sans: 'SplineSans_400Regular',
  sansMedium: 'SplineSans_500Medium',
  sansSemiBold: 'SplineSans_600SemiBold',
} as const;

export const radius = {
  xs: 3, // heat cell
  sm: 5,
  md: 8,
  lg: 10,
  xl: 11,
  pill: 12,
  card: 14, // --rad
} as const;

/** Type scale (px) — keyed to the demo's component styles. */
export const fontSize = {
  brand: 30, // .brand h1
  statLevel: 34, // .stat .lv
  detail: 26, // .detail-head h2 / .today-head .date
  refHero: 24, // .ref-hero h2
  pillNumber: 22, // .pill .n
  panelTitle: 18, // .panel h2
  actionTitle: 16, // .actions h3
  body: 15, // html/body base
  bodySm: 14,
  small: 13.5,
  meta: 12.5,
  micro: 11.5,
  label: 10.5, // .section-label
  tag: 9.5, // .tag
} as const;

export const letterSpacing = {
  tight: -0.5, // brand h1
  label: 1.6, // section-label .16em ~ 10.5px
  tag: 0.8,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

/** Page content width cap (demo .wrap max-width 1080px). */
export const layout = {
  maxWidth: 1080,
} as const;

export const tokens = { color, font, radius, fontSize, letterSpacing, space, layout } as const;
export type Tokens = typeof tokens;
