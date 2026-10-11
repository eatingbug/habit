import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

import { HelpTip } from './HelpTip';

export interface BannerProps {
  /** The bold first line. */
  title: string;
  /** Tooltip copy for the `?` beside the title (§6.8). */
  help?: string;
  /** The actions under the title — `Button`s in the `warn` variant. */
  children?: ReactNode;
}

/** `.banner` — a `warn` tint box with `warn` ink, a title line with its `?`, then actions. */
export function Banner({ title, help, children }: BannerProps) {
  const { redesign } = useTheme();

  return (
    <View style={[styles.banner, { backgroundColor: redesign.warnTint }]}>
      <View style={styles.head}>
        <Text style={[TYPE.bodyStrong, styles.title, { color: redesign.warnInk }]}>{title}</Text>
        {help != null && <HelpTip text={help} />}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1 },
});
