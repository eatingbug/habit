// PROTOTYPE (#180) — throwaway. Three Home habit-row layouts, switched by `?variant=`.
// Lives on branch `prototype-180-home-row` only. Question: which row shape gets 5–6
// habits onto a 390×844 Home tab while keeping states readable and days tappable?
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, DayMark, HelpTip, StatusLight } from '@/components/re';
import { DASHBOARD_COPY, STATUS_LIGHT_GLYPHS, STATUS_LIGHT_WORDS, TOOLTIPS } from '@/config/copy';
import type { DashboardRow } from '@/hooks/useDashboard';
import { SPACE, TAP_TARGET, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export const PROTOTYPE_VARIANTS = [
  { key: '', name: '지금' },
  { key: 'a', name: '작은 점 카드' },
  { key: 'b', name: '한 표' },
  { key: 'c', name: '한 줄 카드' },
  { key: 'd', name: '두 줄 카드' },
  { key: 'e', name: '한 줄, 이름 줄바꿈' },
  { key: 'f', name: '한 줄, 왼쪽 2단' },
];

export interface HabitRowsPrototypeProps {
  variant: string;
  rows: DashboardRow[];
  onPress: (row: DashboardRow) => void;
  onDay: (row: DashboardRow, date: string) => void;
  onReflect: (row: DashboardRow) => void;
}

export function HabitRowsPrototype(props: HabitRowsPrototypeProps) {
  if (props.variant === 'a') return <VariantA {...props} />;
  if (props.variant === 'b') return <VariantB {...props} />;
  return <VariantC {...props} />;
}

/** ● ◆ ▲ in the light's ink colour, with the word as its accessible name. */
function LightGlyph({ row }: { row: DashboardRow }) {
  const { redesign } = useTheme();
  const level = row.statusLight === 'personal_best' ? 'stable' : row.statusLight;
  const ink = { stable: redesign.doneInk, caution: redesign.warnInk, intervention: redesign.critInk }[level];
  return (
    <Text style={[TYPE.label, { color: ink }]} accessibilityLabel={STATUS_LIGHT_WORDS[level]}>
      {STATUS_LIGHT_GLYPHS[level]}
    </Text>
  );
}

/** Seven 44px-tall tap cells around a drawn mark of `dot`, with or without day labels. */
function Days({ row, onDay, dot, labels }: { row: DashboardRow; onDay: HabitRowsPrototypeProps['onDay']; dot: number; labels: boolean }) {
  const { redesign } = useTheme();
  return (
    <View style={styles.days}>
      {row.week.map((day) => (
        <Pressable
          key={day.date}
          onPress={() => onDay(row, day.date)}
          disabled={!day.tappable}
          accessibilityRole="button"
          accessibilityLabel={day.accessibilityLabel || day.label}
          style={({ pressed }) => [styles.day, pressed && { opacity: 0.7 }]}
        >
          {day.state != null ? <DayMark state={day.state} size={dot} /> : <View style={{ width: dot, height: dot }} />}
          {labels && <Text style={[TYPE.label, { color: redesign.muted }]}>{day.label}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

/** A — today's structure, shrunk: 28px dots, labels kept, 8px gaps. */
function VariantA({ rows, onPress, onDay, onReflect }: HabitRowsPrototypeProps) {
  const { redesign } = useTheme();
  return (
    <View style={{ gap: SPACE.sm }}>
      {rows.map((row) => (
        <Card key={row.habit.id} tone={row.reflectable ? 'red' : undefined} style={{ padding: SPACE.md, gap: SPACE.xs }}>
          <Pressable onPress={() => onPress(row)} accessibilityRole="button" accessibilityLabel={row.label} style={StyleSheet.absoluteFill} />
          <View style={styles.head} pointerEvents="box-none">
            <View style={styles.title} pointerEvents="none">
              <StatusLight light={row.statusLight} />
              <Text style={[TYPE.title, styles.grow, { color: redesign.text }]} numberOfLines={1}>{row.label}</Text>
              <Text style={[TYPE.body, styles.streak, { color: redesign.streakInk }]}>{row.streakLabel}</Text>
            </View>
            <HelpTip text={TOOLTIPS.sevenDayDots} />
          </View>
          <Days row={row} onDay={onDay} dot={28} labels />
          {row.reflectable && <Button label={DASHBOARD_COPY.reflect} variant="crit" block onPress={() => onReflect(row)} />}
        </Card>
      ))}
    </View>
  );
}

/** B — one card for all habits. Weekday labels and `?` once on top, a hairline between habits. */
function VariantB({ rows, onPress, onDay, onReflect }: HabitRowsPrototypeProps) {
  const { redesign } = useTheme();
  const week = rows[0]?.week ?? [];
  return (
    <Card style={{ padding: SPACE.md, paddingTop: SPACE.sm }}>
      <View style={styles.head}>
        <Text style={[TYPE.label, styles.grow, { color: redesign.muted }]}>최근 7일</Text>
        <HelpTip text={TOOLTIPS.sevenDayDots} />
      </View>
      <View style={styles.days}>
        {week.map((d) => (
          <Text key={d.date} style={[TYPE.label, styles.dayLabel, { color: redesign.muted }]}>{d.label}</Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={row.habit.id} style={[styles.bRow, i > 0 && { borderTopWidth: 1, borderTopColor: redesign.border }]}>
          <View style={styles.head}>
            <Pressable onPress={() => onPress(row)} accessibilityRole="button" accessibilityLabel={row.label} style={[styles.title, styles.bName]}>
              <LightGlyph row={row} />
              <Text style={[TYPE.title, styles.grow, { color: redesign.text }]} numberOfLines={1}>{row.label}</Text>
              <Text style={[TYPE.body, styles.streak, { color: redesign.streakInk }]}>{row.streakLabel}</Text>
            </Pressable>
            {row.reflectable && <Button label={DASHBOARD_COPY.reflect} variant="crit" onPress={() => onReflect(row)} />}
          </View>
          <Days row={row} onDay={onDay} dot={28} labels={false} />
        </View>
      ))}
    </Card>
  );
}

/**
 * C — one card per habit, seven 22px marks, whole card opens Detail. Days open via Detail.
 * c: one line, name ellipsised. d: name line on top, marks below on the right.
 * e: one line, a long name wraps to two lines. f: name (≤2 lines) over the streak, marks right.
 */
function VariantC({ rows, onPress, onReflect, variant }: HabitRowsPrototypeProps) {
  const { redesign } = useTheme();
  const marks = (row: DashboardRow) => (
    <View style={styles.cMarks}>
      {row.week.map((day) =>
        day.state != null ? (
          <DayMark key={day.date} state={day.state} size={22} />
        ) : (
          <View key={day.date} style={{ width: 22, height: 22 }} />
        ),
      )}
    </View>
  );
  const name = (row: DashboardRow, lines: number) => (
    <Text style={[TYPE.title, styles.grow, { color: redesign.text }]} numberOfLines={lines}>{row.label}</Text>
  );
  const streak = (row: DashboardRow) => (
    <Text style={[TYPE.label, styles.streak, { color: redesign.streakInk }]}>{row.streakLabel}</Text>
  );

  return (
    <View style={{ gap: SPACE.sm }}>
      {rows.map((row) => (
        <Card key={row.habit.id} tone={row.reflectable ? 'red' : undefined} style={{ padding: 0 }}>
          <Pressable
            onPress={() => onPress(row)}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            style={({ pressed }) => [variant === 'd' ? styles.dCol : styles.cLine, pressed && { opacity: 0.7 }]}
          >
            {variant === 'd' ? (
              <>
                <View style={styles.dHead}>
                  <LightGlyph row={row} />
                  {name(row, 2)}
                  {streak(row)}
                </View>
                <View style={styles.dMarks}>{marks(row)}</View>
              </>
            ) : variant === 'f' ? (
              <>
                <LightGlyph row={row} />
                <View style={styles.grow}>
                  {name(row, 2)}
                  {streak(row)}
                </View>
                {marks(row)}
              </>
            ) : (
              <>
                <LightGlyph row={row} />
                {name(row, variant === 'e' ? 2 : 1)}
                {streak(row)}
                {marks(row)}
              </>
            )}
          </Pressable>
          {row.reflectable && (
            <View style={{ paddingHorizontal: SPACE.md, paddingBottom: SPACE.md }}>
              <Button label={DASHBOARD_COPY.reflect} variant="crit" block onPress={() => onReflect(row)} />
            </View>
          )}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  title: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  streak: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  days: { flexDirection: 'row' },
  day: { flex: 1, minHeight: TAP_TARGET, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { flex: 1, textAlign: 'center' },
  bRow: { paddingTop: SPACE.xs },
  bName: { minHeight: TAP_TARGET },
  cLine: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: TAP_TARGET, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  cMarks: { flexDirection: 'row', gap: 3 },
  dCol: { gap: SPACE.xs, minHeight: TAP_TARGET, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  dHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  dMarks: { alignItems: 'flex-end' },
});
