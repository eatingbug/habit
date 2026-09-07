import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Banner,
  Button,
  Card,
  Chip,
  Eyebrow,
  Footnote,
  NumberField,
  SegmentedControl,
} from '@/components';
import { isFloorMet } from '@/domain/classify';
import { weekdayOf } from '@/domain/dates';
import { useToday, type TodayFeedItem, type TodayHabitRow } from '@/hooks/useToday';
import type { DayState } from '@/models';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE, SPACE } from '@/theme/tokens';

/**
 * Today — SPEC §6.2; layout from `design/parts/Today.body.html`, copy from the
 * design canvas.
 *
 * The artboard is the finished design, so it shows more than this screen renders.
 * One-tap `+최소량`/`✓` with its undo toast and the progress-to-floor bar (#11), the
 * skip chips (#12), tap-to-edit (#13), the 어제 stepper (#14), free logs (#16), the
 * reward toast (#17) and the at-risk save banner (#18) each belong to a later ticket
 * and are left out rather than stubbed — a hardcoded number would read as data the
 * user does not have.
 *
 * What ships here is the plain path: pick a habit, enter an amount (or press ✓ once),
 * and see the row appear in the feed with the day's state recomputed. Every figure on
 * screen comes from `useToday`, which computes it from the rows through the domain.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** "3월 1일 일요일" — the artboard's `.eyebrow`. */
function headerDate(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${month}월 ${day}일 ${WEEKDAYS[weekdayOf(date)]}요일`;
}

/** The row's local wall-clock time — `timestamp` is UTC, the user reads their day. */
function clockOf(timestamp: string): string {
  const at = new Date(timestamp);
  return `${`${at.getHours()}`.padStart(2, '0')}:${`${at.getMinutes()}`.padStart(2, '0')}`;
}

/**
 * Day-state → screen copy (`scratchpad/copy-map.md`). The canvas never shows a domain
 * term: `partial` reads "조금 함", and its footnote says outright that it is not a
 * failure — the fairness rule of §4.1 made visible.
 */
function stateLabel(state: DayState): string {
  switch (state) {
    case 'done':
      return '성공';
    case 'over':
      return '성공 · 목표 초과';
    case 'partial':
      return '조금 함';
    case 'skip':
      return '못 함';
    case 'missed':
      return '기록 없음 · 실패';
    case 'pending':
      // The map has no chip copy for `pending` ("오늘" is the heatmap legend), so this
      // one is ours. `missed` and `skip` cannot occur on today at all — they are here
      // only so the switch stays exhaustive.
      return '아직 기록 없음';
  }
}

function FeedRow({ item }: { item: TodayFeedItem }) {
  const { colors } = useTheme();
  const amount =
    item.habit.kind === 'binary' ? '✓ 완료' : `${item.entry.actual}${item.habit.floorUnit}`;

  return (
    <View style={[styles.feedRow, { borderColor: colors.border }]}>
      <Text style={[styles.feedTime, { color: colors.faint }]}>
        {clockOf(item.entry.timestamp)}
      </Text>
      <Text style={[styles.feedName, { color: colors.text }]} numberOfLines={1}>
        {item.habit.name}
      </Text>
      <Text style={[styles.feedAmount, { color: colors.done }]}>{amount}</Text>
    </View>
  );
}

function Composer({
  row,
  onLog,
}: {
  row: TodayHabitRow;
  onLog: (actual: number) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = Number(amount);
  // §3.3: an activity row is `actual > 0`. A sub-floor amount is perfectly valid — it
  // sums toward the day (§4.1) — but zero is not an activity row at all, so the only
  // control that could write one is disabled. The path for "didn't do it" is a skip
  // row with a reason (#12).
  const canLog = amount.trim().length > 0 && Number.isFinite(parsed) && parsed > 0;

  async function submit(actual: number) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onLog(actual);
      setAmount('');
    } catch {
      setError('기록하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <View style={styles.composerHead}>
        <Text style={[styles.composerName, { color: colors.text }]} numberOfLines={1}>
          {row.habit.name}
        </Text>
        {row.day != null && (
          <Chip
            label={stateLabel(row.day.state)}
            variant={isFloorMet(row.day.state) ? 'good' : 'neutral'}
          />
        )}
      </View>

      {row.habit.kind === 'count' ? (
        <View style={styles.amountRow}>
          <NumberField
            accessibilityLabel="기록할 양"
            value={amount}
            onChangeText={(next) => {
              setAmount(next);
              setError(null);
            }}
            placeholder={`${row.habit.floor}`}
          />
          <Text style={[styles.unit, { color: colors.muted }]}>{row.habit.floorUnit}</Text>
          <Button
            label="기록"
            variant="pri"
            disabled={!canLog || saving}
            onPress={() => submit(parsed)}
            style={styles.grow}
          />
        </View>
      ) : (
        <Button
          label="✓ 완료"
          variant="pri"
          block
          disabled={saving}
          onPress={() => submit(1)}
        />
      )}

      {row.day?.state === 'partial' && <Footnote>최소엔 못 미침, 실패 아님</Footnote>}
      {error != null && <Banner>{error}</Banner>}
    </Card>
  );
}

export default function Today() {
  const { colors } = useTheme();
  const { date, rows, feed, questsDone, logCount, xpToday, loading, logActivity } = useToday();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = rows.find((row) => row.habit.id === selectedId) ?? rows[0];

  return (
    <ScrollView
      style={{ backgroundColor: colors.surface }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.rowline}>
        <View>
          <Eyebrow>{headerDate(date)}</Eyebrow>
          <Text style={[styles.heading, { color: colors.text }]}>오늘</Text>
        </View>
        <View>
          <Text style={[styles.tally, { color: colors.muted }]}>
            완료 {questsDone} · 로그 {logCount}
          </Text>
          <Text style={[styles.tally, { color: colors.text }]}>+{xpToday} XP</Text>
        </View>
      </View>

      {loading ? (
        <Text style={[styles.notice, { color: colors.muted }]}>불러오는 중…</Text>
      ) : rows.length === 0 ? (
        <Text style={[styles.notice, { color: colors.muted }]}>
          아직 습관이 없습니다. 먼저 습관을 하나 만들어 주세요.
        </Text>
      ) : (
        <>
          {/* The target selector. "자유 로그" joins it in #16. */}
          {rows.length > 1 && (
            <SegmentedControl
              label="기록 대상"
              options={rows.map((row) => ({ value: row.habit.id, label: row.habit.name }))}
              value={selected.habit.id}
              onChange={setSelectedId}
            />
          )}

          {/* Keyed by habit: switching targets remounts, so a staged amount can never
              be logged against the habit it was not typed for. */}
          <Composer
            key={selected.habit.id}
            row={selected}
            onLog={(actual) => logActivity(selected.habit.id, actual)}
          />
        </>
      )}

      <Eyebrow>오늘 기록</Eyebrow>
      {feed.length === 0 ? (
        <Text style={[styles.notice, { color: colors.muted }]}>오늘 기록이 아직 없어요.</Text>
      ) : (
        <View style={styles.feed}>
          {feed.map((item) => (
            <FeedRow key={item.entry.id} item={item} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.lg },
  rowline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACE.md + 2,
  },
  heading: { fontSize: FONT_SIZE.lg, fontWeight: '600', letterSpacing: -0.16 },
  tally: {
    fontSize: FONT_SIZE.sm,
    textAlign: 'right',
    fontFamily: FONT_FAMILY.mono,
    fontVariant: ['tabular-nums'],
  },
  notice: { fontSize: FONT_SIZE.base },
  composerHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  composerName: { fontSize: FONT_SIZE.md, fontWeight: '600', letterSpacing: -0.14, flexShrink: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md - 2 },
  unit: { fontSize: FONT_SIZE.sm },
  grow: { flex: 1 },
  feed: { gap: SPACE.sm },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    borderBottomWidth: 1,
    paddingVertical: SPACE.md,
  },
  feedTime: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.mono,
    fontVariant: ['tabular-nums'],
  },
  feedName: { fontSize: FONT_SIZE.base, flexShrink: 1 },
  feedAmount: {
    marginLeft: 'auto',
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
    fontFamily: FONT_FAMILY.mono,
    fontVariant: ['tabular-nums'],
  },
});
