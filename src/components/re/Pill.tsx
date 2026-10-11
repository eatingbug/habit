import { StyleSheet, Text, View } from 'react-native';

import { RADIUS, TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

import { HelpIcon, HelpTip } from './HelpTip';

export interface PillProps {
  /** The name above the number, e.g. 연속. */
  label: string;
  /** The number, e.g. "2". */
  value: string;
  /** The unit after the number, e.g. 일 or %. */
  unit?: string;
  /** Tooltip copy (§6.8). With it, the whole pill is the `?`'s touch area (§6.0). */
  help?: string;
}

/** `.pill` — a stat pill: a `label` name with its `?`, then a `headline` number. */
export function Pill({ label, value, unit, help }: PillProps) {
  const { redesign } = useTheme();

  const body = (
    <View
      style={[
        styles.pill,
        { backgroundColor: redesign.surface, borderColor: redesign.edge, boxShadow: redesign.shadow },
      ]}
    >
      <View style={styles.head}>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{label}</Text>
        {help != null && <HelpIcon />}
      </View>
      <Text style={[TYPE.headline, styles.number, { color: redesign.text }]}>
        {value}
        {unit != null && <Text style={[TYPE.label, { color: redesign.muted }]}>{unit}</Text>}
      </Text>
    </View>
  );

  return help == null ? body : <HelpTip text={help}>{body}</HelpTip>;
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 2,
    borderRadius: RADIUS.md,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 12,
    paddingRight: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  number: { fontVariant: ['tabular-nums'] },
});
