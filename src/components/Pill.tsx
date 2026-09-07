import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '@/theme/tokens';

export interface PillProps {
  /** `.pk` — the uppercase mono key above the value. */
  label: string;
  /** `.pv` — the number, in mono with tabular numerals (§6.0). */
  value: string;
  /** `.pv small` — a trailing unit, faint. */
  unit?: string;
}

/** `.pill` — a key/value stat readout. */
export function Pill({ label, value, unit }: PillProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.pill, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
      <Text style={[styles.key, { color: colors.faint }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.text }]}>
        {value}
        {unit != null && <Text style={[styles.unit, { color: colors.faint }]}> {unit}</Text>}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    minWidth: 0,
    gap: SPACE.xs,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.md + 1,
    paddingVertical: SPACE.md - 1,
  },
  key: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs - 0.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  value: {
    fontFamily: FONT_FAMILY.mono,
    fontVariant: ['tabular-nums'],
    fontSize: FONT_SIZE.md + 0.5,
    fontWeight: '600',
  },
  unit: { fontSize: FONT_SIZE.xs, fontWeight: '500' },
});
