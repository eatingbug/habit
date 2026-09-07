import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { FONT_SIZE, RADIUS, SPACE } from '@/theme/tokens';

/**
 * `.banner` (caution tint), `.banner.good`, and a neutral variant — the artboards use
 * the neutral one for reassurance copy that must not read as an alarm.
 */
export type BannerVariant = 'warn' | 'good' | 'neutral';

export interface BannerProps {
  variant?: BannerVariant;
  /** A small status glyph, sparingly (§6.0). */
  icon?: string;
  children: React.ReactNode;
}

/**
 * RN has no `color-mix()`, so the CSS's 10–12% tints are expressed as a low-opacity
 * overlay of the semantic hue: an absolute fill inside the bordered box. That keeps one
 * hue per variant and stays correct in both themes.
 */
export function Banner({ variant = 'warn', icon, children }: BannerProps) {
  const { colors } = useTheme();
  const hue = variant === 'good' ? colors.good : colors.warn;

  return (
    <View
      style={[
        styles.banner,
        variant === 'neutral'
          ? { borderColor: colors.border, backgroundColor: colors.surface2 }
          : { borderColor: hue, backgroundColor: colors.surface },
      ]}
    >
      {variant !== 'neutral' && (
        <View style={[styles.tint, { backgroundColor: hue }]} pointerEvents="none" />
      )}
      {icon != null && <Text style={styles.icon}>{icon}</Text>}
      <Text style={[styles.text, { color: variant === 'neutral' ? colors.muted : colors.text }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md + 2,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.lg - 2,
    overflow: 'hidden',
  },
  tint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.11 },
  icon: { fontSize: FONT_SIZE.md },
  text: { flex: 1, fontSize: FONT_SIZE.sm + 0.5, lineHeight: 17 },
});
