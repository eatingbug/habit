/**
 * components/fields.tsx — composer form controls (pure presentation).
 *
 * Translates the demo's .crow input / .ccount / .csel / .timepick / .ctype CSS into
 * RN. Renders the props it is handed; holds only local focus state for border tinting.
 */
import { useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { TUNING } from '@/config/tuning';
import type { LogType, SkipReason } from '@/models';
import { font, fontSize, radius, weight, type ColorTheme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useTheme } from '@/theme/ThemeProvider';
import { HOUR_OPTIONS, MINUTE_OPTIONS } from '@/util/date';
import type {
  NumberFieldProps,
  SkipReasonChipsProps,
  SkipReasonPickerProps,
  StatPickerProps,
  TextFieldProps,
  TimePickerProps,
  TypeChipsProps,
} from '@/components/types';

// ── TextField (.crow input) ────────────────────────────────────────────────────
export function TextField({
  value,
  onChangeText,
  placeholder,
  onSubmitEditing,
  autoFocus,
  multiline,
  grow,
}: TextFieldProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.faint}
      onSubmitEditing={onSubmitEditing}
      autoFocus={autoFocus}
      multiline={multiline}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.input,
        grow && styles.grow,
        multiline && styles.multiline,
        focused && styles.focused,
      ]}
    />
  );
}

// ── NumberField (.ccount) ────────────────────────────────────────────────────────
export function NumberField({
  value,
  onChangeText,
  placeholder,
  onSubmitEditing,
  autoFocus,
}: NumberFieldProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.faint}
      onSubmitEditing={onSubmitEditing}
      autoFocus={autoFocus}
      keyboardType="numeric"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.count, focused && styles.focused]}
    />
  );
}

// ── StatPicker (.csel) ────────────────────────────────────────────────────────────
export function StatPicker({ value, onValueChange }: StatPickerProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.sel}>
      <Picker selectedValue={value} onValueChange={onValueChange} style={styles.picker} dropdownIconColor={c.text}>
        {TUNING.stats.map((s) => (
          <Picker.Item key={s.id} label={`${s.icon} ${s.name}`} value={s.id} color={c.text} />
        ))}
      </Picker>
    </View>
  );
}

// ── TimePicker (.timepick) ────────────────────────────────────────────────────────
export function TimePicker({ hour, minute, onHourChange, onMinuteChange }: TimePickerProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.timepick}>
      <View style={styles.timeSel}>
        <Picker selectedValue={hour} onValueChange={onHourChange} style={styles.picker} dropdownIconColor={c.text}>
          {HOUR_OPTIONS.map((h) => (
            <Picker.Item key={h} label={h} value={h} color={c.text} />
          ))}
        </Picker>
      </View>
      <Text style={styles.colon}>:</Text>
      <View style={styles.timeSel}>
        <Picker selectedValue={minute} onValueChange={onMinuteChange} style={styles.picker} dropdownIconColor={c.text}>
          {MINUTE_OPTIONS.map((m) => (
            <Picker.Item key={m} label={m} value={m} color={c.text} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

// ── TypeChips (.ctypes / .ctype) ──────────────────────────────────────────────────
// Emoji carries type identity — a single accent styles the selected chip (no per-type hues).
const CHIPS: { type: LogType; label: string }[] = [
  { type: 'note', label: '📝 메모' },
  { type: 'win', label: '🏆 성취' },
  { type: 'mood', label: '🌤 기분' },
  { type: 'idea', label: '💡 아이디어' },
];

export function TypeChips({ value, onChange }: TypeChipsProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.ctypes}>
      {CHIPS.map((chip) => {
        const selected = value === chip.type;
        return (
          <Pressable
            key={chip.type}
            onPress={() => onChange(chip.type)}
            style={[
              styles.ctype,
              selected && { borderColor: c.accent, backgroundColor: c.accentWeak },
            ]}
          >
            <Text style={[styles.ctypeText, { color: selected ? c.accentInk : c.muted }]}>{chip.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── SkipReasonPicker (.csel) ──────────────────────────────────────────────────────
const SKIP_REASONS: { value: SkipReason; label: string }[] = [
  { value: 'cue', label: '시간 놓침 / 깜빡함' },
  { value: 'floor', label: '너무 힘듦 / 과함' },
  { value: 'exception', label: '아픔 / 외부 사정 (예외)' },
  { value: 'identity', label: '내키지 않음' },
];

export function SkipReasonPicker({ value, onValueChange }: SkipReasonPickerProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.sel}>
      <Picker selectedValue={value} onValueChange={onValueChange} style={styles.picker} dropdownIconColor={c.text}>
        {SKIP_REASONS.map((r) => (
          <Picker.Item key={r.value} label={r.label} value={r.value} color={c.text} />
        ))}
      </Picker>
    </View>
  );
}

// ── SkipReasonChips (B5) — one-tap skip reasons in the composer ────────────────────
const SKIP_CHIPS: { value: SkipReason; label: string }[] = [
  { value: 'cue', label: '깜빡함' },
  { value: 'floor', label: '너무 힘듦' },
  { value: 'exception', label: '예외' },
  { value: 'identity', label: '안 내킴' },
];

export function SkipReasonChips({ onPick, value }: SkipReasonChipsProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.ctypes}>
      {SKIP_CHIPS.map((chip) => {
        const selected = value === chip.value;
        return (
          <Pressable
            key={chip.value}
            onPress={() => onPick(chip.value)}
            style={[styles.ctype, selected && { borderColor: c.accent, backgroundColor: c.accentWeak }]}
          >
            <Text style={[styles.ctypeText, { color: selected ? c.accentInk : c.muted }]}>{chip.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: ColorTheme) =>
  StyleSheet.create({
    input: {
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      color: c.text,
      fontFamily: font.sans,
      fontSize: fontSize.small,
      paddingVertical: 11,
      paddingHorizontal: 14,
    },
    grow: { flex: 1 },
    multiline: { minHeight: 72, textAlignVertical: 'top' },
    focused: { borderColor: c.accent },
    count: {
      width: 90,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      color: c.text,
      fontFamily: font.mono,
      fontSize: fontSize.small,
      fontVariant: ['tabular-nums'],
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    sel: {
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      overflow: 'hidden',
    },
    picker: {
      color: c.text,
      fontFamily: font.mono,
      fontSize: fontSize.small,
      backgroundColor: 'transparent',
      borderWidth: 0,
    },
    timepick: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    timeSel: {
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      overflow: 'hidden',
    },
    colon: {
      fontFamily: font.mono,
      fontWeight: weight.bold,
      color: c.muted,
    },
    ctypes: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
    },
    ctype: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface2,
      borderRadius: 20,
      paddingVertical: 5,
      paddingHorizontal: 13,
    },
    ctypeText: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
    },
  });
