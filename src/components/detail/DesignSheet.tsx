import { useState, type ReactNode } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import { Button, HelpTip, InputField, Sheet } from '@/components/re';
import { DETAIL_COPY, SAVE_FAILED_NOTE, SCREEN_WORDS, TODAY_COPY, TOOLTIPS } from '@/config/copy';
import type { DesignErrors, DesignPatch, DetailDesignSheet } from '@/hooks/useHabitDetail';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The design card's edit sheet (수정, SPEC §6.5 Design card): 언제·어디서, 최소량 and 목표
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
  const [cue, setCue] = useState(design.cue ?? '');
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

  const error = (message?: string) =>
    message == null ? null : <Text style={[TYPE.body, { color: redesign.critInk }]}>{message}</Text>;

  return (
    <Sheet visible onClose={onClose} eyebrow={sheet.eyebrow} title={sheet.title}>
      <Field label={SCREEN_WORDS.cue}>
        <InputField
          value={cue}
          onChangeText={setCue}
          placeholder={DETAIL_COPY.cuePlaceholder}
          accessibilityLabel={SCREEN_WORDS.cue}
        />
      </Field>

      {design.editsAmounts && (
        <>
          <Field label={SCREEN_WORDS.floor} help={TOOLTIPS.floor}>
            <View style={styles.pair}>
              <View style={styles.amount}>
                <InputField
                  value={floor}
                  onChangeText={setFloor}
                  placeholder={DETAIL_COPY.floorPlaceholder}
                  accessibilityLabel={SCREEN_WORDS.floor}
                />
              </View>
              <View style={styles.grow}>
                <InputField value={floorUnit} onChangeText={setFloorUnit} placeholder={DETAIL_COPY.unitPlaceholder} />
              </View>
            </View>
            {error(errors.floor ?? errors.floorUnit)}
          </Field>
          <Field label={DETAIL_COPY.target} help={TOOLTIPS.target}>
            <View style={styles.pair}>
              <View style={styles.amount}>
                <InputField
                  value={target}
                  onChangeText={setTarget}
                  placeholder={DETAIL_COPY.targetPlaceholder}
                  accessibilityLabel={DETAIL_COPY.target}
                />
              </View>
              <Text style={[TYPE.body, { color: redesign.muted }]}>{floorUnit}</Text>
            </View>
            {error(errors.target)}
          </Field>
        </>
      )}

      <Field label={SCREEN_WORDS.identity}>
        <InputField
          value={identity}
          onChangeText={setIdentity}
          placeholder={DETAIL_COPY.identityPlaceholder}
          accessibilityLabel={SCREEN_WORDS.identity}
        />
      </Field>

      <Button label={TODAY_COPY.save} variant="pri" block disabled={saving} onPress={() => void submit()} />
      {error(saveError ?? undefined)}
    </Sheet>
  );
}

/** `.flabel` over its input — a `label` name, its `?` when it has one. */
function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  const { redesign } = useTheme();
  return (
    <View style={styles.field}>
      <View style={styles.label}>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{label}</Text>
        {help != null && <HelpTip text={help} />}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amount: { width: 120 },
  grow: { flex: 1 },
});
