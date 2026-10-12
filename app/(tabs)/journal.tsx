import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Pencil } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { JournalEntry } from '@/components/journal/JournalEntry';
import { Banner, Button, Card, ChoiceChip } from '@/components/re';
import { JOURNAL_COPY, LOADING_NOTE, RETRY_LABEL } from '@/config/copy';
import { useJournal } from '@/hooks/useJournal';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * 글 모음 — SPEC §6.4, the `ReJournal` artboard (#132). Redesign tokens and the shared
 * components in `src/components/re` only.
 *
 * The screen renders and decides nothing: the words, the groups, the filter and where a
 * row goes are `useJournal`'s. The list is read-only; a row is a link.
 */
export default function Journal() {
  const { redesign } = useTheme();
  const router = useRouter();
  const view = useJournal();
  const { reload } = view;

  /**
   * Re-read on every return to this tab. A tab stays mounted, so a note written on
   * Today or Habit Detail would otherwise not show here. The first focus is the mount,
   * whose load `useJournal` already runs.
   */
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) reload();
      focusedBefore.current = true;
    }, [reload]),
  );

  return (
    <ScrollView style={[styles.fill, { backgroundColor: redesign.bg }]} contentContainerStyle={styles.page}>
      <View>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{view.dateLabel}</Text>
        <Text style={[TYPE.display, { color: redesign.text }]} accessibilityRole="header">
          {view.title}
        </Text>
      </View>

      {view.chips.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {view.chips.map((chip) => (
            <ChoiceChip
              key={chip.id}
              label={chip.label}
              selected={chip.selected}
              onPress={() => view.select(chip.id)}
            />
          ))}
        </ScrollView>
      )}

      {/* A failed read is said here, once. Retry is the hook's (#51). */}
      {view.failure != null && (
        <Banner title={view.failure.message}>
          <Button label={RETRY_LABEL} variant="warn" onPress={view.failure.retry} />
        </Banner>
      )}

      {view.loading && <Text style={[TYPE.body, { color: redesign.muted }]}>{LOADING_NOTE}</Text>}

      {view.empty && (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>{JOURNAL_COPY.emptyEmoji}</Text>
          <Text style={[TYPE.body, { color: redesign.text }]}>{JOURNAL_COPY.empty}</Text>
          <Button
            label={JOURNAL_COPY.emptyAction}
            icon={Pencil}
            variant="pri"
            onPress={() => router.push('/today')}
          />
        </View>
      )}

      {view.noMatch && <Text style={[TYPE.body, { color: redesign.muted }]}>{JOURNAL_COPY.noMatch}</Text>}

      {view.groups.map((group) => (
        <View key={group.date} style={styles.group}>
          <Text style={[TYPE.label, styles.groupHead, { color: redesign.muted }]}>{group.label}</Text>
          <Card style={styles.card}>
            {group.items.map((item, index) => (
              <JournalEntry
                key={item.id}
                item={item}
                divider={index < group.items.length - 1}
                onPress={() => router.push(item.href as Href)}
              />
            ))}
          </Card>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.page` — `padding:24px 20px 28px; gap:12px`.
  page: { paddingTop: 24, paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
  // `.chips` — `gap:8px`. Scrolls sideways when the habits outgrow the width.
  chips: { gap: 8 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  emptyEmoji: { fontSize: 56, lineHeight: 64 },
  group: { gap: 12 },
  // The group head's `margin-top:8px`.
  groupHead: { marginTop: 8 },
  // `.card` with `padding:4px 16px`.
  card: { paddingVertical: 4, paddingHorizontal: 16 },
});
