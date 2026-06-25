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
import { color, font, fontSize, space } from '@/theme/tokens';
import type { HabitRowProps } from '@/components/types';

export function HabitRow({ data, onPress, onLightPress }: HabitRowProps) {
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
        <Heatmap cells={data.cells} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // .habit-row (with the light pulled out as a leading sibling)
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: color.line,
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
    fontFamily: font.sansSemiBold,
    fontSize: fontSize.body,
    color: color.ink,
  },
  // .habit-row .info .cue
  cue: {
    fontFamily: font.sans,
    fontSize: fontSize.micro,
    color: color.inkFaint,
    marginTop: space.xs,
    lineHeight: 16,
  },
});
