import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, DayMark, HelpTip } from '@/components/re';
import { DAY_STATE_WORDS, DETAIL_COPY, TOOLTIPS } from '@/config/copy';
import type { DetailHeatmap } from '@/hooks/useHabitDetail';
import type { DayState } from '@/models';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/** Columns of the grid: one week per row, 3 rows (§6.5 Heatmap). */
const COLUMNS = 7;

/**
 * The 최근 3주 heatmap card (SPEC §6.5 Heatmap, `.heat`): a weekday row, then 7 by 3
 * cells ending on today at the bottom right, then the six-state legend. A cell is drawn
 * at 40 in a 48-tall row, and the whole cell is the touch area (§6.0 Touch areas).
 */
export function RecentHeatmap({
  heatmap,
  onPressDate,
}: {
  heatmap: DetailHeatmap;
  onPressDate: (date: string) => void;
}) {
  const { redesign } = useTheme();
  const rows = Array.from({ length: Math.ceil(heatmap.cells.length / COLUMNS) }, (_, row) =>
    heatmap.cells.slice(row * COLUMNS, (row + 1) * COLUMNS),
  );

  return (
    <Card>
      <View style={styles.headLine}>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{DETAIL_COPY.heatmap}</Text>
        <HelpTip text={TOOLTIPS.recentThreeWeeks} />
      </View>
      <View style={styles.grid}>
        <View style={styles.row}>
          {heatmap.weekdays.map((weekday, index) => (
            <Text key={index} style={[TYPE.label, styles.weekday, { color: redesign.muted }]}>
              {weekday}
            </Text>
          ))}
        </View>
        {rows.map((cells) => (
          <View key={cells[0].date} style={styles.row}>
            {cells.map((cell) => (
              <Pressable
                key={cell.date}
                onPress={() => onPressDate(cell.date)}
                disabled={!cell.tappable}
                accessibilityRole="button"
                accessibilityLabel={cell.label}
                accessibilityState={{ disabled: !cell.tappable }}
                style={({ pressed }) => [styles.cell, pressed && { opacity: 0.6 }]}
              >
                {cell.state == null ? <View style={styles.blank} /> : <DayMark state={cell.state} size={40} square />}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        {(Object.keys(DAY_STATE_WORDS) as DayState[]).map((state) => (
          <View key={state} style={styles.legendItem}>
            <DayMark state={state} size={22} />
            <Text style={[TYPE.label, { color: redesign.muted }]}>{DAY_STATE_WORDS[state]}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headLine: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  grid: { marginTop: 6 },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, height: 24, textAlign: 'center', textAlignVertical: 'bottom' },
  // At least 44 wide and 48 tall; the card's width gives each of 7 columns about 45.
  cell: { flex: 1, minWidth: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  blank: { width: 40, height: 40 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
