import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { RADIUS, TAP_TARGET, TYPE, type Palette } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * `count` is `.chip.count` (the Today count chip: `surface`, 17px). `neutral` is `inset`
 * and `quiet` is `surface2`, both with `muted` ink (`.st.skip` and `.st.pending`). The
 * others are a colour's `tint` with its `ink` (§6.0: only `ink` goes on a `tint`).
 */
export type ChipTone =
  | 'count'
  | 'neutral'
  | 'quiet'
  | 'accent'
  | 'done'
  | 'warn'
  | 'crit'
  | 'streak'
  | 'stat';

export interface ChipProps {
  label: string;
  tone?: ChipTone;
  style?: StyleProp<ViewStyle>;
}

function toneOf(tone: Exclude<ChipTone, 'count'>, p: Palette): { bg: string; ink: string } {
  switch (tone) {
    case 'neutral':
      return { bg: p.inset, ink: p.muted };
    case 'quiet':
      return { bg: p.surface2, ink: p.muted };
    case 'accent':
      return { bg: p.accentTint, ink: p.accentInk };
    case 'done':
      return { bg: p.doneTint, ink: p.doneInk };
    case 'warn':
      return { bg: p.warnTint, ink: p.warnInk };
    case 'crit':
      return { bg: p.critTint, ink: p.critInk };
    case 'streak':
      return { bg: p.streakTint, ink: p.streakInk };
    case 'stat':
      return { bg: p.statTint, ink: p.statInk };
  }
}

/** `.chip` — a static label. Not a control, so it has no touch area. */
export function Chip({ label, tone = 'neutral', style }: ChipProps) {
  const { redesign } = useTheme();

  if (tone === 'count') {
    return (
      <View
        style={[
          styles.chip,
          styles.count,
          { backgroundColor: redesign.surface, borderColor: redesign.edge, boxShadow: redesign.shadow },
          style,
        ]}
      >
        <Text style={[TYPE.body, styles.countText, { color: redesign.text }]}>{label}</Text>
      </View>
    );
  }

  const { bg, ink } = toneOf(tone, redesign);
  return (
    <View style={[styles.chip, { backgroundColor: bg }, style]}>
      <Text style={[TYPE.label, { color: ink }]}>{label}</Text>
    </View>
  );
}

export interface ChoiceChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** `pill` is `.fchip` (kind and filter chips), `box` is `.pick` (reason chips). */
  shape?: 'pill' | 'box';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A chip that is a control: `.fchip` or `.pick`. At least `TAP_TARGET` tall. Selected
 * is shown by fill and border, and announced through `accessibilityState`.
 */
export function ChoiceChip({ label, selected = false, onPress, shape = 'pill', disabled, style }: ChoiceChipProps) {
  const { redesign } = useTheme();
  const on =
    shape === 'pill'
      ? { backgroundColor: redesign.accent, borderColor: redesign.accent, color: '#fff' }
      : { backgroundColor: redesign.accentTint, borderColor: redesign.accent, color: redesign.accentInk };
  const off = { backgroundColor: redesign.surface, borderColor: redesign.border, color: redesign.text };
  const look = selected ? on : off;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      style={({ pressed }) => [
        shape === 'pill' ? styles.pill : styles.box,
        { backgroundColor: look.backgroundColor, borderColor: look.borderColor },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 },
        style,
      ]}
    >
      <Text style={[TYPE.body, styles.choiceText, { color: look.color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: RADIUS.pill,
  },
  count: { borderWidth: 2, paddingVertical: 8, paddingHorizontal: 14 },
  countText: { fontWeight: '700' },
  pill: {
    minHeight: TAP_TARGET,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    minHeight: TAP_TARGET,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: { fontWeight: '700' },
});
