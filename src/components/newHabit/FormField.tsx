import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { HelpTip } from '@/components/re';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface FormFieldProps {
  label: string;
  /** "· 선택", drawn after the label for an optional field. */
  optional?: string;
  /** The `?` tooltip copy (§6.8). */
  help?: string;
  error?: string;
  children: ReactNode;
}

/**
 * One New habit field: `.flabel` (a `label` line in `muted`, its "· 선택" and `?`), the
 * control, and the field's error under it in `crit` ink.
 */
export function FormField({ label, optional, help, error, children }: FormFieldProps) {
  const { redesign } = useTheme();

  return (
    <View style={styles.field}>
      <View style={styles.label}>
        <Text style={[TYPE.label, { color: redesign.muted }]}>
          {label}
          {optional != null && <Text style={styles.optional}>{` ${optional}`}</Text>}
        </Text>
        {help != null && <HelpTip text={help} />}
      </View>
      {children}
      {error != null && <Text style={[TYPE.label, { color: redesign.critInk }]}>{error}</Text>}
    </View>
  );
}

export interface AmountInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  /** Fixed width, as the board's `width:120px` amount box. Absent: grows. */
  width?: number;
  keyboard?: 'decimal-pad' | 'default';
}

/**
 * `.field` for the amount row: the shared `InputField` look, plus a fixed width and a
 * number keyboard, which the shared component does not take.
 */
export function AmountInput({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  width,
  keyboard = 'decimal-pad',
}: AmountInputProps) {
  const { redesign } = useTheme();

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={redesign.muted}
      accessibilityLabel={accessibilityLabel}
      keyboardType={keyboard}
      style={[
        TYPE.body,
        styles.input,
        width != null ? { width } : styles.grow,
        { color: redesign.text, backgroundColor: redesign.surface, borderColor: redesign.borderStrong },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  // The board's field stack: `gap:6px`, and `.flabel`'s `gap:4px; margin-bottom:2px`.
  field: { gap: 6 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  optional: { fontWeight: '600' },
  input: {
    minHeight: 56,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontVariant: ['tabular-nums'],
  },
  grow: { flex: 1 },
});
