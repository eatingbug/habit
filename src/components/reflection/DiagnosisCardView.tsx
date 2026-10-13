import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/re';
import type { DiagnosisCard } from '@/hooks/useReflection';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

import { WeeklyChartView } from './WeeklyChartView';

/**
 * `.flag` (`ReReflection`, SPEC §6.7) — the badge, the message and the evidence. The
 * evidence is always in the body, never behind a tap: it is the guard against
 * rubber-stamping (CONCEPT §6.2 rule 4). The left rule and the badge carry the
 * severity in colour (`card.tone`), and the badge's ▲ or ◆ carries it in shape. Both
 * come from `useReflection`; this component only renders them.
 *
 * A `load` or decline card carries the weekly chart under its evidence
 * (`ReReflectionChart`, #147).
 */
export function DiagnosisCardView({ card }: { card: DiagnosisCard }) {
  const { redesign } = useTheme();

  return (
    <View
      style={[
        styles.flag,
        {
          backgroundColor: redesign.surface,
          borderColor: redesign.edge,
          borderLeftColor: redesign[card.tone],
          boxShadow: redesign.shadow,
        },
      ]}
    >
      <Chip label={card.badge} tone={card.tone} />
      <Text style={[TYPE.title, { color: redesign.text }]}>{card.message}</Text>
      <Text style={[TYPE.body, styles.evidence, { color: redesign.muted, backgroundColor: redesign.inset }]}>
        {card.evidence}
      </Text>
      {card.chart != null && <WeeklyChartView chart={card.chart} />}
    </View>
  );
}

const styles = StyleSheet.create({
  // `.flag` — 2px `edge`, a 6px left rule, `--r-md`, padding 14/16, gap 8.
  flag: {
    borderWidth: 2,
    borderLeftWidth: 6,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  // `.evidence` — `inset`, `--r-sm`, padding 10/12, 17px `muted`.
  evidence: { borderRadius: RADIUS.sm, paddingVertical: 10, paddingHorizontal: 12, overflow: 'hidden' },
});
