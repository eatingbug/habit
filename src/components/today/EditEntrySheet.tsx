import { useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';

import { Banner, Button, ChoiceChip, InputField, Sheet } from '@/components/re';
import {
  DAY_STATE_WORDS,
  deleteConfirmLines,
  SHEET_COPY,
  SKIP_REASON_LABELS,
  TODAY_COPY,
  WRITE_FAILED_NOTE,
} from '@/config/copy';
import type { EditEntrySheetView, EntryDraft, TimeDraft } from '@/hooks/useToday';
import type { HabitEntry, SkipReason } from '@/models';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

import { TimeReveal } from './TimeReveal';

export interface EditEntrySheetProps {
  sheet: EditEntrySheetView;
  onClose: () => void;
  /** The row the draft would store, or `null` when it cannot (`useToday.editedEntry`). */
  edited: (draft: EntryDraft) => HabitEntry | null;
  /** 저장 — the hook rewrites the row and closes the sheet. */
  onSave: (draft: EntryDraft) => Promise<void>;
  /** 삭제 (after its confirm, if any) — the hook deletes the row and closes the sheet. */
  onDelete: () => Promise<void>;
  /**
   * The confirm's lines, when the caller words them itself. Habit Detail passes them
   * because its rows sit on past days, which the lines must name (`useHabitDetail`).
   */
  deleteLines?: string[] | null;
}

/**
 * A feed row reopened in a sheet, its `id` kept (SPEC §6.2 Edit & delete, #13): the
 * row kind (했어요 / 못 했어요), the amount or the reason, the note and the time. The
 * hook builds and checks the row; this holds only what is being typed. 삭제 is
 * immediate unless the sheet carries a `deleteEffect`, which is confirmed first (D2).
 */
export function EditEntrySheet({ sheet, onClose, edited, onSave, onDelete, deleteLines }: EditEntrySheetProps) {
  const { redesign } = useTheme();
  const { entry, habit } = sheet.item;

  const [kind, setKind] = useState<EntryDraft['kind']>(entry.skipReason == null ? 'activity' : 'skip');
  const [amount, setAmount] = useState(`${entry.actual > 0 ? entry.actual : habit.floor}`);
  const [reason, setReason] = useState<SkipReason | undefined>(entry.skipReason);
  const [note, setNote] = useState(entry.note ?? '');
  const [time, setTime] = useState<TimeDraft>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const draft: EntryDraft = { kind, amount, reason, note, time };

  async function run(write: () => Promise<void>) {
    if (saving) return;
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await write();
    } catch {
      setError(WRITE_FAILED_NOTE);
      setSaving(false);
      setConfirming(false);
    }
  }

  const effect = sheet.deleteEffect;

  return (
    <Sheet visible onClose={onClose} eyebrow={sheet.item.time} title={sheet.item.title}>
      <View style={styles.pair}>
        {(['activity', 'skip'] as const).map((value) => (
          <ChoiceChip
            key={value}
            label={TODAY_COPY.editKinds[value]}
            shape="box"
            selected={kind === value}
            onPress={() => setKind(value)}
            style={styles.cell}
          />
        ))}
      </View>

      {kind === 'activity' ? (
        habit.kind === 'count' && (
          <View style={styles.amountRow}>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              accessibilityLabel={habit.floorUnit}
              style={[TYPE.headline, styles.amount, { color: redesign.text, borderColor: redesign.borderStrong }]}
            />
            <Text style={[TYPE.title, { color: redesign.text }]}>{habit.floorUnit}</Text>
          </View>
        )
      ) : (
        <View style={styles.pair}>
          {(Object.keys(SKIP_REASON_LABELS) as SkipReason[]).map((value) => (
            <ChoiceChip
              key={value}
              label={SKIP_REASON_LABELS[value]}
              shape="box"
              selected={reason === value}
              onPress={() => setReason(value)}
              style={styles.cell}
            />
          ))}
        </View>
      )}

      <InputField value={note} onChangeText={setNote} placeholder={SHEET_COPY.notePlaceholder} />

      {sheet.timeEditable ? (
        <TimeReveal
          open={time != null}
          label={sheet.timeLabel}
          hour={time?.hour ?? ''}
          minute={time?.minute ?? ''}
          onChangeHour={(hour) => setTime((t) => ({ hour, minute: t?.minute ?? '' }))}
          onChangeMinute={(minute) => setTime((t) => ({ hour: t?.hour ?? '', minute }))}
          onOpen={() => setTime({ hour: sheet.clock.slice(0, 2), minute: sheet.clock.slice(3, 5) })}
        />
      ) : (
        <Text style={[TYPE.body, styles.center, { color: redesign.muted }]}>{sheet.timeLabel}</Text>
      )}

      {!confirming ? (
        <>
          <Button
            label={TODAY_COPY.save}
            variant="pri"
            block
            disabled={saving || edited(draft) == null}
            onPress={() => void run(() => onSave(draft))}
          />
          <Button
            label={TODAY_COPY.remove}
            variant="text"
            block
            disabled={saving}
            onPress={() => (effect == null ? void run(onDelete) : setConfirming(true))}
          />
        </>
      ) : (
        <>
          {effect != null && (
            <Banner
              title={(
                deleteLines ??
                deleteConfirmLines({
                  habitName: effect.habit.name,
                  emptiesDay: effect.emptiesDay,
                  carriesMiss: effect.carriesMiss,
                  stateAfterLabel: effect.stateAfter == null ? undefined : DAY_STATE_WORDS[effect.stateAfter],
                })
              ).join(' ')}
            />
          )}
          <Button
            label={TODAY_COPY.confirmRemove}
            variant="crit"
            block
            disabled={saving}
            onPress={() => void run(onDelete)}
          />
          <Button label={TODAY_COPY.keep} variant="text" block disabled={saving} onPress={() => setConfirming(false)} />
        </>
      )}
      {error != null && <Text style={[TYPE.body, { color: redesign.critInk }]}>{error}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { flexBasis: '47%', flexGrow: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  amount: {
    width: 120,
    minHeight: 56,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  center: { textAlign: 'center' },
});
