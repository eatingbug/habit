import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, DayMark, StatusLight } from '@/components/re';
import { DASHBOARD_COPY } from '@/config/copy';
import type { DashboardRow } from '@/hooks/useDashboard';
import { SPACE, TAP_TARGET, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/** Drawn for the eye only: the row's `Pressable` already announces these words. */
const VISUAL_ONLY = {
  pointerEvents: 'none',
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
  'aria-hidden': true,
} as const;

export interface HabitRowProps {
  row: DashboardRow;
  /** The row itself: Habit Detail. */
  onPress: () => void;
  /** A tappable dot: the record sheet for that date. */
  onDay: (date: string) => void;
  /** 회고하기 on a 🔴 row. */
  onReflect: () => void;
}

/** The dot's drawn size (§6.3). The touch area is the whole cell. */
const DOT = 22;

/**
 * One Dashboard habit row (SPEC §6.3, `ReDashboard`'s `.card.hrow`): the status light's
 * shape, icon and name, and "🔥 N" on the head line, the 7 dots under it, and 회고하기 on
 * a 🔴 row only. The dots' `?` sits once above the list (ADR-0009). Every word and state
 * is the hook's.
 */
export function HabitRow({ row, onPress, onDay, onReflect }: HabitRowProps) {
  const { redesign } = useTheme();

  return (
    <Card tone={row.reflectable ? 'red' : undefined} style={[styles.card, row.reflectable && styles.cardReflect]}>
      {/* The row's tap target sits behind its content, so no control is nested inside it. */}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={row.label}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.head} {...VISUAL_ONLY}>
        <StatusLight light={row.statusLight} wordless />
        <Text style={[TYPE.title, styles.grow, { color: redesign.text }]} numberOfLines={2}>
          {row.label}
        </Text>
        <Text style={[TYPE.label, styles.streak, { color: redesign.streakInk }]}>{row.streakLabel}</Text>
      </View>

      <View style={styles.days} pointerEvents="box-none">
        {row.week.map((day) => (
          <Pressable
            key={day.date}
            onPress={() => onDay(day.date)}
            disabled={!day.tappable}
            pointerEvents={day.tappable ? 'auto' : 'none'}
            accessibilityRole="button"
            accessibilityLabel={day.accessibilityLabel || day.label}
            accessibilityState={{ disabled: !day.tappable }}
            style={({ pressed }) => [styles.day, pressed && { opacity: 0.7 }]}
          >
            {day.state != null ? <DayMark state={day.state} size={DOT} /> : <View style={styles.blank} />}
          </Pressable>
        ))}
      </View>

      {row.reflectable && <Button label={DASHBOARD_COPY.reflect} variant="crit" block onPress={onReflect} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  // `.hrow` — `padding:var(--space-sm) var(--space-md) 0`. The day cells' height is the bottom space.
  card: { paddingTop: SPACE.sm, paddingHorizontal: SPACE.md, paddingBottom: 0 },
  cardReflect: { paddingBottom: SPACE.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  grow: { flex: 1, minWidth: 0 },
  streak: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  // `.days` — seven equal columns; `.day` — `min-height:var(--tap)`, the mark centred.
  days: { flexDirection: 'row' },
  day: { flex: 1, minHeight: TAP_TARGET, alignItems: 'center', justifyContent: 'center' },
  blank: { width: DOT, height: DOT },
});
