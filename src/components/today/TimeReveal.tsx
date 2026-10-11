import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/re';
import { SHEET_COPY } from '@/config/copy';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface TimeRevealProps {
  open: boolean;
  /** The closed button's words, e.g. "지금 14:20 · 시간 바꾸기". */
  label: string;
  hour: string;
  minute: string;
  onChangeHour: (value: string) => void;
  onChangeMinute: (value: string) => void;
  onOpen: () => void;
  /** 지금으로 — only where there is a "now" to go back to. */
  onReset?: () => void;
}

/**
 * B3's time override (SPEC §6.2): a small `soft` button that reveals an hour and a
 * minute field only when asked. `timestamp` only orders rows within a day (§3.3), so
 * overriding it is rare and the fields stay out of the way until then.
 */
export function TimeReveal({
  open,
  label,
  hour,
  minute,
  onChangeHour,
  onChangeMinute,
  onOpen,
  onReset,
}: TimeRevealProps) {
  const { redesign } = useTheme();

  if (!open) {
    return (
      <View style={styles.center}>
        <Button label={label} variant="soft" onPress={onOpen} />
      </View>
    );
  }

  const field = [TYPE.body, styles.field, { color: redesign.text, borderColor: redesign.borderStrong }];
  return (
    <View style={styles.row}>
      <TextInput
        value={hour}
        onChangeText={onChangeHour}
        keyboardType="number-pad"
        maxLength={2}
        accessibilityLabel={SHEET_COPY.hour}
        placeholder={SHEET_COPY.hour}
        placeholderTextColor={redesign.muted}
        style={field}
      />
      <Text style={[TYPE.title, { color: redesign.muted }]}>:</Text>
      <TextInput
        value={minute}
        onChangeText={onChangeMinute}
        keyboardType="number-pad"
        maxLength={2}
        accessibilityLabel={SHEET_COPY.minute}
        placeholder={SHEET_COPY.minute}
        placeholderTextColor={redesign.muted}
        style={field}
      />
      {onReset != null && <Button label={SHEET_COPY.backToNow} variant="soft" onPress={onReset} />}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  field: {
    width: 72,
    minHeight: 56,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
