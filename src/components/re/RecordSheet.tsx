import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SHEET_COPY, WRITE_FAILED_NOTE } from '@/config/copy';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

import { Button } from './Button';
import { InputField } from './InputField';
import { Sheet } from './Sheet';

export interface RecordSheetProps {
  onClose: () => void;
  /** "📖 독서". */
  title: string;
  /** "지금 6쪽", drawn muted after the title. */
  sumLabel?: string | null;
  /** A count habit has a stepper; a yes/no habit records 1 with no amount (§3.3). */
  isCount: boolean;
  unit: string;
  /** The stepper's start (B2). */
  defaultAmount: number;
  /** "지금 14:20" — a plain label, not a control (B3). */
  timeLabel: string;
  /** The text link to the skip reason sheet, or `null` to leave it out. */
  skipLabel?: string | null;
  /** The one result line under the stepper for the staged amount (C7a). */
  resultLine: (amount: number) => string;
  /** 기록하기. Rejects on a failed write; the sheet then says so and stays open. */
  onRecord: (amount: number, note: string) => Promise<void>;
  onSkip?: () => void;
}

/**
 * The record sheet (SPEC §6.2 Record sheet, `ReTodaySheet`) — one form for every place
 * that records a habit day: Today's `+`, the yesterday banner, and later the Dashboard's
 * 7-day dots and Habit Detail's date cells (§6.2 "One log form").
 *
 * Mount it only while it is open, keyed on the habit and day, so a staged amount or note
 * never follows the user to another habit.
 */
export function RecordSheet({
  onClose,
  title,
  sumLabel,
  isCount,
  unit,
  defaultAmount,
  timeLabel,
  skipLabel,
  resultLine,
  onRecord,
  onSkip,
}: RecordSheetProps) {
  const { redesign } = useTheme();
  const [amountText, setAmountText] = useState(`${defaultAmount}`);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(amountText);
  // §3.3: an activity row is `actual > 0`. Zero is a skip, which has its own sheet.
  const amount = isCount ? (Number.isFinite(parsed) && parsed > 0 ? parsed : null) : 1;

  function step(by: number) {
    const base = amount ?? 0;
    setAmountText(`${Math.max(1, base + by)}`);
  }

  async function submit() {
    if (amount == null || saving) return;
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await onRecord(amount, note);
    } catch {
      setError(WRITE_FAILED_NOTE);
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={title}
      titleAside={
        sumLabel != null ? <Text style={[TYPE.label, { color: redesign.muted }]}>{sumLabel}</Text> : undefined
      }
    >
      {isCount && (
        <View style={styles.stepper}>
          <StepButton label="−" accessibilityLabel={SHEET_COPY.stepDown} onPress={() => step(-1)} />
          <View style={styles.amount}>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="number-pad"
              accessibilityLabel={unit}
              selectTextOnFocus
              style={[
                TYPE.number,
                styles.amountInput,
                // A web input does not size to its text, so it gets a width per digit.
                { color: redesign.text, width: Math.max(1, amountText.length) * 28 + 8 },
              ]}
            />
            <Text style={[TYPE.title, { color: redesign.text }]}>{unit}</Text>
          </View>
          <StepButton label="+" accessibilityLabel={SHEET_COPY.stepUp} onPress={() => step(1)} />
        </View>
      )}

      {amount != null && (
        <Text style={[TYPE.bodyStrong, styles.center, { color: redesign.doneInk }]}>{resultLine(amount)}</Text>
      )}
      <Text style={[TYPE.body, styles.center, { color: redesign.muted }]}>{timeLabel}</Text>

      <InputField value={note} onChangeText={setNote} placeholder={SHEET_COPY.notePlaceholder} />

      <Button
        label={SHEET_COPY.record}
        variant="pri"
        block
        disabled={amount == null || saving}
        onPress={() => void submit()}
      />
      {skipLabel != null && onSkip != null && (
        <Button label={skipLabel} variant="text" block onPress={onSkip} />
      )}
      {error != null && <Text style={[TYPE.body, { color: redesign.critInk }]}>{error}</Text>}
    </Sheet>
  );
}

function StepButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { redesign } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.step, { backgroundColor: redesign.inset }, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.stepText, { color: redesign.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `.stepper` — `gap:20px; margin:8px 0`, 56px round buttons on `inset`.
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginVertical: 8 },
  amount: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  amountInput: { textAlign: 'center', fontVariant: ['tabular-nums'], padding: 0 },
  step: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 28, fontWeight: '700', lineHeight: 32 },
  center: { textAlign: 'center' },
});
