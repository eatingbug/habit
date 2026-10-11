import { StyleSheet, Text, View } from 'react-native';

import type { CelebrationDay } from '@/hooks/useQuickLog';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The celebration's week (`.wk`): seven 28px dots, `streak` fill with ✓ on a floor-met
 * day, today's label in `streak` ink. Not a control, so the cells need no touch area.
 */
export function WeekStrip({ week }: { week: CelebrationDay[] }) {
  const { redesign } = useTheme();

  return (
    <View style={styles.week}>
      {week.map((day) => (
        <View key={day.label} style={styles.day}>
          <View style={[styles.dot, { backgroundColor: day.done ? redesign.streak : redesign.inset }]}>
            <Text style={[TYPE.label, styles.glyph]}>{day.done ? '✓' : ''}</Text>
          </View>
          <Text style={[TYPE.label, { color: day.today ? redesign.streakInk : redesign.muted }]}>{day.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  day: { alignItems: 'center', gap: 2 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  glyph: { color: '#fff' },
});
