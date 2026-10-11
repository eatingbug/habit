import { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import { SKIP_REASON_LABELS, SHEET_COPY, WRITE_FAILED_NOTE } from '@/config/copy';
import type { SkipReason } from '@/models';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

import { ChoiceChip } from './Chip';
import { InputField } from './InputField';
import { Sheet } from './Sheet';

export interface SkipSheetProps {
  onClose: () => void;
  /** "🧘 명상". */
  eyebrow: string;
  /** "{어느 날} 못 했어요 · 왜?". */
  title: string;
  /** A reason chip — the skip is recorded at once (B5). Rejects on a failed write. */
  onPick: (reason: SkipReason, note: string) => Promise<void>;
}

/**
 * The skip reason sheet (SPEC §6.2, `ReTodaySkip`): the note on top, the hint, then
 * four reason chips. Tapping a chip records the skip at once — there is no submit.
 * Chips iterate `SKIP_REASON_LABELS`, whose key order is the on-screen order.
 */
export function SkipSheet({ onClose, eyebrow, title, onPick }: SkipSheetProps) {
  const { redesign } = useTheme();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(reason: SkipReason) {
    if (saving) return;
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await onPick(reason, note);
    } catch {
      setError(WRITE_FAILED_NOTE);
      setSaving(false);
    }
  }

  return (
    <Sheet visible onClose={onClose} eyebrow={eyebrow} title={title}>
      <InputField value={note} onChangeText={setNote} placeholder={SHEET_COPY.notePlaceholder} />
      <Text style={[TYPE.body, { color: redesign.muted }]}>{SHEET_COPY.skipHint}</Text>
      <View style={styles.grid}>
        {(Object.keys(SKIP_REASON_LABELS) as SkipReason[]).map((reason) => (
          <ChoiceChip
            key={reason}
            label={SKIP_REASON_LABELS[reason]}
            shape="box"
            disabled={saving}
            onPress={() => void pick(reason)}
            style={styles.cell}
          />
        ))}
      </View>
      {error != null && <Text style={[TYPE.body, { color: redesign.critInk }]}>{error}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Two columns of 56-tall chips, as the board's grid draws them.
  cell: { flexBasis: '47%', flexGrow: 1, minHeight: 56 },
});
