import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components';
import { SETTINGS_COPY, SIGN_OUT_LABEL } from '@/config/copy';
import { useSession } from '@/context/SessionContext';
import { useSettings } from '@/hooks/useSettings';
import { RADIUS, TAP_TARGET, TYPE } from '@/theme/redesignTokens';
import type { ThemePreference } from '@/theme/ThemeProvider';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Settings — SPEC §6.3 Settings, `design/parts/redesign/ReSettings.body.html` (#126).
 * Opened by the Dashboard's ⚙️. Redesign tokens only.
 */

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

export default function Settings() {
  const { redesign } = useTheme();
  const router = useRouter();
  // Opened straight from the URL (a reload), there is nothing to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();
  const { archivedLabel, archivedCountLabel, theme, setTheme, reload } = useSettings();

  // The archived list screen restores habits, so the count is re-read on return.
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) reload();
      focusedBefore.current = true;
    }, [reload]),
  );

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: redesign.bg }]}
      contentContainerStyle={[styles.page, { paddingTop: styles.page.paddingTop + insets.top }]}
    >
      <View style={styles.backRow}>
        <IconButton icon={ChevronLeft} accessibilityLabel={SETTINGS_COPY.back} onPress={back} />
      </View>
      <Text style={[TYPE.display, { color: redesign.text }]} accessibilityRole="header">
        {SETTINGS_COPY.title}
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: redesign.surface, borderColor: redesign.edge, boxShadow: redesign.shadow },
        ]}
      >
        <Text style={[TYPE.label, { color: redesign.muted }]}>{SETTINGS_COPY.themeLabel}</Text>
        <View style={[styles.seg, { backgroundColor: redesign.inset }]} accessibilityRole="radiogroup">
          {THEME_OPTIONS.map((option) => {
            const on = option === theme;
            return (
              <Pressable
                key={option}
                onPress={() => setTheme(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, checked: on }}
                style={[
                  styles.segButton,
                  on && { backgroundColor: redesign.surface, boxShadow: redesign.shadow },
                ]}
              >
                <Text style={[styles.segText, { color: on ? redesign.text : redesign.muted }]}>
                  {SETTINGS_COPY.themeOptions[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/settings/archived')}
        accessibilityRole="button"
        accessibilityLabel={archivedLabel}
        style={[styles.fold, { backgroundColor: redesign.surface, borderColor: redesign.edge }]}
      >
        <Text style={[styles.foldText, { color: redesign.text }]}>{SETTINGS_COPY.archivedTitle}</Text>
        <View style={styles.foldTrail}>
          <Text style={[styles.foldText, { color: redesign.muted }]}>{archivedCountLabel}</Text>
          <ChevronRight size={24} strokeWidth={2} color={redesign.muted} />
        </View>
      </Pressable>

      <Pressable
        onPress={() => void signOut()}
        accessibilityRole="button"
        style={[
          styles.lineButton,
          { backgroundColor: redesign.surface, borderColor: redesign.borderStrong },
        ]}
      >
        <Text style={[styles.lineText, { color: redesign.text }]}>{SIGN_OUT_LABEL}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.page` — `padding:24px 20px 28px; gap:12px`.
  page: { paddingTop: 24, paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
  // `.spread` with `margin:-8px -12px 0`, so the 48px back target lines up with the title.
  backRow: { flexDirection: 'row', marginTop: -8, marginHorizontal: -12 },
  // `.card` — `border:2px solid var(--edge)`, `--r-lg`, `padding:16px`; here `gap:6px`.
  card: { borderWidth: 2, borderRadius: RADIUS.lg, padding: 16, gap: 6 },
  // `.seg` — an `inset` track with `padding:4px`.
  seg: { flexDirection: 'row', borderRadius: RADIUS.md, padding: 4 },
  segButton: {
    flex: 1,
    minHeight: TAP_TARGET,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segText: { ...TYPE.body, fontWeight: '700' },
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
  foldTrail: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  foldText: { ...TYPE.body, fontWeight: '700' },
  // `.btn.line.block` with the board's `margin-top:8px`.
  lineButton: {
    marginTop: 8,
    minHeight: TAP_TARGET,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineText: { ...TYPE.body, fontWeight: '800' },
});
