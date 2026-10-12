import { StyleSheet, Text, View } from 'react-native';

import { GrowthPanel } from '@/components/GrowthPanel';
import { Chip } from '@/components/re';
import type { DiagnosisCard } from '@/hooks/useReflection';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * `.flag` (`ReReflection`, SPEC §6.7) — the badge, the message and the evidence. The
 * evidence is always in the body, never behind a tap: it is the guard against
 * rubber-stamping (CONCEPT §6.2 rule 4). The left rule and the badge carry the
 * severity in colour, and the badge's ▲ or ◆ carries it in shape.
 *
 * The weekly chart under a `load` or decline card is still the old `GrowthPanel`: no
 * artboard draws it on this screen yet.
 */
export function DiagnosisCardView({ card }: { card: DiagnosisCard }) {
  const { redesign } = useTheme();
  const critical = card.severity === 'critical';

  return (
    <View
      style={[
        styles.flag,
        {
          backgroundColor: redesign.surface,
          borderColor: redesign.edge,
          borderLeftColor: critical ? redesign.crit : redesign.warn,
          boxShadow: redesign.shadow,
        },
      ]}
    >
      <Chip label={card.badge} tone={critical ? 'crit' : 'warn'} />
      <Text style={[TYPE.title, { color: redesign.text }]}>{card.message}</Text>
      <Text style={[TYPE.body, styles.evidence, { color: redesign.muted, backgroundColor: redesign.inset }]}>
        {card.evidence}
      </Text>
      {card.chart != null && <GrowthPanel chart={card.chart} primary={false} />}
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
