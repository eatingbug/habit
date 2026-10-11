import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CELEBRATION_COPY, ICON_LABELS } from '@/config/copy';
import type { StreakCelebration } from '@/hooks/useQuickLog';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

import { WeekStrip } from './WeekStrip';

/**
 * The streak banner (SPEC §6.2 Streak celebration, `ReTodayStreak`'s `.celebrate`). It
 * drops over the top of the screen and does not block logging below it. A tap closes it.
 */
export function StreakBanner({ celebration, onDismiss }: { celebration: StreakCelebration; onDismiss: () => void }) {
  const { redesign } = useTheme();

  return (
    <Pressable
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityHint={ICON_LABELS.close}
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        { backgroundColor: redesign.surface, borderColor: redesign.streak, boxShadow: redesign.lift },
      ]}
    >
      <View style={styles.row}>
        <Text style={styles.fire}>🔥</Text>
        <View style={styles.grow}>
          <Text style={[TYPE.title, { color: redesign.text }]}>
            <Text style={{ color: redesign.streakInk }}>{celebration.streak}</Text>
            {CELEBRATION_COPY.streakSuffix}
          </Text>
          <Text style={[TYPE.body, { color: redesign.muted }]}>{celebration.line}</Text>
        </View>
      </View>
      <WeekStrip week={celebration.week} />
      {celebration.starLine != null && (
        <Text style={[TYPE.label, styles.starLine, { backgroundColor: redesign.streakTint, color: redesign.streakInk }]}>
          {celebration.starLine}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    borderWidth: 2,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fire: { fontSize: 40, lineHeight: 44 },
  grow: { flex: 1 },
  starLine: { borderRadius: RADIUS.sm, paddingVertical: 8, paddingHorizontal: 12, overflow: 'hidden' },
});
