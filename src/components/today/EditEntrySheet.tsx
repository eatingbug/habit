import { useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';

import { Banner, Button, ChoiceChip, InputField, Sheet } from '@/components/re';
import {
  DAY_STATE_WORDS,
  deleteConfirmLines,
  editTimeLabel,
  SKIP_REASON_LABELS,
  TODAY_COPY,
  WRITE_FAILED_NOTE,
} from '@/config/copy';
import type { DeleteEffect, TodayHabitFeedItem } from '@/hooks/useToday';
import { localClock, restampedAtLocalTime } from '@/lib/device';
import type { HabitEntry, SkipReason } from '@/models';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

import { TimeReveal } from './TimeReveal';

type RowKind = 'activity' | 'skip';

export interface EditEntrySheetProps {
  item: TodayHabitFeedItem;
  onClose: () => void;
  onSave: (entry: HabitEntry) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
  deletePreview: (entryId: string) => DeleteEffect | null;
}

/**
 * A feed row reopened in a sheet, its `id` kept (SPEC §6.2 Edit & delete, #13): the
 * row kind (했어요 / 못 했어요), the amount or the reason, the note and the time. 저장
 * replaces that one row. 삭제 is immediate unless `deletePreview` names a consequence,
 * which is then confirmed first (D2).
 *
 * The time of a backfilled row stays at its noon pin (§6.3), so it is shown, not offered.
 */
export function EditEntrySheet({ item, onClose, onSave, onDelete, deletePreview }: EditEntrySheetProps) {
  const { redesign } = useTheme();
  const { entry, habit } = item;
  const isCount = habit.kind === 'count';
  const clock = localClock(entry.timestamp);

  const [kind, setKind] = useState<RowKind>(entry.skipReason == null ? 'activity' : 'skip');
  const [amount, setAmount] = useState(`${entry.actual > 0 ? entry.actual : habit.floor}`);
  const [reason, setReason] = useState<SkipReason | undefined>(entry.skipReason);
  const [note, setNote] = useState(entry.note ?? '');
  const [timeOpen, setTimeOpen] = useState(false);
  const [hour, setHour] = useState(clock.slice(0, 2));
  const [minute, setMinute] = useState(clock.slice(3, 5));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<DeleteEffect | null>(null);

  const parsed = Number(amount);
  const amountUsable = !isCount || (amount.trim().length > 0 && Number.isFinite(parsed) && parsed > 0);
  // The same shape gate `useQuickLog.editEntry` enforces (§3.3).
  const canSave = kind === 'skip' ? reason != null : amountUsable;
  const timestamp = timeOpen ? restampedAtLocalTime(entry.timestamp, entry.date, hour, minute) : entry.timestamp;

  async function run(write: () => Promise<void>) {
    if (saving) return;
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await write();
      onClose();
    } catch {
      setError(WRITE_FAILED_NOTE);
      setSaving(false);
      setConfirming(null);
    }
  }

  function save() {
    if (!canSave || timestamp == null) return;
    const trimmed = note.trim();
    void run(() =>
      onSave({
        ...entry,
        timestamp,
        // Both fields move together — §3.3's discriminator is absolute.
        actual: kind === 'skip' ? 0 : isCount ? parsed : 1,
        skipReason: kind === 'skip' ? reason : undefined,
        note: trimmed.length > 0 ? trimmed : undefined,
      }),
    );
  }

  function requestDelete() {
    const effect = deletePreview(entry.id);
    if (effect == null) void run(() => onDelete(entry.id));
    else setConfirming(effect);
  }

  return (
    <Sheet visible onClose={onClose} eyebrow={item.time} title={item.title}>
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
        isCount && (
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

      <InputField value={note} onChangeText={setNote} placeholder={TODAY_COPY.notePlaceholder} />

      {item.backfilled ? (
        <Text style={[TYPE.body, styles.center, { color: redesign.muted }]}>{TODAY_COPY.backfillTime}</Text>
      ) : (
        <TimeReveal
          open={timeOpen}
          label={editTimeLabel(clock)}
          hour={hour}
          minute={minute}
          onChangeHour={setHour}
          onChangeMinute={setMinute}
          onOpen={() => setTimeOpen(true)}
        />
      )}

      {confirming == null ? (
        <>
          <Button
            label={TODAY_COPY.save}
            variant="pri"
            block
            disabled={saving || !canSave || timestamp == null}
            onPress={save}
          />
          <Button label={TODAY_COPY.remove} variant="text" block disabled={saving} onPress={requestDelete} />
        </>
      ) : (
        <>
          <Banner
            title={deleteConfirmLines({
              habitName: confirming.habit.name,
              emptiesDay: confirming.emptiesDay,
              carriesMiss: confirming.carriesMiss,
              stateAfterLabel: confirming.stateAfter == null ? undefined : DAY_STATE_WORDS[confirming.stateAfter],
            }).join(' ')}
          />
          <Button
            label={TODAY_COPY.confirmRemove}
            variant="crit"
            block
            disabled={saving}
            onPress={() => void run(() => onDelete(entry.id))}
          />
          <Button label={TODAY_COPY.keep} variant="text" block disabled={saving} onPress={() => setConfirming(null)} />
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
