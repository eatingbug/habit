import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '@/theme/tokens';

export interface ToastProps {
  /** The sentence, e.g. '기록됨'. */
  message: string;
  /** `.rx` — the mono delta, e.g. '+60 XP'. */
  detail?: string;
  /** Omitting this drops the 실행취소 slot (B6's undo is not always available). */
  onUndo?: () => void;
}

/**
 * `.toast` — inverted surface, the undo action in the accent. §6.0 allows a faint
 * shadow here (it floats above content) but nothing that reads as a glow.
 */
export function Toast({ message, detail, onUndo }: ToastProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.toast, { backgroundColor: colors.text }]}>
      <Text style={[styles.message, { color: colors.bg }]}>{message}</Text>
      {detail != null && <Text style={[styles.detail, { color: colors.bg }]}>{detail}</Text>}
      {onUndo != null && (
        <Pressable
          accessibilityRole="button"
          onPress={onUndo}
          style={({ pressed }) => [styles.undo, pressed && styles.undoPressed]}
        >
          <Text style={[styles.undoLabel, { color: colors.accent }]}>실행취소</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md + 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.lg - 1,
    paddingVertical: SPACE.md + 1,
  },
  message: { fontSize: FONT_SIZE.sm + 0.5 },
  detail: {
    fontFamily: FONT_FAMILY.mono,
    fontVariant: ['tabular-nums'],
    fontSize: FONT_SIZE.sm + 0.5,
    fontWeight: '600',
  },
  undo: { marginLeft: 'auto', paddingHorizontal: SPACE.sm, paddingVertical: SPACE.sm },
  undoPressed: { opacity: 0.6 },
  undoLabel: { fontSize: FONT_SIZE.sm + 0.5, fontWeight: '600' },
});
