/**
 * theme/Gradient.tsx — expo-linear-gradient presets + the app background.
 *
 * The demo uses CSS angle gradients; expo-linear-gradient takes start/end points in a
 * [0,1] box, so `angleToPoints` converts a CSS-style angle (0deg = up, clockwise).
 * The body's two radial glows are approximated with two corner LinearGradient washes.
 */
import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color } from './tokens';

type Point = { x: number; y: number };
export type GradientPreset = {
  colors: readonly [string, string, ...string[]];
  start: Point;
  end: Point;
};

/** CSS-style angle (0deg points up, increasing clockwise) → start/end points in [0,1]. */
function angleToPoints(deg: number): { start: Point; end: Point } {
  const rad = (deg * Math.PI) / 180;
  const x = Math.sin(rad);
  const y = -Math.cos(rad);
  return {
    start: { x: 0.5 - x / 2, y: 0.5 - y / 2 },
    end: { x: 0.5 + x / 2, y: 0.5 + y / 2 },
  };
}

/** Named gradients matching the demo's component fills. */
export const gradients = {
  stat: { colors: [color.panel2, color.panel], ...angleToPoints(160) }, // .stat 160deg
  composer: { colors: [color.panel2, color.panel], ...angleToPoints(150) }, // .composer 150deg
  refHero: { colors: [color.panel2, color.panel], ...angleToPoints(150) }, // .ref-hero 150deg
  goldButton: { colors: [color.gold, color.goldDeep], ...angleToPoints(120) }, // .btn.primary 120deg
  xpBar: { colors: [color.goldDeep, color.gold], ...angleToPoints(90) }, // .bar > i 90deg
} as const satisfies Record<string, GradientPreset>;

/** A LinearGradient rendered from one of the named presets. */
export function Gradient({
  preset,
  style,
  children,
}: {
  preset: keyof typeof gradients;
  style?: ViewProps['style'];
  children?: React.ReactNode;
}) {
  const g = gradients[preset];
  return (
    <LinearGradient colors={g.colors} start={g.start} end={g.end} style={style}>
      {children}
    </LinearGradient>
  );
}

/**
 * App background: the base dark fill plus two soft corner washes approximating the
 * demo's radial body glows (gold top-right, blue bottom-left). Children render on top.
 */
export function AppBackground({ children, style }: { children?: React.ReactNode; style?: ViewProps['style'] }) {
  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(216,177,90,0.07)', 'rgba(216,177,90,0)'] as const}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.35, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(107,155,216,0.06)', 'rgba(107,155,216,0)'] as const}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.65, y: 0.4 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
  },
});
