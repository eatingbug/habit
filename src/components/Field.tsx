import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '@/theme/tokens';

import { Hint } from './Typography';

export interface FieldProps {
  label: string;
  /**
   * `true` → `.req` 필수, `false` → `.opt` 선택, omitted → no tag at all. The binary
   * "최소량 · 목표" row in `Main.body.html` carries neither tag, so absence is a state.
   */
  required?: boolean;
  hint?: React.ReactNode;
  /** An error outranks the hint: the same slot, in the miss hue. */
  error?: string;
  children: React.ReactNode;
}

/** `.field` — a `.fl` label row with an optional 필수/선택 tag, the input, then `.hint`. */
export function Field({ label, required, hint, error, children }: FieldProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
        {required === true && (
          <Text
            style={[styles.tag, { color: colors.accentInk, backgroundColor: colors.accentWeak }]}
          >
            필수
          </Text>
        )}
        {required === false && (
          <Text style={[styles.tag, styles.optTag, { color: colors.faint, borderColor: colors.border }]}>
            선택
          </Text>
        )}
      </View>
      {children}
      {error != null ? (
        <Text style={[styles.error, { color: colors.crit }]}>{error}</Text>
      ) : hint != null ? (
        typeof hint === 'string' ? <Hint>{hint}</Hint> : hint
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: SPACE.md - 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md - 2 },
  label: { fontSize: FONT_SIZE.sm + 0.5 },
  tag: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs - 0.5,
    paddingHorizontal: SPACE.sm + 1,
    paddingVertical: 1,
    borderRadius: RADIUS.sm - 3,
    letterSpacing: 0.4,
    overflow: 'hidden',
  },
  optTag: { borderWidth: 1 },
  error: { fontSize: FONT_SIZE.xs + 0.5, lineHeight: 15 },
});
