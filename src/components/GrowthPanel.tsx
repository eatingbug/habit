import { StyleSheet, Text, View } from 'react-native';

import type { GrowthChart } from '@/hooks/useHabitDetail';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE, SPACE } from '@/theme/tokens';

import { Card } from './Card';
import { Eyebrow, Hint } from './Typography';

/**
 * The weekly growth panel (§6.3 C4) — `HabitDetail.body.html:22–35`, and the same
 * chart carried by `Established.body.html:16–35`, whose `.chartcard.primary` surface it
 * takes when the habit is established and the panel leads the screen.
 *
 * Every figure is already a percentage of one scale (`GrowthChart`), so a reference
 * line cannot be drawn outside the chart it annotates and no geometry is computed here.
 */
export function GrowthPanel({ chart, primary }: { chart: GrowthChart; primary: boolean }) {
  const { colors } = useTheme();
  // `Established.body.html:17` puts this week's running total beside the best week;
  // the `HabitDetail.body.html:23` head reads `최고 70` alone. So the second figure —
  // and the hint below the chart (`:34`) — ship on the artboard that carries them,
  // which is exactly where the panel leads the screen.
  const head = primary ? `최고 ${chart.best} · 이번 주 ${chart.thisWeek}` : `최고 ${chart.best}`;

  return (
    <Card primary={primary}>
      <View style={styles.chHead}>
        <Eyebrow>주마다 한 양 (최근 {chart.bars.length}주)</Eyebrow>
        <Text style={[styles.sub, { color: colors.muted }]}>{head}</Text>
      </View>

      <View
        style={styles.chart}
        // The bars are a shape, not 12 readouts; the two lines under them say the same
        // thing in words, so the chart is announced once as its own summary.
        accessibilityLabel={`주마다 한 양, 최근 ${chart.bars.length}주. ${head}`}
      >
        {chart.targetLine != null && (
          <View style={[styles.refline, { bottom: `${chart.targetLine}%`, borderColor: colors.accent }]}>
            <Text style={[styles.reflineLabel, { color: colors.accentInk, backgroundColor: primary ? colors.surface2 : colors.surface }]}>
              목표 주 {chart.weeklyTarget}
            </Text>
          </View>
        )}
        <View style={[styles.refline, { bottom: `${chart.floorLine}%`, borderColor: colors.borderStrong }]}>
          <Text style={[styles.reflineLabel, { color: colors.faint, backgroundColor: primary ? colors.surface2 : colors.surface }]}>
            최소 주 {chart.weeklyFloor}
          </Text>
        </View>

        {chart.bars.map((bar) => (
          <View key={bar.weeksAgo} style={[styles.bar, { backgroundColor: colors.inset }]}>
            {bar.best && <Text style={styles.star}>⭐</Text>}
            <View
              style={[
                styles.barFill,
                { height: `${bar.height}%`, backgroundColor: bar.best ? colors.accent : colors.done },
              ]}
            />
            {/* `이번` is the week `today` falls in (`:33`); the rest count backwards. */}
            <Text style={[styles.wk, { color: colors.faint }]}>
              {bar.weeksAgo === 0 ? '이번' : bar.weeksAgo}
            </Text>
          </View>
        ))}
      </View>

      {primary && (
        <Hint>
          점수는 쌓이기만 하니 그것만 보면 잘하고 있는 것처럼 보여요. 그래서{' '}
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            양이 늘고 있는지는 이 그래프로
          </Text>{' '}
          따로 봅니다.
        </Hint>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  chHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACE.md },
  sub: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.mono, fontVariant: ['tabular-nums'] },
  // `.chart` — a fixed 104px box the bars are a percentage of. The extra top and
  // bottom room is the ⭐ and the week labels, which the CSS hangs outside the box.
  chart: {
    position: 'relative',
    height: 104,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE.md - 2,
    paddingTop: SPACE.xl,
    marginBottom: SPACE.xl,
  },
  // `.refline` — a dashed rule across the plot with its label at the right end.
  refline: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'flex-end',
  },
  reflineLabel: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs - 1,
    paddingHorizontal: 3,
    marginTop: -7,
  },
  bar: { flex: 1, height: '100%', borderRadius: 3, position: 'relative', alignItems: 'center' },
  barFill: { position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: 3, minHeight: 3 },
  star: { position: 'absolute', top: -15, fontSize: FONT_SIZE.sm },
  wk: {
    position: 'absolute',
    bottom: -15,
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs - 1.5,
  },
});
