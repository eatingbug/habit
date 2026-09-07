import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { FONT_SIZE, RADIUS, SPACE } from '@/theme/tokens';

/** `.chip` variants: neutral, `.chip.stat`, `.chip.warnc`, `.chip.goodc`. */
export type ChipVariant = 'neutral' | 'stat' | 'warn' | 'good';

export interface ChipProps {
  label: string;
  variant?: ChipVariant;
  /** Small status glyph — sparingly, never decoration (§6.0). */
  icon?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * `.chip` — a small muted pill, not a badge (§6.0: gamification reads as quiet UI).
 *
 * The `warn`/`good` variants are outline-only in the CSS (`background:transparent`),
 * which is how a semantic chip stays legible in both themes without a tinted fill.
 */
export function Chip({ label, variant = 'neutral', icon, style }: ChipProps) {
  const { colors } = useTheme();

  const skin: ViewStyle =
    variant === 'stat'
      ? { backgroundColor: colors.accentWeak, borderColor: 'transparent' }
      : variant === 'warn'
        ? { backgroundColor: 'transparent', borderColor: colors.warn }
        : variant === 'good'
          ? { backgroundColor: 'transparent', borderColor: colors.good }
          : { backgroundColor: colors.surface2, borderColor: colors.border };

  const fg =
    variant === 'stat'
      ? colors.accentInk
      : variant === 'warn'
        ? colors.warn
        : variant === 'good'
          ? colors.good
          : colors.muted;

  return (
    <View style={[styles.chip, skin, style]}>
      {icon != null && <Text style={[styles.text, { color: fg }]}>{icon}</Text>}
      <Text style={[styles.text, { color: fg }, variant === 'stat' && styles.strong]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACE.sm + 1,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.md,
    paddingVertical: 3,
  },
  text: { fontSize: FONT_SIZE.sm },
  strong: { fontWeight: '600' },
});
