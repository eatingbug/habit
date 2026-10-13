import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Ellipsis } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Banner,
  Button,
  Card,
  Chip,
  HelpTip,
  IconButton,
  Pill,
  RecordSheet,
  Sheet,
  SkipSheet,
  StatusLight,
} from '@/components/re';
import { DesignSheet } from '@/components/detail/DesignSheet';
import { HeroCard } from '@/components/detail/HeroCard';
import { MoreMenu } from '@/components/detail/MoreMenu';
import { RecentHeatmap } from '@/components/detail/RecentHeatmap';
import { EditEntrySheet } from '@/components/today/EditEntrySheet';
import { LogOverlay, TOAST_CLEARANCE } from '@/components/today/LogOverlay';
import {
  DETAIL_COPY,
  LOADING_NOTE,
  RETRY_LABEL,
  SCREEN_WORDS,
  SETTINGS_COPY,
  TOOLTIPS,
} from '@/config/copy';
import {
  useHabitDetail,
  type DesignCard,
  type DetailInk,
  type DetailMenuItem,
  type JournalDay,
} from '@/hooks/useHabitDetail';
import { RADIUS, TAP_TARGET, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Habit Detail — SPEC §6.5, the `ReDetailForming`, `ReDetailEstablished`, `ReDetailRed`
 * and `ReDetailPause` artboards (#128). Redesign tokens and the shared components in
 * `src/components/re` only; the pieces only this screen draws are in
 * `src/components/detail`.
 *
 * The screen renders and decides nothing: every word, every number, which pills show,
 * which hero card, which menu items and which sheet is open are `useHabitDetail`'s.
 * There are no component render tests (jest.config.js), so a judgment written here
 * would be one no test can reach.
 *
 * Kept here: whether the ⋯ menu and the 이유 are open — view toggles with no rule.
 */

export default function HabitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { redesign } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const view = useHabitDetail(id);
  const { reload } = view;
  const [menuOpen, setMenuOpen] = useState(false);

  // Opened straight from the URL (a reload), there is nothing to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const reflect = () => router.push(`/reflect/${id}`);

  /** Re-read on every return, e.g. from Reflection, which may have changed the design. */
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) reload();
      focusedBefore.current = true;
    }, [reload]),
  );

  function pick(key: DetailMenuItem['key']) {
    setMenuOpen(false);
    if (key === 'reflect') reflect();
    else void view.pickMenu(key);
  }

  const { habit, head, hero, sheet, toast, celebration } = view;
  const pageTop = { paddingTop: 24 + insets.top };

  const topBar = (
    <View style={styles.topBar}>
      <IconButton icon={ChevronLeft} accessibilityLabel={SETTINGS_COPY.back} onPress={back} />
      {habit != null && (
        <IconButton icon={Ellipsis} accessibilityLabel={DETAIL_COPY.more} onPress={() => setMenuOpen(true)} />
      )}
    </View>
  );

  if (view.loading || habit == null || head == null) {
    return (
      <View style={[styles.fill, styles.page, pageTop, { backgroundColor: redesign.bg }]}>
        {topBar}
        {view.loading ? (
          <Text style={[TYPE.body, { color: redesign.muted }]}>{LOADING_NOTE}</Text>
        ) : view.failure != null ? (
          // A failed read is said, never "not found" (#51).
          <Banner title={view.failure.message}>
            <Button label={RETRY_LABEL} variant="warn" onPress={view.failure.retry} />
          </Banner>
        ) : (
          <Text style={[TYPE.body, { color: redesign.muted }]}>{DETAIL_COPY.notFound}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: redesign.bg }]}>
      <ScrollView style={styles.fill} contentContainerStyle={[styles.page, pageTop]}>
        {topBar}
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: redesign.accentTint }]}>
            <Text style={styles.iconText}>{head.icon}</Text>
          </View>
          <Text style={[TYPE.display, styles.grow, { color: redesign.text }]} accessibilityRole="header">
            {head.name}
          </Text>
        </View>
        <View style={styles.lightRow}>
          <StatusLight light={head.light} />
          <HelpTip text={head.lightHelp} />
        </View>
        {head.stoppedNote != null && <Chip label={head.stoppedNote} tone="neutral" />}

        {/* A failure after the habit loaded: a lifecycle write or a re-read (#51). */}
        {view.failure != null && (
          <Banner title={view.failure.message}>
            <Button label={RETRY_LABEL} variant="warn" onPress={view.failure.retry} />
          </Banner>
        )}

        {head.reflectLabel != null && <Button label={head.reflectLabel} variant="crit" block onPress={reflect} />}

        {hero != null && <HeroCard hero={hero} />}

        <View style={styles.pills}>
          {view.pills.map((pill) => (
            <View key={pill.key} style={view.pillColumns === 2 ? styles.half : styles.third}>
              <Pill label={pill.label} value={pill.value} unit={pill.unit} help={pill.help} />
            </View>
          ))}
        </View>

        <RecentHeatmap heatmap={view.heatmap} onPressDate={view.openRecord} />

        {view.designCard != null && <DesignCardView card={view.designCard} onEdit={view.openDesign} />}

        <Card>
          <Text style={[TYPE.title, { color: redesign.text }]}>{DETAIL_COPY.journal}</Text>
          {view.journalShown.map((day, index) => (
            <JournalDayRow
              key={day.date}
              day={day}
              last={index === view.journalShown.length - 1}
              onOpenDay={() => view.openRecord(day.date)}
              onOpenRow={view.openEntry}
            />
          ))}
          {view.journalMoreLabel != null && (
            <Button label={view.journalMoreLabel} variant="soft" block onPress={view.showMoreJournal} style={styles.more} />
          )}
          {view.backfillLabel != null && view.nextBackfillDate != null && (
            <Button
              label={view.backfillLabel}
              variant="dash"
              block
              onPress={() => view.openRecord(view.nextBackfillDate!)}
              style={styles.more}
            />
          )}
        </Card>
      </ScrollView>

      <LogOverlay
        toast={toast}
        onUndo={() => void view.undoLast()}
        celebration={celebration}
        onDismissCelebration={view.dismissCelebration}
      />

      {menuOpen && (
        <MoreMenu items={view.menu} top={insets.top + 68} onPick={pick} onClose={() => setMenuOpen(false)} />
      )}

      {sheet?.kind === 'record' && (
        <RecordSheet
          key={sheet.date}
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
          onRecord={view.recordFromSheet}
          onSkip={() => view.openSkip(sheet.date)}
        />
      )}
      {sheet?.kind === 'skip' && (
        <SkipSheet
          key={sheet.date}
          onClose={view.closeSheet}
          eyebrow={sheet.eyebrow}
          title={sheet.title}
          onPick={view.skipFromSheet}
        />
      )}
      {sheet?.kind === 'editEntry' && (
        <EditEntrySheet
          key={sheet.item.entry.id}
          sheet={sheet}
          deleteLines={sheet.deleteLines}
          onClose={view.closeSheet}
          edited={view.editedEntry}
          onSave={view.saveEntryFromSheet}
          onDelete={view.removeEntryFromSheet}
        />
      )}
      {sheet?.kind === 'design' && <DesignSheet sheet={sheet} onClose={view.closeSheet} onSave={view.saveDesign} />}
      {sheet?.kind === 'confirm' && (
        <Sheet visible onClose={view.closeSheet} eyebrow={sheet.eyebrow} title={sheet.title}>
          <Text style={[TYPE.body, { color: redesign.text }]}>{sheet.body}</Text>
          <Button
            label={sheet.confirmLabel}
            variant="pri"
            block
            onPress={() => void view.confirmFromSheet()}
            style={styles.confirm}
          />
          <Button label={sheet.keepLabel} variant="text" block onPress={view.closeSheet} />
        </Sheet>
      )}
    </View>
  );
}

/** The design card (`ReDetail*`): the title and 수정, the rows, then 이유 보기. */
function DesignCardView({ card, onEdit }: { card: DesignCard; onEdit: () => void }) {
  const { redesign } = useTheme();
  const [identityOpen, setIdentityOpen] = useState(false);

  return (
    <Card>
      <View style={styles.spread}>
        <Text style={[TYPE.title, styles.grow, { color: redesign.text }]}>{DETAIL_COPY.designTitle}</Text>
        <Button label={DETAIL_COPY.edit} variant="soft" onPress={onEdit} />
      </View>
      <DesignRow label={SCREEN_WORDS.cue} value={card.cue} ink={card.cueInk} />
      {card.floor != null && <DesignRow label={SCREEN_WORDS.floor} value={card.floor} help={TOOLTIPS.floor} />}
      {card.target != null && <DesignRow label={DETAIL_COPY.target} value={card.target} help={TOOLTIPS.target} />}
      {card.stat != null && <DesignRow label={SCREEN_WORDS.stat} value={card.stat} last />}
      <Button
        label={identityOpen ? DETAIL_COPY.identityHide : DETAIL_COPY.identityShow}
        variant="soft"
        block
        onPress={() => setIdentityOpen((open) => !open)}
      />
      {identityOpen && (
        <Text style={[TYPE.body, styles.identity, { color: redesign[card.identityInk] }]}>{card.identity}</Text>
      )}
    </Card>
  );
}

/** `.drow` — a 112-wide `label` key (with its `?`) and a value. */
function DesignRow({
  label,
  value,
  help,
  ink = 'text',
  last = false,
}: {
  label: string;
  value: string;
  help?: string;
  ink?: DetailInk;
  last?: boolean;
}) {
  const { redesign } = useTheme();
  return (
    <View style={[styles.drow, !last && { borderBottomWidth: 1, borderBottomColor: redesign.border }]}>
      <View style={styles.dkey}>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{label}</Text>
        {help != null && <HelpTip text={help} />}
      </View>
      <Text style={[TYPE.bodyStrong, styles.grow, { color: redesign[ink] }]}>{value}</Text>
    </View>
  );
}

/**
 * `.jday` — the date and the state chip, then the day's rows. The head opens the record
 * sheet for that date; each row opens its edit sheet. Both are controls at `TAP_TARGET`.
 */
function JournalDayRow({
  day,
  last,
  onOpenDay,
  onOpenRow,
}: {
  day: JournalDay;
  last: boolean;
  onOpenDay: () => void;
  onOpenRow: (entryId: string) => void;
}) {
  const { redesign } = useTheme();
  return (
    <View style={[styles.jday, !last && { borderBottomWidth: 1, borderBottomColor: redesign.border }]}>
      <Pressable
        onPress={onOpenDay}
        disabled={!day.backfillable}
        accessibilityRole="button"
        accessibilityLabel={`${day.title} ${day.badge}`}
        style={({ pressed }) => [styles.jhead, pressed && { opacity: 0.6 }]}
      >
        <Text style={[TYPE.bodyStrong, { color: redesign.text }]}>{day.title}</Text>
        <Chip label={day.badge} tone={day.tone} />
      </Pressable>
      {day.rows.map((row) => (
        <Pressable
          key={row.entry.id}
          onPress={() => onOpenRow(row.entry.id)}
          accessibilityRole="button"
          accessibilityLabel={`${row.time} ${row.summary}`}
          style={({ pressed }) => [styles.jrow, pressed && { backgroundColor: redesign.surface2 }]}
        >
          <Text style={[TYPE.body, styles.time, { color: redesign.muted }]}>{row.time}</Text>
          <View style={styles.grow}>
            <Text style={[TYPE.body, { color: redesign.muted }]}>{row.summary}</Text>
            {row.entry.note != null && <Text style={[TYPE.body, { color: redesign.muted }]}>{row.entry.note}</Text>}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.page` — `padding:24px 20px 28px; gap:12px`.
  page: { paddingHorizontal: 20, paddingBottom: TOAST_CLEARANCE, gap: 12 },
  // `.spread` with `margin:-8px -12px 0`.
  topBar: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -8, marginHorizontal: -12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lightRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  icon: { width: 56, height: 56, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 30, lineHeight: 38 },
  grow: { flex: 1, minWidth: 0 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Three columns, or two by two when the fourth pill shows (`ReDetailForming`).
  third: { flexBasis: '30%', flexGrow: 1 },
  half: { flexBasis: '45%', flexGrow: 1 },
  drow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  dkey: { width: 112, flexDirection: 'row', alignItems: 'center' },
  identity: { marginTop: 8 },
  jday: { paddingVertical: 12 },
  jhead: {
    minHeight: TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  jrow: { minHeight: TAP_TARGET, flexDirection: 'row', alignItems: 'flex-start', paddingTop: 4 },
  time: { width: 52, fontVariant: ['tabular-nums'] },
  more: { marginTop: 8 },
  confirm: { marginTop: 8 },
});
