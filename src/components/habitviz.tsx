/**
 * components/habitviz.tsx — habit visualization primitives (SPEC §6.0 / §6.1).
 *
 * StatusLight, Streak, Heatmap (flat 5-color day-state), HeatLegend. Adaptive: colors
 * come from the active theme; the heatmap uses semantic day-state hues (blank ≠ partial
 * ≠ skip in both themes), no above-floor intensity ramp.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  HeatLegendProps,
  HeatmapProps,
  StatusLightProps,
  StreakProps,
} from '@/components/types';
import { font, fontSize, letterSpacing, radius, space, weight, type ColorTheme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useTheme } from '@/theme/ThemeProvider';
import type { HeatState } from '@/theme/heatLevel';

const heatColors = (c: ColorTheme): Record<HeatState, string> => ({
  blank: c.blank,
  partial: c.partial,
  done: c.done,
  over: c.over,
  skip: c.skip,
});

// ── StatusLight ────────────────────────────────────────────────────────────────

export function StatusLight({ light, onPress, size = 14 }: StatusLightProps) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(makeStyles);
  let inner: React.ReactNode;

  if (light === 'personal_best') {
    inner = <Text style={[styles.star, { fontSize: size }]}>⭐</Text>;
  } else {
    const dotColor = light === 'stable' ? c.good : light === 'caution' ? c.warn : c.crit;
    inner = (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: dotColor }} />
    );
  }

  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={8} style={styles.lightTarget}>
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.lightTarget}>{inner}</View>;
}

// ── Streak ─────────────────────────────────────────────────────────────────────

export function Streak({ count }: StreakProps) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.streak}>{count > 0 ? `🔥 ${count}일 연속` : '⚠ 연속 끊김'}</Text>;
}

// ── Heatmap (flat day-state cells) ───────────────────────────────────────────────

export function Heatmap({ cells, onCellPress, columns = 20 }: HeatmapProps) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const colors = heatColors(c);
  return (
    <View style={styles.heat}>
      {cells.map((fill, index) => {
        const cellStyle = [styles.cell, { width: `${100 / columns}%` as const }];
        const inner = (
          <View
            style={[
              styles.cellInner,
              { backgroundColor: colors[fill] },
              fill === 'blank' && styles.cellBlank,
            ]}
          />
        );
        if (onCellPress) {
          return (
            <Pressable key={index} style={cellStyle} onPress={() => onCellPress(index)}>
              {inner}
            </Pressable>
          );
        }
        return (
          <View key={index} style={cellStyle}>
            {inner}
          </View>
        );
      })}
    </View>
  );
}

// ── HeatLegend ─────────────────────────────────────────────────────────────────

export function HeatLegend(_: HeatLegendProps) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const colors = heatColors(c);
  const items: { state: HeatState; label: string }[] = [
    { state: 'blank', label: '미기록' },
    { state: 'partial', label: '부분' },
    { state: 'done', label: '달성' },
    { state: 'over', label: '초과' },
    { state: 'skip', label: '건너뜀' },
  ];
  return (
    <View style={styles.legend}>
      {items.map((it) => (
        <React.Fragment key={it.state}>
          <View
            style={[styles.swatch, { backgroundColor: colors[it.state] }, it.state === 'blank' && styles.cellBlank]}
          />
          <Text style={styles.legendText}>{it.label}</Text>
        </React.Fragment>
      ))}
    </View>
  );
}

const makeStyles = (c: ColorTheme) =>
  StyleSheet.create({
    lightTarget: { alignItems: 'center', justifyContent: 'center' },
    star: { color: c.accent },
    streak: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
      color: c.accent,
      marginTop: 6,
      fontVariant: ['tabular-nums'],
    },
    heat: { flexDirection: 'row', flexWrap: 'wrap', flex: 1, minWidth: 0 },
    cell: { aspectRatio: 1, padding: 1.5 },
    cellInner: { flex: 1, borderRadius: radius.cell },
    cellBlank: { borderWidth: 1, borderColor: c.border },
    legend: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 14,
    },
    legendText: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
      color: c.faint,
      letterSpacing: letterSpacing.tag,
    },
    swatch: { width: 11, height: 11, borderRadius: radius.cell },
  });
