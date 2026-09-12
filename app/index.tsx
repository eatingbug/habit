import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Button,
  Card,
  Chip,
  Eyebrow,
  Footnote,
  Heatmap,
  SkipReasonChips,
  TOAST_OVERLAY_CLEARANCE,
  ToastOverlay,
} from '@/components';
import { useDashboard, type DashboardRow, type StatProgress } from '@/hooks/useDashboard';
import type { SkipReason } from '@/models';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '@/theme/tokens';

/**
 * Dashboard — SPEC §6.1; layout from `design/parts/Dashboard.body.html`.
 *
 * The artboard is the finished design, so it shows more than this screen renders. The
 * status lights and the "손볼 습관 N개" aggregate belong to #20 and are left out rather
 * than stubbed: a hardcoded number would read as data the user does not have. The
 * character header's 칭호 (`· 꾸준함`) is #39's — there is no titles engine to derive one
 * from, so the header shows the level alone. What ships here is the character header and
 * the stat cards with their XP bars (#17), and the row itself — name, stat tag, the
 * `TUNING.heatmapDays` heatmap, the 🔥 streak count (#14), the one-tap log with its
 * 실행취소 toast (#11), and the long-press skip chips (#12).
 */

/**
 * The row's one-tap label (§6.1 B1) — copy from the design canvas.
 * `✓ 완료` / `✓ 했어요` / `+1 더` come from `design/parts/Dashboard.logic.js:61`;
 * `+최소` is the row one-tap's own label in `design/parts/RowSkip.body.html:17` and
 * `design/parts/Star.body.html:28` (that same file's `cta` reads `최소만큼`, which is
 * the *composer's* wording — the row uses the short form).
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

/**
 * One stat card — `design/parts/Dashboard.body.html:11–15`, styled from
 * `design/_tokens.css:68–76`.
 *
 * Copy only. `다음 레벨까지 N XP` is the canvas's line
 * (`design/parts/Dashboard.logic.js:68`); `최고 레벨` replaces it at the top of the
 * ladder and is **캔버스 출처 없음 — 신규 문구**, because the canvas has no top-level
 * state to draw. Every *judgment* — the level, the bar's fraction, whether there is a
 * next level at all — arrives decided from `useDashboard`; the only arithmetic here
 * turns that 0–1 fraction into a percentage — the bar's width and the label's number.
 */
function StatCard({ card }: { card: StatProgress }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.statcard, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
      <View style={styles.statTop}>
        <Text style={[styles.statName, { color: colors.muted }]} numberOfLines={1}>
          {card.stat.name}
        </Text>
        <Text style={[styles.statLevel, { color: colors.text }]}>{card.level}</Text>
      </View>
      {/* `.xpbar` — a plain track and a fill, no label inside it. The width is the
          hook's `barFraction`, scaled to a percentage — a unit, not a decision. */}
      <View
        style={[styles.xpbar, { backgroundColor: colors.inset }]}
        accessibilityLabel={`${card.stat.name} 레벨 ${card.level}, ${Math.round(card.barFraction * 100)}%`}
      >
        <View
          style={[styles.xpfill, { backgroundColor: colors.accent, width: `${card.barFraction * 100}%` }]}
        />
      </View>
      <Text style={[styles.statTo, { color: colors.faint }]} numberOfLines={1}>
        {card.xpToNextLevel == null ? '최고 레벨' : `다음 레벨까지 ${card.xpToNextLevel} XP`}
      </Text>
    </View>
  );
}

/**
 * The screen-reader equivalent of the long press.
 *
 * A custom action name is used, rather than RN's standard `longpress`, so that the
 * `label` below travels with it — that label is the only text saying what this action
 * does. How the platform presents it is unverified on device: on web both the action
 * and the announcement are no-ops, so this is a manual verification item.
 */
const PICK_SKIP_REASON = 'pickSkipReason';

function HabitRow({
  row,
  onPress,
  onLog,
  onSkip,
}: {
  row: DashboardRow;
  onPress: () => void;
  onLog: () => void;
  onSkip: (reason: SkipReason) => void;
}) {
  const { colors } = useTheme();
  // Binary's floor is 1, so one row is the whole day: the control has nothing left to
  // append and reads as completed instead (AC — 완료 후 비활성).
  const done = row.habit.kind === 'binary' && row.hasActivityToday;
  /**
   * B5's disclosure. Collapsed by default and re-collapsed once a reason is recorded,
   * so the row returns to its resting shape. Local, not hoisted to the hook: it is
   * "is this row's disclosure open", which no other surface and no test asserts.
   */
  const [skipOpen, setSkipOpen] = useState(false);
  /**
   * Opening the chips is announced, because activating an accessibility action and
   * perceiving nothing is the same "this feature does not exist for me" failure the
   * action was added to prevent — the disclosure is the only feedback either path
   * gets, and a screen reader does not narrate a layout change.
   */
  function openSkip() {
    setSkipOpen(true);
    AccessibilityInfo.announceForAccessibility('못 한 날 사유를 고르세요');
  }

  return (
    <Card>
      {/* The navigating press target is the row *body* only (§6.1: tapping the row
          opens the habit). The one-tap control is its sibling, not its child — nested
          inside it, a click on web could reach both handlers and navigate away from
          the row the user just logged into.

          Both siblings are buttons, so each needs an accessible name that says what
          it *does*; the habit's name alone would give two controls one identity. An
          a11y label is an affordance description, not screen copy, so the canvas
          citation rule (which only covers visible strings) does not reach these. */}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${row.habit.name} 습관 열기`}
      >
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
        {/* `.streak` (`design/parts/Dashboard.body.html:38`) — 연속 날수, ahead of the
            ribbon it summarises. The number is `useDashboard`'s `computeStreak`, never
            stored: filling a past day re-joins the run through it (ADR-0001, #14).

            The `accessibilityLabel` replaces what is announced, so a screen reader
            reads "연속 12일" rather than the literal glyph and digit — the emoji is
            decoration and would otherwise be spoken as its name. */}
        <Text
          style={[styles.streak, { color: colors.muted }]}
          accessibilityLabel={`연속 ${row.streak}일`}
        >
          🔥 {row.streak}
        </Text>
        {/* B5's gesture is on the **ribbon**, not on today's individual cell. Two
            reasons: one cell is a `TUNING.heatmapDays`-th of the strip (~15px), far
            under §6.0's 44px tap target; and `Heatmap` is deliberately hidden from
            assistive tech (a ribbon is a summary of days, not 20 controls), so a
            `Pressable` inside it would be unreachable there. The ribbon is a
            superset of "long-press today's cell" — easier to hit, and outside the
            hidden subtree, so this Pressable keeps its own accessible name.

            `accessibilityActions` is the screen-reader equivalent: a long press is a
            gesture assistive tech does not surface, so without it the feature would
            not exist for those users. */}
        <Pressable
          onPress={onPress}
          onLongPress={row.skippable ? openSkip : undefined}
          accessibilityRole="button"
          accessibilityLabel={`${row.habit.name} 기록 보기`}
          accessibilityActions={
            row.skippable ? [{ name: PICK_SKIP_REASON, label: '못 한 날 사유 고르기' }] : undefined
          }
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === PICK_SKIP_REASON) openSkip();
          }}
          style={styles.strip}
        >
          <Heatmap cells={row.cells} />
        </Pressable>
        <Button
          label={oneTapLabel(row)}
          accessibilityLabel={`${row.habit.name} ${oneTapLabel(row)}`}
          variant={done ? 'sel' : 'pri'}
          tap
          mono={row.habit.kind === 'count'}
          disabled={done}
          onPress={onLog}
          style={styles.onetap}
        />
      </View>
      {/* `.skiprow` (`design/parts/RowSkip.body.html:20–25`) — inside the card, on
          its own hairline-topped row. Recording a reason collapses it again: the
          answer is on the ribbon now, so the question has been asked and answered.

          No note field here: AC 8's optional note is satisfied by Today's composer,
          and the ticket asks for none on this path — the two-tap fast route from a
          row, which has no text-entry context. */}
      {row.skippable && skipOpen && (
        <View style={[styles.skiprow, { borderColor: colors.border }]}>
          <SkipReasonChips
            label="오늘 못 했어요 · 왜?"
            habitName={row.habit.name}
            selected={row.skipReasonToday}
            onPick={(reason) => {
              onSkip(reason);
              setSkipOpen(false);
            }}
          />
        </View>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { colors, preference, toggle } = useTheme();
  const router = useRouter();
  const { rows, stats, characterLevel, loading, logActivity, logSkip, toast, undoLast } =
    useDashboard();

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

        {/* Gated on the same `loading` as the rows below: before the load resolves the
            hook has no stat cards to draw, and `characterLevel` reads `Lv.0` — a level
            that is the empty list's arithmetic, not the user's. Nothing about
            progression is on screen until the figures are real. */}
        {!loading && (
          <>
            {/* `.rowline` — the character block
                (`design/parts/Dashboard.body.html:3–6`). `Lv.N` is the highest stat
                level (§4.2), derived in the hook. */}
            <View>
              <Eyebrow>캐릭터</Eyebrow>
              <Text style={[styles.character, { color: colors.text }]}>
                Lv.<Text style={styles.characterNum}>{characterLevel}</Text>
              </Text>
            </View>

            {/* `.stats` — one card per configured stat, in `TUNING.stats` order. */}
            <View style={styles.stats}>
              {stats.map((card) => (
                <StatCard key={card.stat.id} card={card} />
              ))}
            </View>
          </>
        )}

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
                onSkip={(reason) => void logSkip(row.habit, reason)}
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
  screen: { padding: SPACE.xl, paddingBottom: TOAST_OVERLAY_CLEARANCE, gap: SPACE.lg },
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
  // `.sh` beside the `캐릭터` eyebrow — the level reads in mono, as the canvas's
  // `<span class="num">` does.
  character: { fontSize: FONT_SIZE.lg, fontWeight: '600', letterSpacing: -0.16 },
  characterNum: { fontFamily: FONT_FAMILY.mono, fontVariant: ['tabular-nums'] },
  // `.stats` (`design/_tokens.css:70–76`) — three equal columns; `flex: 1` with
  // `minWidth: 0` is RN's equivalent of the canvas's `minmax(0,1fr)`, so a long
  // 다음 레벨까지 line cannot widen its own card.
  stats: { flexDirection: 'row', gap: SPACE.md },
  statcard: {
    flex: 1,
    minWidth: 0,
    gap: 7,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACE.md + 2,
  },
  statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.xs },
  statName: { fontSize: FONT_SIZE.sm + 0.5, flexShrink: 1 },
  statLevel: {
    fontFamily: FONT_FAMILY.mono,
    fontVariant: ['tabular-nums'],
    fontSize: FONT_SIZE.md + 0.5,
    fontWeight: '600',
  },
  xpbar: { height: 4, borderRadius: 3, overflow: 'hidden' },
  xpfill: { height: '100%', borderRadius: 3 },
  statTo: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.mono },
  quests: { gap: 9 },
  qtop: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  qname: { fontSize: FONT_SIZE.md, fontWeight: '600', letterSpacing: -0.14, flexShrink: 1 },
  // `.qcue` — pushed to the row's trailing edge and clipped, so a long cue can never
  // squeeze the name or the heatmap.
  qcue: { fontSize: FONT_SIZE.sm, marginLeft: 'auto', maxWidth: 120, flexShrink: 1 },
  qbottom: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  // `.streak` (`design/_tokens.css:83`) — mono, muted, the smallest step. Tabular
  // numerals so the ribbon beside it does not shift as the count crosses ten.
  streak: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.mono,
    fontVariant: ['tabular-nums'],
  },
  // The strip carries `.ribbon`'s `flex: 1` up to the row, so the heatmap still takes
  // every pixel the one-tap control leaves.
  strip: { flex: 1, minWidth: 0 },
  // `.ribbon` already claims the slack with `flex: 1`; the control must not be
  // squeezed below §6.0's 44px tap target on a narrow row.
  onetap: { flexShrink: 0 },
  skiprow: { borderTopWidth: 1, paddingTop: SPACE.sm, marginTop: SPACE.xs },
});
