import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RADIUS, TAP_TARGET, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface SegmentedControlProps<T extends string> {
  /** In on-screen order. */
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * `.seg` — an `inset` track with `padding:4px`. The selected segment is a raised
 * `surface` with `text`; the others are `muted`. Each segment is at least `TAP_TARGET`
 * tall and announces itself as a radio. Settings (theme) and New habit (측정 방식) use it.
 */
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const { redesign } = useTheme();

  return (
    <View style={[styles.seg, { backgroundColor: redesign.inset }]} accessibilityRole="radiogroup">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            style={[styles.segButton, on && { backgroundColor: redesign.surface, boxShadow: redesign.shadow }]}
          >
            <Text style={[styles.segText, { color: on ? redesign.text : redesign.muted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', borderRadius: RADIUS.md, padding: 4 },
  segButton: {
    flex: 1,
    minHeight: TAP_TARGET,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segText: { ...TYPE.body, fontWeight: '700' },
});
