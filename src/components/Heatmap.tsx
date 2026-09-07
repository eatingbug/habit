import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { HeatCell, HeatFill, HeatTone } from '@/domain/heatLevel';
import { useTheme } from '@/theme/ThemeProvider';
import type { Palette } from '@/theme/tokens';
import { SPACE } from '@/theme/tokens';

export interface HeatmapProps {
  cells: HeatCell[];
  style?: StyleProp<ViewStyle>;
}

/**
 * `.ribbon` — the Dashboard row's day strip (§6.1).
 *
 * `heatLevel.ts` already decided what each day *means*; this file only turns its
 * `tone`/`fill` pair into `design/_tokens.css`'s `.cell` skins, so the semantics live
 * in one place. The four readings §6.0 requires to stay legible in both themes are:
 *
 *   `pending`  neutral fill, a **dashed** strong border — today, still open
 *   `missed`   the miss hue as a tint with a **solid miss border** — nothing recorded
 *   `skip`     the miss hue **filled** — the user said why (ADR-0001 §파급 7)
 *   `partial`  its own hue, filled — logged but under the floor, and *not* a miss
 *
 * An unclassified day (pre-`createdAt`, or an empty day inside a pause) carries no
 * state hue at all and reads as `.cell.blank` — it still occupies its slot, because
 * the strip is a calendar and must not lose alignment (ADR-0003 §파급 6).
 *
 * `HeatCell.level` is deliberately unused: the canvas ribbon has one flat class per
 * day-state and no above-floor ramp, and `design/` is the layout authority.
 */
function skinOf(colors: Palette, tone: HeatTone, fill: HeatFill): ViewStyle {
  switch (tone) {
    case 'empty':
      return { backgroundColor: colors.blank, borderColor: colors.border };
    case 'neutral':
      return {
        backgroundColor: colors.blank,
        borderColor: colors.borderStrong,
        borderStyle: 'dashed',
      };
    case 'miss':
      return fill === 'outline'
        ? { backgroundColor: colors.missed, borderColor: colors.skip }
        : { backgroundColor: colors.skip, borderColor: colors.skip };
    case 'partial':
      return { backgroundColor: colors.partial, borderColor: colors.partial };
    case 'done':
      return { backgroundColor: colors.done, borderColor: colors.done };
    case 'over':
      return { backgroundColor: colors.over, borderColor: colors.over };
  }
}

export function Heatmap({ cells, style }: HeatmapProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[styles.ribbon, style]}
      // The canvas marks the ribbon `aria-hidden`: it is a summary of days that the
      // row's own text already names, not 20 separate controls.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {cells.map((cell) => (
        <View key={cell.date} style={[styles.cell, skinOf(colors, cell.tone, cell.fill)]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ribbon: { flexDirection: 'row', gap: 3, flex: 1, minWidth: 0 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: SPACE.xs + 0.5, borderWidth: 1 },
});
