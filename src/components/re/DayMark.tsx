import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { DAY_STATE_GLYPHS, DAY_STATE_WORDS } from '@/config/copy';
import type { DayState } from '@/models';
import type { Palette } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface DayMarkProps {
  state: DayState;
  /** Edge length. `.mk` is 36, `.mk.mini` (legends) 22, the heatmap's square 40. */
  size?: number;
  /** `.mk.sq` — the heatmap's rounded square. */
  square?: boolean;
}

function lookOf(state: DayState, p: Palette): { view: ViewStyle; color: string } {
  switch (state) {
    case 'done':
      return { view: { backgroundColor: p.done }, color: '#fff' };
    case 'over':
      return { view: { backgroundColor: p.over }, color: '#fff' };
    case 'partial':
      return { view: { backgroundColor: p.surface, borderWidth: 2, borderColor: p.done }, color: p.doneInk };
    case 'skip':
      return { view: { backgroundColor: p.inset }, color: p.muted };
    case 'missed':
      return { view: { backgroundColor: p.surface, borderWidth: 2, borderColor: p.crit }, color: p.critInk };
    case 'pending':
      return {
        view: { backgroundColor: p.surface, borderWidth: 2, borderStyle: 'dashed', borderColor: p.borderStrong },
        color: p.muted,
      };
  }
}

/**
 * The six day-state marks (SPEC §6.0 Day-state marks). Colour, glyph and the screen
 * word (as the accessible name) always go together, so state is never told by colour
 * alone. Not a control: a date cell that opens a sheet wraps it in its own pressable.
 */
export function DayMark({ state, size = 36, square = false }: DayMarkProps) {
  const { redesign } = useTheme();
  const look = lookOf(state, redesign);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={DAY_STATE_WORDS[state]}
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: square ? 10 : size / 2 },
        look.view,
      ]}
    >
      <Text style={[styles.glyph, { color: look.color }]}>{DAY_STATE_GLYPHS[state]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 14, fontWeight: '800', lineHeight: 18 },
});
