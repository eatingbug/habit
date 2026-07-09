/**
 * Reflection (SPEC §6.4, CONCEPT §6) — the primary bet. Mirror the week, show the
 * rule-based flags (evidence always visible), pre-select the recommended action, and on
 * commit write the design change + ReflectionSession. Then back to Dashboard, where the
 * status light re-derives (and clears once the design is fixed).
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useReflection } from '@/hooks/useReflection';
import {
  ActionGrid,
  DiagnosisFlag,
  EmptyState,
  MirrorWeek,
  NumberField,
  Panel,
  PrimaryButton,
  TextField,
  Toast,
  Wrap,
} from '@/components';
import { font, fontSize, letterSpacing, radius, space, weight, type ColorTheme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';
import type { ReflectionAction } from '@/models';

export default function Reflection() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const r = useReflection(id);
  const styles = useThemedStyles(makeStyles);

  const [chosen, setChosen] = useState<ReflectionAction | null>(null);
  const [cue, setCue] = useState('');
  const [identity, setIdentity] = useState('');
  const [floor, setFloor] = useState('');
  const [target, setTarget] = useState('');
  const [committed, setCommitted] = useState(false);

  // Pre-select the engine's recommended action once it resolves.
  useEffect(() => {
    if (r.suggestedAction && chosen === null) setChosen(r.suggestedAction);
  }, [r.suggestedAction, chosen]);

  // Prefill design inputs from the current habit.
  useEffect(() => {
    if (r.habit) {
      setCue(r.habit.cue ?? '');
      setIdentity(r.habit.identity ?? '');
      setFloor(String(r.habit.floor));
      setTarget(r.habit.target != null ? String(r.habit.target) : '');
    }
  }, [r.habit]);

  const needsInput: 'cue' | 'identity' | 'floor' | 'target' | null =
    chosen === 'fill_cue' || chosen === 'adjust_cue'
      ? 'cue'
      : chosen === 'fill_identity'
        ? 'identity'
        : chosen === 'lower_floor'
          ? 'floor'
          : chosen === 'raise_target'
            ? 'target'
            : null;

  const inputValid =
    needsInput === 'cue'
      ? cue.trim().length > 0
      : needsInput === 'identity'
        ? identity.trim().length > 0
        : needsInput === 'floor'
          ? parseInt(floor, 10) >= 1
          : needsInput === 'target'
            ? parseInt(target, 10) >= 1
            : true;

  const canCommit = chosen !== null && inputValid && !committed && !!r.habit;

  const onCommit = async () => {
    if (!chosen) return;
    await r.commit(chosen, {
      cue: cue.trim() || undefined,
      identity: identity.trim() || undefined,
      floor: parseInt(floor, 10),
      target: target.trim() ? parseInt(target, 10) : undefined,
    });
    setCommitted(true);
    setTimeout(() => router.back(), 900);
  };

  if (!r.habit) {
    return (
      <Wrap>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>← 뒤로</Text>
        </Pressable>
        <EmptyState>{r.loading ? '불러오는 중…' : '이 퀘스트는 더 이상 존재하지 않습니다.'}</EmptyState>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>← 뒤로</Text>
      </Pressable>

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{r.habit.name} · 주간 회고</Text>
        <Text style={styles.heroTitle}>앞으로 나아가기 전에 돌아보기</Text>
        <Text style={styles.heroBody}>
          실제로 무슨 일이 있었는지 다시 꺼내 보고, 설계가 여전히 유효한지 판단하세요. 다시
          읽지 않는 기록은 죽은 기록입니다.
        </Text>
        <View style={styles.mirror}>
          <MirrorWeek days={r.mirror} />
        </View>
      </View>

      <Panel
        title="데이터가 짚어주는 것"
        sub="설계의 네 가지 요소에 대한 결정론적 점검 — AI 없이 규칙만."
        style={styles.panel}
      >
        {r.flags.length === 0 ? (
          <EmptyState>이번 주는 플래그 없음 — 설계가 유효해요. 그대로 둬도 됩니다.</EmptyState>
        ) : (
          r.flags.map((f, i) => <DiagnosisFlag key={`${f.component}-${i}`} flag={f} />)
        )}
      </Panel>

      <Panel
        title="루프 닫기"
        sub="회고는 결정으로 끝나야 해요. 바꿀 것을 고르거나 — 그대로 유지하세요."
      >
        <ActionGrid actions={r.actions} selected={chosen} onSelect={setChosen} />

        {needsInput === 'cue' ? (
          <View style={styles.input}>
            <TextField value={cue} onChangeText={setCue} placeholder="예: 아침 커피 마신 뒤, 문틀 철봉에서" />
          </View>
        ) : null}
        {needsInput === 'identity' ? (
          <View style={styles.input}>
            <TextField value={identity} onChangeText={setIdentity} placeholder="예: 나는 매일 훈련하는 사람이다" />
          </View>
        ) : null}
        {needsInput === 'floor' ? (
          <View style={styles.input}>
            <NumberField value={floor} onChangeText={setFloor} placeholder="1" />
          </View>
        ) : null}
        {needsInput === 'target' ? (
          <View style={styles.input}>
            <NumberField value={target} onChangeText={setTarget} placeholder="—" />
          </View>
        ) : null}

        <View style={styles.commit}>
          <PrimaryButton label="이번 주 확정" onPress={onCommit} disabled={!canCommit} />
          <Toast message="✓ 설계 갱신 · 루프 종료" visible={committed} />
        </View>
      </Panel>
    </Wrap>
  );
}

const makeStyles = (c: ColorTheme) =>
  StyleSheet.create({
    back: { fontFamily: font.mono, fontSize: fontSize.meta, color: c.muted, marginBottom: space.md },
    hero: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      padding: space.xl,
      marginBottom: space.lg,
      ...c.shadow,
    },
    eyebrow: {
      fontFamily: font.mono,
      fontSize: fontSize.label,
      color: c.accent,
      textTransform: 'uppercase',
      letterSpacing: letterSpacing.label,
    },
    heroTitle: {
      fontFamily: font.sans,
      fontWeight: weight.bold,
      fontSize: fontSize.title,
      color: c.text,
      marginVertical: 6,
    },
    heroBody: { fontFamily: font.sans, fontSize: fontSize.small, color: c.muted, maxWidth: 560 },
    mirror: { marginTop: space.lg },
    panel: { marginBottom: space.lg },
    input: { marginTop: space.md },
    commit: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap', marginTop: space.md },
  });
