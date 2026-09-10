import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Banner,
  Button,
  Card,
  Chip,
  Eyebrow,
  Field,
  Footnote,
  Heatmap,
  Hint,
  NumberField,
  Pill,
  SegmentedControl,
  SkipReasonChips,
  StaticField,
  TextField,
  TOAST_OVERLAY_CLEARANCE,
  ToastOverlay,
} from '@/components';
import { deleteConfirmLines, SKIP_REASON_LABELS } from '@/config/copy';
import {
  useHabitDetail,
  type DesignBox,
  type DetailDeleteEffect,
  type DetailPanel,
  type GrowthChart,
  type JournalDay,
  type JournalRow,
} from '@/hooks/useHabitDetail';
import { restampedAtLocalTime } from '@/lib/device';
import type { DayState, Habit, HabitEntry, SkipReason } from '@/models';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE, TAP_TARGET } from '@/theme/tokens';

/**
 * Habit detail — SPEC §6.3; layout and copy from `design/parts/HabitDetail.body.html`,
 * `Established.body.html` and `YesNo.body.html`.
 *
 * Every judgment on this screen is `useHabitDetail`'s: the pill figures, which panel
 * comes first, each bar's height and each reference line's position as a percentage of
 * one shared scale, which week wears the ⭐, which journal rows may be re-stamped,
 * whether a delete needs a confirm and whether that confirm quotes a streak.
 * `jest.config.js` matches `src/**` only and there are no render tests, so a condition
 * written here is a condition nothing asserts — this file applies **words** to the
 * hook's fields and decides nothing.
 *
 * The artboards are the finished design, so they show more than this screen renders.
 * Each of these is a later ticket's, and is left out rather than stubbed:
 * - the status-light dot and the 붙는 중 / 몸에 붙음 lifecycle chip — `deriveStatusLight`
 *   is #20's;
 * - the 흐름 ↓ · 가장 많던 주 · 최소 대비 pills and the 하락 banner — #20 (trend);
 * - the 회고 button beside that banner — #21 (the reflection screen);
 * - the 주간 XP pill and `YesNo`'s milestone bars — #17 owns every XP surface, and this
 *   screen computes no XP;
 * - the 빠짐없이 pill — #18 (engagement streak);
 * - the journal's free-log lines (메모 · 성취 · 기분 · 아이디어) — #16.
 *
 * One canvas gesture of **this** ticket is absent: tapping a heatmap cell. `Heatmap`
 * is one summary hidden from assistive tech, and its cells are ~15px wide — under
 * §6.0's 44px minimum — which is why the Dashboard long-presses the whole ribbon
 * instead of a cell. The two controls that do open a composer carry the same §6.3
 * gate over a longer reach: the journal's own line for a date (12 weeks of days
 * against the ribbon's `TUNING.heatmapDays`), and `+ 지난 날 기록 추가`, which the hook
 * points at the most recent `missed` day (`view.nextBackfillDate`).
 *
 * One date the ribbon shows is therefore unreachable: an **empty day inside a pause**,
 * which `dayStates` omits (ADR-0003's asymmetry) while `heatCells` still draws its
 * slot, and which `isBackfillableDate` does allow a write to. It is not `missed`
 * either — it has no state at all — so the button never names it. Filling it needs the
 * journal to hold a line for a date the classifier has no opinion about: a rule, and
 * the hook's, not this file's.
 */

/** The journal's date column — `7/8` (`HabitDetail.body.html:46`). */
function shortDate(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${month}/${day}`;
}

/** The same date in prose, for a sentence that has to name the day it changes. */
function monthDay(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${month}월 ${day}일`;
}

/** The row's local wall-clock time — `timestamp` is UTC, the user reads their day. */
function clockOf(timestamp: string): string {
  const at = new Date(timestamp);
  return `${`${at.getHours()}`.padStart(2, '0')}:${`${at.getMinutes()}`.padStart(2, '0')}`;
}

/**
 * Day-state → this screen's chip word (`HabitDetail.body.html:46–50`,
 * `YesNo.body.html:52`/`:55`).
 *
 * The words are the **detail canvas's**, and two of them differ from `app/today.tsx`'s:
 * `over` reads `목표까지` here and `성공 · 목표 초과` there, because each artboard names
 * its own chip. Nothing is imported across screens for that reason.
 *
 * A binary habit says only whether it happened (`함` / `안 함`) — it has no amount, so
 * neither half of the count wording is true of it.
 *
 * `pending` has no canvas chip: it can only be today, still open. 캔버스 출처 없음 —
 * 신규 문구 `아직 기록 없음`, which `app/today.tsx` already uses for exactly this state.
 *
 * The delete confirm's `지운 뒤 …:` line resolves its label through this map as well,
 * and reaches only a subset of it. `done` and `over` never arrive there — the confirm
 * fires on `emptiesDay || carriesMiss || showsStreak`, and a delete leaving the day
 * floor-met passes none of the three: rows survive it (`emptiesDay` false); a
 * miss-carrying day holds no activity row (§4.1), so no delete off one can leave a
 * floor-met day (`carriesMiss` false); and a day that was floor-met before and stays
 * floor-met counts identically in `computeStreak`'s walk (`showsStreak` false). So
 * `over`'s `목표까지`, whose other half is the chip's `· 모두 12`, is never printed as a
 * confirm line without it.
 */
function stateWord(state: DayState, binary: boolean): string {
  switch (state) {
    case 'done':
      return binary ? '함' : '성공';
    case 'over':
      return binary ? '함' : '목표까지';
    case 'partial':
      return '조금 함';
    case 'skip':
      return binary ? '안 함' : '못 함';
    case 'missed':
      return '기록 없음 · 실패';
    case 'pending':
      return '아직 기록 없음';
  }
}

/**
 * The whole chip: the state word, then the day's total when there is one
 * (`성공 · 모두 5`). The amount half is the hook's `chipAmount`, which is already
 * absent on a binary habit and on a day with nothing recorded, and the reason half is
 * its `skipReason` — so neither is decided here.
 *
 * The canvas prints `모두 5` with no unit (`:46`, on a habit measured in 회), and this
 * follows it.
 */
function chipText(day: JournalDay, binary: boolean): string {
  const word = stateWord(day.state, binary);
  if (day.skipReason != null) return `${word} · ${SKIP_REASON_LABELS[day.skipReason]}`;
  if (day.chipAmount != null) return `${word} · 모두 ${day.chipAmount}`;
  return word;
}

/** `.statechip` — one hue per day-state, as a tint the way `Banner` makes its own. */
function StateChip({ label, state }: { label: string; state: DayState }) {
  const { colors } = useTheme();
  const hue =
    state === 'done'
      ? colors.done
      : state === 'over'
        ? colors.over
        : state === 'partial'
          ? colors.partial
          : state === 'skip' || state === 'missed'
            ? colors.skip
            : colors.faint;

  return (
    <View
      style={[
        styles.statechip,
        // `.sc-missed` is the one outlined chip: the miss tint plus a solid miss
        // border, the same outline/fill split the heatmap uses for 기록 없음 vs 안 함.
        state === 'missed'
          ? { backgroundColor: colors.missed, borderColor: colors.skip }
          : { borderColor: 'transparent' },
      ]}
    >
      {state !== 'missed' && (
        <View style={[styles.tint, { backgroundColor: hue }]} pointerEvents="none" />
      )}
      <Text style={[styles.statechipText, { color: hue }]}>{label}</Text>
    </View>
  );
}

/** One journal row's amount column — §3.3's discriminator, the reason before the kind. */
function amountText(entry: HabitEntry, habit: Habit): string {
  if (entry.skipReason != null) return '건너뜀';
  return habit.kind === 'binary' ? '✓' : `+${entry.actual}`;
}

/**
 * The two stat pills the canvas keeps (`HabitDetail.body.html:10`/`:12`).
 *
 * `성공률` shows `—` when the hook hands back `null`: §4.4's minimum-sample guard means
 * there is not yet enough resolved history to state a rate, and `0%` would read as a
 * score rather than as silence.
 */
function StatPills({ streak, successRate }: { streak: number; successRate: number | null }) {
  return (
    <View style={styles.pills}>
      <Pill label="연속" value={`${streak}`} unit="일" />
      <Pill
        label="성공률"
        value={successRate == null ? '—' : `${Math.round(successRate * 100)}`}
        unit={successRate == null ? undefined : '%'}
      />
    </View>
  );
}

/**
 * The weekly growth panel (§6.3 C4) — `HabitDetail.body.html:22–35`, and the same
 * chart carried by `Established.body.html:16–35`, whose `.chartcard.primary` surface it
 * takes when the habit is established and the panel leads the screen.
 *
 * Every figure is already a percentage of one scale (`GrowthChart`), so a reference
 * line cannot be drawn outside the chart it annotates and no geometry is computed here.
 */
function GrowthPanel({ chart, primary }: { chart: GrowthChart; primary: boolean }) {
  const { colors } = useTheme();

  return (
    <Card primary={primary}>
      <View style={styles.chHead}>
        <Eyebrow>주마다 한 양 (최근 {chart.bars.length}주)</Eyebrow>
        <Text style={[styles.sub, { color: colors.muted }]}>최고 {chart.best}</Text>
      </View>

      <View
        style={styles.chart}
        // The bars are a shape, not 12 readouts; the two lines under them say the same
        // thing in words, so the chart is announced once as its own summary.
        accessibilityLabel={`주마다 한 양, 최근 ${chart.bars.length}주. 최고 ${chart.best}`}
      >
        {chart.targetLine != null && (
          <View style={[styles.refline, { bottom: `${chart.targetLine}%`, borderColor: colors.accent }]}>
            <Text style={[styles.reflineLabel, { color: colors.accentInk, backgroundColor: primary ? colors.surface2 : colors.surface }]}>
              목표 주 {chart.weeklyTarget}
            </Text>
          </View>
        )}
        <View style={[styles.refline, { bottom: `${chart.floorLine}%`, borderColor: colors.borderStrong }]}>
          <Text style={[styles.reflineLabel, { color: colors.faint, backgroundColor: primary ? colors.surface2 : colors.surface }]}>
            최소 주 {chart.weeklyFloor}
          </Text>
        </View>

        {chart.bars.map((bar) => (
          <View key={bar.weeksAgo} style={[styles.bar, { backgroundColor: colors.inset }]}>
            {bar.best && <Text style={styles.star}>⭐</Text>}
            <View
              style={[
                styles.barFill,
                { height: `${bar.height}%`, backgroundColor: bar.best ? colors.accent : colors.done },
              ]}
            />
            {/* `이번` is the week `today` falls in (`:33`); the rest count backwards. */}
            <Text style={[styles.wk, { color: colors.faint }]}>
              {bar.weeksAgo === 0 ? '이번' : bar.weeksAgo}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

/**
 * The Forming expectation panel (§6.3 C7b) — `HabitDetail.body.html:16–20`, with the
 * fuller hint from `YesNo.body.html:40`, which is the same panel said at length.
 *
 * The bar's width is the hook's clamped `ratio`; the unclamped day count is what the
 * heading reads, so day 80 says `80일째 / 보통 66일` beside a full bar rather than one
 * that overflows.
 */
function FormingPanel({ days, expectedDays, ratio }: { days: number; expectedDays: number; ratio: number }) {
  const { colors } = useTheme();

  return (
    <Card>
      <View style={styles.chHead}>
        <Eyebrow>아직 붙는 중 — 보통 두 달쯤 걸려요</Eyebrow>
        <Text style={[styles.sub, { color: colors.muted }]}>
          {days}일째 / 보통 {expectedDays}일
        </Text>
      </View>
      <View style={[styles.xpbar, { backgroundColor: colors.inset }]}>
        <View style={[styles.xpbarFill, { width: `${ratio * 100}%`, backgroundColor: colors.accent }]} />
      </View>
      <Hint>
        날짜가 아니라 <Text style={{ color: colors.text, fontWeight: '600' }}>실제로 한 날 수</Text>로
        셉니다. 좀 더디더라도 실패한 게 아니라 아직 붙는 중인 거예요.
      </Hint>
    </Card>
  );
}

/**
 * The design box (§6.3, AC 8) — `HabitDetail.body.html:37–42`, its 목표 row from
 * `Established.body.html:64`, and its empty copy and binary 최소량 row from
 * `YesNo.body.html:45–47`.
 *
 * The form reuses the creation form's inputs (`app/habit/new.tsx`) but re-derives no
 * validation: `saveDesign` returns the per-field messages, and nothing is written when
 * it does. Whether the amount inputs appear at all is `design.editsAmounts`.
 */
function DesignPanel({
  design,
  onSave,
}: {
  design: DesignBox;
  onSave: (patch: {
    cue: string | null;
    identity: string | null;
    floor?: number;
    floorUnit?: string;
    target?: number | null;
  }) => Promise<{ floor?: string; floorUnit?: string; target?: string } | null>;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [cue, setCue] = useState(design.cue ?? '');
  const [identity, setIdentity] = useState(design.identity ?? '');
  const [floor, setFloor] = useState(`${design.floor}`);
  const [floorUnit, setFloorUnit] = useState(design.floorUnit);
  const [target, setTarget] = useState(design.target == null ? '' : `${design.target}`);
  const [errors, setErrors] = useState<{ floor?: string; floorUnit?: string; target?: string }>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    Keyboard.dismiss();
    setSaving(true);
    setSaveError(null);
    try {
      const found = await onSave({
        // A blank box clears the field; both are optional by design (§5).
        cue: cue.trim().length > 0 ? cue : null,
        identity: identity.trim().length > 0 ? identity : null,
        // Omitted entirely for a binary habit, whose amounts this form never showed:
        // an absent field leaves the stored value alone (`DesignPatch`).
        ...(design.editsAmounts
          ? { floor: Number(floor), floorUnit, target: target.trim().length > 0 ? Number(target) : null }
          : {}),
      });
      setErrors(found ?? {});
      if (found == null) setEditing(false);
    } catch {
      setSaveError('저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.designbox, { borderColor: colors.border }]}>
      <View style={[styles.dhead, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <Eyebrow>지금 이렇게 하기로 했어요</Eyebrow>
        <Button
          label={editing ? '닫기' : '수정'}
          variant="ghost"
          onPress={() => setEditing((open) => !open)}
        />
      </View>

      {editing ? (
        <View style={styles.dform}>
          <Field label="신호 — 언제·어디서 할지" required={false}>
            <TextField
              accessibilityLabel="신호"
              value={cue}
              onChangeText={setCue}
              placeholder="예: 아침 커피 마신 뒤, 문틀 바에서"
            />
          </Field>

          {design.editsAmounts && (
            <>
              <Field label="최소량" required error={errors.floor ?? errors.floorUnit}>
                <View style={styles.amountRow}>
                  <NumberField
                    accessibilityLabel="최소량"
                    value={floor}
                    onChangeText={setFloor}
                    placeholder="5"
                    invalid={errors.floor != null}
                  />
                  <TextField
                    accessibilityLabel="단위"
                    value={floorUnit}
                    onChangeText={setFloorUnit}
                    placeholder="회"
                    invalid={errors.floorUnit != null}
                    style={styles.grow}
                  />
                </View>
              </Field>

              <Field
                label="목표"
                required={false}
                error={errors.target}
                hint="더 하고 싶은 양 · 안 채워도 괜찮아요"
              >
                <View style={styles.amountRow}>
                  <NumberField
                    accessibilityLabel="목표"
                    value={target}
                    onChangeText={setTarget}
                    placeholder="10"
                    invalid={errors.target != null}
                  />
                  {/* The target shares the floor's unit — one source, never re-typed. */}
                  <StaticField
                    text={floorUnit.trim().length > 0 ? floorUnit.trim() : '단위'}
                    muted={floorUnit.trim().length === 0}
                    style={styles.grow}
                  />
                </View>
              </Field>
            </>
          )}

          <Field label="이유 — 어떤 사람이 되고 싶은지" required={false}>
            <TextField
              accessibilityLabel="이유"
              value={identity}
              onChangeText={setIdentity}
              placeholder="예: 나는 매일 몸을 쓰는 사람이니까"
            />
          </Field>

          {saveError != null && <Banner>{saveError}</Banner>}
          <Button label="저장" variant="pri" block disabled={saving} onPress={() => void submit()} />
        </View>
      ) : (
        <>
          <DesignRow label="언제" value={design.cue} empty="아직 안 정함 — 이것부터 정해 보길 권합니다" />
          <DesignRow
            label="최소량"
            // A binary habit has no amount to state, so the row says what it has
            // instead of a number it would have to invent (`YesNo.body.html:46`).
            value={
              design.editsAmounts
                ? `하루 ${design.floor}${design.floorUnit}`
                : '없음 — 했다 / 안 했다'
            }
          />
          {design.target != null && (
            <DesignRow label="목표" value={`하루 ${design.target}${design.floorUnit}`} />
          )}
          <DesignRow label="이유" value={design.identity} empty="아직 안 적음" />
        </>
      )}
    </View>
  );
}

/** `.drow` — a key column and its value, or the canvas's own empty line in the miss hue. */
function DesignRow({ label, value, empty }: { label: string; value?: string; empty?: string }) {
  const { colors } = useTheme();
  const filled = value != null && value.length > 0;

  return (
    <View style={[styles.drow, { borderColor: colors.border }]}>
      <Text style={[styles.dk, { color: colors.faint }]}>{label}</Text>
      {/* `.dv.empty` — an unfilled hypothesis reads in the miss hue and italic, which
          is the canvas saying it is the next thing worth doing, not an error. */}
      <Text
        style={[
          styles.dv,
          filled ? { color: colors.text } : [styles.dvEmpty, { color: colors.crit }],
        ]}
      >
        {filled ? value : empty}
      </Text>
    </View>
  );
}

/**
 * The composer for one journal date — the append path (§6.3), opened from the day it
 * writes to and closing over that date entirely.
 *
 * It states nothing about *when* the row lands. On a past date the write is noon-pinned
 * and on today it is stamped now (`useQuickLog`), and the rows themselves say which
 * happened once they exist (`JournalRow.backfilled`) — so no claim here can be false
 * for the date it was opened on.
 */
function DayComposer({
  habit,
  date,
  onFill,
  onSkip,
  onClose,
}: {
  habit: Habit;
  date: string;
  onFill: (actual?: number) => Promise<void>;
  onSkip: (reason: SkipReason, opts?: { note?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const isCount = habit.kind === 'count';
  const [amount, setAmount] = useState(`${habit.floor}`);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = Number(amount);
  // §3.3: an activity row is `actual > 0`. Zero is not one — the way to say "didn't do
  // it" is a skip row with a reason.
  const canLog = amount.trim().length > 0 && Number.isFinite(parsed) && parsed > 0;

  async function run(write: () => Promise<void>) {
    if (saving) return;
    // A raised soft keyboard would sit over the bottom-pinned 실행취소 toast for its
    // whole window — the same reason `app/today.tsx` dismisses it before every write.
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await write();
      setNote('');
    } catch {
      setError('기록하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <View style={styles.rowline}>
        <Eyebrow>{monthDay(date)} 기록 추가</Eyebrow>
        <Button label="닫기" variant="ghost" onPress={onClose} />
      </View>

      {/* B1's one-tap, in the canvas's composer wording (`Backfill.body.html:35`). */}
      <Button
        label={isCount ? `✓ 최소만큼 했어요 (+${habit.floor}${habit.floorUnit})` : '✓ 완료'}
        variant="pri"
        block
        disabled={saving}
        onPress={() => void run(() => onFill())}
      />

      {isCount && (
        <View style={styles.amountRow}>
          <NumberField
            accessibilityLabel="기록할 양"
            value={amount}
            onChangeText={(next) => {
              setAmount(next);
              setError(null);
            }}
            placeholder={`${habit.floor}`}
          />
          <Text style={[styles.unit, { color: colors.muted }]}>{habit.floorUnit}</Text>
          <Button
            label="기록"
            disabled={!canLog || saving}
            onPress={() => void run(() => onFill(parsed))}
            tap
            style={styles.grow}
          />
        </View>
      )}

      {/* B5 — the note is filled in before a chip is tapped, so it comes first, inside
          the same bounded block as the chips it belongs to. */}
      <View style={[styles.skipGroup, { borderColor: colors.border }]}>
        <TextField
          accessibilityLabel="못 한 이유 메모"
          value={note}
          onChangeText={setNote}
          placeholder="메모 (선택)"
        />
        <SkipReasonChips
          label="못 했어요"
          habitName={habit.name}
          disabled={saving}
          onPick={(reason) => void run(() => onSkip(reason, { note }))}
        />
      </View>

      {error != null && <Banner>{error}</Banner>}
    </Card>
  );
}

/**
 * One journal row, reopened for editing (#13's editor, on this screen's past dates).
 *
 * The whole row is written back, because the store **replaces** the element: an omitted
 * `timestamp` would silently reorder the day (§3.3). The time reveal is therefore
 * prefilled from this row's own stamp and rewritten only when the fields read a
 * different clock (`restampedAtLocalTime`).
 *
 * Whether the reveal appears at all is `row.timeEditable` — a noon-pinned backfill is
 * that day's ordering basis (§6.3/§7.3) and re-stamping it would reorder rows the pin
 * placed. The hook owns that rule; this file only withholds the control.
 */
function RowEditor({
  row,
  habit,
  dayLabel,
  effectOf,
  onSave,
  onDelete,
  onClose,
}: {
  row: JournalRow;
  habit: Habit;
  dayLabel: string;
  effectOf: (entryId: string) => DetailDeleteEffect | null;
  onSave: (entry: HabitEntry) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { entry } = row;
  const isCount = habit.kind === 'count';

  const [kind, setKind] = useState<'activity' | 'skip'>(entry.skipReason == null ? 'activity' : 'skip');
  const [amount, setAmount] = useState(`${entry.actual > 0 ? entry.actual : habit.floor}`);
  const [reason, setReason] = useState<SkipReason | undefined>(entry.skipReason);
  const [note, setNote] = useState(entry.note ?? '');
  const [timeOpen, setTimeOpen] = useState(false);
  const [hour, setHour] = useState(clockOf(entry.timestamp).slice(0, 2));
  const [minute, setMinute] = useState(clockOf(entry.timestamp).slice(3, 5));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** The pending confirm, from the hook — `null` means none is up. */
  const [confirming, setConfirming] = useState<DetailDeleteEffect | null>(null);

  const parsed = Number(amount);
  const amountUsable = !isCount || (amount.trim().length > 0 && Number.isFinite(parsed) && parsed > 0);
  // The same shape gate `useQuickLog.editEntry` enforces, so the control is disabled
  // rather than the write rejected: a skip row is nothing without its reason.
  const canSave = kind === 'skip' ? reason != null : amountUsable;

  const timestamp = timeOpen
    ? restampedAtLocalTime(entry.timestamp, entry.date, hour, minute)
    : entry.timestamp;
  const timeUsable = timestamp != null;

  async function save() {
    if (saving || !canSave || timestamp == null) return;
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      const trimmed = note.trim();
      await onSave({
        ...entry,
        timestamp,
        // Both fields move together — §3.3's discriminator is absolute, so a
        // transition sets the amount *and* the reason, never one of the two.
        actual: kind === 'skip' ? 0 : isCount ? parsed : 1,
        skipReason: kind === 'skip' ? reason : undefined,
        note: trimmed.length > 0 ? trimmed : undefined,
      });
      onClose();
    } catch {
      setError('기록을 고치지 못했어요. 잠시 뒤 다시 눌러 주세요.');
      setSaving(false);
    }
  }

  /** With no effect there is nothing to warn about, so the row just goes (#13 AC 4). */
  function requestDelete() {
    const effect = effectOf(entry.id);
    if (effect == null) void remove();
    else setConfirming(effect);
  }

  async function remove() {
    if (saving) return;
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await onDelete(entry.id);
      onClose();
    } catch {
      setError('기록을 지우지 못했어요. 잠시 뒤 다시 눌러 주세요.');
      setSaving(false);
      setConfirming(null);
    }
  }

  return (
    <Card>
      <View style={styles.rowline}>
        <Eyebrow>{dayLabel} 기록 수정</Eyebrow>
        <Chip label={clockOf(entry.timestamp)} />
      </View>

      <SegmentedControl
        label="기록 종류"
        options={[
          { value: 'activity', label: '했어요' },
          { value: 'skip', label: '못 했어요' },
        ]}
        value={kind}
        onChange={setKind}
      />

      {kind === 'activity'
        ? isCount && (
            <View style={styles.amountRow}>
              <NumberField
                accessibilityLabel="고칠 양"
                value={amount}
                onChangeText={(next) => {
                  setAmount(next);
                  setError(null);
                }}
                placeholder={`${habit.floor}`}
              />
              <Text style={[styles.unit, { color: colors.muted }]}>{habit.floorUnit}</Text>
            </View>
          )
        : /* This edits one row, not the day's answer, so the chips show this row's own
             reason. */
          <SkipReasonChips
            label="못 했어요"
            habitName={habit.name}
            selected={reason}
            disabled={saving}
            onPick={setReason}
          />}

      <TextField
        accessibilityLabel="메모"
        value={note}
        onChangeText={setNote}
        placeholder="메모 (선택)"
      />

      {row.timeEditable ? (
        timeOpen ? (
          <View style={styles.amountRow}>
            <NumberField accessibilityLabel="시" value={hour} onChangeText={setHour} placeholder="시" />
            <Text style={[styles.unit, { color: colors.muted }]}>:</Text>
            <NumberField accessibilityLabel="분" value={minute} onChangeText={setMinute} placeholder="분" />
          </View>
        ) : (
          <Button
            label={`🕑 ${clockOf(entry.timestamp)}`}
            variant="ghost"
            onPress={() => setTimeOpen(true)}
            style={styles.selfStart}
          />
        )
      ) : (
        // The front half is the composer's own static line for a noon-pinned write
        // (`app/today.tsx`, `design/parts/Backfill.logic.js:81`). 캔버스 출처 없음 —
        // 신규 문구, the trailing clause: this screen is the first that could offer to
        // re-stamp such a row, so it is the first that has to say why it does not.
        <Footnote>🕑 낮 12:00으로 기록 — 그날 순서의 기준이라 바꾸지 않아요</Footnote>
      )}

      {confirming == null ? (
        <View style={styles.actions}>
          <Button
            label="저장"
            variant="pri"
            disabled={saving || !canSave || !timeUsable}
            onPress={() => void save()}
            style={styles.grow}
          />
          <Button label="취소" variant="ghost" disabled={saving} onPress={onClose} tap />
          <Button label="삭제" disabled={saving} onPress={requestDelete} tap />
        </View>
      ) : (
        <View style={styles.confirm}>
          {/* Every clause and its order are `deleteConfirmLines`'; the conditions are
              the hook's. `Banner` joins them into one paragraph.

              The streak figures are passed only when the hook says this delete shows
              them (`showsStreak`) — a past date whose run actually changes (AC 9). */}
          <Banner>
            {deleteConfirmLines({
              habitName: confirming.habit.name,
              emptiesDay: confirming.emptiesDay,
              carriesMiss: confirming.carriesMiss,
              dayLabel,
              streakBefore: confirming.showsStreak ? confirming.streakBefore : undefined,
              streakAfter: confirming.showsStreak ? confirming.streakAfter : undefined,
              // The state → copy map is this screen's, so the label is resolved here
              // and `copy.ts` never learns what a `DayState` is.
              stateAfterLabel:
                confirming.stateAfter == null
                  ? undefined
                  : stateWord(confirming.stateAfter, habit.kind === 'binary'),
            }).join(' ')}
          </Banner>
          <View style={styles.actions}>
            <Button label="지울게요" variant="pri" disabled={saving} onPress={() => void remove()} style={styles.grow} />
            <Button label="그대로 둘게요" variant="ghost" disabled={saving} onPress={() => setConfirming(null)} tap />
          </View>
        </View>
      )}

      {error != null && <Banner>{error}</Banner>}
    </Card>
  );
}

/**
 * One journal day (`.jday`) — the date, the computed chip, and the day's rows.
 *
 * The journal is a **date walk**: a past day with no rows still gets a line, and that
 * line is the control that fills it (`day.backfillable`). It carries §6.0's 44px
 * minimum and an assembled accessible name, because three separate `Text`s would tell a
 * screen reader nothing about what pressing does.
 */
function JournalDayRow({
  day,
  habit,
  onOpen,
  onPickRow,
}: {
  day: JournalDay;
  habit: Habit;
  onOpen: () => void;
  onPickRow: (entryId: string) => void;
}) {
  const { colors } = useTheme();
  const label = chipText(day, habit.kind === 'binary');

  return (
    <View style={[styles.jday, { borderColor: colors.border }]}>
      <Text style={[styles.jd, { color: colors.muted }]}>{shortDate(day.date)}</Text>
      <View style={styles.jc}>
        <Pressable
          accessibilityRole={day.backfillable ? 'button' : undefined}
          accessibilityLabel={day.backfillable ? `${monthDay(day.date)} ${label} — 기록 추가` : undefined}
          disabled={!day.backfillable}
          onPress={onOpen}
          style={({ pressed }) => [styles.jchip, pressed && { opacity: 0.6 }]}
        >
          <StateChip label={label} state={day.state} />
        </Pressable>

        {day.rows.map((row) => (
          <Pressable
            key={row.entry.id}
            accessibilityRole="button"
            accessibilityLabel={`${clockOf(row.entry.timestamp)} ${amountText(row.entry, habit)} — 수정`}
            onPress={() => onPickRow(row.entry.id)}
            style={({ pressed }) => [styles.jrow, pressed && { backgroundColor: colors.accentWeak }]}
          >
            <Text style={[styles.jrows, { color: colors.muted }]}>
              {clockOf(row.entry.timestamp)} {amountText(row.entry, habit)}
              {row.entry.skipReason != null && ` · ${SKIP_REASON_LABELS[row.entry.skipReason]}`}
            </Text>
            {row.entry.note != null && (
              <Text style={[styles.jrows, { color: colors.faint }]}>메모: {row.entry.note}</Text>
            )}
          </Pressable>
        ))}

        {/* `HabitDetail.body.html:48` — a `partial` is under the floor and **not** a
            miss (CONTEXT glossary), which is the one thing that line exists to say. */}
        {day.state === 'partial' && (
          <Text style={[styles.jrows, { color: colors.faint }]}>최소엔 못 미침, 실패 아님</Text>
        )}
        {/* `:50` — the repair promise, on the days that can take it (ADR-0001). */}
        {day.recoverable && (
          <Text style={[styles.jrows, { color: colors.faint }]}>
            지금 채워 넣으면 이 날이 회복됩니다
          </Text>
        )}
      </View>
    </View>
  );
}

export default function HabitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const view = useHabitDetail(id);
  /**
   * The journal row being edited, held as an **id** and resolved from the live journal
   * each render: the editor then closes itself on a delete, and on any reload that
   * drops the row, with no cleanup effect to keep in step.
   */
  const [editingId, setEditingId] = useState<string | null>(null);

  const { habit } = view;

  if (view.loading) {
    return (
      <View style={styles.screen}>
        <Text style={[styles.notice, { color: colors.muted }]}>불러오는 중…</Text>
      </View>
    );
  }

  if (habit == null) {
    return (
      <View style={styles.screen}>
        <Text style={[styles.notice, { color: colors.muted }]}>습관을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  // Bound once, after the guard above: `panel` is a hoisted declaration, so the
  // narrowing of `view.habit` does not reach inside it.
  const shown: Habit = habit;
  const editingDay = view.journal.find((day) => day.rows.some((row) => row.entry.id === editingId));
  const editingRow = editingDay?.rows.find((row) => row.entry.id === editingId);

  function panel(name: DetailPanel) {
    switch (name) {
      case 'pills':
        return <StatPills key={name} streak={view.pills.streak} successRate={view.pills.successRate} />;
      case 'heatmap':
        return (
          <Card key={name}>
            <View style={styles.chHead}>
              <Eyebrow>최근 {view.heatmap.length}일</Eyebrow>
            </View>
            <Heatmap cells={view.heatmap} />
            {/* `YesNo.body.html:34` — what the two miss cells mean, and that a past day
                is repairable. True of both habit kinds: the outline/fill split is the
                heatmap's, not the kind's. */}
            <Hint>
              테두리만 있는 칸은{' '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>기록이 없어 실패로 잡힌 날</Text>
              이고, 꽉 찬 칸은 “못 함”을 직접 찍은 날이에요. 둘 다 연속을 끊습니다. 다만{' '}
              <Text style={{ color: colors.done, fontWeight: '600' }}>
                지난 날을 채워 넣으면 그 날이 성공으로 바뀌고 연속도 다시 이어집니다.
              </Text>
            </Hint>
          </Card>
        );
      case 'forming':
        return view.forming == null ? null : (
          <FormingPanel
            key={name}
            days={view.forming.days}
            expectedDays={view.forming.expectedDays}
            ratio={view.forming.ratio}
          />
        );
      case 'chart':
        return view.chart == null ? null : (
          <GrowthPanel
            key={name}
            chart={view.chart}
            // `Established.body.html:16` gives the panel the `.chartcard.primary`
            // surface where it leads the screen — which is exactly where the hook put
            // it, so the order decides the emphasis and this file re-reads neither.
            primary={view.panelOrder[0] === 'chart'}
          />
        );
      case 'design':
        return view.design == null ? null : (
          <DesignPanel key={name} design={view.design} onSave={view.saveDesign} />
        );
      case 'journal': {
        // `HabitDetail.body.html:53`. The date is the hook's — the most recent gap in
        // the window — and with no gap left there is nothing to add, so no button.
        const gap = view.nextBackfillDate;

        return (
          <View key={name} style={styles.journalGroup}>
            <Eyebrow>저널</Eyebrow>
            <View>
              {view.journal.map((day) => (
                <View key={day.date}>
                  <JournalDayRow
                    day={day}
                    habit={shown}
                    onOpen={() => {
                      setEditingId(null);
                      view.openBackfill(day.date);
                    }}
                    onPickRow={(entryId) => {
                      view.closeBackfill();
                      setEditingId(entryId);
                    }}
                  />
                  {/* Both surfaces open **under the day they act on**: the journal is
                      12 weeks long, and one pinned to the top of the screen would be
                      off-screen for the day that opened it. */}
                  {view.backfillDate === day.date && (
                    <DayComposer
                      habit={shown}
                      date={day.date}
                      onFill={view.fillDay}
                      onSkip={view.skipDay}
                      onClose={view.closeBackfill}
                    />
                  )}
                  {editingDay?.date === day.date && editingRow != null && (
                    <RowEditor
                      key={editingRow.entry.id}
                      row={editingRow}
                      habit={shown}
                      dayLabel={monthDay(day.date)}
                      effectOf={view.deletePreview}
                      onSave={view.editEntry}
                      onDelete={view.removeEntry}
                      onClose={() => setEditingId(null)}
                    />
                  )}
                </View>
              ))}
            </View>
            {gap != null && (
              <Button
                label="+ 지난 날 기록 추가"
                block
                tap
                onPress={() => {
                  // Same order as a journal line's own press: an open row editor is
                  // dismissed first, so the two panels never stand open together.
                  setEditingId(null);
                  view.openBackfill(gap);
                }}
              />
            )}
          </View>
        );
      }
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.surface }]}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={styles.rowline}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {habit.name}
          </Text>
          {view.stat != null && <Chip label={view.stat.name} variant="stat" />}
        </View>

        {view.panelOrder.map(panel)}
      </ScrollView>

      <ToastOverlay toast={view.toast} onUndo={() => void view.undoLast()} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { padding: SPACE.xl, paddingBottom: TOAST_OVERLAY_CLEARANCE, gap: SPACE.lg },
  rowline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  title: { fontSize: FONT_SIZE.xl, fontWeight: '600', letterSpacing: -0.2, flexShrink: 1 },
  notice: { fontSize: FONT_SIZE.base },
  // `.pills` — the row wraps, and each pill grows to share the width.
  pills: { flexDirection: 'row', gap: SPACE.md - 1, flexWrap: 'wrap' },
  // `.ch-head` — the eyebrow and its figure on one baseline.
  chHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACE.md },
  sub: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.mono, fontVariant: ['tabular-nums'] },
  // `.chart` — a fixed 104px box the bars are a percentage of. The extra top and
  // bottom room is the ⭐ and the week labels, which the CSS hangs outside the box.
  chart: {
    position: 'relative',
    height: 104,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE.md - 2,
    paddingTop: SPACE.xl,
    marginBottom: SPACE.xl,
  },
  // `.refline` — a dashed rule across the plot with its label at the right end.
  refline: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'flex-end',
  },
  reflineLabel: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs - 1,
    paddingHorizontal: 3,
    marginTop: -7,
  },
  bar: { flex: 1, height: '100%', borderRadius: 3, position: 'relative', alignItems: 'center' },
  barFill: { position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: 3, minHeight: 3 },
  star: { position: 'absolute', top: -15, fontSize: FONT_SIZE.sm },
  wk: {
    position: 'absolute',
    bottom: -15,
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs - 1.5,
  },
  // `.xpbar` — a 4px track with an accent fill.
  xpbar: { height: 4, borderRadius: 3, overflow: 'hidden' },
  xpbarFill: { height: '100%', borderRadius: 3 },
  // `.designbox` — a bordered block whose head and rows are separated by hairlines.
  designbox: { borderWidth: 1, borderRadius: RADIUS.md, overflow: 'hidden' },
  dhead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderBottomWidth: 1,
  },
  dform: { padding: SPACE.lg, gap: SPACE.lg },
  drow: { flexDirection: 'row', gap: SPACE.lg - 2, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md + 1, borderBottomWidth: 1 },
  dk: {
    width: 52,
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dv: { flex: 1, fontSize: FONT_SIZE.base },
  dvEmpty: { fontStyle: 'italic' },
  journalGroup: { gap: SPACE.md },
  // `.jday` — the date column, then the chip and rows stacked beside it.
  jday: { flexDirection: 'row', gap: SPACE.lg - 2, paddingVertical: SPACE.md + 1, borderBottomWidth: 1 },
  jd: { width: 52, fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm, paddingTop: 2 },
  jc: { flex: 1, gap: SPACE.sm },
  // §6.0's 44px minimum: the chip is the control that opens the day's composer.
  jchip: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: TAP_TARGET },
  // Each row is the control that opens its own editor, so it carries the minimum too.
  jrow: { justifyContent: 'center', minHeight: TAP_TARGET, borderRadius: RADIUS.sm, gap: SPACE.xs },
  jrows: { fontSize: FONT_SIZE.sm },
  // `.statechip` — RN has no `color-mix()`, so the CSS's 16–18% tint is a low-opacity
  // overlay of the same hue, exactly as `Banner` expresses its own.
  statechip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: SPACE.md - 1,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  statechipText: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.mono, fontWeight: '600' },
  tint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.16 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md - 2 },
  skipGroup: { borderTopWidth: 1, paddingTop: SPACE.md, gap: SPACE.md - 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md - 2 },
  confirm: { gap: SPACE.md },
  unit: { fontSize: FONT_SIZE.sm },
  grow: { flex: 1 },
  selfStart: { alignSelf: 'flex-start' },
});
