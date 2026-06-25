/**
 * components/Composer.tsx — the unified Today composer (CONCEPT §9.2).
 *
 * Translates the demo's .composer / .crow / .ctop / .habitfields / .cfloorhint / .hint
 * (mvp/habiquest-demo_2.html) into RN. Pure presentation: holds only local input state,
 * emits a ComposerSubmit on Log; the screen turns it into a stored record.
 */
import { useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LogType, SkipReason } from '@/models';
import { Gradient } from '@/theme/Gradient';
import { color, font, fontSize, letterSpacing, radius, space } from '@/theme/tokens';
import { nowHourMinute } from '@/util/date';
import { NumberField, SkipReasonPicker, TextField, TimePicker, TypeChips } from '@/components/fields';
import { PrimaryButton } from '@/components/primitives';
import type { ComposerProps, ComposerSubmit } from '@/components/types';

export function Composer({ habits, onSubmit, initial, editing, onCancel }: ComposerProps) {
  const clock = nowHourMinute();
  const [target, setTarget] = useState<string>(initial?.target ?? 'free');
  const [hour, setHour] = useState(initial?.hour ?? clock.hour);
  const [minute, setMinute] = useState(initial?.minute ?? clock.minute);
  const [logType, setLogType] = useState<LogType>(initial?.logType ?? 'note');
  const [count, setCount] = useState(initial?.count ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [skipMode, setSkipMode] = useState(initial?.skipMode ?? false);
  const [skipReason, setSkipReason] = useState<SkipReason>(initial?.skipReason ?? 'cue');

  const habit = target === 'free' ? undefined : habits.find((h) => h.id === target);
  const isBinary = habit?.kind === 'binary';

  const freeValid = note.trim().length > 0;
  const n = parseInt(count, 10);
  const entryValid = habit ? (isBinary ? true : Number.isFinite(n) && n >= habit.floor) : false;
  const disabled = habit ? (skipMode ? false : !entryValid) : !freeValid;

  function submit() {
    if (target === 'free') {
      onSubmit({ kind: 'log', type: logType, text: note.trim(), hour, minute });
    } else if (habit && skipMode) {
      onSubmit({
        kind: 'skip',
        habitId: target,
        skipReason,
        note: note.trim() || undefined,
        hour,
        minute,
      });
    } else if (habit) {
      onSubmit({
        kind: 'entry',
        habitId: target,
        actual: isBinary ? 1 : n,
        note: note.trim() || undefined,
        hour,
        minute,
      });
    }
    setCount('');
    setNote('');
  }

  const buttonLabel = editing ? '수정' : '기록';

  return (
    <Gradient preset="composer" style={styles.composer}>
      <Text style={styles.clabel}>오늘을 기록하세요 — 습관이든 무엇이든</Text>

      <View style={styles.ctop}>
        <TimePicker hour={hour} minute={minute} onHourChange={setHour} onMinuteChange={setMinute} />
        <View style={styles.targetSel}>
          <Picker
            selectedValue={target}
            onValueChange={setTarget}
            enabled={!editing}
            style={styles.picker}
            dropdownIconColor={color.ink}
          >
            <Picker.Item label="자유 로그 (그냥 오늘 기록)" value="free" color={color.ink} />
            {habits.map((h) => (
              <Picker.Item key={h.id} label={`🎯 ${h.name}`} value={h.id} color={color.ink} />
            ))}
          </Picker>
        </View>
      </View>

      {target === 'free' ? (
        <>
          <View style={styles.typeRow}>
            <TypeChips value={logType} onChange={setLogType} />
          </View>
          <View style={styles.crow}>
            <TextField
              grow
              value={note}
              onChangeText={setNote}
              placeholder="무슨 일이 있었나요? (메모, 선택)"
            />
            <PrimaryButton label={buttonLabel} onPress={submit} disabled={disabled} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.habitfields}>
            {!skipMode ? (
              isBinary ? (
                <Text style={styles.binaryDone}>✓ 완료로 표시</Text>
              ) : (
                <>
                  <NumberField value={count} onChangeText={setCount} placeholder="0" />
                  <Text style={styles.cunit}>{habit?.floorUnit}</Text>
                  {habit ? (
                    <Text style={styles.cfloorhint}>
                      {`최소 ${habit.floor}${habit.target ? ' · 목표 ' + habit.target : ''} ${habit.floorUnit}`}
                    </Text>
                  ) : null}
                </>
              )
            ) : (
              <SkipReasonPicker value={skipReason} onValueChange={setSkipReason} />
            )}
            <Pressable onPress={() => setSkipMode((s) => !s)} style={styles.toggleChip}>
              <Text style={styles.toggleText}>{skipMode ? '수치 입력으로' : '건너뛰기'}</Text>
            </Pressable>
          </View>
          <View style={styles.crow}>
            <TextField
              grow
              value={note}
              onChangeText={setNote}
              placeholder="어땠나요? (메모, 선택)"
            />
            <PrimaryButton label={buttonLabel} onPress={submit} disabled={disabled} />
          </View>
        </>
      )}

      {editing && onCancel ? (
        <Pressable onPress={onCancel} hitSlop={6} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>취소</Text>
        </Pressable>
      ) : (
        <Text style={styles.hint}>
          자유 로그는 그냥 하루 기록이에요 — XP 없음. 습관 기록은 XP를 얻고 히트맵을 갱신합니다.
        </Text>
      )}
    </Gradient>
  );
}

const styles = StyleSheet.create({
  // .composer
  composer: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.card,
    paddingVertical: 16,
    paddingHorizontal: space.lg,
  },
  // .clabel
  clabel: {
    fontFamily: font.mono,
    fontSize: fontSize.label,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.label,
    color: color.inkFaint,
    marginBottom: 10,
  },
  // .crow.ctop
  ctop: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 11,
    alignItems: 'center',
  },
  // .csel.grow
  targetSel: {
    flex: 1,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  picker: {
    color: color.ink,
    fontFamily: font.sans,
    fontSize: fontSize.bodySm,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  // .ctypes wrapper
  typeRow: {
    marginBottom: 11,
  },
  // .crow
  crow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  // .habitfields
  habitfields: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 11,
    flexWrap: 'wrap',
  },
  // .cunit
  cunit: {
    fontFamily: font.mono,
    fontSize: fontSize.meta,
    color: color.inkDim,
  },
  // binary "mark done" label (replaces the count field for yes/no habits)
  binaryDone: {
    fontFamily: font.sansSemiBold,
    fontSize: fontSize.bodySm,
    color: color.green4,
    paddingVertical: 8,
  },
  // .cfloorhint
  cfloorhint: {
    fontFamily: font.mono,
    fontSize: fontSize.micro,
    color: color.inkFaint,
    marginLeft: 'auto',
  },
  // .chip toggle
  toggleChip: {
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.panel,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 13,
  },
  toggleText: {
    fontFamily: font.mono,
    fontSize: fontSize.micro,
    color: color.inkDim,
  },
  // .composer .hint
  hint: {
    fontFamily: font.mono,
    fontSize: fontSize.tag,
    color: color.inkFaint,
    marginTop: 9,
  },
  cancelBtn: {
    alignSelf: 'flex-start',
    marginTop: 9,
  },
  cancelText: {
    fontFamily: font.mono,
    fontSize: fontSize.meta,
    color: color.inkDim,
  },
});
