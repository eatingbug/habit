import { StyleSheet, Text, View } from 'react-native';

import { Sheet } from '@/components/re';
import type { StatsSheet as StatsSheetView } from '@/hooks/useDashboard';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The stat sheet the level card opens (SPEC §6.3, `ReDashboardStats`): the character
 * level and the 별 left to the next level in the head, then one bar per stat with its
 * level, the habits tied to it and the 별 left to its next level.
 */
export function StatsSheet({ sheet, onClose }: { sheet: StatsSheetView; onClose: () => void }) {
  const { redesign } = useTheme();

  return (
    <Sheet visible onClose={onClose} title={sheet.title}>
      <Text style={[TYPE.body, { color: redesign.muted }]}>{sheet.subtitle}</Text>
      <View>
        {sheet.rows.map((row, index) => (
          <View
            key={row.id}
            style={[
              styles.row,
              index < sheet.rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: redesign.border },
            ]}
          >
            <View style={styles.spread}>
              <Text style={[TYPE.title, { color: redesign.text }]}>{row.title}</Text>
              <Text style={[TYPE.bodyStrong, { color: redesign.text }]}>{row.levelLabel}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: redesign.inset }]}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.round(Math.min(1, Math.max(0, row.barFraction)) * 100)}%`,
                    backgroundColor: redesign.statInk,
                  },
                ]}
              />
            </View>
            <View style={styles.spread}>
              <Text style={[TYPE.label, styles.grow, { color: redesign.muted }]}>{row.habits}</Text>
              <Text style={[TYPE.label, { color: redesign.muted }]}>{row.nextLine}</Text>
            </View>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // `.statrow` — `gap:6px; padding:12px 0`, a 1px `border` line between rows.
  row: { gap: 6, paddingVertical: 12 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  // `.sbar` — 10px on `inset`, `stat` ink fill.
  track: { height: 10, borderRadius: RADIUS.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: RADIUS.pill },
});
