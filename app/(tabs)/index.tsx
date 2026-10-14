import { useFocusEffect, useRouter } from 'expo-router';
import { Plus, Settings } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { HabitRow } from '@/components/dashboard/HabitRow';
import { LevelCard } from '@/components/dashboard/LevelCard';
import { StatsSheet } from '@/components/dashboard/StatsSheet';
import { Banner, Button, HelpTip, IconButton, RecordSheet, SkipSheet } from '@/components/re';
import { LogOverlay, TOAST_CLEARANCE } from '@/components/today/LogOverlay';
import {
  DASHBOARD_COPY,
  LOADING_NOTE,
  RETRY_LABEL,
  SETTINGS_COPY,
  TOOLTIPS,
} from '@/config/copy';
import { useDashboard } from '@/hooks/useDashboard';
import { SPACE, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Dashboard — SPEC §6.3, the `ReDashboard`, `ReDashboardStats` and `ReDashboardEmpty`
 * artboards (#129). Redesign tokens and the shared components in `src/components/re`.
 *
 * The screen renders and decides nothing: every word, the row order, every figure and
 * which sheet is open are `useDashboard`'s. There are no component render tests
 * (jest.config.js), so a judgment written here would be one no test can reach.
 */

export default function Dashboard() {
  const { redesign } = useTheme();
  const router = useRouter();
  const view = useDashboard();
  const { reload, sheet, toast, celebration } = view;

  /**
   * Re-read on every return to this tab. It stays mounted under what it pushes, so a
   * Reflection commit or a habit created or edited would not show otherwise. The first
   * focus is the mount, whose load `useDashboard` already runs.
   */
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) reload();
      focusedBefore.current = true;
    }, [reload]),
  );

  const newHabit = () => router.push('/habit/new');

  return (
    <View style={[styles.fill, { backgroundColor: redesign.bg }]}>
      <ScrollView style={styles.fill} contentContainerStyle={[styles.page, view.empty && styles.grow]}>
        <View style={styles.top}>
          <View>
            <Text style={[TYPE.label, { color: redesign.muted }]}>{view.dateLabel}</Text>
            <Text style={[TYPE.display, { color: redesign.text }]} accessibilityRole="header">
              {DASHBOARD_COPY.title}
            </Text>
          </View>
          <IconButton
            icon={Settings}
            accessibilityLabel={SETTINGS_COPY.open}
            onPress={() => router.push('/settings')}
          />
        </View>

        {/* A failed read or undo is said here, once. Retry is the hook's (#51). */}
        {view.failure != null && (
          <Banner title={view.failure.message}>
            <Button label={RETRY_LABEL} variant="warn" onPress={view.failure.retry} />
          </Banner>
        )}

        {view.loading ? (
          <Text style={[TYPE.body, { color: redesign.muted }]}>{LOADING_NOTE}</Text>
        ) : (
          <>
            <LevelCard level={view.level} onPress={view.openStats} />

            {view.empty ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>{DASHBOARD_COPY.emptyEmoji}</Text>
                <Text style={[TYPE.title, { color: redesign.text }]}>{DASHBOARD_COPY.empty}</Text>
                <Button label={DASHBOARD_COPY.newHabit} variant="pri" onPress={newHabit} style={styles.emptyButton} />
              </View>
            ) : (
              <>
                {view.needsAttentionLabel != null && (
                  <Text style={[TYPE.title, styles.headLine, { color: redesign.text }]} accessibilityRole="header">
                    {view.needsAttentionLabel}
                  </Text>
                )}
                <View style={styles.rows}>
                  <View style={styles.weekHead}>
                    <Text style={[TYPE.label, styles.weekLabel, { color: redesign.muted }]}>
                      {DASHBOARD_COPY.recentWeek}
                    </Text>
                    <HelpTip text={TOOLTIPS.sevenDayDots} />
                  </View>
                  {view.rows.map((row) => (
                    <HabitRow
                      key={row.habit.id}
                      row={row}
                      onPress={() => router.push(`/habit/${row.habit.id}`)}
                      onDay={(date) => view.openRecord(row.habit.id, date)}
                      onReflect={() => router.push(`/reflect/${row.habit.id}`)}
                    />
                  ))}
                </View>
                <Button label={DASHBOARD_COPY.newHabit} icon={Plus} variant="dash" block onPress={newHabit} />
              </>
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
          key={`${sheet.habit.id}:${sheet.date}`}
          onClose={view.closeSheet}
          eyebrow={sheet.eyebrow}
          title={sheet.title}
          sumLabel={sheet.sumLabel}
          isCount={sheet.isCount}
          unit={sheet.unit}
          defaultAmount={sheet.defaultAmount}
          timeLabel={sheet.timeLabel}
          skipLabel={sheet.skipLabel}
          resultLine={sheet.resultLine}
          onRecord={(amount, note) => view.recordFromSheet(amount, note)}
          onSkip={() => view.openSkip(sheet.habit.id, sheet.date)}
        />
      )}
      {sheet?.kind === 'skip' && (
        <SkipSheet
          key={`${sheet.habit.id}:${sheet.date}`}
          onClose={view.closeSheet}
          eyebrow={sheet.eyebrow}
          title={sheet.title}
          onPick={(reason, note) => view.skipFromSheet(reason, note)}
        />
      )}
      {sheet?.kind === 'stats' && <StatsSheet sheet={sheet} onClose={view.closeSheet} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  // `.page` — `padding:24px var(--space-xl) 28px; gap:var(--space-md)`.
  page: { paddingTop: 24, paddingHorizontal: SPACE.xl, paddingBottom: TOAST_CLEARANCE, gap: SPACE.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  // `.head-line` — `margin:12px 0 0`.
  headLine: { marginTop: 12 },
  // The habit rows sit closer than the page gap. Their one `?` heads them (ADR-0009).
  rows: { gap: SPACE.sm },
  weekHead: { flexDirection: 'row', alignItems: 'center' },
  weekLabel: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyEmoji: { fontSize: 64, lineHeight: 72 },
  emptyButton: { paddingHorizontal: 28 },
});
