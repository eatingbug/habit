import { Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, ProgressBar } from '@/components/re';
import type { TodayHabitRow } from '@/hooks/useToday';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
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
 * and bar, and the large round button. Every word and the bar's ratio are the hook's.
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
        {row.progressLine != null && (
          <Text style={[TYPE.bodyStrong, styles.progress, { color: redesign.text }]}>{row.progressLine}</Text>
        )}
        {row.progressRatio != null && <ProgressBar ratio={row.progressRatio} done={row.floorMet} />}
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
          <Plus size={28} strokeWidth={2.5} color="#fff" />
        )}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  // `.habit` — `display:flex; align-items:center; gap:14px`.
  card: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 52, height: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 28, lineHeight: 34 },
  grow: { flex: 1, minWidth: 0 },
  progress: { marginTop: 4, fontVariant: ['tabular-nums'] },
  // `.act` — a 56px circle; ✓ at 26/800.
  action: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  check: { color: '#fff', fontSize: 26, fontWeight: '800', lineHeight: 30 },
});
