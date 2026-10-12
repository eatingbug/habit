import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, DayMark, HelpTip, StatusLight } from '@/components/re';
import { DASHBOARD_COPY, TOOLTIPS } from '@/config/copy';
import type { DashboardRow } from '@/hooks/useDashboard';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

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
const DOT = 36;

/**
 * One Dashboard habit row (SPEC §6.3, `ReDashboard`'s `.card`): the status light, icon
 * and name, "🔥 N" and the 7-day dots' `?` on the head line, the 7 dots under it, and
 * 회고하기 on a 🔴 row only. Every word and state is the hook's.
 */
export function HabitRow({ row, onPress, onDay, onReflect }: HabitRowProps) {
  const { redesign } = useTheme();

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={row.label}>
      <Card tone={row.reflectable ? 'red' : undefined} style={styles.card}>
        <View style={styles.head}>
          <StatusLight light={row.statusLight} />
          <Text style={[TYPE.title, styles.grow, { color: redesign.text }]} numberOfLines={1}>
            {row.label}
          </Text>
          <Text style={[TYPE.body, styles.streak, { color: redesign.streakInk }]}>{row.streakLabel}</Text>
          <HelpTip text={TOOLTIPS.sevenDayDots} />
        </View>

        <View style={styles.days}>
          {row.week.map((day) => (
            <Pressable
              key={day.date}
              onPress={() => onDay(day.date)}
              disabled={!day.tappable}
              accessibilityRole="button"
              accessibilityLabel={day.accessibilityLabel || day.label}
              accessibilityState={{ disabled: !day.tappable }}
              style={({ pressed }) => [styles.day, pressed && { opacity: 0.7 }]}
            >
              {day.state != null ? <DayMark state={day.state} size={DOT} /> : <View style={styles.blank} />}
              <Text style={[TYPE.label, { color: redesign.muted }]}>{day.label}</Text>
            </Pressable>
          ))}
        </View>

        {row.reflectable && <Button label={DASHBOARD_COPY.reflect} variant="crit" block onPress={onReflect} />}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  streak: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  // `.days` — seven equal columns; `.day` — `min-height:48px; gap:2px`.
  days: { flexDirection: 'row' },
  day: { flex: 1, minHeight: 48, alignItems: 'center', gap: 2 },
  blank: { width: DOT, height: DOT },
});
