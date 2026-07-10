/**
 * components/Composer.tsx — the unified Today composer (SPEC §6.2, CONCEPT §9.2).
 *
 * B-tier easier logging: a date control (오늘/어제 + stepper, B4), a smart-default numeric
 * field with quick-add chips (B2), a collapsed time affordance (B3), one-tap skip chips
 * (B5), and a progress-to-floor readout with a staged-amount preview (C7a). Pure
 * presentation: local input state only; emits a ComposerSubmit the screen stores.
 */
import { useEffect, useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LogType, SkipReason } from '@/models';
import { font, fontSize, letterSpacing, radius, space, weight, type ColorTheme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useTheme } from '@/theme/ThemeProvider';
import { previewLog, smartDefaultAmount } from '@/domain/logging';
import { formatShortDate, nowHourMinute, toLocalDateString, todayLocal } from '@/util/date';
import { NumberField, SkipReasonChips, TextField, TimePicker, TypeChips } from '@/components/fields';
import { PrimaryButton } from '@/components/primitives';
import type { ComposerProps, ComposerSubmit } from '@/components/types';

/** Shift an ISO calendar date by whole days (local). */
function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toLocalDateString(new Date(y, m - 1, d + delta));
}

export function Composer({
  habits,
  onSubmit,
  initial,
  editing,
  onCancel,
  onDelete,
  todaySumByHabit,
  lastAmountByHabit,
}: ComposerProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const clock = nowHourMinute();
  const today = todayLocal();
  const [target, setTarget] = useState<string>(initial?.target ?? 'free');
  const [date, setDate] = useState<string>(initial?.date ?? today);
  const [hour, setHour] = useState(initial?.hour ?? clock.hour);
  const [minute, setMinute] = useState(initial?.minute ?? clock.minute);
  const [timeOpen, setTimeOpen] = useState(false);
  const [logType, setLogType] = useState<LogType>(initial?.logType ?? 'note');
  const [count, setCount] = useState(initial?.count ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [skipMode, setSkipMode] = useState(initial?.skipMode ?? false);
  const [skipReason, setSkipReason] = useState<SkipReason>(initial?.skipReason ?? 'cue');

  const habit = target === 'free' ? undefined : habits.find((h) => h.id === target);
  const isBinary = habit?.kind === 'binary';
  const daySum = habit ? (todaySumByHabit?.[habit.id] ?? 0) : 0;

  // B2: prefill the count with a smart default when a count habit is picked (not while editing).
  useEffect(() => {
    if (editing || !habit || habit.kind === 'binary') return;
    setCount(String(smartDefaultAmount(daySum, habit.floor, lastAmountByHabit?.[habit.id])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const freeValid = note.trim().length > 0;
  const n = parseInt(count, 10);
  const entryValid = habit ? (isBinary ? true : Number.isFinite(n) && n > 0) : false;
  const disabled = habit ? (skipMode ? false : !entryValid) : !freeValid;

  const isToday = date === today;
  const lowerBound = habit ? habit.createdAt.slice(0, 10) : shiftDate(today, -365);
  const canPrev = date > lowerBound;
  const dateLabel = isToday ? '오늘' : date === shiftDate(today, -1) ? '어제' : formatShortDate(date);

  function emit(s: ComposerSubmit) {
    onSubmit(s);
    setCount('');
    setNote('');
  }

  function submit() {
    if (target === 'free') {
      emit({ kind: 'log', date, type: logType, text: note.trim(), hour, minute });
    } else if (habit && skipMode) {
      emit({ kind: 'skip', date, habitId: target, skipReason, note: note.trim() || undefined, hour, minute });
    } else if (habit) {
      emit({ kind: 'entry', date, habitId: target, actual: isBinary ? 1 : n, note: note.trim() || undefined, hour, minute });
    }
  }

  function pickSkip(reason: SkipReason) {
    setSkipReason(reason);
    if (editing || !habit) return; // edit mode commits via the 수정 button
    emit({ kind: 'skip', date, habitId: target, skipReason: reason, note: note.trim() || undefined, hour, minute });
  }

  const buttonLabel = editing ? '수정' : '기록';
  const preview = habit && !isBinary && !skipMode && Number.isFinite(n) && n > 0 ? previewLog(daySum, n, habit) : null;

  return (
    <View style={styles.composer}>
      <Text style={styles.clabel}>오늘을 기록하세요 — 습관이든 무엇이든</Text>

      {/* B4 — date control */}
      <View style={styles.dateRow}>
        <Pressable
          onPress={() => canPrev && setDate(shiftDate(date, -1))}
          disabled={!canPrev}
          hitSlop={8}
          style={[styles.stepBtn, !canPrev && styles.stepDisabled]}
        >
          <Text style={styles.stepText}>‹</Text>
        </Pressable>
        <Text style={styles.dateLabel}>{dateLabel}</Text>
        <Pressable
          onPress={() => !isToday && setDate(shiftDate(date, 1))}
          disabled={isToday}
          hitSlop={8}
          style={[styles.stepBtn, isToday && styles.stepDisabled]}
        >
          <Text style={styles.stepText}>›</Text>
        </Pressable>
        {isToday ? (
          <Pressable onPress={() => canPrev && setDate(shiftDate(today, -1))} hitSlop={6} style={styles.dateQuick}>
            <Text style={styles.dateQuickText}>어제</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setDate(today)} hitSlop={6} style={styles.dateQuick}>
            <Text style={styles.dateQuickText}>오늘로</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.ctop}>
        <View style={styles.targetSel}>
          <Picker
            selectedValue={target}
            onValueChange={setTarget}
            enabled={!editing}
            style={styles.picker}
            dropdownIconColor={c.text}
          >
            <Picker.Item label="자유 로그 (그냥 오늘 기록)" value="free" color={c.text} />
            {habits.map((h) => (
              <Picker.Item key={h.id} label={`🎯 ${h.name}`} value={h.id} color={c.text} />
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
            <TextField grow value={note} onChangeText={setNote} placeholder="무슨 일이 있었나요? (메모, 선택)" />
            <PrimaryButton label={buttonLabel} onPress={submit} disabled={disabled} />
          </View>
        </>
      ) : (
        <>
          {skipMode ? (
            <View style={styles.skipWrap}>
              <SkipReasonChips value={editing ? skipReason : undefined} onPick={pickSkip} />
              <Pressable onPress={() => setSkipMode(false)} style={styles.toggleChip}>
                <Text style={styles.toggleText}>수치 입력으로</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.habitfields}>
                {isBinary ? (
                  <Text style={styles.binaryDone}>✓ 완료로 표시</Text>
                ) : (
                  <>
                    <NumberField value={count} onChangeText={setCount} placeholder={`${habit?.floor ?? 0}`} />
                    <Text style={styles.cunit}>{habit?.floorUnit}</Text>
                    <Pressable onPress={() => setSkipMode(true)} style={styles.toggleChip}>
                      <Text style={styles.toggleText}>건너뛰기</Text>
                    </Pressable>
                  </>
                )}
                {isBinary ? (
                  <Pressable onPress={() => setSkipMode(true)} style={styles.toggleChip}>
                    <Text style={styles.toggleText}>건너뛰기</Text>
                  </Pressable>
                ) : null}
              </View>

              {/* B2 — quick-add chips */}
              {!isBinary && habit ? (
                <View style={styles.quickRow}>
                  <QuickChip label="+1" onPress={() => setCount(String((Number.isFinite(n) ? n : 0) + 1))} styles={styles} />
                  <QuickChip label={`+${habit.floor}`} onPress={() => setCount(String(habit.floor))} styles={styles} />
                  {lastAmountByHabit?.[habit.id] != null ? (
                    <QuickChip
                      label={`직전 ${lastAmountByHabit[habit.id]}`}
                      onPress={() => setCount(String(lastAmountByHabit[habit.id]))}
                      styles={styles}
                    />
                  ) : null}
                </View>
              ) : null}

              {/* C7a — progress to floor (today, count habits) */}
              {!isBinary && habit && isToday ? (
                <Text style={styles.progress}>
                  {`오늘 ${daySum}/${habit.floor} · ${Math.max(0, habit.floor - daySum)} 남음`}
                  {preview
                    ? `   →  ${preview.sum}/${habit.floor} ${preview.state === 'over' ? 'over' : preview.state === 'done' ? 'done ✓' : ''}${preview.xpDelta > 0 ? ` · +${preview.xpDelta} XP` : ''}`
                    : ''}
                </Text>
              ) : null}

              <View style={styles.crow}>
                <TextField grow value={note} onChangeText={setNote} placeholder="어땠나요? (메모, 선택)" />
                <PrimaryButton label={buttonLabel} onPress={submit} disabled={disabled} />
              </View>
            </>
          )}
        </>
      )}

      {/* B3 — collapsed time (today only; backfills use a fixed noon timestamp) */}
      {isToday ? (
        timeOpen ? (
          <View style={styles.timeWrap}>
            <TimePicker hour={hour} minute={minute} onHourChange={setHour} onMinuteChange={setMinute} />
          </View>
        ) : (
          <Pressable onPress={() => setTimeOpen(true)} hitSlop={6} style={styles.timeAffordance}>
            <Text style={styles.timeAffordanceText}>{`🕑 지금 ${hour}:${minute}`}</Text>
          </Pressable>
        )
      ) : null}

      {editing ? (
        <View style={styles.editActions}>
          {onDelete ? (
            <Pressable onPress={onDelete} hitSlop={6}>
              <Text style={styles.deleteText}>삭제</Text>
            </Pressable>
          ) : null}
          {onCancel ? (
            <Pressable onPress={onCancel} hitSlop={6}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.hint}>
          자유 로그는 그냥 하루 기록이에요 — XP 없음. 습관 기록은 XP를 얻고 히트맵을 갱신합니다.
        </Text>
      )}
    </View>
  );
}

function QuickChip({ label, onPress, styles }: { label: string; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return (
    <Pressable onPress={onPress} style={styles.quickChip} hitSlop={4}>
      <Text style={styles.quickChipText}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (c: ColorTheme) =>
  StyleSheet.create({
    composer: {
      backgroundColor: c.surface2,
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: radius.r,
      paddingVertical: 16,
      paddingHorizontal: space.lg,
    },
    clabel: {
      fontFamily: font.mono,
      fontSize: fontSize.label,
      textTransform: 'uppercase',
      letterSpacing: letterSpacing.label,
      color: c.faint,
      marginBottom: 10,
    },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 11,
    },
    stepBtn: {
      width: 30,
      height: 30,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepDisabled: { opacity: 0.35 },
    stepText: { fontFamily: font.sans, fontSize: fontSize.body, color: c.text },
    dateLabel: {
      fontFamily: font.sans,
      fontWeight: weight.semibold,
      fontSize: fontSize.small,
      color: c.text,
      minWidth: 56,
      textAlign: 'center',
    },
    dateQuick: {
      marginLeft: 'auto',
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 20,
      paddingVertical: 5,
      paddingHorizontal: 13,
    },
    dateQuickText: { fontFamily: font.mono, fontSize: fontSize.micro, color: c.muted },
    ctop: { flexDirection: 'row', gap: 10, marginBottom: 11, alignItems: 'center' },
    targetSel: {
      flex: 1,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      overflow: 'hidden',
    },
    picker: {
      color: c.text,
      fontFamily: font.sans,
      fontSize: fontSize.small,
      backgroundColor: 'transparent',
      borderWidth: 0,
    },
    typeRow: { marginBottom: 11 },
    crow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    habitfields: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
    skipWrap: { gap: 10, marginBottom: 11 },
    cunit: { fontFamily: font.mono, fontSize: fontSize.meta, color: c.muted },
    binaryDone: {
      fontFamily: font.sans,
      fontWeight: weight.semibold,
      fontSize: fontSize.small,
      color: c.done,
      paddingVertical: 8,
    },
    toggleChip: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 20,
      paddingVertical: 5,
      paddingHorizontal: 13,
      alignSelf: 'flex-start',
    },
    toggleText: { fontFamily: font.mono, fontSize: fontSize.micro, color: c.muted },
    quickRow: { flexDirection: 'row', gap: 7, marginBottom: 10, flexWrap: 'wrap' },
    quickChip: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 20,
      paddingVertical: 4,
      paddingHorizontal: 11,
    },
    quickChipText: { fontFamily: font.mono, fontSize: fontSize.micro, color: c.accentInk },
    progress: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
      color: c.muted,
      marginBottom: 10,
      fontVariant: ['tabular-nums'],
    },
    timeWrap: { marginTop: 10 },
    timeAffordance: { marginTop: 10, alignSelf: 'flex-start' },
    timeAffordanceText: { fontFamily: font.mono, fontSize: fontSize.micro, color: c.muted, fontVariant: ['tabular-nums'] },
    hint: { fontFamily: font.mono, fontSize: fontSize.tag, color: c.faint, marginTop: 9 },
    editActions: { flexDirection: 'row', gap: space.lg, marginTop: 10, alignItems: 'center' },
    deleteText: { fontFamily: font.mono, fontSize: fontSize.meta, color: c.crit },
    cancelText: { fontFamily: font.mono, fontSize: fontSize.meta, color: c.muted },
  });
