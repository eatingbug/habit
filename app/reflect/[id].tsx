import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, ChevronLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, ChoiceChip, DayMark, HelpTip, IconButton, SkipSheet, Toast } from '@/components/re';
import { ActionField } from '@/components/reflection/ActionField';
import { DiagnosisCardView } from '@/components/reflection/DiagnosisCardView';
import { useReflection, type ReflectionView } from '@/hooks/useReflection';
import type { ReflectionAction } from '@/models';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Reflection — SPEC §6.7, the `ReReflection` artboard (#131). Redesign tokens and the
 * shared components in `src/components/re` only.
 *
 * Every judgment and every word is `useReflection`'s: each day's state, which card
 * opens and how many fold, which actions are offered and which is pre-selected, and
 * what a commit writes. There are no component render tests (jest.config.js), so this
 * file places words and decides nothing.
 *
 * State kept here is view state only: whether the folded cards are open, and the
 * draft typed into each action's field.
 *
 * The recover-first question (ADR-0002) opens the screen when `view.recover` says so,
 * above the 7 days and before any diagnosis.
 */

/** Room under the scroll for the floating toast. */
const TOAST_CLEARANCE = 112;

/** `.recover` — one row per date; 했어요 and 안 했어요 have the same size and weight. */
function Recover({ view }: { view: ReflectionView }) {
  const { redesign } = useTheme();
  if (view.recover == null) return null;

  return (
    <View style={[styles.recover, { backgroundColor: redesign.surface, borderColor: redesign.borderStrong }]}>
      <View style={styles.head}>
        <Text style={[TYPE.headline, styles.grow, { color: redesign.text }]}>{view.recover.question}</Text>
        <HelpTip text={view.words.backfillHelp} />
      </View>
      {view.recover.rows.map((row) => (
        <View key={row.date} style={styles.row}>
          <Text style={[TYPE.bodyStrong, styles.grow, { color: redesign.text }]}>{row.label}</Text>
          <Button
            label={view.words.did}
            accessibilityLabel={row.didLabel}
            disabled={view.answering}
            style={[styles.answer, { borderColor: redesign.done }]}
            onPress={() => void view.fill(row.date)}
          />
          <Button
            label={view.words.didNot}
            accessibilityLabel={row.didNotLabel}
            disabled={view.answering}
            style={styles.answer}
            onPress={() => view.askWhy(row.date)}
          />
        </View>
      ))}
      <Text style={[TYPE.body, { color: redesign.muted }]}>{view.words.recoverNote}</Text>
    </View>
  );
}

/** `.head-line` — a section title and its `?`. */
function HeadLine({ title, help }: { title: string; help: string }) {
  const { redesign } = useTheme();
  return (
    <View style={styles.headLine}>
      <Text style={[TYPE.title, { color: redesign.text }]} accessibilityRole="header">
        {title}
      </Text>
      <HelpTip text={help} />
    </View>
  );
}

export default function Reflect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { redesign } = useTheme();
  const view = useReflection(id);
  /** One draft per action, so switching away and back keeps what was typed. */
  const [drafts, setDrafts] = useState<Partial<Record<ReflectionAction, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [showFolded, setShowFolded] = useState(false);
  // Opened straight from the URL (a reload), there is nothing to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  useEffect(() => {
    // §6.7: after commit, back to the Dashboard, which re-reads on focus.
    if (view.committed) router.dismissTo('/');
  }, [view.committed, router]);

  const chosen = view.options.find((option) => option.action === view.chosen);
  const value = chosen == null ? '' : (drafts[chosen.action] ?? chosen.current);
  const setValue = (next: string) => {
    if (chosen != null) setDrafts((current) => ({ ...current, [chosen.action]: next }));
    setError(null);
  };

  async function commit() {
    setError(await view.commit(value));
  }

  return (
    <View style={[styles.fill, { backgroundColor: redesign.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.page, { paddingTop: styles.page.paddingTop + insets.top }]}
      >
        <View style={styles.backRow}>
          <IconButton icon={ChevronLeft} accessibilityLabel={view.words.back} onPress={back} />
        </View>

        {view.failure != null && (
          <Banner title={view.failure.message}>
            <Button label={view.words.retry} variant="warn" onPress={view.failure.retry} />
          </Banner>
        )}

        {view.loading ? (
          <Text style={[TYPE.body, { color: redesign.muted }]}>{view.words.loading}</Text>
        ) : view.habit == null ? (
          view.failure == null && <Text style={[TYPE.body, { color: redesign.muted }]}>{view.words.notFound}</Text>
        ) : (
          <>
            <Text style={[TYPE.display, { color: redesign.text }]} accessibilityRole="header">
              {view.title}
            </Text>

            <Recover view={view} />

            <HeadLine title={view.words.sevenDays} help={view.words.sevenDaysHelp} />
            <View style={styles.days}>
              {view.mirror.map((cell) => (
                <View key={cell.date} style={styles.day}>
                  {cell.state == null ? (
                    <View style={[styles.blank, { borderColor: redesign.border }]} />
                  ) : (
                    <DayMark state={cell.state} size={40} square />
                  )}
                  <Text style={[TYPE.label, { color: redesign.muted }]}>{cell.label}</Text>
                </View>
              ))}
            </View>
            {view.notes.length > 0 && (
              <View
                style={[
                  styles.notes,
                  { backgroundColor: redesign.surface, borderColor: redesign.edge, boxShadow: redesign.shadow },
                ]}
              >
                {view.notes.map((note, index) => (
                  <View key={`${note.date}-${index}`} style={styles.row}>
                    <Text style={[TYPE.label, styles.tabular, { color: redesign.muted }]}>{note.label}</Text>
                    <Text style={[TYPE.label, styles.grow, styles.noteText, { color: redesign.muted }]}>
                      {note.text}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <HeadLine title={view.words.howItReads} help={view.words.howItReadsHelp} />
            {view.lead != null ? (
              <DiagnosisCardView card={view.lead} />
            ) : (
              <Text style={[TYPE.body, { color: redesign.muted }]}>{view.words.nothingToFlag}</Text>
            )}
            {view.moreLabel != null &&
              (showFolded ? (
                view.folded.map((card) => <DiagnosisCardView key={card.key} card={card} />)
              ) : (
                <Button
                  label={view.moreLabel}
                  icon={ChevronDown}
                  variant="soft"
                  block
                  onPress={() => setShowFolded(true)}
                />
              ))}

            {/* `.rec` — the pre-selected action, its reason, its input, the others. */}
            {chosen != null && (
              <View style={[styles.rec, { borderColor: redesign.accent, backgroundColor: redesign.accentTint }]}>
                <Text style={[TYPE.title, { color: redesign.accentInk }]}>{view.proposal}</Text>
                <Text style={[TYPE.body, { color: redesign.muted }]}>{chosen.reason}</Text>
                {chosen.input != null && (
                  <View style={styles.row}>
                    <ActionField
                      value={value}
                      onChangeText={setValue}
                      accessibilityLabel={chosen.label}
                      placeholder={chosen.input.placeholder}
                      numeric={chosen.input.numeric}
                      invalid={error != null}
                    />
                    {chosen.input.unit != null && (
                      <Text style={[TYPE.body, { color: redesign.muted }]}>{chosen.input.unit}</Text>
                    )}
                  </View>
                )}
                {error != null && <Text style={[TYPE.body, { color: redesign.critInk }]}>{error}</Text>}
                <View style={styles.alts}>
                  {view.options
                    .filter((option) => option.action !== view.chosen)
                    .map((option) => (
                      <ChoiceChip
                        key={option.action}
                        label={option.label}
                        shape="box"
                        onPress={() => {
                          view.choose(option.action);
                          setError(null);
                        }}
                      />
                    ))}
                </View>
                <Button label={view.words.commit} variant="pri" block onPress={() => void commit()} />
              </View>
            )}
          </>
        )}
      </ScrollView>

      {view.toast != null && (
        <Toast
          title={view.toast.message}
          lines={[view.toast.detail, view.toast.sub]}
          actionLabel={view.words.undo}
          onAction={() => void view.undoLast()}
        />
      )}
      {view.asking != null && (
        <SkipSheet
          key={view.asking.date}
          onClose={view.cancelAsk}
          eyebrow={view.asking.eyebrow}
          title={view.asking.title}
          onPick={(reason, note) => view.skip(view.asking!.date, reason, note)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.page` — `padding:24px 20px 28px; gap:12px`.
  page: { paddingTop: 24, paddingHorizontal: 20, paddingBottom: TOAST_CLEARANCE, gap: 12 },
  // `.spread` with `margin:-8px -12px 0`, so the 48px back target lines up with the title.
  backRow: { flexDirection: 'row', marginTop: -8, marginHorizontal: -12 },
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  // `.head-line` — `gap:2px; margin:12px 0 0`.
  headLine: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 12 },
  // `.recover` — `surface`, 2px `borderStrong`, `--r-lg`, padding 16, gap 10.
  recover: { borderWidth: 2, borderRadius: RADIUS.lg, padding: 16, gap: 10 },
  answer: { minWidth: 104 },
  // `.days` — seven equal columns; `.day` is at least 48 tall.
  days: { flexDirection: 'row' },
  day: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48 },
  blank: { width: 40, height: 40, borderRadius: 10, borderWidth: 2 },
  // `.card` with `padding:12px 16px`.
  notes: { borderWidth: 2, borderRadius: RADIUS.lg, paddingVertical: 12, paddingHorizontal: 16, gap: 6 },
  tabular: { fontVariant: ['tabular-nums'] },
  noteText: { fontWeight: '600' },
  // `.rec` — 2px `accent`, `accent` tint, `--r-lg`, padding 16, gap 10.
  rec: { borderWidth: 2, borderRadius: RADIUS.lg, padding: 16, gap: 10 },
  alts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
