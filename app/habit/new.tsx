import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ChoiceChip, IconButton, InputField, SegmentedControl } from '@/components/re';
import { FormField } from '@/components/newHabit/FormField';
import { IconSheet } from '@/components/newHabit/IconSheet';
import { ICON_LABELS } from '@/config/copy';
import { useNewHabit } from '@/hooks/useNewHabit';
import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * New habit — SPEC §6.6, `ReNewHabit` (횟수 · 양) and `ReNewHabitYesNo` (예 · 아니오)
 * (#130). Redesign tokens and `src/components/re` only.
 *
 * The screen renders and decides nothing: every word, the validation and the save are
 * `useNewHabit`'s. The one piece of state kept here is whether the icon sheet is open.
 */
export default function NewHabit() {
  const { redesign } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const form = useNewHabit();
  const { copy, tooltips, errors } = form;
  const [iconSheetOpen, setIconSheetOpen] = useState(false);
  // Opened straight from the URL (a reload), there is nothing to go back to.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  async function submit() {
    if (await form.submit()) close();
  }

  return (
    <>
      <ScrollView
        style={[styles.fill, { backgroundColor: redesign.bg }]}
        contentContainerStyle={[styles.page, { paddingTop: styles.page.paddingTop + insets.top }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.closeRow}>
          <IconButton icon={X} accessibilityLabel={ICON_LABELS.close} onPress={close} />
        </View>
        <View>
          <Text style={[TYPE.display, { color: redesign.text }]} accessibilityRole="header">
            {copy.title}
          </Text>
          <Text style={[TYPE.body, { color: redesign.muted }]}>{copy.subtitle}</Text>
        </View>

        <FormField label={copy.labels.name} error={errors.name}>
          <View style={styles.row}>
            <Pressable
              onPress={() => setIconSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={copy.pickIcon}
              style={[styles.iconButton, { backgroundColor: redesign.surface, borderColor: redesign.border }]}
            >
              <Text style={styles.iconText}>{form.icon}</Text>
            </Pressable>
            <View style={styles.grow}>
              <InputField
                value={form.name}
                onChangeText={form.setName}
                placeholder={copy.placeholders.name}
                accessibilityLabel={copy.labels.name}
              />
            </View>
          </View>
        </FormField>

        <FormField label={copy.labels.kind} help={tooltips.kind}>
          <SegmentedControl options={form.kindOptions} value={form.kind} onChange={form.setKind} />
        </FormField>

        {form.showAmounts && (
          <>
            <FormField label={copy.labels.floor} help={tooltips.floor} error={errors.floor ?? errors.floorUnit}>
              <View style={styles.row}>
                <InputField
                  value={form.floor}
                  onChangeText={form.setFloor}
                  placeholder={copy.placeholders.floor}
                  accessibilityLabel={copy.labels.floor}
                  width={AMOUNT_WIDTH}
                  keyboardType="decimal-pad"
                />
                <View style={styles.grow}>
                  <InputField
                    value={form.floorUnit}
                    onChangeText={form.setFloorUnit}
                    placeholder={copy.placeholders.floorUnit}
                    accessibilityLabel={copy.floorUnitLabel}
                  />
                </View>
              </View>
            </FormField>

            <FormField
              label={copy.labels.target}
              optional={copy.optional}
              help={tooltips.target}
              error={errors.target}
            >
              <View style={styles.row}>
                <InputField
                  value={form.target}
                  onChangeText={form.setTarget}
                  placeholder={copy.placeholders.target}
                  accessibilityLabel={copy.labels.target}
                  width={AMOUNT_WIDTH}
                  keyboardType="decimal-pad"
                />
                <Text style={[TYPE.body, { color: redesign.muted }]}>{form.targetUnit}</Text>
              </View>
            </FormField>
          </>
        )}

        <FormField label={copy.labels.cue} optional={copy.optional} help={tooltips.cue}>
          <InputField
            value={form.cue}
            onChangeText={form.setCue}
            placeholder={copy.placeholders.cue}
            accessibilityLabel={copy.labels.cue}
          />
        </FormField>

        <FormField label={copy.labels.stat} help={tooltips.stat}>
          <View style={styles.chips}>
            {form.statOptions.map((stat) => (
              <ChoiceChip
                key={stat.id}
                label={stat.label}
                shape="box"
                selected={stat.selected}
                onPress={() => form.pickStat(stat.id)}
              />
            ))}
          </View>
        </FormField>

        <FormField label={copy.labels.identity} optional={copy.optional} help={tooltips.identity}>
          <InputField
            value={form.identity}
            onChangeText={form.setIdentity}
            placeholder={copy.placeholders.identity}
            accessibilityLabel={copy.labels.identity}
          />
        </FormField>

        {form.saveError != null && (
          <Text style={[TYPE.bodyStrong, { color: redesign.critInk }]} accessibilityLiveRegion="polite">
            {form.saveError}
          </Text>
        )}

        <Button
          label={copy.submit}
          variant="pri"
          block
          disabled={form.saving}
          onPress={() => void submit()}
          style={styles.submit}
        />
      </ScrollView>

      <IconSheet
        visible={iconSheetOpen}
        onClose={() => setIconSheetOpen(false)}
        title={copy.pickIcon}
        options={form.iconOptions}
        clearLabel={copy.useStatIcon}
        onPick={form.pickIcon}
      />
    </>
  );
}

/** The board's `width:120px` amount box. */
const AMOUNT_WIDTH = 120;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.page` — `padding:24px 20px 28px; gap:12px`.
  page: { paddingTop: 24, paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
  // `.spread` with `margin:-8px -12px 0`, so the 48px close target lines up with the title.
  closeRow: { flexDirection: 'row', marginTop: -8, marginHorizontal: -12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  // The board's icon `.pick`: 56 square, 26px emoji.
  iconButton: {
    width: 56,
    height: 56,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 26, lineHeight: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // The board's `margin-top:8px` on the primary button.
  submit: { marginTop: 8 },
});
