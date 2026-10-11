import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components';
import { LIFECYCLE_LABELS, LOADING_NOTE, RETRY_LABEL, SETTINGS_COPY } from '@/config/copy';
import { useSettings } from '@/hooks/useSettings';
import { RADIUS, TAP_TARGET, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * 보관한 습관 — the path from Settings to see archived habits and bring them back
 * (SPEC §6.3 Settings, #126). No artboard draws this list, so it reuses `ReSettings`'s
 * page, card and line button. Redesign tokens only.
 */
export default function ArchivedHabits() {
  const { redesign } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { archived, loading, failure, restore } = useSettings();

  // Opened straight from the URL (a reload), there is nothing to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: redesign.bg }]}
      contentContainerStyle={[styles.page, { paddingTop: 24 + insets.top }]}
    >
      <View style={styles.backRow}>
        <IconButton icon={ChevronLeft} accessibilityLabel={SETTINGS_COPY.back} onPress={back} />
      </View>
      <Text style={[TYPE.display, { color: redesign.text }]} accessibilityRole="header">
        {SETTINGS_COPY.archivedTitle}
      </Text>

      {failure != null && (
        <View style={[styles.failure, { backgroundColor: redesign.critTint }]}>
          <Text style={[TYPE.body, { color: redesign.critInk }]}>{failure.message}</Text>
          <LineButton label={RETRY_LABEL} onPress={failure.retry} />
        </View>
      )}

      {loading ? (
        <Text style={[TYPE.body, { color: redesign.muted }]}>{LOADING_NOTE}</Text>
      ) : archived.length === 0 && failure == null ? (
        // §6.0: an empty screen shows one large emoji, one sentence and one button.
        <View style={styles.empty}>
          <Text style={TYPE.number} accessibilityElementsHidden importantForAccessibility="no">
            {SETTINGS_COPY.archivedEmptyEmoji}
          </Text>
          <Text style={[TYPE.body, { color: redesign.text }]}>{SETTINGS_COPY.archivedEmpty}</Text>
          <LineButton label={SETTINGS_COPY.archivedEmptyAction} onPress={back} />
        </View>
      ) : (
        archived.map((habit) => (
          <View
            key={habit.id}
            style={[
              styles.card,
              { backgroundColor: redesign.surface, borderColor: redesign.edge, boxShadow: redesign.shadow },
            ]}
          >
            <Text style={[TYPE.title, styles.name, { color: redesign.text }]} numberOfLines={2}>
              {habit.name}
            </Text>
            <LineButton
              label={LIFECYCLE_LABELS.unarchive}
              accessibilityLabel={`${habit.name} ${LIFECYCLE_LABELS.unarchive}`}
              onPress={() => void restore(habit)}
            />
          </View>
        ))
      )}
    </ScrollView>
  );
}

/** `.btn.line` — `surface` face, `borderStrong` 2px border, `text` label. */
function LineButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const { redesign } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.lineButton, { backgroundColor: redesign.surface, borderColor: redesign.borderStrong }]}
    >
      <Text style={[TYPE.body, styles.lineText, { color: redesign.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
  backRow: { flexDirection: 'row', marginTop: -8, marginHorizontal: -12 },
  card: {
    borderWidth: 2,
    borderRadius: RADIUS.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  name: { flex: 1, minWidth: 0 },
  empty: { alignItems: 'center', gap: 12, paddingTop: 48 },
  failure: { borderRadius: RADIUS.lg, paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  lineButton: {
    minHeight: TAP_TARGET,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineText: { fontWeight: '800' },
});
