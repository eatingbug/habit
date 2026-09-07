import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

/** `.dot.g` / `.dot.a` / `.dot.r` — the 🟢 / 🟡 / 🔴 status light (§6.1). */
export type StatusLevel = 'good' | 'caution' | 'intervention';

export interface StatusDotProps {
  level: StatusLevel;
  style?: StyleProp<ViewStyle>;
}

/** A small semantic dot, not a glowing light: colour only, no shadow (§6.0). */
export function StatusDot({ level, style }: StatusDotProps) {
  const { colors } = useTheme();
  const backgroundColor =
    level === 'good' ? colors.good : level === 'caution' ? colors.warn : colors.crit;

  return <View style={[styles.dot, { backgroundColor }, style]} />;
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4, flexGrow: 0, flexShrink: 0 },
});
