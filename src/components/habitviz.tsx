/**
 * components/habitviz.tsx — habit visualization primitives.
 *
 * StatusLight, Streak, Heatmap, HeatLegend. Pure presentation: render the props handed in.
 * Visual reference: mvp/habiquest-demo_2.html (.streak / .heat / .heat i / .legend).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  HeatLegendProps,
  HeatmapProps,
  StatusLightProps,
  StreakProps,
} from '@/components/types';
import { color, font, fontSize, letterSpacing, radius, space } from '@/theme/tokens';
import type { HeatState } from '@/theme/heatLevel';

// Flat day-state colors (SPEC §6.1). `skip` renders as the tinted miss cell below.
const HEAT_COLORS: Record<Exclude<HeatState, 'skip'>, string> = {
  blank: color.green0,
  partial: color.amber,
  done: color.green3,
  over: color.green4,
};

const MISS_BORDER = 'rgba(214,101,90,.3)';

// ── StatusLight ────────────────────────────────────────────────────────────────

export function StatusLight({ light, onPress, size = 14 }: StatusLightProps) {
  let inner: React.ReactNode;

  if (light === 'personal_best') {
    inner = <Text style={[styles.star, { fontSize: size }]}>⭐</Text>;
  } else {
    const dotColor =
      light === 'stable' ? color.green3 : light === 'caution' ? color.amber : color.red;
    inner = (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: dotColor,
        }}
      />
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
  return (
    <Text style={styles.streak}>
      {count > 0 ? `🔥 ${count}일 연속` : '⚠ 연속 끊김'}
    </Text>
  );
}

// ── Heatmap ────────────────────────────────────────────────────────────────────

export function Heatmap({ cells, onCellPress, columns = 20 }: HeatmapProps) {
  return (
    <View style={styles.heat}>
      {cells.map((fill, index) => {
        const cellStyle = [
          styles.cell,
          { width: `${100 / columns}%` as const },
        ];
        const inner =
          fill === 'skip' ? (
            <View style={[styles.cellInner, styles.cellMiss]} />
          ) : (
            <View style={[styles.cellInner, { backgroundColor: HEAT_COLORS[fill] }]} />
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
  return (
    <View style={styles.legend}>
      <View style={[styles.swatch, { backgroundColor: HEAT_COLORS.blank }]} />
      <Text style={styles.legendText}>미기록</Text>
      <View style={[styles.swatch, { backgroundColor: HEAT_COLORS.partial }]} />
      <Text style={styles.legendText}>부분</Text>
      <View style={[styles.swatch, { backgroundColor: HEAT_COLORS.done }]} />
      <Text style={styles.legendText}>달성</Text>
      <View style={[styles.swatch, { backgroundColor: HEAT_COLORS.over }]} />
      <Text style={styles.legendText}>초과</Text>
      <View style={[styles.swatch, styles.swatchMiss]} />
      <Text style={styles.legendText}>건너뜀</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lightTarget: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: {
    color: color.gold,
  },
  streak: {
    fontFamily: font.mono,
    fontSize: fontSize.micro,
    color: color.gold,
    marginTop: 6,
  },
  // .heat — grid of square cells, `columns` per row
  heat: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
  },
  cell: {
    aspectRatio: 1,
    padding: 1.5, // half of the demo's 3px gap, applied per cell
  },
  cellInner: {
    flex: 1,
    borderRadius: radius.xs,
  },
  cellMiss: {
    backgroundColor: color.heatMiss,
    borderWidth: 1,
    borderColor: MISS_BORDER,
  },
  // .legend — right-aligned mono row
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
    color: color.inkFaint,
    letterSpacing: letterSpacing.tag,
  },
  swatch: {
    width: 11,
    height: 11,
    borderRadius: radius.xs,
  },
  swatchMiss: {
    backgroundColor: color.heatMiss,
    borderWidth: 1,
    borderColor: MISS_BORDER,
  },
});
