import { StyleSheet, Text, View } from 'react-native';

import { CHART_BEST_WEEK, CHART_THIS_WEEK } from '@/config/copy';
import type { ChartLine, WeeklyChart } from '@/hooks/useReflection';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The weekly chart under a Rule 3 or decline card (`ReReflectionChart`, #147). The
 * bars and lines are `.bars` of `ReDetailEstablished`. The line names sit in a gutter
 * right of the bars, so they never cover the ⭐. Every number and word is the hook's.
 */
export function WeeklyChartView({ chart }: { chart: WeeklyChart }) {
  const { redesign } = useTheme();

  return (
    <View style={styles.chart} accessible accessibilityLabel={chart.summary}>
      <View style={styles.spread}>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{chart.head}</Text>
        <Text style={[TYPE.label, styles.number, { color: redesign.muted }]}>{chart.bestLabel}</Text>
      </View>
      <View style={styles.plot}>
        <View style={styles.bars}>
          {chart.bars.map((bar) => (
            <View
              key={bar.weeksAgo}
              style={[
                styles.bar,
                {
                  height: `${bar.height}%`,
                  backgroundColor: bar.now ? redesign.accent : redesign.accentTint,
                },
              ]}
            >
              {bar.best && (
                <Text style={styles.star} accessibilityLabel={CHART_BEST_WEEK}>
                  ⭐
                </Text>
              )}
            </View>
          ))}
          <Rule line={chart.floor} color={redesign.borderStrong} />
          {chart.target != null && <Rule line={chart.target} color={redesign.over} />}
        </View>
        <View style={styles.gutter}>
          <RuleLabel line={chart.floor} ink={redesign.muted} />
          {chart.target != null && <RuleLabel line={chart.target} ink={redesign.doneInk} />}
        </View>
      </View>
      <View style={[styles.spread, styles.axis]}>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{chart.startLabel}</Text>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{CHART_THIS_WEEK}</Text>
      </View>
    </View>
  );
}

/** `.bars .ln` — a dashed rule across the bars. */
function Rule({ line, color }: { line: ChartLine; color: string }) {
  return <View pointerEvents="none" style={[styles.line, { bottom: `${line.at}%`, borderTopColor: color }]} />;
}

/** The rule's name in the gutter, level with it. */
function RuleLabel({ line, ink }: { line: ChartLine; ink: string }) {
  return <Text style={[TYPE.label, styles.lineLabel, { bottom: `${line.at}%`, color: ink }]}>{line.label}</Text>;
}

const GUTTER = 56;
const PLOT_GAP = 8;

const styles = StyleSheet.create({
  // The board's three rows are `.flag` children: `gap:8px`, the head `margin-top:4px`.
  chart: { gap: 8, marginTop: 4 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  number: { fontVariant: ['tabular-nums'] },
  // The board's 20px room above the plot holds the ⭐ of a full-height bar.
  plot: { flexDirection: 'row', gap: PLOT_GAP, height: 120, marginTop: 20 },
  // `.bars` — `gap:6px`, bars rounded 6px at the top.
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  // `minHeight` keeps a zero week visible as a stub in its slot.
  bar: { flex: 1, minHeight: 3, borderTopLeftRadius: 6, borderTopRightRadius: 6, alignItems: 'center' },
  star: { position: 'absolute', top: -22, fontSize: 14, lineHeight: 20 },
  line: { position: 'absolute', left: 0, right: 0, borderTopWidth: 2, borderStyle: 'dashed' },
  gutter: { width: GUTTER },
  // Centred on its line: half of `TYPE.label`'s 20px line height below it.
  lineLabel: { position: 'absolute', left: 0, marginBottom: -10 },
  axis: { marginRight: GUTTER + PLOT_GAP },
});
