import { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import { Button, ChoiceChip, HelpTip, InputField, Sheet } from '@/components/re';
import { LOG_TYPE_LABELS, TODAY_COPY, TOOLTIPS, WRITE_FAILED_NOTE } from '@/config/copy';
import type { FreeDraft, TimeDraft } from '@/hooks/useToday';
import type { FreeLog, LogType } from '@/models';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

import { TimeReveal } from './TimeReveal';

export interface FreeLogSheetProps {
  onClose: () => void;
  /** Present when editing an existing log (#16 AC 5–7): prefilled, with 저장 and 삭제. */
  log?: FreeLog;
  /** "14:20" — what the time fields start from when opened. */
  clock: string;
  /** "지금 14:20 · 시간 바꾸기", or the edited log's own time. */
  timeLabel: string;
  /** Do the time fields read a time of day? (`useToday.freeTimeUsable`) */
  timeUsable: (time: TimeDraft) => boolean;
  /** 남기기 or 저장 — the hook stamps it, writes it and closes the sheet. */
  onSubmit: (draft: FreeDraft) => Promise<void>;
  /** 삭제 on an edited log — the hook deletes it and closes the sheet. */
  onDelete: () => Promise<void>;
}

/**
 * The 끄적이기 sheet (SPEC §6.2, `ReTodayFreeLog`): a `?` beside the title, four kind
 * chips (default 떠오른 생각), the text, the time button and 남기기. Reopened on an
 * existing log it edits that log in place and adds 삭제. Every stamp and write is the
 * hook's; this holds only what is being typed.
 */
export function FreeLogSheet({ onClose, log, clock, timeLabel, timeUsable, onSubmit, onDelete }: FreeLogSheetProps) {
  const { redesign } = useTheme();
  const [type, setType] = useState<LogType>(log?.type ?? 'idea');
  const [text, setText] = useState(log?.text ?? '');
  const [time, setTime] = useState<TimeDraft>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        open={time != null}
        label={timeLabel}
        hour={time?.hour ?? ''}
        minute={time?.minute ?? ''}
        onChangeHour={(hour) => setTime((t) => ({ hour, minute: t?.minute ?? '' }))}
        onChangeMinute={(minute) => setTime((t) => ({ hour: t?.hour ?? '', minute }))}
        onOpen={() => setTime({ hour: clock.slice(0, 2), minute: clock.slice(3, 5) })}
        onReset={log == null ? () => setTime(null) : undefined}
      />
      <Button
        label={log == null ? TODAY_COPY.freeLogSubmit : TODAY_COPY.save}
        variant="pri"
        block
        disabled={saving || !timeUsable(time)}
        onPress={() => void run(() => onSubmit({ type, text, time }))}
      />
      {log != null && (
        <Button label={TODAY_COPY.remove} variant="text" block disabled={saving} onPress={() => void run(onDelete)} />
      )}
      {error != null && <Text style={[TYPE.body, { color: redesign.critInk }]}>{error}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
