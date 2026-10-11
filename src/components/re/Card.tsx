import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { RADIUS } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface CardProps {
  /** `ok` draws the `done` border (floor met), `red` the `crit` border. */
  tone?: 'ok' | 'red';
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/** `.card` — `surface`, a 2px `edge` border (an outline in dark), `--r-lg`, padding 16. */
export function Card({ tone, style, children }: CardProps) {
  const { redesign } = useTheme();
  const borderColor = tone === 'ok' ? redesign.done : tone === 'red' ? redesign.crit : redesign.edge;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: redesign.surface, borderColor, boxShadow: redesign.shadow },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: RADIUS.lg, padding: 16 },
});
