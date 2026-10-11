import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { RADIUS, TAP_TARGET, TYPE, type Palette } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * `.btn` and its variants (`design/_tokens.redesign.css`):
 * - `pri`: the one primary action of a sheet (`accent` fill, 56 tall).
 * - `line`: a plain choice on `surface` (the yesterday list sheet).
 * - `soft`: a quiet secondary (`inset`), e.g. the free-log time button.
 * - `dash`: the dashed "add" button (끄적이기).
 * - `text`: a text-only link (`오늘 못 했어요 · 왜?`).
 * - `crit`: a destructive confirm.
 * - `warn`: a button inside the `warn` banner (`.banner .btn`).
 */
export type ButtonVariant = 'pri' | 'line' | 'soft' | 'dash' | 'text' | 'crit' | 'warn';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** A Lucide icon drawn before the word (§6.0 Icons: buttons pair an icon with a word). */
  icon?: LucideIcon;
  /** Full width. */
  block?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

interface Look {
  view: ViewStyle;
  color: string;
  weight: '600' | '700' | '800';
}

function lookOf(variant: ButtonVariant, p: Palette): Look {
  switch (variant) {
    case 'pri':
      return { view: { backgroundColor: p.accent, minHeight: 56 }, color: '#fff', weight: '800' };
    case 'crit':
      return { view: { backgroundColor: p.crit }, color: '#fff', weight: '800' };
    case 'soft':
      return { view: { backgroundColor: p.inset }, color: p.muted, weight: '800' };
    case 'line':
      return {
        view: { backgroundColor: p.surface, borderWidth: 2, borderColor: p.borderStrong },
        color: p.text,
        weight: '800',
      };
    case 'dash':
      return {
        view: { borderWidth: 2, borderStyle: 'dashed', borderColor: p.borderStrong },
        color: p.muted,
        weight: '700',
      };
    case 'text':
      return { view: {}, color: p.muted, weight: '600' };
    case 'warn':
      return {
        view: { backgroundColor: p.surface, borderWidth: 2, borderColor: p.warn },
        color: p.warnInk,
        weight: '800',
      };
  }
}

export function Button({
  label,
  onPress,
  variant = 'line',
  icon: Icon,
  block,
  disabled,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { redesign } = useTheme();
  const look = lookOf(variant, redesign);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        look.view,
        block && styles.block,
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 },
        style,
      ]}
    >
      {Icon != null && <Icon size={24} strokeWidth={2} color={look.color} />}
      <Text style={[styles.label, { color: look.color, fontWeight: look.weight }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TAP_TARGET,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  block: { alignSelf: 'stretch' },
  label: { ...TYPE.body, textAlign: 'center' },
});
