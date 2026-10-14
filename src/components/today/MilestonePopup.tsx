import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { CELEBRATION_COPY } from '@/config/copy';
import { MILESTONE_POPUP_MS, type StreakCelebration } from '@/hooks/useQuickLog';
import { COLUMN_MAX_WIDTH, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

import { WeekStrip } from './WeekStrip';

/** Where the confetti sits, as fractions of the screen (`ReTodayMilestone`'s `.confetti`). */
const CONFETTI = [
  { glyph: '🎉', left: '10%', top: '27%' },
  { glyph: '✨', left: '82%', top: '24%' },
  { glyph: '🟧', left: '18%', top: '73%' },
  { glyph: '⭐', left: '77%', top: '74%' },
  { glyph: '✨', left: '7%', top: '50%' },
  { glyph: '🎉', left: '87%', top: '53%' },
  { glyph: '🟨', left: '46%', top: '21%' },
  { glyph: '🔥', left: '49%', top: '79%' },
] as const;

/**
 * The milestone popup (SPEC §6.2, `ReTodayMilestone`): on day 5, 10, 20, 30, 60 and 100
 * it shows instead of the banner, over a `scrim`, with confetti. The hook closes it
 * after `MILESTONE_POPUP_MS`; the bar at its foot drains over the same time. A tap
 * anywhere closes it sooner.
 */
export function MilestonePopup({ celebration, onDismiss }: { celebration: StreakCelebration; onDismiss: () => void }) {
  const { redesign } = useTheme();
  // State, not a ref: the value is read while rendering the bar's width.
  const [drain] = useState(() => new Animated.Value(1));

  useEffect(() => {
    drain.setValue(1);
    const run = Animated.timing(drain, {
      toValue: 0,
      duration: MILESTONE_POPUP_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [celebration.entryId, drain]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={[styles.fill, { backgroundColor: redesign.scrim }]} onPress={onDismiss} accessible={false}>
        {CONFETTI.map((piece, index) => (
          <Text key={index} style={[styles.confetti, { left: piece.left, top: piece.top }]}>
            {piece.glyph}
          </Text>
        ))}
        <View
          accessibilityLiveRegion="polite"
          style={[styles.popup, { backgroundColor: redesign.surface, borderColor: redesign.edge }]}
        >
          <Text style={styles.fire}>🔥</Text>
          <Text style={[TYPE.number, { color: redesign.streakInk }]}>{celebration.streak}</Text>
          <Text style={[TYPE.title, { color: redesign.text }]}>{CELEBRATION_COPY.streakSuffix}</Text>
          <Text style={[TYPE.body, styles.center, { color: redesign.muted }]}>{celebration.line}</Text>
          <WeekStrip week={celebration.week} />
          {[celebration.starLine, celebration.bonusLine].map(
            (line) =>
              line != null && (
                <Text
                  key={line}
                  style={[TYPE.label, styles.line, { backgroundColor: redesign.streakTint, color: redesign.streakInk }]}
                >
                  {line}
                </Text>
              ),
          )}
          <View style={[styles.drain, { backgroundColor: redesign.streakTint }]}>
            <Animated.View
              style={[
                styles.drainFill,
                {
                  backgroundColor: redesign.streak,
                  width: drain.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                },
              ]}
            />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const SIDE = 45;

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'center', paddingHorizontal: SIDE },
  confetti: { position: 'absolute', fontSize: 22 },
  // `.popup` — radius 28, padding 24/22/20, gap 8, centred. The `Modal` draws outside
  // the root column, so the card keeps the width it has in a column-wide window.
  popup: {
    width: '100%',
    maxWidth: COLUMN_MAX_WIDTH - SIDE * 2,
    alignSelf: 'center',
    borderRadius: 28,
    borderWidth: 2,
    paddingTop: 24,
    paddingHorizontal: 22,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 8,
  },
  fire: { fontSize: 64, lineHeight: 70 },
  center: { textAlign: 'center' },
  line: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, overflow: 'hidden' },
  drain: { height: 4, alignSelf: 'stretch', borderRadius: 9, overflow: 'hidden', marginTop: 8 },
  drainFill: { height: '100%' },
});
