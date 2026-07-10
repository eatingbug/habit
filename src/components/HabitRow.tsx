/**
 * components/HabitRow.tsx — a single habit list row (.habit-row).
 *
 * Visual reference: mvp/habiquest-demo_2.html (.habit-row / .info / .cue / .streak).
 * Pure presentation: render the props handed in, no app data.
 *
 * The StatusLight is a SEPARATE pressable sibling of the row body so tapping the light
 * routes to reflection (onLightPress) while tapping the row routes to detail (onPress).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tag } from '@/components/primitives';
import { Heatmap, Streak, StatusLight } from '@/components/habitviz';
import { oneTapAction } from '@/domain/logging';
import { font, fontSize, space, weight, type ColorTheme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';
import type { HabitRowProps } from '@/components/types';

export function HabitRow({ data, onPress, onLightPress, onQuickLog, onCellLongPress }: HabitRowProps) {
  const styles = useThemedStyles(makeStyles);
  const hasActivity =
    data.todayState === 'partial' || data.todayState === 'done' || data.todayState === 'over';
  const action = oneTapAction(data, hasActivity);
  return (
    <View style={styles.row}>
      <StatusLight light={data.light} onPress={onLightPress} />
      <Pressable style={styles.body} onPress={onPress}>
        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{data.name}</Text>
            <Tag>{data.statName}</Tag>
          </View>
          {data.cue ? <Text style={styles.cue}>{data.cue}</Text> : null}
          <Streak count={data.streak} />
        </View>
        <Heatmap cells={data.cells} onCellPress={onCellLongPress ? onPress : undefined} onCellLongPress={onCellLongPress} />
      </Pressable>
      {onQuickLog ? (
        <Pressable
          onPress={onQuickLog}
          disabled={action.disabled}
          style={[styles.quick, action.disabled && styles.quickDisabled]}
          hitSlop={6}
        >
          <Text style={styles.quickText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ColorTheme) =>
  StyleSheet.create({
  // .habit-row (with the light pulled out as a leading sibling)
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.lg,
    paddingVertical: 16,
  },
  // .habit-row .info
  info: {
    minWidth: 172,
  },
  // .habit-row .info .t
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  title: {
    fontFamily: font.sans,
    fontWeight: weight.semibold,
    fontSize: fontSize.small,
    color: c.text,
  },
  // .habit-row .info .cue
  cue: {
    fontFamily: font.sans,
    fontSize: fontSize.micro,
    color: c.faint,
    marginTop: space.xs,
    lineHeight: 16,
  },
  // one-tap log button (B1)
  quick: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: c.accentWeak,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 13,
  },
  quickDisabled: { opacity: 0.4, borderColor: c.border, backgroundColor: c.surface2 },
  quickText: {
    fontFamily: font.mono,
    fontSize: fontSize.micro,
    color: c.accentInk,
    fontVariant: ['tabular-nums'],
  },
  });
