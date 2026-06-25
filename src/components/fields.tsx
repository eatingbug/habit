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
import { color, font, fontSize, radius } from '@/theme/tokens';
import { HOUR_OPTIONS, MINUTE_OPTIONS } from '@/util/date';
import type {
  NumberFieldProps,
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
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={color.inkFaint}
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
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={color.inkFaint}
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
  return (
    <View style={styles.sel}>
      <Picker selectedValue={value} onValueChange={onValueChange} style={styles.picker} dropdownIconColor={color.ink}>
        {TUNING.stats.map((s) => (
          <Picker.Item key={s.id} label={`${s.icon} ${s.name}`} value={s.id} color={color.ink} />
        ))}
      </Picker>
    </View>
  );
}

// ── TimePicker (.timepick) ────────────────────────────────────────────────────────
export function TimePicker({ hour, minute, onHourChange, onMinuteChange }: TimePickerProps) {
  return (
    <View style={styles.timepick}>
      <View style={styles.timeSel}>
        <Picker selectedValue={hour} onValueChange={onHourChange} style={styles.picker} dropdownIconColor={color.ink}>
          {HOUR_OPTIONS.map((h) => (
            <Picker.Item key={h} label={h} value={h} color={color.ink} />
          ))}
        </Picker>
      </View>
      <Text style={styles.colon}>:</Text>
      <View style={styles.timeSel}>
        <Picker selectedValue={minute} onValueChange={onMinuteChange} style={styles.picker} dropdownIconColor={color.ink}>
          {MINUTE_OPTIONS.map((m) => (
            <Picker.Item key={m} label={m} value={m} color={color.ink} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

// ── TypeChips (.ctypes / .ctype) ──────────────────────────────────────────────────
const CHIPS: { type: LogType; label: string; on: string; tint: string }[] = [
  { type: 'note', label: '📝 메모', on: color.ink, tint: 'rgba(232,228,216,.06)' },
  { type: 'win', label: '🏆 성취', on: color.gold, tint: 'rgba(216,177,90,.1)' },
  { type: 'mood', label: '🌤 기분', on: color.blue, tint: 'rgba(107,155,216,.1)' },
  { type: 'idea', label: '💡 아이디어', on: color.green4, tint: 'rgba(116,214,138,.1)' },
];

export function TypeChips({ value, onChange }: TypeChipsProps) {
  return (
    <View style={styles.ctypes}>
      {CHIPS.map((c) => {
        const selected = value === c.type;
        return (
          <Pressable
            key={c.type}
            onPress={() => onChange(c.type)}
            style={[
              styles.ctype,
              selected && { borderColor: c.on, backgroundColor: c.tint },
            ]}
          >
            <Text style={[styles.ctypeText, { color: selected ? c.on : color.inkDim }]}>{c.label}</Text>
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
  return (
    <View style={styles.sel}>
      <Picker selectedValue={value} onValueChange={onValueChange} style={styles.picker} dropdownIconColor={color.ink}>
        {SKIP_REASONS.map((r) => (
          <Picker.Item key={r.value} label={r.label} value={r.value} color={color.ink} />
        ))}
      </Picker>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    color: color.ink,
    fontFamily: font.sans,
    fontSize: fontSize.bodySm,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  grow: { flex: 1 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  focused: { borderColor: color.goldDeep },
  count: {
    width: 90,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    color: color.ink,
    fontFamily: font.mono,
    fontSize: fontSize.bodySm,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  sel: {
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  picker: {
    color: color.ink,
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
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  colon: {
    fontFamily: font.monoBold,
    color: color.inkDim,
  },
  ctypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  ctype: {
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.panel,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 13,
  },
  ctypeText: {
    fontFamily: font.mono,
    fontSize: fontSize.micro,
  },
});
