import { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import { Button, FormField, InputField, Sheet } from '@/components/re';
import { NEW_HABIT_COPY, SAVE_FAILED_NOTE, SCREEN_WORDS, TODAY_COPY, TOOLTIPS } from '@/config/copy';
import type { DesignErrors, DesignPatch, DetailDesignSheet } from '@/hooks/useHabitDetail';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/** The amount boxes' width, as on New habit (`width:120px`). */
const AMOUNT_WIDTH = 120;

/**
 * The design card's edit sheet (수정, SPEC §6.5 Design card): 언제, 어떻게, 최소량 and 목표
 * (count habits only), and 이유. The hook validates and writes (`saveDesign`), and
 * closes the sheet once the edit is stored; refused fields show their message here.
 */
export function DesignSheet({
  sheet,
  onClose,
  onSave,
}: {
  sheet: DetailDesignSheet;
  onClose: () => void;
  onSave: (patch: DesignPatch) => Promise<DesignErrors | null>;
}) {
  const { redesign } = useTheme();
  const { design } = sheet;
  const copy = NEW_HABIT_COPY;
  const [cue, setCue] = useState(design.cue ?? '');
  const [method, setMethod] = useState(design.method ?? '');
  const [identity, setIdentity] = useState(design.identity ?? '');
  const [floor, setFloor] = useState(`${design.floor}`);
  const [floorUnit, setFloorUnit] = useState(design.floorUnit);
  const [target, setTarget] = useState(design.target == null ? '' : `${design.target}`);
  const [errors, setErrors] = useState<DesignErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    Keyboard.dismiss();
    setSaving(true);
    setSaveError(null);
    try {
      const found = await onSave({
        // A blank box clears the field; both are optional.
        cue: cue.trim().length > 0 ? cue : null,
        method: method.trim().length > 0 ? method : null,
        identity: identity.trim().length > 0 ? identity : null,
        // Omitted for a yes/no habit, whose amounts this form never showed.
        ...(design.editsAmounts
          ? { floor: Number(floor), floorUnit, target: target.trim().length > 0 ? Number(target) : null }
          : {}),
      });
      setErrors(found ?? {});
      if (found != null) setSaving(false);
    } catch {
      setSaveError(SAVE_FAILED_NOTE);
      setSaving(false);
    }
  }

  return (
    <Sheet visible onClose={onClose} eyebrow={sheet.eyebrow} title={sheet.title}>
      <FormField label={SCREEN_WORDS.cue} optional={copy.optional}>
        <InputField
          value={cue}
          onChangeText={setCue}
          placeholder={copy.placeholders.cue}
          accessibilityLabel={SCREEN_WORDS.cue}
        />
      </FormField>

      <FormField label={SCREEN_WORDS.method} optional={copy.optional} help={TOOLTIPS.method}>
        <InputField
          value={method}
          onChangeText={setMethod}
          placeholder={copy.placeholders.method}
          accessibilityLabel={SCREEN_WORDS.method}
        />
      </FormField>

      {design.editsAmounts && (
        <>
          <FormField label={SCREEN_WORDS.floor} help={TOOLTIPS.floor} error={[errors.floor, errors.floorUnit]}>
            <View style={styles.row}>
              <InputField
                value={floor}
                onChangeText={setFloor}
                placeholder={copy.placeholders.floor}
                accessibilityLabel={SCREEN_WORDS.floor}
                width={AMOUNT_WIDTH}
                keyboardType="number-pad"
                invalid={errors.floor != null}
              />
              <View style={styles.grow}>
                <InputField
                  value={floorUnit}
                  onChangeText={setFloorUnit}
                  placeholder={copy.placeholders.floorUnit}
                  accessibilityLabel={copy.floorUnitLabel}
                  invalid={errors.floorUnit != null}
                />
              </View>
            </View>
          </FormField>
          <FormField label={copy.labels.target} optional={copy.optional} help={TOOLTIPS.target} error={errors.target}>
            <View style={styles.row}>
              <InputField
                value={target}
                onChangeText={setTarget}
                placeholder={copy.placeholders.target}
                accessibilityLabel={copy.labels.target}
                width={AMOUNT_WIDTH}
                keyboardType="number-pad"
                invalid={errors.target != null}
              />
              <Text style={[TYPE.body, { color: redesign.muted }]}>{floorUnit}</Text>
            </View>
          </FormField>
        </>
      )}

      <FormField label={SCREEN_WORDS.identity} optional={copy.optional}>
        <InputField
          value={identity}
          onChangeText={setIdentity}
          placeholder={copy.placeholders.identity}
          accessibilityLabel={SCREEN_WORDS.identity}
        />
      </FormField>

      <Button label={TODAY_COPY.save} variant="pri" block disabled={saving} onPress={() => void submit()} />
      {saveError != null && <Text style={[TYPE.body, { color: redesign.critInk }]}>{saveError}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
});
