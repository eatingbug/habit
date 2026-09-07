import { StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE, TAP_TARGET } from '@/theme/tokens';

export interface TextFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Marks the box invalid — the miss hue on the border, per §6.0's semantic hues. */
  invalid?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** `.input` — 44px minimum, hairline border, surface background. */
export function TextField({
  value,
  onChangeText,
  placeholder,
  invalid,
  accessibilityLabel,
  style,
}: TextFieldProps) {
  const { colors } = useTheme();

  return (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.faint}
      style={[
        styles.input,
        {
          borderColor: invalid ? colors.crit : colors.borderStrong,
          backgroundColor: colors.surface,
          color: colors.text,
        },
        style,
      ]}
    />
  );
}

export interface NumberFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  accessibilityLabel?: string;
}

/**
 * `.numfield` — narrow, centred, mono with tabular numerals (§6.0), 44px minimum
 * because it is part of a logging control.
 */
export function NumberField({
  value,
  onChangeText,
  placeholder,
  invalid,
  accessibilityLabel,
}: NumberFieldProps) {
  const { colors } = useTheme();

  return (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.faint}
      keyboardType="decimal-pad"
      style={[
        styles.numfield,
        {
          borderColor: invalid ? colors.crit : colors.borderStrong,
          backgroundColor: colors.surface,
          color: colors.text,
        },
      ]}
    />
  );
}

/** `.input.ph` rendered read-only — a static box that states a fact, never typed into. */
export function StaticField({ text, muted, style }: { text: string; muted?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.input,
        styles.staticBox,
        { borderColor: colors.borderStrong, backgroundColor: colors.surface },
        style,
      ]}
    >
      <Text style={{ color: muted ? colors.faint : colors.text, fontSize: FONT_SIZE.md - 0.5 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.lg - 1,
    paddingVertical: SPACE.lg - 2,
    minHeight: TAP_TARGET,
    fontSize: FONT_SIZE.md - 0.5,
  },
  staticBox: { justifyContent: 'center' },
  numfield: {
    width: 56,
    flexGrow: 0,
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    minHeight: TAP_TARGET,
    paddingHorizontal: SPACE.sm,
    textAlign: 'center',
    fontFamily: FONT_FAMILY.mono,
    fontVariant: ['tabular-nums'],
    fontSize: FONT_SIZE.lg - 1,
    fontWeight: '600',
  },
});
