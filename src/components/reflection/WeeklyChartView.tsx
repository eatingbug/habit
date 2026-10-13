import { StyleSheet, Text, View } from 'react-native';

import type { WeeklyChart } from '@/hooks/useReflection';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The weekly chart under a Rule 3 or decline card (`ReReflectionChart`, #147). The
 * bars and lines are `.bars` of `ReDetailEstablished`. The line names sit in a gutter
 * right of the bars, so they never cover the ⭐. Every number and word is the hook's.
 */
export function WeeklyChartView({ chart }: { chart: WeeklyChart }) {
  const { redesign } = useTheme();
  const last = chart.bars.length - 1;

  return (
    <View accessible accessibilityLabel={chart.summary}>
      <View style={styles.spread}>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{chart.span}</Text>
        <Text style={[TYPE.label, styles.number, { color: redesign.muted }]}>{chart.best}</Text>
      </View>
      <View style={styles.plot}>
        <View style={styles.bars}>
          {chart.bars.map((bar, index) => (
            <View
              key={bar.weeksAgo}
              style={[
                styles.bar,
                {
                  height: `${bar.height}%`,
                  backgroundColor: index === last ? redesign.accent : redesign.accentTint,
                },
              ]}
            >
              {bar.best && (
                <Text style={styles.star} accessibilityLabel={chart.bestWeekLabel}>
                  ⭐
                </Text>
              )}
            </View>
          ))}
          <View pointerEvents="none" style={[styles.line, { bottom: `${chart.floorLine}%`, borderTopColor: redesign.borderStrong }]} />
          {chart.targetLine != null && (
            <View pointerEvents="none" style={[styles.line, { bottom: `${chart.targetLine}%`, borderTopColor: redesign.over }]} />
          )}
        </View>
        <View style={styles.gutter}>
          <Text style={[TYPE.label, styles.lineLabel, { bottom: `${chart.floorLine}%`, color: redesign.muted }]}>
            {chart.floorLabel}
          </Text>
          {chart.targetLine != null && chart.targetLabel != null && (
            <Text style={[TYPE.label, styles.lineLabel, { bottom: `${chart.targetLine}%`, color: redesign.doneInk }]}>
              {chart.targetLabel}
            </Text>
          )}
        </View>
      </View>
      <View style={[styles.spread, styles.axis]}>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{chart.startLabel}</Text>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{chart.endLabel}</Text>
      </View>
    </View>
  );
}

const GUTTER = 56;
const PLOT_GAP = 8;

const styles = StyleSheet.create({
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  number: { fontVariant: ['tabular-nums'] },
  // The board's 20px room above the plot holds the ⭐ of a full-height bar.
  plot: { flexDirection: 'row', gap: PLOT_GAP, height: 120, marginTop: 20 },
  // `.bars` — `gap:6px`, bars rounded 6px at the top.
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  bar: { flex: 1, borderTopLeftRadius: 6, borderTopRightRadius: 6, alignItems: 'center' },
  star: { position: 'absolute', top: -22, fontSize: 14, lineHeight: 20 },
  // `.bars .ln` — a 2px dashed rule across the bars.
  line: { position: 'absolute', left: 0, right: 0, borderTopWidth: 2, borderStyle: 'dashed' },
  gutter: { width: GUTTER },
  // Centred on its line: half of `TYPE.label`'s 20px line height below it.
  lineLabel: { position: 'absolute', left: 0, marginBottom: -10 },
  axis: { marginRight: GUTTER + PLOT_GAP },
});
