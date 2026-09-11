import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
  SkipReasonChips,
  TextField,
  TOAST_OVERLAY_CLEARANCE,
  ToastOverlay,
} from '@/components';
import { deleteConfirmLines, LOG_TYPE_LABELS, SKIP_REASON_LABELS } from '@/config/copy';
import { isFloorMet } from '@/domain/classify';
import { weekdayOf } from '@/domain/dates';
import {
  feedItemId,
  FREE_TARGET,
  useToday,
  type DateControl,
  type DeleteEffect,
  type TodayFeedItem,
  type TodayFreeFeedItem,
  type TodayHabitFeedItem,
  type TodayHabitRow,
} from '@/hooks/useToday';
import { restampedAtLocalTime, timestampAtLocalTime } from '@/lib/device';
import type { DayState, FreeLog, HabitEntry, LogType, SkipReason } from '@/models';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE, SPACE, TAP_TARGET } from '@/theme/tokens';

/**
 * Today — SPEC §6.2; layout from `design/parts/Today.body.html`, copy from the
 * design canvas.
 *
 * The artboard is the finished design, so it shows more than this screen renders. Free
 * logs (#16), the reward toast (#17) and the at-risk save banner (#18) each belong to a
 * later ticket and are left out rather than stubbed — a hardcoded number would read as
 * data the user does not have.
 *
 * The date control (§6.2 B4, #14) is here, and its own artboard is
 * `design/parts/Backfill.body.html`. Every judgment it makes — where the steps may go,
 * whether the date reads as 오늘/어제/a date, whether a write is a backfill — is
 * `useToday`'s `dateControl`; this file only applies the words.
 *
 * A feed line is also a **control** (#13): tapping it swaps the composer for
 * `EntryEditor` on that one row. Every judgment behind the delete confirm is
 * `useToday.deletePreview`'s and its copy is `config/copy.ts`'s, not this file's —
 * there are no component render tests (jest.config.js), and `testMatch` covers `src/**`
 * only, so anything decided in this file is decided where no test can reach it.
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

/**
 * One feed line, and a **control** (#13): pressing it opens `EntryEditor` on that row,
 * so it carries §6.0's 44px minimum and a button role.
 *
 * `accessibilityLabel` is assembled rather than left to the three child `Text`s: a
 * screen reader would otherwise announce "07:10 독서 +3쪽" with no hint that the line
 * does anything. An a11y label describes the affordance, so no canvas citation applies.
 */
function FeedRow({ item, onPress }: { item: TodayFeedItem; onPress: () => void }) {
  // Dispatch only — which row to draw, never a decision about what it says. The two
  // kinds share the feed's ordering and nothing else (§3.4).
  switch (item.kind) {
    case 'habit':
      return <HabitFeedRow item={item} onPress={onPress} />;
    case 'free':
      return <FreeFeedRow item={item} onPress={onPress} />;
  }
}

function HabitFeedRow({ item, onPress }: { item: TodayHabitFeedItem; onPress: () => void }) {
  const { colors } = useTheme();
  /**
   * §3.3's row discriminator — the *presence of a reason*, never `actual === 0`. A
   * skip row must be tested first, above the binary/count split: on a binary habit
   * the amount column would otherwise read `✓ 완료`, claiming success on a day the
   * user just said they did not do.
   *
   * The canvas fixes this case (`design/parts/Today.logic.js:97–100`): the amount
   * column reads `건너뜀` unemphasised (`amt plain`) with the reason on a second line.
   * The hue is `muted`, not `done` — a recorded skip is a fact, not an achievement.
   */
  const reason = item.entry.skipReason;
  const amount =
    reason != null
      ? '건너뜀'
      : item.habit.kind === 'binary'
        ? '✓ 완료'
        : `${item.entry.actual}${item.habit.floorUnit}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${clockOf(item.entry.timestamp)} ${item.habit.name} ${amount} — 수정`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.feedItem,
        { borderColor: colors.border },
        pressed && { backgroundColor: colors.accentWeak },
      ]}
    >
      <View style={styles.feedRow}>
        <Text style={[styles.feedTime, { color: colors.faint }]}>
          {clockOf(item.entry.timestamp)}
        </Text>
        <Text style={[styles.feedName, { color: colors.text }]} numberOfLines={1}>
          {item.habit.name}
        </Text>
        <Text style={[styles.feedAmount, { color: reason != null ? colors.muted : colors.done }]}>
          {amount}
        </Text>
      </View>
      {reason != null && (
        <Text style={[styles.feedNote, { color: colors.faint }]}>
          {SKIP_REASON_LABELS[reason]}
        </Text>
      )}
      {/* AC 3 — the first screen that *reads* `note` back. Canvas source:
          `design/parts/HabitDetail.body.html:49` (`메모: 어깨 뻐근함`), the only place
          the canvas ever displays one, on the same `.backnote` second line this row
          already uses for the reason. Shown for an activity row too: `note` is a field
          of the row (§3.3), not of the skip path. */}
      {item.entry.note != null && (
        <Text style={[styles.feedNote, { color: colors.faint }]}>메모: {item.entry.note}</Text>
      )}
      {/* `Backfill.logic.js:52` — a backfilled row's time column reads noon, which is a
          fact about how it was recorded rather than about when the user did the thing.
          This says so, on the same `.backnote` second line. Per **row**
          (`item.backfilled`), not per screen date: a row genuinely logged at 09:00
          yesterday shows 09:00 in the same feed, and the note would be a lie beside it.
          The artboard never shows that case — it seeds every past-day row at 12:00. */}
      {item.backfilled && (
        <Text style={[styles.feedNote, { color: colors.faint }]}>지난 날 기록 · 낮 12시로 남음</Text>
      )}
    </Pressable>
  );
}

/**
 * A free log's feed line (#16) — the canvas's `feeditem freelog`
 * (`design/parts/Today.logic.js:198`): the type's name where a habit's name goes, the
 * fixed `자유 로그` in the amount column unemphasised (`amt plain`, so `colors.muted`,
 * not `colors.done` — it is not an achievement), and **one** `.fnote` line beneath it.
 *
 * One line because the canvas's row has one such slot (`Today.body.html:88`) and its
 * two instances fill it differently — the user's text (`Today.logic.js:20`) or the
 * no-score sentence (`:196`). Which of the two this row shows is `item.note`, resolved
 * in the hook alongside `item.label`: `jest.config.js` matches `src/**` only, so a
 * choice between two sentences written here is one no test can reach.
 *
 * Also a control, like the habit row: pressing it opens the free-log editor (AC 5–6),
 * so it carries the same 44px minimum and assembled a11y label.
 */
function FreeFeedRow({ item, onPress }: { item: TodayFreeFeedItem; onPress: () => void }) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${clockOf(item.log.timestamp)} ${item.label} 자유 로그 — 수정`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.feedItem,
        { borderColor: colors.border },
        pressed && { backgroundColor: colors.accentWeak },
      ]}
    >
      <View style={styles.feedRow}>
        <Text style={[styles.feedTime, { color: colors.faint }]}>
          {clockOf(item.log.timestamp)}
        </Text>
        <Text style={[styles.feedName, { color: colors.text }]} numberOfLines={1}>
          {item.label}
        </Text>
        <Text style={[styles.feedAmount, { color: colors.muted }]}>자유 로그</Text>
      </View>
      <Text style={[styles.feedNote, { color: colors.faint }]}>{item.note}</Text>
    </Pressable>
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
 * The heading over the date — `오늘` / `어제` / `지난 날` (#14). The kind is
 * `dateControl.kind`'s judgment; these are the words for it. `지난 날` is the canvas's
 * own name for a backfilled day (`design/parts/Backfill.body.html:3`, `:67`).
 */
function headingFor(kind: DateControl['kind']): string {
  return kind === 'today' ? '오늘' : kind === 'yesterday' ? '어제' : '지난 날';
}

/**
 * The date control (§6.2 B4) — layout and copy from `design/parts/Backfill.body.html:15–23`
 * and the label rule at `design/parts/Backfill.logic.js:67`.
 *
 * It decides nothing: where each control may go, and which of the three labels applies,
 * are `dateControl`'s fields. Every control carries §6.0's 44px minimum (`tap`), and
 * the two arrows carry the canvas's own `aria-label`s — `‹`/`›` alone name nothing.
 */
function DateControlBar({
  control,
  onPick,
}: {
  control: DateControl;
  onPick: (date: string) => void;
}) {
  const { colors } = useTheme();
  const label =
    control.kind === 'today'
      ? `오늘 · ${headerDate(control.date)}`
      : control.kind === 'yesterday'
        ? `어제 · ${headerDate(control.date)}`
        : headerDate(control.date);

  return (
    <View style={styles.dateGroup}>
      <View style={styles.rowline}>
        <Eyebrow>날짜</Eyebrow>
        {/* `.backnote` at `Backfill.body.html:12` — the allowed range, in words. */}
        <Text style={[styles.rangeNote, { color: colors.faint }]}>만든 날부터 오늘까지</Text>
      </View>
      <View style={styles.dateCtl}>
        <Button
          label="‹"
          accessibilityLabel="이전 날"
          disabled={control.prevDate == null}
          onPress={() => control.prevDate != null && onPick(control.prevDate)}
          tap
        />
        <Text style={[styles.dateLabel, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Button
          label="›"
          accessibilityLabel="다음 날"
          disabled={control.nextDate == null}
          onPress={() => control.nextDate != null && onPick(control.nextDate)}
          tap
        />
        <Button
          label="오늘"
          variant={control.kind === 'today' ? 'sel' : 'default'}
          onPress={() => onPick(control.today)}
          tap
        />
        <Button
          label="어제"
          variant={control.kind === 'yesterday' ? 'sel' : 'default'}
          disabled={control.yesterdayDate == null}
          onPress={() => control.yesterdayDate != null && onPick(control.yesterdayDate)}
          tap
        />
      </View>
    </View>
  );
}

/**
 * B3's time control: a collapsed `🕑 …` affordance that reveals an hour and a minute
 * field (`design/parts/Today.body.html:63`, the canvas's `🕑 지금 {{ clock }}`).
 * `timestamp` is ordering and tiebreak only (§3.3), so overriding it is rare and the
 * fields stay out of the way until asked for.
 *
 * One component because all four writing surfaces on this screen now hold the same
 * affordance — `Composer`, `FreeComposer`, `EntryEditor` and `FreeLogEditor` (#16 put
 * the free path's two beside the habit path's two). Only the control is lifted: what
 * the collapsed label says, what the fields are prefilled with and what a stamp is
 * computed from differ per caller and stay there, because they are each caller's own
 * rule about a stored fact.
 *
 * `onReset` is the composers' `지금으로`, rendered only when given: the editors pass
 * the original stamp through verbatim, so there is nothing to reset *to* but the time
 * already in the fields.
 */
function TimeReveal({
  open,
  label,
  hour,
  minute,
  onChangeHour,
  onChangeMinute,
  onOpen,
  onReset,
}: {
  open: boolean;
  label: string;
  hour: string;
  minute: string;
  onChangeHour: (value: string) => void;
  onChangeMinute: (value: string) => void;
  onOpen: () => void;
  onReset?: () => void;
}) {
  const { colors } = useTheme();

  if (!open) {
    return <Button label={label} variant="ghost" onPress={onOpen} style={styles.time} />;
  }

  return (
    <View style={styles.amountRow}>
      <NumberField
        accessibilityLabel="시"
        value={hour}
        onChangeText={onChangeHour}
        placeholder="시"
      />
      <Text style={[styles.unit, { color: colors.muted }]}>:</Text>
      <NumberField
        accessibilityLabel="분"
        value={minute}
        onChangeText={onChangeMinute}
        placeholder="분"
      />
      {onReset != null && (
        <Button label="지금으로" variant="ghost" onPress={onReset} style={styles.grow} />
      )}
    </View>
  );
}

function Composer({
  row,
  date,
  isBackfill,
  previewOf,
  onLog,
  onSkip,
}: {
  row: TodayHabitRow;
  date: string;
  /** Is this a past date? Then the row is noon-pinned and B3's override does nothing. */
  isBackfill: boolean;
  previewOf: (staged: number) => { sum: number; state: DayState } | null;
  onLog: (actual: number, opts?: { timestamp?: string }) => Promise<void>;
  onSkip: (reason: SkipReason, opts?: { note?: string }) => Promise<void>;
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
  /** The optional note a skip carries — filled in *before* a chip is tapped (B5). */
  const [note, setNote] = useState('');

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

  /**
   * An explicit override must never be silently discarded. The revealed fields are
   * prefilled from now, so an invalid pair means the user typed one — so the log
   * controls go disabled until it reads as a time, exactly as the amount field's own
   * `canLog` gate works. No new error copy for a state the user is mid-edit on.
   */
  const timestamp = timeOpen ? timestampAtLocalTime(date, hour, minute) : undefined;
  const timeUsable = !timeOpen || timestamp != null;

  async function submit(actual: number) {
    if (saving) return;
    /**
     * The amount and time fields are done being used the moment a log commits, and a
     * raised soft keyboard would hide the bottom-pinned undo toast — on iOS the window
     * does not resize for the keyboard, so an absolutely positioned overlay stays
     * behind it and B6's 실행취소 is unreachable for the whole `TUNING.undoToastMs`.
     * Dismissing needs no layout change; wrapping the screen in a
     * `KeyboardAvoidingView` would alter every other surface on it.
     */
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await onLog(actual, { timestamp });
      // Only the amount resets. An open time reveal is an explicit override the user
      // chose, and a second log of the same session belongs at the same time.
      setStaged(null);
    } catch {
      setError('기록하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  }

  /**
   * A chip tap is the whole gesture — no confirm step, so this commits directly.
   * `Keyboard.dismiss()` for the same reason `submit` does it: the note field raises
   * the soft keyboard, and on iOS the window does not resize for it, so the
   * bottom-pinned 실행취소 toast would sit behind the keyboard for its whole window.
   */
  async function submitSkip(reason: SkipReason) {
    if (saving) return;

    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await onSkip(reason, { note });
      // The next skip must not inherit this one's note.
      setNote('');
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
        disabled={saving || binaryDone || !timeUsable}
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
              disabled={!canLog || saving || !timeUsable}
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
          {/* C7a — once the day is floor-met, nudge the optional 목표. The 최고기록
              half of that nudge waits for #20, which already owns `personal_best`.

              `더 하고 싶은 양` is reused from the creation form's 목표 field
              (`design/parts/Main.body.html:39`), which is the canvas's only wording
              for what a target is; it is true anywhere. That line's trailing
              `· 안 채워도 괜찮아요` is dropped — it describes leaving a *form field*
              blank, and this screen has no target field to leave unfilled. The canvas
              has no target-suggestion string for Today or Habit Detail, so nothing
              replaces it rather than inventing a sentence. */}
          {row.suggestTarget && <Hint>목표 — 더 하고 싶은 양</Hint>}
        </>
      )}

      {/* B3 — the time picker is collapsed behind "🕑 지금 HH:MM" and revealed only to
          override. `timestamp` is ordering and tiebreak only (§3.3), so this is rare.

          On a backfill there is nothing to override: the row is noon-pinned so the
          day's total order is defined (§6.3/§7.3), and `useQuickLog` ignores an override
          there. The control becomes the canvas's static statement of that fact
          (`design/parts/Backfill.logic.js:81`) rather than a field that would silently
          do nothing. */}
      {isBackfill ? (
        <Footnote>🕑 낮 12:00으로 기록</Footnote>
      ) : (
        <TimeReveal
          open={timeOpen}
          label={`🕑 지금 ${clockOf(new Date().toISOString())}`}
          hour={hour}
          minute={minute}
          onChangeHour={setHour}
          onChangeMinute={setMinute}
          onOpen={() => {
            // Prefilled from now, so the revealed fields show what the collapsed
            // label promised — and an empty field can never stamp local midnight.
            const at = new Date();
            setHour(`${at.getHours()}`.padStart(2, '0'));
            setMinute(`${at.getMinutes()}`.padStart(2, '0'));
            setTimeOpen(true);
          }}
          onReset={() => {
            setTimeOpen(false);
            setHour('');
            setMinute('');
          }}
        />
      )}

      {/* B5 — the skip affordance, as **one bounded group**: the note box and the
          chips inside a single hairline-topped block, note first because it is filled
          in before a chip is tapped (AC — 총 두 탭).

          The note belongs to the skip path, so it lives inside the skip group: within
          this block, this habit's skip is the only thing it can be a note *for*, and
          one left staged here and picked up by a later chip tap is what the user
          wrote it for. (`note` is deliberately **not** wired into `logActivity`:
          SPEC §6.2 does put an optional note on the activity path, but that is #13's
          edit surface, not this ticket's.)

          The guarantee is scoped to the habit, to the skip path **and to the date** —
          `Composer` is keyed on `${habit.id}:${date}` (#14 D7), so switching habits or
          stepping the date remounts, and a note typed for one day can never be picked
          up by a chip tapped on another.

          Two deviations from the canvas, both deliberate:
          - **Copy.** `메모 (선택)` is the front half of
            `design/parts/Today.body.html:56`. Its trailing
            `— 오늘 무슨 일이 있었나요` is shed: that question belongs to the free-log
            (일기) field, which asks what happened today, whereas this box answers
            why not. The front half asserts nothing about the occasion, so it is true
            in either field.
          - **Arrangement.** `:63–68` puts the chips on the 🕑 row. That layout has no
            note field to place — the canvas never planned one on the habit path — so
            it offers no arrangement for this element, and the misreading above is the
            cost of following it anyway.

          Withheld whole on a day activity covers (`row.skippable`, §4.1): chips,
          note and all. */}
      {row.skippable && (
        <View style={[styles.skipGroup, { borderColor: colors.border }]}>
          <TextField
            accessibilityLabel="못 한 이유 메모"
            value={note}
            onChangeText={setNote}
            placeholder="메모 (선택)"
          />
          <SkipReasonChips
            label="건너뛰기"
            habitName={row.habit.name}
            selected={row.skipReasonToday}
            disabled={saving}
            onPick={(reason) => void submitSkip(reason)}
          />
        </View>
      )}

      {row.day?.state === 'partial' && <Footnote>최소엔 못 미침, 실패 아님</Footnote>}
      {/* The one day-state line this screen did not have a state for until now
          (`design/parts/Backfill.logic.js:42`). `pending` and `partial` already have
          their say — the chip above, the progress line, and the footnote on the line
          before this one — so only `missed` gets new copy, and it is the sentence that
          says the day is repairable rather than merely lost (ADR-0001). */}
      {row.day?.state === 'missed' && (
        <Footnote>기록이 없어 실패로 잡힌 날 — 지금 채우면 회복됩니다</Footnote>
      )}
      {error != null && <Banner>{error}</Banner>}
    </Card>
  );
}

/**
 * The free-log type chips (#16 AC 1) — the four `LOG_TYPE_LABELS`, iterated in the
 * record's key order, which is §3.4's union order and the canvas's chip order
 * (`design/parts/Today.logic.js:158`). Shared by the composer and the editor, which is
 * what AC 7 needs: the type is as editable afterwards as it is choosable at creation.
 */
function LogTypeChips({
  selected,
  disabled,
  onPick,
}: {
  selected: LogType;
  disabled?: boolean;
  onPick: (type: LogType) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {(Object.keys(LOG_TYPE_LABELS) as LogType[]).map((type) => (
        <Button
          key={type}
          label={LOG_TYPE_LABELS[type]}
          variant={type === selected ? 'sel' : 'default'}
          disabled={disabled}
          onPress={() => onPick(type)}
          tap
        />
      ))}
    </View>
  );
}

/**
 * The composer's free-log path (#16) — layout and copy from
 * `design/parts/Today.body.html:50–58`: the chip row, the note field, the submit
 * button and the "no score" hint, in that order.
 *
 * Its own component rather than a branch inside `Composer`: the two share no field —
 * no amount, no quick chips, no progress line, no skip path. The one thing they do
 * share is the time reveal, and that is now `TimeReveal`, used by both of them and by
 * both editors.
 *
 * **The time reveal is a recorded deviation from the canvas.** `Today.logic.js:179`
 * sets `isHabit: !isFree`, and `Today.body.html:61–63` gates the `🕑 지금` block on it,
 * so the artboard switches the control off for free logs. SPEC §6.2 says the time
 * control "Applies to habit entries and free logs alike", §3.4 makes `timestamp`
 * editable, and #16 AC 5 requires it — so it ships. Re-adding an element the canvas
 * *actively excluded* is a deviation, unlike merely omitting one, so it is stated here.
 *
 * The default type is the first chip, `note`. The canvas seeds `기분`
 * (`Today.logic.js:12`) to show the selected style on the artboard, which is sample
 * data, not a stated default.
 */
function FreeComposer({
  date,
  onLog,
}: {
  date: string;
  onLog: (type: LogType, text: string, opts?: { timestamp?: string }) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [type, setType] = useState<LogType>('note');
  const [text, setText] = useState('');
  const [timeOpen, setTimeOpen] = useState(false);
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Same rule as `Composer`: the revealed fields are prefilled from now, so an invalid
  // pair means the user typed one, and the submit goes disabled until it reads as a
  // time rather than silently falling back to the clock.
  const timestamp = timeOpen ? timestampAtLocalTime(date, hour, minute) : undefined;
  const timeUsable = !timeOpen || timestamp != null;

  async function submit() {
    if (saving) return;

    // Same reason as `Composer.submit`: a raised soft keyboard would sit over the
    // bottom-pinned toast overlay.
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await onLog(type, text, { timestamp });
      // The text is spent; the type is not. Two entries of the same kind in a row are
      // the ordinary case, and re-picking the chip every time would be friction the
      // canvas's persistent `freeType` selection does not have.
      setText('');
    } catch {
      setError('기록하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <LogTypeChips selected={type} disabled={saving} onPick={setType} />

      {/* `Today.body.html:56` — the free path's own field, and the only place the
          full sentence is true: this box does ask what happened today. */}
      <TextField
        accessibilityLabel="오늘 일기"
        value={text}
        onChangeText={setText}
        placeholder="메모 (선택) — 오늘 무슨 일이 있었나요"
      />

      {/* `Today.body.html:57` */}
      <Button
        label="오늘 일기 남기기"
        variant="pri"
        block
        disabled={saving || !timeUsable}
        onPress={() => void submit()}
      />

      <TimeReveal
        open={timeOpen}
        label={`🕑 지금 ${clockOf(new Date().toISOString())}`}
        hour={hour}
        minute={minute}
        onChangeHour={setHour}
        onChangeMinute={setMinute}
        onOpen={() => {
          const at = new Date();
          setHour(`${at.getHours()}`.padStart(2, '0'));
          setMinute(`${at.getMinutes()}`.padStart(2, '0'));
          setTimeOpen(true);
        }}
        onReset={() => {
          setTimeOpen(false);
          setHour('');
          setMinute('');
        }}
      />

      {/* `Today.body.html:58` — AC 4 said in words, where the user is about to act. */}
      <Hint>그냥 오늘 있었던 일을 적는 칸이에요. 점수나 연속 날수와는 아무 상관 없습니다.</Hint>

      {error != null && <Banner>{error}</Banner>}
    </Card>
  );
}

/** Which shape the edited row is being given — §3.3's two row kinds, as a choice. */
type RowKind = 'activity' | 'skip';

/**
 * The row editor (#13) — the composer, reopened on **one existing row** with its `id`
 * preserved. It replaces `Composer` on screen rather than sitting beside it: the two
 * would otherwise offer two different "record this habit" controls at once, and the
 * ticket asks for the composer to open filled in, not for a third card.
 *
 * It is a local component, not a `src/components` export: there is one caller. #15's
 * journal is the second, and can lift it then (CLAUDE.md §2).
 *
 * The whole row is passed to `onSave`, because the write **replaces** the stored
 * element — an omitted `timestamp` would silently reorder the feed (§3.3). So the time
 * reveal is prefilled from *this row's* stamp, not from now, and the stamp is rewritten
 * only when the fields read a clock the original does not (`restampedAtLocalTime`);
 * otherwise the original string is stored back verbatim, seconds and all.
 *
 * On a **backfilled** row the reveal is withheld entirely, and the same static line the
 * composer shows takes its place. That is the composer's rule carried across, not a new
 * one: a backfill is noon-pinned so the day's total order is defined (§6.3/§7.3), and
 * offering to restamp it here would undo, one row at a time, the invariant the control
 * one component away refuses to break. Making past rows time-editable is a capability
 * #14 was not asked for; #15's journal can add it, with its own copy.
 *
 * The reveal is `TimeReveal`, shared with the composers, and it is passed no
 * `지금으로` reset unlike theirs: with the original stamp passed through verbatim there
 * is nothing to reset *to* but the time already in the fields.
 */
function EntryEditor({
  item,
  onSave,
  onDelete,
  deletePreview,
  onClose,
}: {
  item: TodayHabitFeedItem;
  onSave: (entry: HabitEntry) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
  deletePreview: (entryId: string) => DeleteEffect | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { entry, habit } = item;
  const isCount = habit.kind === 'count';
  const unit = habit.floorUnit;

  const [kind, setKind] = useState<RowKind>(entry.skipReason == null ? 'activity' : 'skip');
  const [amount, setAmount] = useState(`${entry.actual > 0 ? entry.actual : habit.floor}`);
  const [reason, setReason] = useState<SkipReason | undefined>(entry.skipReason);
  const [note, setNote] = useState(entry.note ?? '');
  const [timeOpen, setTimeOpen] = useState(false);
  const [hour, setHour] = useState(clockOf(entry.timestamp).slice(0, 2));
  const [minute, setMinute] = useState(clockOf(entry.timestamp).slice(3, 5));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** The pending confirm, from `deletePreview` — `null` means none is up. */
  const [confirming, setConfirming] = useState<DeleteEffect | null>(null);

  const parsed = Number(amount);
  // Binary rows carry no amount to edit: their `actual` is always 1 (§3.3).
  const amountUsable =
    !isCount || (amount.trim().length > 0 && Number.isFinite(parsed) && parsed > 0);
  // The same shape gate `useQuickLog.editEntry` enforces, so the control is disabled
  // rather than the write rejected: a skip row is nothing without its reason.
  const canSave = kind === 'skip' ? reason != null : amountUsable;

  /**
   * The stamp to store: the original unless the fields read a different wall clock
   * (`restampedAtLocalTime`, tested in `src/lib/device.test.ts`). Opening the reveal is
   * not an edit — the decision lives in `src/lib` because it is a decision about a
   * stored fact, and no test can reach a judgment left in this file.
   */
  const timestamp = timeOpen
    ? restampedAtLocalTime(entry.timestamp, entry.date, hour, minute)
    : entry.timestamp;
  const timeUsable = timestamp != null;

  async function save() {
    if (saving || !canSave || !timeUsable) return;

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

  /** AC 4 — with no `DeleteEffect` there is nothing to warn about, so it just goes. */
  function requestDelete() {
    const effect = deletePreview(entry.id);
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
      <View style={styles.composerHead}>
        <Text style={[styles.composerName, { color: colors.text }]} numberOfLines={1}>
          {habit.name}
        </Text>
        {/* 캔버스 출처 없음 — 신규 문구. 근거: the canvas's edit affordance is
            `design/parts/HabitDetail.body.html:38` (`수정`, a `btn ghost`), which is a
            *button*, not a heading; this chip names the card that button opens, and
            `기록` is the word this screen already uses for a row (`오늘 기록`). */}
        <Chip label={`${clockOf(entry.timestamp)} 기록 수정`} variant="neutral" />
      </View>

      {/* AC 2 — the activity ↔ skip transition, as the row's kind. 캔버스 출처 없음 —
          신규 문구: the canvas has no such switch. 근거: `못 했어요` is the canvas's own
          label for the skip affordance (`design/parts/Backfill.body.html:57`), and
          `했어요` is the counterpart already on this screen's binary one-tap control
          (`✓ 했어요`). */}
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
              <Text style={[styles.unit, { color: colors.muted }]}>{unit}</Text>
            </View>
          )
        : /* The reason is required for a skip row, so the chips are the row's own
             selection rather than the day's (`selected={reason}`, not
             `row.skipReasonToday`): this edits one row, not the day's answer. */
          <SkipReasonChips
            label="건너뛰기"
            habitName={habit.name}
            selected={reason}
            disabled={saving}
            onPick={setReason}
          />}

      {/* AC 3 — the note, editable here. Placeholder reused from the composer's
          skip note (`design/parts/Today.body.html:56`, front half), which is where the
          only note field the canvas draws lives. Shown for both row kinds: SPEC §6.2
          puts an optional note on the activity path too, and the composer's own comment
          parked that field here. */}
      <TextField
        accessibilityLabel="메모"
        value={note}
        onChangeText={setNote}
        placeholder="메모 (선택)"
      />

      {/* B3's reveal, prefilled from *this row's* stamp. Reopening it and pressing
          저장 changes nothing: `restampedAtLocalTime` returns the original verbatim
          while the fields read its own clock, so the row keeps the sub-minute position
          §7.3's total order gives it.

          Withheld on a backfilled row (`item.backfilled`), which keeps the noon pin
          intact — same rule and same sentence as the composer's. */}
      {item.backfilled ? (
        <Footnote>🕑 낮 12:00으로 기록</Footnote>
      ) : (
        <TimeReveal
          open={timeOpen}
          label={`🕑 ${clockOf(entry.timestamp)}`}
          hour={hour}
          minute={minute}
          onChangeHour={setHour}
          onChangeMinute={setMinute}
          onOpen={() => setTimeOpen(true)}
        />
      )}

      {confirming == null ? (
        <View style={styles.editActions}>
          {/* 캔버스 출처 없음 — 신규 문구 (`저장`·`취소`·`삭제`). 근거: the canvas
              draws no edit form, so it names none of these three; they are the
              conventional Korean labels for the three actions and assert nothing about
              the domain. 삭제 keeps the 44px minimum (§6.0) via `tap`, as every control
              that writes on this screen does. */}
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
          {/* `Banner` (caution tint) is this screen's existing device for a line the
              user has to read before acting; it wraps its children in one `Text`, so
              the clauses join into one paragraph in the order the hook derived. */}
          <Banner>
            {deleteConfirmLines({
              habitName: confirming.habit.name,
              emptiesDay: confirming.emptiesDay,
              carriesMiss: confirming.carriesMiss,
              // The state → copy map is this screen's, so the label is resolved here
              // and `copy.ts` never learns what a `DayState` is.
              stateAfterLabel:
                confirming.stateAfter == null ? undefined : stateLabel(confirming.stateAfter),
            }).join(' ')}
          </Banner>
          {/* 캔버스 출처 없음 — 신규 문구. 근거: a plain `삭제`/`취소` pair here would
              repeat the labels of the row above it and read as the same two buttons, so
              the confirm answers in the first person, as the canvas's own reassurance
              copy does (`안 채워도 괜찮아요`, `신경 안 쓰셔도 돼요`). */}
          <View style={styles.editActions}>
            <Button
              label="지울게요"
              variant="pri"
              disabled={saving}
              onPress={() => void remove()}
              style={styles.grow}
            />
            <Button
              label="그대로 둘게요"
              variant="ghost"
              disabled={saving}
              onPress={() => setConfirming(null)}
              tap
            />
          </View>
        </View>
      )}

      {error != null && <Banner>{error}</Banner>}
    </Card>
  );
}

/**
 * The free-log editor (#16 AC 5–7) — the free composer, reopened on **one existing
 * row** with its `id` preserved. It takes the composer's place on screen for the same
 * reason `EntryEditor` does, and it is a separate small component rather than a
 * generalization of `EntryEditor`: that one is about §3.3's activity↔skip
 * discriminator, an amount and a habit, none of which a `FreeLog` has (CLAUDE.md §3).
 *
 * The whole row goes to `onSave`, because the write replaces the stored element — an
 * omitted `timestamp` would silently reorder the feed (§3.4/§7.3). So the time reveal
 * is prefilled from *this row's* stamp and the stamp is rewritten only when the fields
 * read a clock the original does not (`restampedAtLocalTime`).
 *
 * **Delete is immediate, with no confirm.** §3.4 sends the reader to §6.2, which
 * revised itself in place: a deliberate delete is immediate for an ordinary row, and
 * the one guarded case is the last remaining row of a date or a miss-bearing skip.
 * A free log is neither — it carries no scoring weight — so the citation itself yields
 * "immediate", which is what AC 6 asks for. `deletePreview` is not consulted; it
 * returns `null` for these ids by construction.
 */
function FreeLogEditor({
  item,
  onSave,
  onDelete,
  onClose,
}: {
  item: TodayFreeFeedItem;
  onSave: (log: FreeLog) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { log } = item;

  const [type, setType] = useState<LogType>(log.type);
  const [text, setText] = useState(log.text);
  const [timeOpen, setTimeOpen] = useState(false);
  const [hour, setHour] = useState(clockOf(log.timestamp).slice(0, 2));
  const [minute, setMinute] = useState(clockOf(log.timestamp).slice(3, 5));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const timestamp = timeOpen
    ? restampedAtLocalTime(log.timestamp, log.date, hour, minute)
    : log.timestamp;
  const timeUsable = timestamp != null;

  async function save() {
    if (saving || !timeUsable) return;

    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...log, type, text, timestamp });
      onClose();
    } catch {
      setError('기록을 고치지 못했어요. 잠시 뒤 다시 눌러 주세요.');
      setSaving(false);
    }
  }

  async function remove() {
    if (saving) return;

    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await onDelete(log.id);
      onClose();
    } catch {
      setError('기록을 지우지 못했어요. 잠시 뒤 다시 눌러 주세요.');
      setSaving(false);
    }
  }

  return (
    <Card>
      <View style={styles.composerHead}>
        <Text style={[styles.composerName, { color: colors.text }]} numberOfLines={1}>
          {item.label}
        </Text>
        {/* 캔버스 출처 없음 — 신규 문구. 근거: the same chip `EntryEditor` puts on the
            card a feed row opens, with 일기 for the word the canvas uses for this
            row's own path (`오늘 일기`, `design/parts/Today.logic.js:135`). */}
        <Chip label={`${clockOf(log.timestamp)} 일기 수정`} variant="neutral" />
      </View>

      {/* AC 7 — the type, editable afterwards. The same chips the composer offers. */}
      <LogTypeChips selected={type} disabled={saving} onPick={setType} />

      <TextField
        accessibilityLabel="오늘 일기"
        value={text}
        onChangeText={setText}
        placeholder="메모 (선택) — 오늘 무슨 일이 있었나요"
      />

      <TimeReveal
        open={timeOpen}
        label={`🕑 ${clockOf(log.timestamp)}`}
        hour={hour}
        minute={minute}
        onChangeHour={setHour}
        onChangeMinute={setMinute}
        onOpen={() => setTimeOpen(true)}
      />

      {/* The same three labels `EntryEditor` uses, for the same three actions. 삭제
          commits straight away here — there is no consequence to warn about. */}
      <View style={styles.editActions}>
        <Button
          label="저장"
          variant="pri"
          disabled={saving || !timeUsable}
          onPress={() => void save()}
          style={styles.grow}
        />
        <Button label="취소" variant="ghost" disabled={saving} onPress={onClose} tap />
        <Button label="삭제" disabled={saving} onPress={() => void remove()} tap />
      </View>

      {error != null && <Banner>{error}</Banner>}
    </Card>
  );
}

export default function Today() {
  const { colors } = useTheme();
  /**
   * The day being recorded (§6.2 B4). `null` is "today" — the hook owns what today is
   * (`localToday()`), so holding a date here before the user has picked one would pin
   * the screen to the day it mounted.
   */
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const {
    date,
    rows,
    feed,
    questsDone,
    dateControl,
    logCount,
    xpToday,
    loading,
    logActivity,
    logSkip,
    previewOf,
    editEntry,
    removeEntry,
    deletePreview,
    targetOptions,
    resolvesToFree,
    logFree,
    editFreeLog,
    removeFreeLog,
    toast,
    undoLast,
  } = useToday({ date: selectedDate ?? undefined });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /**
   * The feed row being edited (#13). Held as an **id**, and the item derived from the
   * live feed each render: the editor then closes itself on a delete, and on any reload
   * that drops the row, with no cleanup effect to keep in step.
   *
   * The id now spans two namespaces — a `HabitEntry.id` or a `FreeLog.id` (#16) — so
   * the lookup reads whichever the item carries, and the editor is picked off the
   * item's `kind` rather than off a second piece of state that could disagree with it.
   */
  const [editingId, setEditingId] = useState<string | null>(null);

  const selectedHabit = rows.find((row) => row.habit.id === selectedId) ?? rows[0];
  // Whether the selection lands on the free path is the hook's question, not this
  // file's — a selection held across a date step can go stale (`resolvesToFree`).
  const freeTarget = resolvesToFree(selectedId);
  const editing = feed.find((item) => feedItemId(item) === editingId);

  return (
    <View style={[styles.fill, { backgroundColor: colors.surface }]}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.rowline}>
          <View>
            <Eyebrow>{headerDate(date)}</Eyebrow>
            <Text style={[styles.heading, { color: colors.text }]}>
              {headingFor(dateControl.kind)}
            </Text>
          </View>
          <View>
            <Text style={[styles.tally, { color: colors.muted }]}>
              완료 {questsDone} · 로그 {logCount}
            </Text>
            <Text style={[styles.tally, { color: colors.text }]}>+{xpToday} XP</Text>
          </View>
        </View>

        <DateControlBar control={dateControl} onPick={setSelectedDate} />

        {/* `Backfill.body.html:67` — what a write to a past day does, said where the
            user can act on it: the noon pin, the append, the recovery. Neutral, because
            it states a mechanism rather than warning about one.

            The artboard's companion banner on today (`:73`) is deliberately **not**
            here. It is the only permanent copy this ticket would add to the default
            Today view, which the date stepper does not otherwise change, and its own
            sentence says the timestamp matters only for ordering and can be ignored — a
            line that argues for its own absence from a screen every user opens every
            day. Omitting a canvas element is not a deviation from its copy: the canvas
            is the authority on what an element says once it ships. */}
        {dateControl.isBackfill && (
          <Banner variant="neutral">
            지난 날 기록 — 시각은 그날 낮 12시로 남습니다. 원래 있던 기록을 지우지 않고 옆에
            더해집니다. 실패로 잡혀 있던 날이면 성공으로 바뀌고, 연속 날수가 다시 계산됩니다.
          </Banner>
        )}

        {loading ? (
          <Text style={[styles.notice, { color: colors.muted }]}>불러오는 중…</Text>
        ) : (
          <>
            {/* Still shown with no habits — the recording path this screen is for is
                the habit one. It is no longer the *whole* screen, though: a free log
                links to no habit at all (§3.4), so needing one first would be a
                dependency the model deliberately does not have. */}
            {rows.length === 0 && (
              <Text style={[styles.notice, { color: colors.muted }]}>
                아직 습관이 없습니다. 먼저 습관을 하나 만들어 주세요.
              </Text>
            )}

            {/* The target selector, withheld while a row is being edited: the editor is
                about one row that already names its habit, and switching the *logging*
                target underneath it would change nothing it shows.

                Counted over `targetOptions`, which holds the free tab too (#16): on a
                one-habit install there are two things to choose between, and gating on
                the habits alone would hide the free path on the commonest screen. */}
            {targetOptions.length > 1 && editing == null && (
              <SegmentedControl
                label="기록 대상"
                options={targetOptions}
                value={freeTarget ? FREE_TARGET : selectedHabit.habit.id}
                onChange={setSelectedId}
              />
            )}

            {/* The editor takes the composer's place on the screen while it is open —
                its row comes from the tapped **feed item**, never from `selectedHabit`,
                which is the logging target and may well be a different habit — or the
                free path. Which editor is the item's own `kind`, so the two can never
                disagree.

                Everything here is keyed: switching targets or tapping a second feed row
                remounts, so no staged amount or text can be written to the row it was
                not typed for. */}
            {editing != null ? (
              editing.kind === 'habit' ? (
                <EntryEditor
                  key={editing.entry.id}
                  item={editing}
                  onSave={editEntry}
                  onDelete={removeEntry}
                  deletePreview={deletePreview}
                  onClose={() => setEditingId(null)}
                />
              ) : (
                <FreeLogEditor
                  key={editing.log.id}
                  item={editing}
                  onSave={editFreeLog}
                  onDelete={removeFreeLog}
                  onClose={() => setEditingId(null)}
                />
              )
            ) : freeTarget ? (
              // Keyed on the date for the same reason the habit composer is, even
              // though the free path only ever writes to today: stepping away and back
              // must not leave yesterday's half-typed text staged.
              <FreeComposer key={`${FREE_TARGET}:${date}`} date={date} onLog={logFree} />
            ) : selectedHabit != null ? (
              <Composer
                // #14 D7 — the date is part of the identity: stepping it must not leave
                // an amount, a time or a skip note staged for the day before.
                key={`${selectedHabit.habit.id}:${date}`}
                row={selectedHabit}
                date={date}
                isBackfill={dateControl.isBackfill}
                previewOf={(stagedAmount) => previewOf(selectedHabit.habit.id, stagedAmount)}
                onLog={(actual, opts) => logActivity(selectedHabit.habit.id, actual, opts)}
                onSkip={(reason, opts) => logSkip(selectedHabit.habit, reason, opts)}
              />
            ) : null}
          </>
        )}

        {/* `Backfill.logic.js:82` / `:58` — the feed and its empty line name the day
            they are about, so a past day's empty feed cannot be read as today's. */}
        <Eyebrow>{dateControl.isBackfill ? '이 날 기록' : '오늘 기록'}</Eyebrow>
        {feed.length === 0 ? (
          <View style={styles.emptyFeed}>
            <Text style={[styles.notice, { color: colors.muted }]}>
              {dateControl.isBackfill ? '이 날엔 기록이 없어요' : '오늘은 아직 기록이 없어요'}
            </Text>
            {/* `Backfill.logic.js:61` — the recovery half of the empty past day, which
                is ADR-0001's whole promise: the day is repairable, not merely lost.

                The canvas's `실패` badge beside it (`:59`) is **not** adopted. That
                artboard shows one habit, so its amount column can call the day a
                failure; this feed is across habits, and a habit paused on that date is
                no failure at all (ADR-0003). The word belongs where it is true per
                habit — the composer's own `missed` line above. */}
            {dateControl.isBackfill && <Footnote>채워 넣으면 이 날이 성공으로 바뀝니다</Footnote>}
          </View>
        ) : (
          <View style={styles.feed}>
            {feed.map((item) => {
              const id = feedItemId(item);
              return <FeedRow key={id} item={item} onPress={() => setEditingId(id)} />;
            })}
          </View>
        )}

        {/* `Backfill.body.html:90` — the two ends of the range, in one sentence. It is
            also what explains a habit's absence from the list on an early date (#14 D3),
            which is why no per-row "not created yet" copy was invented. */}
        <Footnote>아직 오지 않은 날, 습관을 만들기 전 날짜는 고를 수 없어요.</Footnote>
      </ScrollView>

      <ToastOverlay toast={toast} onUndo={() => void undoLast()} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { padding: SPACE.xl, paddingBottom: TOAST_OVERLAY_CLEARANCE, gap: SPACE.lg },
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
  // `.datectl` (`design/parts/Backfill.body.html:15`) — the arrows, the label and the
  // two chips on one wrapping row, under their own eyebrow.
  dateGroup: { gap: SPACE.sm },
  dateCtl: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md - 2, flexWrap: 'wrap' },
  dateLabel: { fontSize: FONT_SIZE.base, fontWeight: '600', flexShrink: 1 },
  rangeNote: { fontSize: FONT_SIZE.sm },
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
  // The note and the chips as one bounded block, so the note cannot be read as
  // belonging to the log control above it. No canvas selector is cited: this
  // arrangement is the documented deviation above, and `.skiprow` is the chip row's
  // own class (see `SkipReasonChips`).
  skipGroup: { borderTopWidth: 1, paddingTop: SPACE.md, gap: SPACE.md - 2 },
  time: { alignSelf: 'flex-start' },
  editActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md - 2 },
  confirm: { gap: SPACE.md },
  unit: { fontSize: FONT_SIZE.sm },
  grow: { flex: 1 },
  feed: { gap: SPACE.sm },
  emptyFeed: { gap: SPACE.xs },
  // The hairline and vertical rhythm move to the item, so a skip row's reason line
  // sits inside the same separated block as the amount it explains.
  // §6.0's 44px minimum — the row is the control that opens the editor (#13).
  feedItem: {
    borderBottomWidth: 1,
    paddingVertical: SPACE.md,
    gap: SPACE.xs,
    justifyContent: 'center',
    minHeight: TAP_TARGET,
  },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  feedTime: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.mono,
    fontVariant: ['tabular-nums'],
  },
  feedName: { fontSize: FONT_SIZE.base, flexShrink: 1 },
  // `.backnote` (`design/_tokens.css:234`) — the second line under a skip row, saying
  // which reason was recorded. `--faint` is taken as given; the rule's
  // `font-family: var(--mono)` is deliberately **not**: `.backnote` carries figures
  // elsewhere in the canvas, where tabular numerals are the point, whereas this line
  // is a Korean word that a mono stack has no glyphs for and would render through a
  // fallback. Font size is tokenized to the nearest step (no 10.5 token exists).
  feedNote: { fontSize: FONT_SIZE.sm },
  feedAmount: {
    marginLeft: 'auto',
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
    fontFamily: FONT_FAMILY.mono,
    fontVariant: ['tabular-nums'],
  },
});
