import { StyleSheet, Text, View } from 'react-native';

import { BEST_RECORD_GLYPH, STATUS_LIGHT_GLYPHS, STATUS_LIGHT_WORDS } from '@/config/copy';
import type { StatusLight as StatusLightValue } from '@/domain/statusLight';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface StatusLightProps {
  light: StatusLightValue;
}

/**
 * `.light` — the status light as colour, shape and word together (SPEC §6.0 Visual
 * rules): ● 괜찮아요, ◆ 살펴보세요, ▲ 손봐야 해요. `personal_best` is a 괜찮아요 that
 * adds ★ (`ReDashboard`: "● 괜찮아요 ★"). Its `?` is the caller's, beside it.
 */
export function StatusLight({ light }: StatusLightProps) {
  const { redesign } = useTheme();
  const level = light === 'personal_best' ? 'stable' : light;
  const colors = {
    stable: { bg: redesign.doneTint, ink: redesign.doneInk },
    caution: { bg: redesign.warnTint, ink: redesign.warnInk },
    intervention: { bg: redesign.critTint, ink: redesign.critInk },
  }[level];
  const text =
    `${STATUS_LIGHT_GLYPHS[level]} ${STATUS_LIGHT_WORDS[level]}` +
    (light === 'personal_best' ? ` ${BEST_RECORD_GLYPH}` : '');

  return (
    <View style={[styles.light, { backgroundColor: colors.bg }]}>
      <Text style={[TYPE.label, { color: colors.ink }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  light: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.pill,
  },
});
