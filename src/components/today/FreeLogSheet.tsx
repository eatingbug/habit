import { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import { Button, ChoiceChip, HelpTip, InputField, Sheet } from '@/components/re';
import {
  editTimeLabel,
  freeLogTimeLabel,
  LOG_TYPE_LABELS,
  TODAY_COPY,
  TOOLTIPS,
  WRITE_FAILED_NOTE,
} from '@/config/copy';
import { localClock, restampedAtLocalTime, timestampAtLocalTime } from '@/lib/device';
import type { FreeLog, LogType } from '@/models';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

import { TimeReveal } from './TimeReveal';

export interface FreeLogSheetProps {
  onClose: () => void;
  /** Today's date — the day a new free log belongs to (§3.4). */
  date: string;
  /** Present when editing an existing log (#16 AC 5–7): prefilled, with 저장 and 삭제. */
  log?: FreeLog;
  /** A new log. Rejects on a failed write. */
  onCreate: (type: LogType, text: string, opts: { timestamp?: string }) => Promise<void>;
  onSave: (log: FreeLog) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/**
 * The 끄적이기 sheet (SPEC §6.2, `ReTodayFreeLog`): a `?` beside the title, four kind
 * chips (default 떠오른 생각), the text, the time button and 남기기. Reopened on an
 * existing log it edits that log in place, keyed on its id, and adds 삭제 — immediate,
 * since a free log carries no scoring weight (#16 AC 6).
 */
export function FreeLogSheet({ onClose, date, log, onCreate, onSave, onDelete }: FreeLogSheetProps) {
  const { redesign } = useTheme();
  const editing = log != null;
  const [type, setType] = useState<LogType>(log?.type ?? 'idea');
  const [text, setText] = useState(log?.text ?? '');
  const [timeOpen, setTimeOpen] = useState(false);
  const [hour, setHour] = useState(log == null ? '' : localClock(log.timestamp).slice(0, 2));
  const [minute, setMinute] = useState(log == null ? '' : localClock(log.timestamp).slice(3, 5));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A typed time that is not a time of day disables the submit rather than silently
  // falling back to now. An edit keeps the original stamp unless the clock changed.
  const timestamp = !timeOpen
    ? log?.timestamp
    : log != null
      ? restampedAtLocalTime(log.timestamp, log.date, hour, minute)
      : timestampAtLocalTime(date, hour, minute);
  const timeUsable = !timeOpen || timestamp != null;

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
    }
  }

  function openTime() {
    if (log == null) {
      const clock = localClock(new Date());
      setHour(clock.slice(0, 2));
      setMinute(clock.slice(3, 5));
    }
    setTimeOpen(true);
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={TODAY_COPY.freeLogTitle}
      titleAside={<HelpTip text={TOOLTIPS.freeLog} />}
    >
      <View style={styles.chips}>
        {(Object.keys(LOG_TYPE_LABELS) as LogType[]).map((kind) => (
          <ChoiceChip
            key={kind}
            label={LOG_TYPE_LABELS[kind]}
            selected={kind === type}
            onPress={() => setType(kind)}
          />
        ))}
      </View>
      <InputField
        value={text}
        onChangeText={setText}
        placeholder={TODAY_COPY.freeLogPlaceholder}
        accessibilityLabel={TODAY_COPY.freeLogButton}
        multiline
      />
      <TimeReveal
        open={timeOpen}
        label={
          log == null ? freeLogTimeLabel(localClock(new Date())) : editTimeLabel(localClock(log.timestamp))
        }
        hour={hour}
        minute={minute}
        onChangeHour={setHour}
        onChangeMinute={setMinute}
        onOpen={openTime}
        onReset={log == null ? () => setTimeOpen(false) : undefined}
      />
      {editing ? (
        <>
          <Button
            label={TODAY_COPY.save}
            variant="pri"
            block
            disabled={saving || !timeUsable}
            onPress={() => void run(() => onSave({ ...log, type, text, timestamp: timestamp ?? log.timestamp }))}
          />
          <Button
            label={TODAY_COPY.remove}
            variant="text"
            block
            disabled={saving}
            onPress={() => void run(() => onDelete(log.id))}
          />
        </>
      ) : (
        <Button
          label={TODAY_COPY.freeLogSubmit}
          variant="pri"
          block
          disabled={saving || !timeUsable}
          onPress={() => void run(() => onCreate(type, text, { timestamp }))}
        />
      )}
      {error != null && <Text style={[TYPE.body, { color: redesign.critInk }]}>{error}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
