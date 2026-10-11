import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RADIUS, TAP_TARGET, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface ToastProps {
  /** The first line, e.g. 기록됨. */
  title: string;
  /** Further lines, in order. Empty strings and `undefined` are skipped. */
  lines?: (string | undefined)[];
  /** The action word, e.g. 실행취소. */
  actionLabel: string;
  onAction: () => void;
  /** Distance from the bottom of the screen area the toast floats over. */
  bottom?: number;
}

/**
 * `.toast` — floats over the bottom of its screen. `text` background with `surface`
 * text, which inverts with the theme (§6.0 Visual rules). The action keeps `TAP_TARGET`.
 * `accessibilityLiveRegion` announces it when it appears.
 */
export function Toast({ title, lines = [], actionLabel, onAction, bottom = 16 }: ToastProps) {
  const { redesign } = useTheme();
  const shown = lines.filter((line): line is string => line != null && line.length > 0);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        { bottom, backgroundColor: redesign.text, borderColor: redesign.edge },
      ]}
    >
      <View style={styles.grow}>
        <Text style={[TYPE.bodyStrong, { color: redesign.surface }]}>{title}</Text>
        {shown.map((line) => (
          <Text key={line} style={[TYPE.label, styles.line, { color: redesign.surface }]}>
            {line}
          </Text>
        ))}
      </View>
      <Pressable onPress={onAction} accessibilityRole="button" style={styles.action}>
        <Text style={[TYPE.body, styles.actionText, { color: redesign.surface }]}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  grow: { flex: 1 },
  line: { fontWeight: '600' },
  action: { minHeight: TAP_TARGET, minWidth: TAP_TARGET, paddingHorizontal: 4, justifyContent: 'center' },
  actionText: { fontWeight: '800', textDecorationLine: 'underline' },
});
