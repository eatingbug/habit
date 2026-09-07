import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, Eyebrow, Footnote, Heatmap } from '@/components';
import { useDashboard, type DashboardRow } from '@/hooks/useDashboard';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_SIZE, RADIUS, SPACE } from '@/theme/tokens';

/**
 * Dashboard — SPEC §6.1; layout from `design/parts/Dashboard.body.html`.
 *
 * The artboard is the finished design, so it shows more than this screen renders. The
 * stat cards / XP bars (#17), the status lights and the "손볼 습관 N개" aggregate (#20),
 * one-tap logging (#11), long-press skip chips (#12) and the streak count (#14) each
 * belong to a later ticket and are left out rather than stubbed: a hardcoded number
 * would read as data the user does not have. What ships here is the row itself — name,
 * stat tag, and the `TUNING.heatmapDays` heatmap.
 */

function HabitRow({ row, onPress }: { row: DashboardRow; onPress: () => void }) {
  const { colors } = useTheme();

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={row.habit.name}>
      <Card>
        <View style={styles.qtop}>
          <Text style={[styles.qname, { color: colors.text }]} numberOfLines={1}>
            {row.habit.name}
          </Text>
          {row.stat != null && <Chip label={row.stat.name} variant="stat" />}
          {/* Cue summary (§6.1). Absent until the user fills it in — cue is optional at
              creation by design (§5), so an empty cue simply renders nothing. */}
          {row.habit.cue != null && row.habit.cue.length > 0 && (
            <Text style={[styles.qcue, { color: colors.muted }]} numberOfLines={1}>
              {row.habit.cue}
            </Text>
          )}
        </View>
        <View style={styles.qbottom}>
          <Heatmap cells={row.cells} />
        </View>
      </Card>
    </Pressable>
  );
}

export default function Dashboard() {
  const { colors, preference, toggle } = useTheme();
  const router = useRouter();
  const { rows, loading } = useDashboard();

  return (
    <ScrollView
      style={{ backgroundColor: colors.surface }}
      contentContainerStyle={styles.screen}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>대시보드</Text>
        <Pressable
          onPress={toggle}
          style={[styles.toggle, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
        >
          <Text style={[styles.toggleText, { color: colors.muted }]}>
            {preference === 'system' ? '자동' : preference === 'light' ? '라이트' : '다크'}
          </Text>
        </Pressable>
      </View>

      <Eyebrow>오늘의 습관</Eyebrow>

      {loading ? (
        <Text style={[styles.notice, { color: colors.muted }]}>불러오는 중…</Text>
      ) : rows.length === 0 ? (
        <Text style={[styles.notice, { color: colors.muted }]}>아직 습관이 없습니다.</Text>
      ) : (
        <View style={styles.quests}>
          {rows.map((row) => (
            <HabitRow
              key={row.habit.id}
              row={row}
              onPress={() => router.push(`/habit/${row.habit.id}`)}
            />
          ))}
        </View>
      )}

      <Button label="오늘 기록하기" block onPress={() => router.push('/today')} />

      <Button
        label="+ 습관 만들기"
        variant="pri"
        block
        onPress={() => router.push('/habit/new')}
      />

      {rows.length > 0 && (
        <Footnote>
          테두리만 있는 칸은 기록이 없어 실패로 잡힌 날입니다. 그 날을 채워 넣으면 회복돼요.
        </Footnote>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FONT_SIZE.xl, fontWeight: '600', letterSpacing: -0.2 },
  toggle: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm + 1,
  },
  toggleText: { fontSize: FONT_SIZE.sm },
  notice: { fontSize: FONT_SIZE.base },
  quests: { gap: 9 },
  qtop: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  qname: { fontSize: FONT_SIZE.md, fontWeight: '600', letterSpacing: -0.14, flexShrink: 1 },
  // `.qcue` — pushed to the row's trailing edge and clipped, so a long cue can never
  // squeeze the name or the heatmap.
  qcue: { fontSize: FONT_SIZE.sm, marginLeft: 'auto', maxWidth: 120, flexShrink: 1 },
  qbottom: { flexDirection: 'row', alignItems: 'center', gap: 9 },
});
