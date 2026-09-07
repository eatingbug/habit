import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE } from '@/theme/tokens';

export interface TextBlockProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}

/** `.eyebrow` — mono, uppercase, letter-spaced, faint. */
export function Eyebrow({ children, style }: TextBlockProps) {
  const { colors } = useTheme();
  return <Text style={[styles.eyebrow, { color: colors.faint }, style]}>{children}</Text>;
}

/** `.hint` — the small explanatory line under a field. */
export function Hint({ children, style }: TextBlockProps) {
  const { colors } = useTheme();
  return <Text style={[styles.hint, { color: colors.faint }, style]}>{children}</Text>;
}

/** `.footnote` — centred, faint, end-of-screen. */
export function Footnote({ children, style }: TextBlockProps) {
  const { colors } = useTheme();
  return <Text style={[styles.footnote, { color: colors.faint }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs + 0.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '500',
  },
  hint: { fontSize: FONT_SIZE.xs + 0.5, lineHeight: 15 },
  footnote: { fontSize: FONT_SIZE.xs + 0.5, textAlign: 'center' },
});
