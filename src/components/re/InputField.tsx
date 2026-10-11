import { StyleSheet, TextInput } from 'react-native';

import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface InputFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Also the accessible name when `accessibilityLabel` is absent. */
  placeholder: string;
  accessibilityLabel?: string;
  /** A taller box that wraps, e.g. the free-log text (`min-height:96px`). */
  multiline?: boolean;
  editable?: boolean;
}

/** `.field` — a 56-tall box on `surface` with a 2px `borderStrong` border, `body` text. */
export function InputField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  multiline = false,
  editable = true,
}: InputFieldProps) {
  const { redesign } = useTheme();

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={redesign.muted}
      accessibilityLabel={accessibilityLabel ?? placeholder}
      multiline={multiline}
      editable={editable}
      style={[
        TYPE.body,
        styles.field,
        multiline && styles.multiline,
        { color: redesign.text, backgroundColor: redesign.surface, borderColor: redesign.borderStrong },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 56,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
});
