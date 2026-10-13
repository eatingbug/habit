import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HelpTip } from '@/components/re';
import { TOOLTIPS } from '@/config/copy';
import type { LevelCardView } from '@/hooks/useDashboard';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/** Drawn for the eye only: the card's `Pressable` already announces these words. */
const VISUAL_ONLY = {
  pointerEvents: 'none',
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
  'aria-hidden': true,
} as const;

/**
 * The level card (SPEC §6.3, `ReDashboard`'s `.level`): a solid `accent` fill in both
 * themes, white text. The whole card opens the stat sheet; its `?` opens its own tooltip.
 */
export function LevelCard({ level, onPress }: { level: LevelCardView; onPress: () => void }) {
  const { redesign } = useTheme();
  const [pressed, setPressed] = useState(false);

  return (
    <View style={[styles.card, pressed && { opacity: 0.9 }]}>
      {/* The card's tap target sits behind its content, so the `?` is not nested inside it. */}
      <Pressable
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole="button"
        accessibilityLabel={`${level.title} ${level.nextLine}`}
        style={[StyleSheet.absoluteFill, styles.face, { backgroundColor: redesign.accent }]}
      />
      <View style={styles.spread} pointerEvents="box-none">
        <View style={styles.head} pointerEvents="box-none">
          <View {...VISUAL_ONLY}>
            <Text style={[TYPE.headline, styles.white]}>{level.title}</Text>
          </View>
          <HelpTip text={TOOLTIPS.characterLevel} tone="onFill" />
        </View>
        <View {...VISUAL_ONLY}>
          <ChevronRight size={24} strokeWidth={2} color="#fff" />
        </View>
      </View>
      <View style={styles.body} {...VISUAL_ONLY}>
        {level.statLine != null && <Text style={[TYPE.bodyStrong, styles.white]}>{level.statLine}</Text>}
        <View style={styles.track}>
          <View style={[styles.fill, { width: level.barWidth }]} />
        </View>
        <Text style={[TYPE.label, styles.white]}>{level.nextLine}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // `.level` — `padding:16px 18px; gap:8px; --r-lg`.
  card: { paddingVertical: 16, paddingHorizontal: 18, gap: 8 },
  face: { borderRadius: RADIUS.lg },
  body: { gap: 8 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  white: { color: '#fff' },
  // `.lvbar` — 8px, white over 30% white.
  track: { height: 8, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 9, backgroundColor: '#fff' },
});
