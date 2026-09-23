import { useState, type ReactNode } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import type { LogAffordances } from '@/hooks/useQuickLog';
import type { Habit, SkipReason } from '@/models';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE, SPACE } from '@/theme/tokens';

import { Banner } from './Banner';
import { Button } from './Button';
import { SkipReasonChips } from './SkipReasonChips';
import { NumberField, TextField } from './TextField';

export interface LogFormProps {
  habit: Habit;
  /** The day's `logAffordances` — the prefilled amount, the progress and the skip gate. */
  affordances: LogAffordances;
  /** `오늘` on today, the date otherwise — the progress line and the skip lead-in name it. */
  dayLabel: string;
  /** Sits beside the progress in the title row — Today's day-state chip. */
  badge?: ReactNode;
  onLog: (actual: number, opts: { note: string }) => Promise<void>;
  onSkip: (reason: SkipReason, opts: { note: string }) => Promise<void>;
  /** Called after a write succeeds — #80's modal closes on it. */
  onSaved?: () => void;
}

/**
 * The one log form (#79) — Today's habit card and the habit detail's fill panel both
 * render it, and #80's dashboard modal will. One amount field prefilled with
 * `defaultAmount`, one note, one primary `기록` (`✓ 완료` on a binary habit), and the
 * reason chips while the day is `skippable`. There is deliberately no second way to
 * write an activity row here: one path is the easier form (SPEC §6.2 B1).
 *
 * The form owns its inputs and its saving/error state. A successful write resets the
 * amount to the day's new default and empties the note, so the next row cannot inherit
 * this one's note; a failed write leaves both staged and says so in the card. Each
 * habit and day gets its own mount (Today keys it, the detail screen renders it under
 * the day), so an input never follows the user to another.
 *
 * The container is the caller's: Today wraps it in its card with the day-state
 * footnotes, the detail screen under its `기록 추가 · 닫기` header.
 */
export function LogForm({
  habit,
  affordances,
  dayLabel,
  badge,
  onLog,
  onSkip,
  onSaved,
}: LogFormProps) {
  const { colors } = useTheme();
  /**
   * `null` means "untouched", so the field falls back to `defaultAmount`. A write
   * resets it to `null`, which re-prefills the field with the day's new default rather
   * than leaving the old number staged.
   */
  const [staged, setStaged] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCount = habit.kind === 'count';
  const amount = staged ?? `${affordances.defaultAmount}`;
  const parsed = Number(amount);
  // §3.3: an activity row is `actual > 0`. A sub-floor amount is valid — it sums toward
  // the day (§4.1) — but zero is not an activity row; "didn't do it" is a skip row.
  const canLog = !isCount || (amount.trim().length > 0 && Number.isFinite(parsed) && parsed > 0);
  // Binary's floor is 1, so one row is the whole day: the control reads as completed.
  const binaryDone = !isCount && affordances.hasActivityToday;
  const { sum, floor } = affordances.progress;

  async function run(write: () => Promise<void>) {
    if (saving) return;
    // A raised soft keyboard would sit over the bottom-pinned 실행취소 toast for its
    // whole window — on iOS the window does not resize for it.
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await write();
      setStaged(null);
      setNote('');
      onSaved?.();
    } catch {
      setError('기록하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <View style={styles.head}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {habit.name}
        </Text>
        {isCount && (
          <Text style={[styles.progress, { color: colors.muted }]}>
            {dayLabel} {sum}/{floor}
            {habit.floorUnit}
          </Text>
        )}
        {badge}
      </View>

      {isCount && (
        <View style={styles.amountRow}>
          <NumberField
            accessibilityLabel="기록할 양"
            value={amount}
            onChangeText={(next) => {
              setStaged(next);
              setError(null);
            }}
            placeholder={`${habit.floor}`}
          />
          <Text style={[styles.unit, { color: colors.muted }]}>{habit.floorUnit}</Text>
        </View>
      )}

      <TextField
        accessibilityLabel="메모"
        value={note}
        onChangeText={setNote}
        placeholder="메모 (선택)"
      />

      <Button
        label={isCount ? '기록' : binaryDone ? '✓ 했어요' : '✓ 완료'}
        variant="pri"
        block
        disabled={!canLog || saving || binaryDone}
        onPress={() => void run(() => onLog(isCount ? parsed : 1, { note }))}
      />

      {/* B5 — withheld whole on a day activity covers (`skippable`, §4.1): a skip
          written there changes no state, no miss and no diagnosis. */}
      {affordances.skippable && (
        <View style={[styles.skipGroup, { borderColor: colors.border }]}>
          <SkipReasonChips
            label={`${dayLabel} 못 했어요 · 왜?`}
            habitName={habit.name}
            selected={affordances.skipReasonToday}
            disabled={saving}
            onPick={(reason) => void run(() => onSkip(reason, { note }))}
          />
        </View>
      )}

      {error != null && <Banner>{error}</Banner>}
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  name: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    letterSpacing: -0.14,
    flexShrink: 1,
    marginRight: 'auto',
  },
  progress: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.mono,
    fontVariant: ['tabular-nums'],
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md - 2 },
  unit: { fontSize: FONT_SIZE.sm },
  skipGroup: { borderTopWidth: 1, paddingTop: SPACE.md, gap: SPACE.md - 2 },
});
