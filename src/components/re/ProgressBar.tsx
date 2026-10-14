import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { RADIUS } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface ProgressBarProps {
  /** 0..1, clamped. */
  ratio: number;
  /** Floor met: the bar turns from `accent` to `done` (§6.0 Visual rules). */
  done: boolean;
  style?: StyleProp<ViewStyle>;
}

/** `.bar` — a 10px track on `inset`. */
export function ProgressBar({ ratio, done, style }: ProgressBarProps) {
  const { redesign } = useTheme();
  const width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` as const;

  return (
    <View style={[styles.track, { backgroundColor: redesign.inset }, style]}>
      <View style={[styles.fill, { width, backgroundColor: done ? redesign.done : redesign.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, borderRadius: RADIUS.pill, marginTop: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: RADIUS.pill },
});
