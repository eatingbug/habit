import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Banner,
  Button,
  Card,
  Chip,
  Eyebrow,
  Footnote,
  Heatmap,
  LogForm,
  TOAST_OVERLAY_CLEARANCE,
  ToastOverlay,
} from '@/components';
import { RETRY_LABEL, SIGN_OUT_LABEL } from '@/config/copy';
import { useSession } from '@/context/SessionContext';
import type { StatusLight } from '@/domain/statusLight';
import { useDashboard, type DashboardRow, type StatProgress } from '@/hooks/useDashboard';
import type { SkipReason } from '@/models';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '@/theme/tokens';

/**
 * Dashboard — SPEC §6.1; layout from `design/parts/Dashboard.body.html`.
 *
 * The artboard is the finished design, so it shows more than this screen renders. The
 * character header's 칭호 (`· 꾸준함`) is #39's — there is no titles engine to derive one
 * from, so the header shows the level alone. What ships here is the character header and
 * the stat cards with their XP bars (#17), the 상태등 and its 손볼 습관 N개 chip (#20),
 * and the row itself — name, stat tag, the `TUNING.heatmapDays` heatmap, the 🔥 streak
 * count (#14), and the row's `기록` button, which opens the log form in a modal with its
 * 실행취소 toast (#80).
 */

/**
 * The row's 상태등 (§4.6) — `design/parts/Dashboard.body.html:33` puts it first in
 * `.qtop`, as an 8px `.dot` coloured `.g` / `.a` / `.r` (`design/_tokens.css:54–55`).
 * A `personal_best` row swaps the dot for a ⭐ instead, which is what the canvas draws
 * (`design/parts/Star.body.html:19` · `:35`).
 *
 * **It is read, not pressed.** §6.1 (`docs/SPEC.md:899`) navigates a tap on the 🔴/🟡
 * to `reflect/[habitId]`, but no `app/reflect*` exists — that screen is #21's, and
 * `app.json:38` sets `typedRoutes: true`, so a link to a route that is not there does
 * not typecheck. #21 attaches the press; until then this renders as a glyph, with no
 * `Pressable` around it.
 *
 * The light is spoken rather than left as a coloured pixel: colour alone carries the
 * whole state here, so a screen reader would otherwise get nothing at all.
 */
function StatusDot({ light }: { light: StatusLight }) {
  const { colors } = useTheme();

  if (light === 'personal_best') {
    return (
      <Text style={styles.star} accessibilityLabel="최고 기록">
        ⭐
      </Text>
    );
  }

  const tone =
    light === 'intervention' ? colors.crit : light === 'caution' ? colors.warn : colors.good;
  const label =
    light === 'intervention' ? '손봐야 해요' : light === 'caution' ? '살펴보세요' : '괜찮아요';

  return <View style={[styles.dot, { backgroundColor: tone }]} accessibilityLabel={label} />;
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

function HabitRow({
  row,
  onPress,
  onOpenLog,
}: {
  row: DashboardRow;
  onPress: () => void;
  onOpenLog: () => void;
}) {
  const { colors } = useTheme();
  // Binary's floor is 1, so one row is the whole day: the control has nothing left to
  // append and reads as completed instead.
  const done = row.habit.kind === 'binary' && row.hasActivityToday;
  // A count habit past its floor can still log more, so the button stays pressable. The
  // pale `sel` shape says today's share is in.
  const floorMet = row.habit.kind === 'count' && row.progress.remaining === 0;
  const label = done ? '✓ 했어요' : '기록';

  return (
    <Card>
      {/* The navigating press target is the row *body* only (§6.1: tapping the row
          opens the habit). The 기록 control is its sibling, not its child — nested
          inside it, a click on web could reach both handlers and navigate away from
          the row the user is about to log into.

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
          <StatusDot light={row.statusLight} />
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
        {/* `Heatmap` is deliberately hidden from assistive tech (a ribbon is a summary
            of days, not 20 controls), so the press sits on this wrapper, outside the
            hidden subtree, with its own accessible name. */}
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${row.habit.name} 기록 보기`}
          style={styles.strip}
        >
          <Heatmap cells={row.cells} />
        </Pressable>
        <Button
          label={label}
          accessibilityLabel={`${row.habit.name} ${label}`}
          variant={done || floorMet ? 'sel' : 'pri'}
          tap
          disabled={done}
          onPress={onOpenLog}
          style={styles.logButton}
        />
      </View>
    </Card>
  );
}

/**
 * The row's 기록 modal (#80) — the shared `LogForm` (#79), under the same
 * `오늘 기록 추가 · 닫기` header the habit detail's fill panel uses. A successful write
 * closes it, and the 실행취소 toast below the modal confirms it. A failed write leaves
 * it open with the form's own banner and the inputs staged.
 *
 * The caller mounts it only while open, so closing it unmounts the form: the next open
 * starts from an empty note and the day's default amount.
 *
 * The backdrop is the card's sibling, not its parent. Nested inside a `Pressable`, a
 * click on the card's plain text could reach the backdrop on web and close the form.
 */
function LogModal({
  row,
  onLog,
  onSkip,
  onClose,
}: {
  row: DashboardRow;
  onLog: (actual: number, opts: { note: string }) => Promise<void>;
  onSkip: (reason: SkipReason, opts: { note: string }) => Promise<void>;
  onClose: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="기록 닫기"
        />
        <Card style={styles.modalCard}>
          <View style={styles.rowline}>
            <Eyebrow>오늘 기록 추가</Eyebrow>
            <Button label="닫기" variant="ghost" onPress={onClose} />
          </View>
          <LogForm
            habit={row.habit}
            affordances={row}
            dayLabel="오늘"
            onLog={onLog}
            onSkip={onSkip}
            onSaved={onClose}
          />
        </Card>
      </View>
    </Modal>
  );
}

export default function Dashboard() {
  const { colors, preference, toggle } = useTheme();
  const router = useRouter();
  const { signOut } = useSession();
  const {
    rows,
    stats,
    characterLevel,
    shaky,
    loading,
    failure,
    logActivity,
    logSkip,
    toast,
    undoLast,
  } = useDashboard();
  /**
   * The habit whose 기록 modal is open. An id, not the row: the form reads the row from
   * the latest `rows`, so its affordances are never a stale snapshot.
   */
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const loggingRow = rows.find((row) => row.habit.id === loggingId);

  return (
    <View style={[styles.fill, { backgroundColor: colors.surface }]}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.screen}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>대시보드</Text>
          <View style={styles.headerControls}>
            <Pressable
              onPress={toggle}
              style={[styles.toggle, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
            >
              <Text style={[styles.toggleText, { color: colors.muted }]}>
                {preference === 'system' ? '자동' : preference === 'light' ? '라이트' : '다크'}
              </Text>
            </Pressable>
            {/* 로그아웃은 게이트를 되돌리는 유일한 손잡이다 — 누르면 `<Stack>` 이 통째로
                언마운트되고 이전 사용자의 화면은 남지 않는다 (AC 3). */}
            <Pressable
              onPress={() => void signOut()}
              style={[styles.toggle, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
            >
              <Text style={[styles.toggleText, { color: colors.muted }]}>{SIGN_OUT_LABEL}</Text>
            </Pressable>
          </View>
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
            <View style={styles.rowline}>
              <View>
                <Eyebrow>캐릭터</Eyebrow>
                <Text style={[styles.character, { color: colors.text }]}>
                  Lv.<Text style={styles.characterNum}>{characterLevel}</Text>
                </Text>
              </View>
              {/* `손볼 습관 N개` — `design/parts/Dashboard.body.html:7`. The canvas
                  draws it `warnc` when there is something to do and `goodc` at zero
                  (`design/parts/Star.body.html:7`), so the chip's own colour is the
                  "nothing to fix" news; the number is the hook's. */}
              <Chip label={`손볼 습관 ${shaky}개`} variant={shaky > 0 ? 'warn' : 'good'} />
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

        {/* 실패는 실패로 보여야 하고, 다시 시도할 수단이 같이 있어야 한다 — 문구도 다시
            시도가 무엇인지도 훅의 `failure` 가 정한다 (#51). 읽기 실패와 실행취소의
            실패가 같은 자리를 쓴다. 기록의 실패는 모달의 폼 안에서 말한다 (#80). */}
        {failure != null && (
          <Banner trailing={<Button label={RETRY_LABEL} onPress={failure.retry} />}>
            {failure.message}
          </Banner>
        )}

        {loading ? (
          <Text style={[styles.notice, { color: colors.muted }]}>불러오는 중…</Text>
        ) : rows.length === 0 && failure == null ? (
          /* `failure` 가 있으면 이 문장을 쓰지 않는다. 불러오지 못한 것을 "아직 습관이
             없습니다" 라고 말하면 앱이 사용자 기록이 없다고 주장하는 셈이다. */
          <Text style={[styles.notice, { color: colors.muted }]}>아직 습관이 없습니다.</Text>
        ) : (
          <View style={styles.quests}>
            {rows.map((row) => (
              <HabitRow
                key={row.habit.id}
                row={row}
                onPress={() => router.push(`/habit/${row.habit.id}`)}
                onOpenLog={() => setLoggingId(row.habit.id)}
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

      {loggingRow != null && (
        <LogModal
          key={loggingRow.habit.id}
          row={loggingRow}
          onLog={(actual, opts) => logActivity(loggingRow.habit, actual, opts)}
          onSkip={(reason, opts) => logSkip(loggingRow.habit, reason, opts)}
          onClose={() => setLoggingId(null)}
        />
      )}

      {/* B6 — the undo toast doubles as the "it registered" confirmation the modal's
          close otherwise lacks (§6.2), so it must not scroll out of reach. */}
      <ToastOverlay toast={toast} onUndo={() => void undoLast()} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { padding: SPACE.xl, paddingBottom: TOAST_OVERLAY_CLEARANCE, gap: SPACE.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // `.rowline` (`design/_tokens.css:48`) — the character block and the 손볼 습관 chip on
  // one baseline, the chip pushed to the trailing edge.
  rowline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  headerControls: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
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
  // `.dot` (`design/_tokens.css:54`) — 8px, never shrunk by a long habit name.
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  // The ⭐ stands in the dot's place, at the canvas's 12px
  // (`design/parts/Star.body.html:19`).
  star: { fontSize: 12, flexShrink: 0 },
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
  // every pixel the 기록 control leaves.
  strip: { flex: 1, minWidth: 0 },
  // `.ribbon` already claims the slack with `flex: 1`; the control must not give up its
  // width to it on a narrow row. (`TAP_TARGET`, `src/theme/tokens.ts`, is a `minHeight`
  // only — nothing enforces a width floor here.)
  logButton: { flexShrink: 0 },
  modalRoot: { flex: 1, justifyContent: 'center', padding: SPACE.xl },
  modalCard: { width: '100%', maxWidth: 480, alignSelf: 'center' },
});
