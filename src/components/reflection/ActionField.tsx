import { StyleSheet, TextInput } from 'react-native';

import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface ActionFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  /** The chosen action's label, as the accessible name. */
  accessibilityLabel: string;
  placeholder?: string;
  /** A number pad, for the floor and the target. */
  numeric?: boolean;
  /** Draws the `crit` border while the commit's error is shown. */
  invalid?: boolean;
}

/**
 * The recommended action's input (`.rec .field`, `ReReflection`). The shared
 * `InputField`'s box, plus the number pad and the error border this screen needs.
 */
export function ActionField({ value, onChangeText, accessibilityLabel, placeholder, numeric, invalid }: ActionFieldProps) {
  const { redesign } = useTheme();

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={redesign.muted}
      accessibilityLabel={accessibilityLabel}
      keyboardType={numeric ? 'number-pad' : 'default'}
      style={[
        TYPE.body,
        styles.field,
        {
          color: redesign.text,
          backgroundColor: redesign.surface,
          borderColor: invalid ? redesign.crit : redesign.borderStrong,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    minHeight: 56,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
});
