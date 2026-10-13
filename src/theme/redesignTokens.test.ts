import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PALETTES, RADIUS, TYPE } from './redesignTokens';

/**
 * `design/_tokens.redesign.css` is the source of the concrete values (SPEC §6.0). These
 * tests read that file, so the RN tokens cannot drift from the artboards unnoticed.
 */
const css = readFileSync(join(__dirname, '..', '..', 'design', '_tokens.redesign.css'), 'utf8');

/** Every `selector{...}` rule body, keyed by its trimmed selector. Parsed once. */
const RULES = new Map<string, string>(
  Array.from(css.matchAll(/([^{}]+)\{([^}]*)\}/g), ([, selector, body]) => [
    selector.replace(/\/\*[\s\S]*?\*\//g, '').trim(),
    body,
  ]),
);

function rule(selector: string): string {
  const body = RULES.get(selector);
  if (body === undefined) throw new Error(`design/_tokens.redesign.css has no rule \`${selector}\``);
  return body;
}

function decl(selector: string, prop: string): string | undefined {
  return rule(selector).match(new RegExp(`(?:^|;)\\s*${prop}:([^;]+)`))?.[1].trim();
}

function requiredDecl(selector: string, prop: string): string {
  const value = decl(selector, prop);
  if (value === undefined) throw new Error(`\`${selector}\` in design/_tokens.redesign.css has no \`${prop}\``);
  return value;
}

function customProps(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, value] of rule(selector).matchAll(/--([\w-]+):([^;]+)/g)) {
    out[name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = value.trim();
  }
  return out;
}

const shared = customProps(':root');

/** A theme's custom properties plus the shared fills, with `var(--x)` resolved. */
function cssTheme(selector: string): Record<string, string> {
  const all = { ...customProps(selector), ...shared };
  const resolve = (v: string): string => {
    const ref = v.match(/^var\(--([\w-]+)\)$/)?.[1];
    return ref ? resolve(all[ref.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())]) : v;
  };
  return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, resolve(v)]));
}

/**
 * CSS custom properties with no palette counterpart: radii (`RADIUS`) and the font stack.
 * A deny-list on purpose: a new custom property in the CSS fails the palette test until
 * it is mapped here or added to the palette.
 */
const NOT_IN_PALETTE = ['rSm', 'rMd', 'rLg', 'sans'];

function cssPalette(selector: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(cssTheme(selector)).filter(([k]) => !NOT_IN_PALETTE.includes(k)),
  );
}

describe('redesign tokens match design/_tokens.redesign.css', () => {
  it('light palette has the same keys and values', () => {
    expect(PALETTES.light).toEqual(cssPalette(':root, [data-theme="light"]'));
  });

  it('dark palette has the same keys and values', () => {
    expect(PALETTES.dark).toEqual(cssPalette('[data-theme="dark"]'));
  });

  it('fills are shared by both themes', () => {
    for (const fill of ['accent', 'done', 'over', 'crit', 'warn', 'streak'] as const) {
      expect(PALETTES.dark[fill]).toBe(PALETTES.light[fill]);
    }
  });

  it('radii are --r-sm, --r-md, --r-lg and a pill', () => {
    expect(RADIUS).toEqual({
      sm: parseFloat(shared.rSm),
      md: parseFloat(shared.rMd),
      lg: parseFloat(shared.rLg),
      pill: 999,
    });
  });

  it('type scale follows the .t-* classes', () => {
    /** Classes without a line-height inherit the `[data-theme]` one. */
    const inheritedLineHeight = requiredDecl('[data-theme]', 'line-height');
    const style = (cls: string, weightFrom = cls) => {
      const fontSize = parseFloat(requiredDecl(cls, 'font-size'));
      const lineHeight = parseFloat(decl(cls, 'line-height') ?? inheritedLineHeight);
      const letterSpacing = decl(cls, 'letter-spacing');
      return {
        fontSize,
        fontWeight: requiredDecl(weightFrom, 'font-weight'),
        lineHeight: Math.round(fontSize * lineHeight),
        ...(letterSpacing && { letterSpacing: parseFloat(letterSpacing) * fontSize }),
      };
    };
    expect(TYPE).toEqual({
      label: style('.t-label'),
      body: style('.t-body'),
      bodyStrong: style('.t-body', '.b'),
      title: style('.t-title'),
      headline: style('.t-head'),
      display: style('.t-display'),
      number: style('.t-number'),
    });
  });
});
