import { ArrowDown, ArrowUp, Plus } from 'lucide-react-native';
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
  order?: {
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMove(direction: -1 | 1): void;
  };
}

/**
 * A Today habit card (SPEC §6.2 Habit card, `ReToday`'s `.card.habit`): the icon on the
 * `accent` tint, the name with its status words, the separate 언제 and 어떻게 lines, the progress line
 * with its bar on one row, and the round button. Every word and the bar's ratio are the
 * hook's. Compact by ADR-0008: icon 40, button 44, padding 12.
 */
export function HabitCard({ row, onPress, accessibilityLabel, order }: HabitCardProps) {
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
        {row.methodLine != null && <Text style={[TYPE.body, { color: redesign.muted }]}>{row.methodLine}</Text>}
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
      {order != null ? (
        <View style={styles.moves}>
          <Pressable
            onPress={() => order.onMove(-1)}
            disabled={!order.canMoveUp}
            accessibilityRole="button"
            accessibilityLabel={`${row.habit.name} 위로`}
            accessibilityState={{ disabled: !order.canMoveUp }}
            style={[styles.move, { backgroundColor: redesign.inset, opacity: order.canMoveUp ? 1 : 0.35 }]}
          >
            <ArrowUp size={20} color={redesign.muted} />
          </Pressable>
          <Pressable
            onPress={() => order.onMove(1)}
            disabled={!order.canMoveDown}
            accessibilityRole="button"
            accessibilityLabel={`${row.habit.name} 아래로`}
            accessibilityState={{ disabled: !order.canMoveDown }}
            style={[styles.move, { backgroundColor: redesign.inset, opacity: order.canMoveDown ? 1 : 0.35 }]}
          >
            <ArrowDown size={20} color={redesign.muted} />
          </Pressable>
        </View>
      ) : <Pressable
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
      </Pressable>}
    </Card>
  );
}

const styles = StyleSheet.create({
  // `.habit` — `display:flex; align-items:center; gap:var(--space-md); padding:var(--space-md)`.
  moves: { gap: SPACE.xs },
  move: { width: 44, height: 44, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
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
