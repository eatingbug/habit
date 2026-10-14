import { Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, ProgressBar } from '@/components/re';
import type { TodayHabitRow } from '@/hooks/useToday';
import { RADIUS, SPACE, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface HabitCardProps {
  row: TodayHabitRow;
  /** `+` or ✓ — opens the record sheet. */
  onPress: () => void;
  /** The button's accessible name, e.g. "독서 기록". */
  accessibilityLabel: string;
}

/**
 * A Today habit card (SPEC §6.2 Habit card, `ReToday`'s `.card.habit`): the icon on the
 * `accent` tint, the name with its status words, the 언제·어디서 value, the progress line
 * with its bar on one row, and the round button. Every word and the bar's ratio are the
 * hook's. Compact by ADR-0008: icon 40, button 44, padding 12.
 */
export function HabitCard({ row, onPress, accessibilityLabel }: HabitCardProps) {
  const { redesign } = useTheme();
  const badgeColor = row.floorMet ? redesign.doneInk : redesign.muted;

  return (
    <Card tone={row.floorMet ? 'ok' : undefined} style={styles.card}>
      <View style={[styles.icon, { backgroundColor: redesign.accentTint }]}>
        <Text style={styles.iconText}>{row.icon}</Text>
      </View>
      <View style={styles.grow}>
        <Text style={[TYPE.title, { color: redesign.text }]}>
          {row.habit.name}
          {row.badge != null && (
            <Text style={[TYPE.label, { color: badgeColor }]}>{`  ${row.badge}`}</Text>
          )}
        </Text>
        {row.cueLine != null && <Text style={[TYPE.body, { color: redesign.muted }]}>{row.cueLine}</Text>}
        {(row.progressLine != null || row.progressRatio != null) && (
          <View style={styles.progress}>
            {row.progressLine != null && (
              <Text style={[TYPE.bodyStrong, styles.progressText, { color: redesign.text }]}>{row.progressLine}</Text>
            )}
            {row.progressRatio != null && (
              <ProgressBar ratio={row.progressRatio} done={row.floorMet} style={styles.bar} />
            )}
          </View>
        )}
      </View>
      <Pressable
        onPress={onPress}
        disabled={!row.canLog}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !row.canLog }}
        style={({ pressed }) => [
          styles.action,
          { backgroundColor: row.floorMet ? redesign.done : redesign.accent },
          pressed && { opacity: 0.85 },
        ]}
      >
        {row.floorMet ? (
          <Text style={styles.check}>✓</Text>
        ) : (
          <Plus size={24} strokeWidth={2.5} color="#fff" />
        )}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  // `.card.habit` — `display:flex; align-items:center; gap:12px; padding:12px`.
  card: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.md },
  icon: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 22, lineHeight: 28 },
  grow: { flex: 1, minWidth: 0 },
  // `.prog` — the progress words and the bar on one row.
  progress: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.xs },
  progressText: { fontVariant: ['tabular-nums'] },
  bar: { flex: 1, marginTop: 0 },
  // `.act` — a 44px circle; ✓ at 22/800.
  action: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  check: { color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 26 },
});
