import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { FONT_SIZE, RADIUS, SPACE } from '@/theme/tokens';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for a screen reader — the CSS uses `aria-label` on `.seg`. */
  label?: string;
}

/**
 * `.seg` — an inset track with one raised selection. The CSS marks the choice with
 * `aria-selected`, whose RN equivalent is `accessibilityState={{ selected }}`.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={[styles.seg, { backgroundColor: colors.inset }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              selected && { backgroundColor: colors.surface },
              pressed && !selected && { backgroundColor: colors.accentWeak },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? colors.text : colors.muted },
                selected && styles.selectedLabel,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', gap: SPACE.sm, padding: 3, borderRadius: RADIUS.md - 2 },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.md - 2,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.sm - 1,
    minHeight: 32,
  },
  label: { fontSize: FONT_SIZE.sm + 0.5, fontWeight: '500' },
  selectedLabel: { fontWeight: '600' },
});
