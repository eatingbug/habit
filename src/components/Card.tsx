import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { RADIUS, SPACE } from '@/theme/tokens';

export interface CardProps {
  children: React.ReactNode;
  /** `.chartcard.primary` — the stronger border on `surface-2`. */
  primary?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * `.chartcard` / `.quest` — the shared surface. Depth is a hairline border only; §6.0
 * forbids gradients and glows, so there is nothing else to configure.
 */
export function Card({ children, primary, style }: CardProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.card,
        primary
          ? { borderColor: colors.borderStrong, backgroundColor: colors.surface2 }
          : { borderColor: colors.border, backgroundColor: colors.surface },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACE.lg, gap: SPACE.md + 2 },
});
