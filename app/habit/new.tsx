/**
 * Create a habit (modal) — Stage 1 Design (CONCEPT §5). Floor + unit + stat are required;
 * cue / identity / target are optional on purpose (introduced later at reflection if the
 * data shows they're needed). Builds a 'forming' Habit and upserts it.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useRepository } from '@/context/RepositoryContext';
import {
  NumberField,
  Panel,
  PrimaryButton,
  StatPicker,
  TextField,
  Wrap,
} from '@/components';
import { TUNING } from '@/config/tuning';
import { newId } from '@/util/id';
import { nowTimestamp } from '@/util/date';
import { color, font, fontSize, space } from '@/theme/tokens';

export default function NewHabit() {
  const router = useRouter();
  const repo = useRepository();

  const [name, setName] = useState('');
  const [statId, setStatId] = useState<string>(TUNING.stats[0]?.id ?? '');
  const [kind, setKind] = useState<'count' | 'binary'>('count');
  const [floor, setFloor] = useState('1');
  const [floorUnit, setFloorUnit] = useState('');
  const [target, setTarget] = useState('');
  const [cue, setCue] = useState('');
  const [identity, setIdentity] = useState('');

  const floorNum = parseInt(floor, 10);
  // Binary (yes/no) habits have no floor/unit/target — only name + stat are required.
  const valid =
    !!name.trim() &&
    !!statId &&
    (kind === 'binary' || (Number.isFinite(floorNum) && floorNum >= 1 && !!floorUnit.trim()));

  // TODO §8.1: Forming-slot soft-cap (friction when too many habits are still Forming)
  // is deferred to V2 — creation stays frictionless for now.
  const save = async () => {
    if (!valid) return;
    await repo.upsertHabit({
      id: newId(),
      name: name.trim(),
      statId,
      kind,
      floor: kind === 'binary' ? 1 : floorNum,
      floorUnit: kind === 'binary' ? 'time' : floorUnit.trim(),
      target: kind === 'binary' || !target.trim() ? undefined : parseInt(target, 10),
      cue: cue.trim() || undefined,
      identity: identity.trim() || undefined,
      lifecycle: 'forming',
      createdAt: nowTimestamp(),
    });
    router.back();
  };

  return (
    <Wrap>
      <View style={styles.head}>
        <Text style={styles.title}>새 퀘스트</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.close}>닫기</Text>
        </Pressable>
      </View>

      <Panel sub="가볍게 시작하세요 — 최소 기준만 필수예요. 신호나 정체성은 데이터가 필요하다고 알려줄 때 나중에 추가하면 됩니다.">
        <Field label="이름 *">
          <TextField value={name} onChangeText={setName} placeholder="예: 턱걸이" autoFocus />
        </Field>
        <Field label="스탯 *">
          <StatPicker value={statId} onValueChange={setStatId} />
        </Field>
        <Field label="유형 *">
          <View style={styles.typeRow}>
            <Pressable
              onPress={() => setKind('count')}
              style={[styles.typeChip, kind === 'count' && styles.typeChipOn]}
            >
              <Text style={[styles.typeChipText, kind === 'count' && styles.typeChipTextOn]}>
                🔢 횟수 / 수치
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setKind('binary')}
              style={[styles.typeChip, kind === 'binary' && styles.typeChipOn]}
            >
              <Text style={[styles.typeChipText, kind === 'binary' && styles.typeChipTextOn]}>
                ✓ 예 / 아니오
              </Text>
            </Pressable>
          </View>
        </Field>
        {kind === 'count' ? (
          <>
            <View style={styles.row}>
              <Field label="최소 기준 * (무조건 달성)" style={styles.col}>
                <NumberField value={floor} onChangeText={setFloor} placeholder="1" />
              </Field>
              <Field label="단위 *" style={styles.col}>
                <TextField value={floorUnit} onChangeText={setFloorUnit} placeholder="회" />
              </Field>
            </View>
            <Field label="목표 (선택 도전치)">
              <NumberField value={target} onChangeText={setTarget} placeholder="—" />
            </Field>
          </>
        ) : (
          <Text style={styles.typeHint}>완료 / 미완료로 기록 — 채울 수치 없음.</Text>
        )}
        <Field label="신호 (선택)">
          <TextField value={cue} onChangeText={setCue} placeholder="아침 커피 마신 뒤…" />
        </Field>
        <Field label="정체성 (선택)">
          <TextField value={identity} onChangeText={setIdentity} placeholder="나는 ~하는 사람이다…" />
        </Field>

        <View style={styles.actions}>
          <PrimaryButton label="퀘스트 생성" onPress={save} disabled={!valid} />
        </View>
      </Panel>
    </Wrap>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg },
  title: { fontFamily: font.serifBlack, fontSize: fontSize.detail, color: color.ink },
  close: { fontFamily: font.mono, fontSize: fontSize.meta, color: color.inkDim },
  field: { marginBottom: space.md },
  label: { fontFamily: font.mono, fontSize: fontSize.tag, color: color.inkFaint, textTransform: 'uppercase', marginBottom: 6 },
  row: { flexDirection: 'row', gap: space.md },
  col: { flex: 1 },
  actions: { marginTop: space.sm },
  typeRow: { flexDirection: 'row', gap: space.sm },
  typeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.panel,
    borderRadius: 20,
    paddingVertical: 9,
    alignItems: 'center',
  },
  typeChipOn: { borderColor: color.gold, backgroundColor: 'rgba(216,177,90,0.1)' },
  typeChipText: { fontFamily: font.mono, fontSize: fontSize.micro, color: color.inkDim },
  typeChipTextOn: { color: color.gold },
  typeHint: { fontFamily: font.serifItalic, fontStyle: 'italic', color: color.inkFaint, fontSize: fontSize.small, marginBottom: space.md },
});
