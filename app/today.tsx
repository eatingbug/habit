import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Banner,
  Button,
  Card,
  Chip,
  Eyebrow,
  Footnote,
  Hint,
  NumberField,
  SegmentedControl,
  Toast,
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
 * The artboard is the finished design, so it shows more than this screen renders. The
 * skip chips (#12), tap-to-edit (#13), the 어제 stepper (#14), free logs (#16), the
 * reward toast (#17) and the at-risk save banner (#18) each belong to a later ticket
 * and are left out rather than stubbed — a hardcoded number would read as data the
 * user does not have.
 *
 * What ships here is the low-friction path: pick a habit, press one control (or a
 * quick chip), and see the row appear in the feed with the day's state recomputed.
 * Every figure on screen — the prefilled amount, the chips, the progress line and the
 * staged preview — comes from `useToday`, which computes it from the rows through the
 * domain. Nothing here re-derives a floor comparison of its own.
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

/**
 * The quick-add chip's label (B2) — canvas copy, derived from the amount so the hook
 * can keep handing plain numbers. `+1` is the nudge, the floor reads "최소만큼", and
 * anything else is the day's previous amount.
 */
function chipLabel(amount: number, floor: number): string {
  if (amount === 1) return '+1';
  if (amount === floor) return '최소만큼';
  return `지난번 ${amount}`;
}

/**
 * The B3 time override → an ISO `timestamp`. Built from the **local** wall clock the
 * user typed, because that is what the feed reads back (`clockOf`); a naive
 * `${date}T${hh}:${mm}Z` would show a time offset from what they entered. `date` is
 * untouched — the row still belongs to this day (§3.3).
 *
 * `undefined` for an out-of-range entry, which leaves the default "now" in place.
 */
function overrideTimestamp(date: string, hour: string, minute: string): string | undefined {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return undefined;
  if (h < 0 || h > 23 || m < 0 || m > 59) return undefined;

  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, h, m).toISOString();
}

function Composer({
  row,
  date,
  previewOf,
  onLog,
}: {
  row: TodayHabitRow;
  date: string;
  previewOf: (staged: number) => { sum: number; state: DayState } | null;
  onLog: (actual: number, opts?: { timestamp?: string }) => Promise<void>;
}) {
  const { colors } = useTheme();
  /**
   * `null` means "untouched", so the field falls back to `row.defaultAmount` — the
   * floor on the day's first record, the day's previous amount afterwards (B2). A log
   * resets it to `null`, which is what re-prefills the field with the new default
   * rather than leaving the old number staged.
   */
  const [staged, setStaged] = useState<string | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isCount = row.habit.kind === 'count';
  const unit = row.habit.floorUnit;
  const amount = staged ?? `${row.defaultAmount}`;
  const parsed = Number(amount);
  // §3.3: an activity row is `actual > 0`. A sub-floor amount is perfectly valid — it
  // sums toward the day (§4.1) — but zero is not an activity row at all, so the only
  // control that could write one is disabled. The path for "didn't do it" is a skip
  // row with a reason (#12).
  const canLog = amount.trim().length > 0 && Number.isFinite(parsed) && parsed > 0;

  // Binary's floor is 1, so one row is the whole day: nothing is left to append and
  // the control reads as completed (AC — 완료 후 비활성).
  const binaryDone = !isCount && row.hasActivityToday;
  const oneTapLabel = isCount
    ? row.hasActivityToday
      ? '+1 더'
      : `✓ 최소만큼 했어요 (+${row.habit.floor}${unit})`
    : binaryDone
      ? '✓ 했어요'
      : '✓ 완료';

  const preview = canLog ? previewOf(parsed) : null;
  const { sum, floor, remaining } = row.progress;

  async function submit(actual: number) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onLog(actual, {
        timestamp: timeOpen ? overrideTimestamp(date, hour, minute) : undefined,
      });
      // Only the amount resets. An open time reveal is an explicit override the user
      // chose, and a second log of the same session belongs at the same time.
      setStaged(null);
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

      {/* B1 — the one-tap control, first and widest: the highest-frequency action is
          the cheapest one on the screen. */}
      <Button
        label={oneTapLabel}
        variant="pri"
        block
        disabled={saving || binaryDone}
        onPress={() => submit(row.oneTapAmount)}
      />

      {isCount && (
        <>
          <View style={styles.amountRow}>
            <NumberField
              accessibilityLabel="기록할 양"
              value={amount}
              onChangeText={(next) => {
                setStaged(next);
                setError(null);
              }}
              placeholder={`${row.habit.floor}`}
            />
            <Text style={[styles.unit, { color: colors.muted }]}>{unit}</Text>
            <Button
              label="기록"
              disabled={!canLog || saving}
              onPress={() => submit(parsed)}
              tap
              style={styles.grow}
            />
          </View>

          {/* B2 — quick chips. They stage the amount; 기록 commits it, so a mis-tap
              costs nothing. */}
          <View style={styles.chipRow}>
            <Text style={[styles.lbl, { color: colors.faint }]}>빠른 추가</Text>
            {row.quickChips.map((chip) => (
              <Button
                key={chip}
                label={chipLabel(chip, row.habit.floor)}
                mono
                onPress={() => setStaged(`${chip}`)}
              />
            ))}
          </View>

          {/* C7a — progress-to-floor, and what the staged amount would make of the
              day. The state comes from `previewOf`, i.e. from the real classifier. */}
          <View style={styles.progress}>
            <Text style={[styles.progressText, { color: colors.muted }]}>
              오늘 {sum}/{floor}
              {unit}
            </Text>
            <Text
              style={[styles.progressText, { color: remaining === 0 ? colors.done : colors.muted }]}
            >
              {remaining === 0 ? '오늘 몫 완료 ✓' : `${remaining}${unit} 남음`}
            </Text>
          </View>
          {preview != null && (
            <Hint>
              → {preview.sum}/{floor}
              {unit} {stateLabel(preview.state)}
            </Hint>
          )}
        </>
      )}

      {/* B3 — the time picker is collapsed behind "🕑 지금 HH:MM" and revealed only to
          override. `timestamp` is ordering and tiebreak only (§3.3), so this is rare. */}
      {timeOpen ? (
        <View style={styles.amountRow}>
          <NumberField
            accessibilityLabel="시"
            value={hour}
            onChangeText={setHour}
            placeholder="시"
          />
          <Text style={[styles.unit, { color: colors.muted }]}>:</Text>
          <NumberField
            accessibilityLabel="분"
            value={minute}
            onChangeText={setMinute}
            placeholder="분"
          />
          <Button
            label="지금으로"
            variant="ghost"
            onPress={() => {
              setTimeOpen(false);
              setHour('');
              setMinute('');
            }}
            style={styles.grow}
          />
        </View>
      ) : (
        <Button
          label={`🕑 지금 ${clockOf(new Date().toISOString())}`}
          variant="ghost"
          onPress={() => {
            // Prefilled from now, so the revealed fields show what the collapsed
            // label promised — and an empty field can never stamp local midnight.
            const at = new Date();
            setHour(`${at.getHours()}`.padStart(2, '0'));
            setMinute(`${at.getMinutes()}`.padStart(2, '0'));
            setTimeOpen(true);
          }}
          style={styles.time}
        />
      )}

      {row.day?.state === 'partial' && <Footnote>최소엔 못 미침, 실패 아님</Footnote>}
      {error != null && <Banner>{error}</Banner>}
    </Card>
  );
}

export default function Today() {
  const { colors } = useTheme();
  const {
    date,
    rows,
    feed,
    questsDone,
    logCount,
    xpToday,
    loading,
    logActivity,
    previewOf,
    toast,
    undoLast,
  } = useToday();
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
            date={date}
            previewOf={(stagedAmount) => previewOf(selected.habit.id, stagedAmount)}
            onLog={(actual, opts) => logActivity(selected.habit.id, actual, opts)}
          />
        </>
      )}

      {/* B6 — the undo toast doubles as the "it registered" confirmation that one-tap
          logging otherwise lacks (§6.2). */}
      {toast != null && (
        <Toast message={toast.message} detail={toast.detail} onUndo={() => void undoLast()} />
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
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md - 2, flexWrap: 'wrap' },
  lbl: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.4 },
  progress: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md },
  progressText: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.mono,
    fontVariant: ['tabular-nums'],
  },
  time: { alignSelf: 'flex-start' },
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
