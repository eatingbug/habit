import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HelpTip } from '@/components/re';
import { TOOLTIPS } from '@/config/copy';
import type { LevelCardView } from '@/hooks/useDashboard';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The level card (SPEC §6.3, `ReDashboard`'s `.level`): a solid `accent` fill in both
 * themes, white text. The whole card opens the stat sheet; its `?` opens its own tooltip.
 */
export function LevelCard({ level, onPress }: { level: LevelCardView; onPress: () => void }) {
  const { redesign } = useTheme();
  const width = `${Math.round(Math.min(1, Math.max(0, level.barFraction)) * 100)}%` as const;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${level.title} ${level.nextLine}`}
      style={({ pressed }) => [styles.card, { backgroundColor: redesign.accent }, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.spread}>
        <View style={styles.head}>
          <Text style={[TYPE.headline, styles.white]}>{level.title}</Text>
          <HelpTip text={TOOLTIPS.characterLevel} tone="onFill" />
        </View>
        <ChevronRight size={24} strokeWidth={2} color="#fff" />
      </View>
      {level.statLine != null && <Text style={[TYPE.bodyStrong, styles.white]}>{level.statLine}</Text>}
      <View style={styles.track}>
        <View style={[styles.fill, { width }]} />
      </View>
      <Text style={[TYPE.label, styles.white]}>{level.nextLine}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `.level` — `padding:16px 18px; gap:8px; --r-lg`.
  card: { borderRadius: RADIUS.lg, paddingVertical: 16, paddingHorizontal: 18, gap: 8 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  white: { color: '#fff' },
  // `.lvbar` — 8px, white over 30% white.
  track: { height: 8, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 9, backgroundColor: '#fff' },
});
