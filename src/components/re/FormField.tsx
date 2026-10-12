import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

import { HelpTip } from './HelpTip';

export interface FormFieldProps {
  label: string;
  /** "· 선택", drawn after the label for an optional field. */
  optional?: string;
  /** The `?` tooltip copy (§6.8). */
  help?: string;
  error?: string;
  children: ReactNode;
}

/**
 * One form field: `.flabel` (a `label` line in `muted`, its "· 선택" and `?`), the
 * control, and the field's error under it in `crit` ink. New habit uses it; the Habit
 * Detail edit form can reuse it.
 */
export function FormField({ label, optional, help, error, children }: FormFieldProps) {
  const { redesign } = useTheme();

  return (
    <View style={styles.field}>
      <View style={styles.label}>
        <Text style={[TYPE.label, { color: redesign.muted }]}>
          {label}
          {optional != null && <Text style={styles.optional}>{` ${optional}`}</Text>}
        </Text>
        {help != null && <HelpTip text={help} />}
      </View>
      {children}
      {error != null && <Text style={[TYPE.label, { color: redesign.critInk }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  // The board's field stack: `gap:6px`, and `.flabel`'s `gap:4px; margin-bottom:2px`.
  field: { gap: 6 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  optional: { fontWeight: '600' },
});
