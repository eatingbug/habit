import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/re';
import type { JournalItem } from '@/hooks/useJournal';
import { TAP_TARGET, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface JournalEntryProps {
  item: JournalItem;
  /** False on a group's last row, which has no bottom border (`.entry:last-child`). */
  divider: boolean;
  onPress: () => void;
}

/**
 * `.entry` in `ReJournal` — one free log or one note. Read-only (§6.4): a tap leaves
 * for the screen that edits it, and nothing here writes. Every word and the chip's tone
 * are `useJournal`'s.
 */
export function JournalEntry({ item, divider, onPress }: JournalEntryProps) {
  const { redesign } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={item.accessibilityLabel}
      style={({ pressed }) => [
        styles.entry,
        divider && { borderBottomWidth: 1, borderBottomColor: redesign.border },
        pressed && { opacity: 0.6 },
      ]}
    >
      <View style={styles.spread}>
        {item.kind === 'note' ? (
          <View style={styles.row}>
            <Text style={[TYPE.label, { color: redesign.text }]}>{item.label}</Text>
            {item.stateChip != null && <Chip label={item.stateChip.label} tone={item.stateChip.tone} />}
          </View>
        ) : (
          <Text style={[TYPE.label, styles.shrink, { color: redesign.muted }]}>{item.label}</Text>
        )}
        <Text style={[TYPE.label, styles.time, { color: redesign.muted }]}>{item.time}</Text>
      </View>
      {item.text != null && <Text style={[TYPE.body, { color: redesign.text }]}>{item.text}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `.entry` — `gap:4px; padding:12px 0`.
  entry: { minHeight: TAP_TARGET, gap: 4, paddingVertical: 12 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  shrink: { flexShrink: 1 },
  time: { fontVariant: ['tabular-nums'] },
});
