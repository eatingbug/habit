import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Chip, RecordSheet, Sheet, SkipSheet } from '@/components/re';
import { EditEntrySheet } from '@/components/today/EditEntrySheet';
import { FreeLogSheet } from '@/components/today/FreeLogSheet';
import { HabitCard } from '@/components/today/HabitCard';
import { LogOverlay, TOAST_CLEARANCE } from '@/components/today/LogOverlay';
import {
  LOADING_NOTE,
  RETRY_LABEL,
  SHEET_COPY,
  TODAY_COPY,
  TOOLTIPS,
} from '@/config/copy';
import { feedItemId, useToday, type TodayFeedItem } from '@/hooks/useToday';
import { RADIUS, TAP_TARGET, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Today — SPEC §6.2, the `ReToday*` artboards (#127). Redesign tokens and the shared
 * components in `src/components/re` only.
 *
 * The screen renders and decides nothing: every word, every count, which banner and
 * which sheet are `useToday`'s, and the toast and the celebration come through it from
 * `useQuickLog`. There are no component render tests (jest.config.js), so a judgment
 * written here would be one no test can reach.
 *
 * The one piece of state kept here is whether the "오늘 기록 N개" fold is open — a
 * view toggle with no rule behind it.
 */

export default function Today() {
  const { redesign } = useTheme();
  const router = useRouter();
  // Opened from 글 모음 (§6.4), the date a free log was written on. Absent: today.
  const { date } = useLocalSearchParams<{ date?: string }>();
  const view = useToday({ date });
  const { reload } = view;
  const [foldOpen, setFoldOpen] = useState(false);

  /**
   * Re-read on every return to this tab (#126). A tab stays mounted, so a log made on
   * the Dashboard or Habit Detail would otherwise not show here. The first focus is the
   * mount, whose load `useToday` already runs.
   */
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) reload();
      focusedBefore.current = true;
    }, [reload]),
  );

  const { sheet, yesterdayBanner, celebration, toast } = view;

  return (
    <View style={[styles.fill, { backgroundColor: redesign.bg }]}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.page}>
        <View>
          <Text style={[TYPE.label, { color: redesign.muted }]}>{view.dateLabel}</Text>
          <Text style={[TYPE.display, { color: redesign.text }]} accessibilityRole="header">
            {TODAY_COPY.title}
          </Text>
        </View>
        {view.backToToday != null && (
          <Button label={view.backToToday} variant="soft" onPress={() => router.setParams({ date: undefined })} />
        )}
        {view.countChip != null && <Chip label={view.countChip} tone="count" />}

        {/* A failed read is said here, once. Retry is the hook's (#51). */}
        {view.failure != null && (
          <Banner title={view.failure.message}>
            <Button label={RETRY_LABEL} variant="warn" onPress={view.failure.retry} />
          </Banner>
        )}

        {view.loading ? (
          <Text style={[TYPE.body, { color: redesign.muted }]}>{LOADING_NOTE}</Text>
        ) : (
          <>
            {yesterdayBanner != null && (
              <Banner title={yesterdayBanner.title} help={TOOLTIPS.yesterdayBanner}>
                {yesterdayBanner.single != null ? (
                  <View style={styles.pair}>
                    <Button
                      label={TODAY_COPY.did}
                      variant="warn"
                      onPress={() => view.openRecord(yesterdayBanner.single!.id, 'yesterday')}
                      style={styles.cell}
                    />
                    <Button
                      label={TODAY_COPY.didNot}
                      variant="warn"
                      onPress={() => view.openSkip(yesterdayBanner.single!.id, 'yesterday')}
                      style={styles.cell}
                    />
                  </View>
                ) : (
                  <Button label={TODAY_COPY.fill} variant="warn" block onPress={view.openYesterdayList} />
                )}
              </Banner>
            )}

            {/* Not when the read failed: that would claim there are no habits (#51). */}
            {view.rows.length === 0 && view.failure == null && (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>{TODAY_COPY.emptyEmoji}</Text>
                <Text style={[TYPE.body, { color: redesign.text }]}>{TODAY_COPY.empty}</Text>
                <Button label={TODAY_COPY.emptyAction} variant="pri" onPress={() => router.push('/habit/new')} />
              </View>
            )}

            {view.rows.map((row) => (
              <HabitCard
                key={row.habit.id}
                row={row}
                accessibilityLabel={`${row.habit.name} ${SHEET_COPY.record}`}
                onPress={() => view.openRecord(row.habit.id)}
              />
            ))}

            {view.feed.length > 0 && (
              <View>
                <Pressable
                  onPress={() => setFoldOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: foldOpen }}
                  accessibilityHint={foldOpen ? TODAY_COPY.foldClose : TODAY_COPY.foldOpen}
                  style={[styles.fold, { backgroundColor: redesign.surface, borderColor: redesign.edge }]}
                >
                  <Text style={[TYPE.body, styles.bold, { color: redesign.muted }]}>{view.foldLabel}</Text>
                  {foldOpen ? (
                    <ChevronUp size={24} strokeWidth={2} color={redesign.muted} />
                  ) : (
                    <ChevronDown size={24} strokeWidth={2} color={redesign.muted} />
                  )}
                </Pressable>
                {foldOpen &&
                  view.feed.map((item) => (
                    <FeedRow
                      key={feedItemId(item)}
                      item={item}
                      onPress={() => view.openFeedItem(feedItemId(item))}
                    />
                  ))}
              </View>
            )}

            {view.freeLogAvailable && (
              <Button
                label={TODAY_COPY.freeLogButton}
                icon={Pencil}
                variant="dash"
                block
                onPress={view.openFreeLog}
              />
            )}
          </>
        )}
      </ScrollView>

      <LogOverlay
        toast={toast}
        onUndo={() => void view.undoLast()}
        celebration={celebration}
        onDismissCelebration={view.dismissCelebration}
      />

      {sheet?.kind === 'record' && (
        <RecordSheet
          key={`${sheet.habit.id}:${sheet.day}`}
          onClose={view.closeSheet}
          title={sheet.title}
          sumLabel={sheet.sumLabel}
          isCount={sheet.isCount}
          unit={sheet.unit}
          defaultAmount={sheet.defaultAmount}
          timeLabel={sheet.timeLabel}
          skipLabel={sheet.skipLabel}
          resultLine={sheet.resultLine}
          onRecord={(amount, note) => view.recordFromSheet(amount, note)}
          onSkip={() => view.openSkip(sheet.habit.id, sheet.day)}
        />
      )}
      {sheet?.kind === 'skip' && (
        <SkipSheet
          key={`${sheet.habit.id}:${sheet.day}`}
          onClose={view.closeSheet}
          eyebrow={sheet.eyebrow}
          title={sheet.title}
          onPick={(reason, note) => view.skipFromSheet(reason, note)}
        />
      )}
      {sheet?.kind === 'yesterdayList' && (
        <Sheet visible onClose={view.closeSheet} eyebrow={sheet.eyebrow} title={sheet.title}>
          {sheet.blanks.map((blank) => (
            <View key={blank.habit.id} style={styles.listRow}>
              <Text style={[TYPE.title, { color: redesign.text }]}>{blank.label}</Text>
              <View style={styles.pair}>
                <Button
                  label={TODAY_COPY.did}
                  onPress={() => view.openRecord(blank.habit.id, 'yesterday')}
                  style={styles.cell}
                />
                <Button
                  label={TODAY_COPY.didNot}
                  onPress={() => view.openSkip(blank.habit.id, 'yesterday')}
                  style={styles.cell}
                />
              </View>
            </View>
          ))}
        </Sheet>
      )}
      {(sheet?.kind === 'freeLog' || sheet?.kind === 'editFree') && (
        <FreeLogSheet
          key={sheet.kind === 'editFree' ? sheet.item.log.id : 'new'}
          onClose={view.closeSheet}
          log={sheet.kind === 'editFree' ? sheet.item.log : undefined}
          clock={sheet.clock}
          timeLabel={sheet.timeLabel}
          timeUsable={view.freeTimeUsable}
          onSubmit={view.submitFreeFromSheet}
          onDelete={view.removeFreeFromSheet}
        />
      )}
      {sheet?.kind === 'editEntry' && (
        <EditEntrySheet
          key={sheet.item.entry.id}
          sheet={sheet}
          onClose={view.closeSheet}
          edited={view.editedEntry}
          onSave={view.saveEntryFromSheet}
          onDelete={view.removeEntryFromSheet}
        />
      )}
    </View>
  );
}

/** One row under the open fold — a control that opens the row's edit sheet. */
function FeedRow({ item, onPress }: { item: TodayFeedItem; onPress: () => void }) {
  const { redesign } = useTheme();
  const note = item.kind === 'habit' ? item.entry.note : undefined;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.time} ${item.title} ${item.summary}`}
      style={({ pressed }) => [
        styles.feedRow,
        { borderBottomColor: redesign.border },
        pressed && { backgroundColor: redesign.surface2 },
      ]}
    >
      <Text style={[TYPE.label, styles.time, { color: redesign.muted }]}>{item.time}</Text>
      <View style={styles.grow}>
        <Text style={[TYPE.bodyStrong, { color: redesign.text }]}>{item.title}</Text>
        <Text style={[TYPE.body, { color: redesign.muted }]}>{item.summary}</Text>
        {note != null && <Text style={[TYPE.label, { color: redesign.muted }]}>{note}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.page` — `padding:24px 20px 28px; gap:12px`.
  page: { paddingTop: 24, paddingHorizontal: 20, paddingBottom: TOAST_CLEARANCE, gap: 12 },
  pair: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  emptyEmoji: { fontSize: 56, lineHeight: 64 },
  // `.fold` — `min-height:56px; padding:0 16px; border:2px solid var(--edge)`.
  fold: {
    minHeight: 56,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bold: { fontWeight: '700' },
  listRow: { gap: 8 },
  feedRow: {
    minHeight: TAP_TARGET,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  time: { width: 48, paddingTop: 3, fontVariant: ['tabular-nums'] },
  grow: { flex: 1 },
});
