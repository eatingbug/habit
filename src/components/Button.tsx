import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE, TAP_TARGET } from '@/theme/tokens';

/** `.btn` variants: default, `.btn.pri`, `.btn.ghost`, `.btn.sel`. */
export type ButtonVariant = 'default' | 'pri' | 'ghost' | 'sel';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** `.btn.block` — full width. */
  block?: boolean;
  disabled?: boolean;
  /** `.btn.tap` — force the 44px minimum on a non-primary control that logs. */
  tap?: boolean;
  /** Counts read in mono (§6.0) — e.g. the "+5" one-tap chips. */
  mono?: boolean;
  /**
   * Overrides the accessible name when `label` alone is ambiguous out of context —
   * several rows each offering "+최소" need to say *which* habit. Defaults to `label`.
   */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * `.btn` — the one interactive surface. `pri` carries the accent, and §6.0's 44px
 * minimum, because it is the control that logs or commits.
 *
 * Pressed state replaces the CSS `:hover{border-color:accent}`: touch has no hover, so
 * the accent border/tint is the only feedback that a tap registered.
 */
export function Button({
  label,
  onPress,
  variant = 'default',
  block,
  disabled,
  tap,
  mono,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { colors } = useTheme();

  const base: ViewStyle =
    variant === 'pri'
      ? { backgroundColor: colors.accent, borderColor: colors.accent }
      : variant === 'ghost'
        ? { backgroundColor: 'transparent', borderColor: colors.border }
        : variant === 'sel'
          ? { backgroundColor: colors.accentWeak, borderColor: colors.accent }
          : { backgroundColor: colors.surface, borderColor: colors.borderStrong };

  const pressedSkin: ViewStyle =
    variant === 'pri'
      ? { backgroundColor: colors.accentInk, borderColor: colors.accentInk }
      : { borderColor: colors.accent, backgroundColor: colors.accentWeak };

  const fg =
    variant === 'pri'
      ? '#FFFFFF'
      : variant === 'ghost'
        ? colors.muted
        : variant === 'sel'
          ? colors.accentInk
          : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, selected: variant === 'sel' }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        base,
        variant === 'pri' && styles.pri,
        variant === 'ghost' && styles.ghost,
        tap && styles.tapTarget,
        block && styles.block,
        pressed && !disabled && pressedSkin,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: fg },
          variant === 'ghost' && styles.ghostLabel,
          mono && styles.mono,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.md - 2,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  pri: { minHeight: TAP_TARGET, paddingHorizontal: SPACE.xl - 2, paddingVertical: SPACE.lg - 2 },
  ghost: { paddingHorizontal: SPACE.lg - 2, paddingVertical: SPACE.md - 2 },
  tapTarget: { minHeight: TAP_TARGET },
  block: { width: '100%' },
  disabled: { opacity: 0.4 },
  label: { fontSize: FONT_SIZE.base, fontWeight: '600' },
  ghostLabel: { fontSize: FONT_SIZE.sm + 0.5, fontWeight: '500' },
  mono: { fontFamily: FONT_FAMILY.mono, fontVariant: ['tabular-nums'] },
});
