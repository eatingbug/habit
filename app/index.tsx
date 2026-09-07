import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, Eyebrow, Footnote, Heatmap, ToastOverlay } from '@/components';
import { useDashboard, type DashboardRow } from '@/hooks/useDashboard';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_SIZE, RADIUS, SPACE } from '@/theme/tokens';

/**
 * Dashboard — SPEC §6.1; layout from `design/parts/Dashboard.body.html`.
 *
 * The artboard is the finished design, so it shows more than this screen renders. The
 * stat cards / XP bars (#17), the status lights and the "손볼 습관 N개" aggregate (#20),
 * long-press skip chips (#12) and the streak count (#14) each belong to a later ticket
 * and are left out rather than stubbed: a hardcoded number would read as data the user
 * does not have. What ships here is the row itself — name, stat tag, the
 * `TUNING.heatmapDays` heatmap, and the one-tap log with its 실행취소 toast (#11).
 */

/**
 * The row's one-tap label (§6.1 B1) — copy from the design canvas
 * (`design/parts/Dashboard.logic.js:61`).
 *
 * The *readings* it branches on (`hasActivityToday`) are derived in `useDashboard`
 * from the shared `logAffordances`, where the hook tests can reach them; the *copy* is
 * applied here, in the screen. Today's composer has its own cascade because its count
 * strings differ — a shared helper there would be a false abstraction over two
 * genuinely different sets of words.
 */
function oneTapLabel(row: DashboardRow): string {
  if (row.habit.kind === 'binary') return row.hasActivityToday ? '✓ 했어요' : '✓ 완료';
  return row.hasActivityToday ? '+1 더' : '+최소';
}

function HabitRow({
  row,
  onPress,
  onLog,
}: {
  row: DashboardRow;
  onPress: () => void;
  onLog: () => void;
}) {
  const { colors } = useTheme();
  // Binary's floor is 1, so one row is the whole day: the control has nothing left to
  // append and reads as completed instead (AC — 완료 후 비활성).
  const done = row.habit.kind === 'binary' && row.hasActivityToday;

  return (
    <Card>
      {/* The navigating press target is the row *body* only (§6.1: tapping the row
          opens the habit). The one-tap control is its sibling, not its child — nested
          inside it, a click on web could reach both handlers and navigate away from
          the row the user just logged into. */}
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={row.habit.name}>
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
      </Pressable>
      <View style={styles.qbottom}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={row.habit.name}
          style={styles.strip}
        >
          <Heatmap cells={row.cells} />
        </Pressable>
        <Button
          label={oneTapLabel(row)}
          variant={done ? 'sel' : 'pri'}
          tap
          mono={row.habit.kind === 'count'}
          disabled={done}
          onPress={onLog}
          style={styles.onetap}
        />
      </View>
    </Card>
  );
}

export default function Dashboard() {
  const { colors, preference, toggle } = useTheme();
  const router = useRouter();
  const { rows, loading, logActivity, toast, undoLast } = useDashboard();

  return (
    <View style={[styles.fill, { backgroundColor: colors.surface }]}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.screen}>
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
                onLog={() => void logActivity(row.habit, row.oneTapAmount)}
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

      {/* B6 — the undo toast doubles as the "it registered" confirmation that one-tap
          logging otherwise lacks (§6.2), so it must not scroll out of reach. */}
      <ToastOverlay toast={toast} onUndo={() => void undoLast()} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // The extra bottom room is the overlay toast's: it floats above the scroll, so the
  // last row has to be able to scroll clear of it.
  screen: { padding: SPACE.xl, paddingBottom: SPACE.xxl * 3, gap: SPACE.lg },
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
  // The strip carries `.ribbon`'s `flex: 1` up to the row, so the heatmap still takes
  // every pixel the one-tap control leaves.
  strip: { flex: 1, minWidth: 0 },
  // `.ribbon` already claims the slack with `flex: 1`; the control must not be
  // squeezed below §6.0's 44px tap target on a narrow row.
  onetap: { flexShrink: 0 },
});
