import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Banner,
  Button,
  Chip,
  Eyebrow,
  Field,
  Hint,
  NumberField,
  SegmentedControl,
  StaticField,
  TextField,
} from '@/components';
import { TUNING } from '@/config/tuning';
import { useRepository } from '@/context/RepositoryContext';
import { newId } from '@/lib/device';
import type { Habit, HabitKind } from '@/models';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_SIZE, SPACE } from '@/theme/tokens';

/**
 * Habit creation — SPEC §3.2 (invariants) and §6.6; layout and copy from
 * `design/parts/Main.body.html`.
 *
 * The form is the *only* place the §3.2 creation invariants are enforced, which is why
 * they are re-stated here rather than trusted to the engine: `classifyDay` ignores a
 * bad `target` defensively, but a stored habit that violates an invariant is a data
 * defect that survives every later screen.
 *
 * `cue` and `identity` stay optional on purpose (§5): asking a beginner to design a
 * trigger and an identity before any data exists is the friction that kills the first
 * habit. The diagnosis engine asks for them later, at the moment they explain a failure.
 *
 * The artboard's bottom `.sheet` (the Forming-slot soft cap) is deliberately omitted —
 * SPEC §1.3 defers slots to V2.
 */

const KIND_OPTIONS: { value: HabitKind; label: string }[] = [
  { value: 'count', label: '횟수 · 양' },
  { value: 'binary', label: '예 · 아니오' },
];

/** Binary habits have no amount to unit-ise; §3.2 fixes the unit to 'time'. */
const BINARY_UNIT = 'time';

interface Errors {
  name?: string;
  floor?: string;
  floorUnit?: string;
  target?: string;
  statId?: string;
}

export default function NewHabit() {
  const { colors } = useTheme();
  const router = useRouter();
  const repository = useRepository();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<HabitKind>('count');
  const [floor, setFloor] = useState('');
  const [floorUnit, setFloorUnit] = useState('');
  const [target, setTarget] = useState('');
  const [statId, setStatId] = useState<string | null>(null);
  const [cue, setCue] = useState('');
  const [identity, setIdentity] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isCount = kind === 'count';

  /** A corrected field must stop looking wrong before the next submit. */
  function clear(key: keyof Errors) {
    setErrors((prev) => (prev[key] == null ? prev : { ...prev, [key]: undefined }));
  }

  /**
   * Validation returns the habit it would persist, so the invariant check and the
   * payload cannot drift apart. Count-only fields are read only when `kind` is
   * 'count' — that is what stops a value typed before switching to 예·아니오 from
   * leaking into a binary habit (§3.2: binary ⇒ floor 1, no target).
   */
  function validate(): { habit: Habit } | { errors: Errors } {
    const next: Errors = {};
    const trimmedName = name.trim();
    if (trimmedName.length === 0) next.name = '이름을 적어 주세요.';
    if (statId == null) next.statId = '스탯을 하나 고르세요.';

    let floorValue = 1;
    let unitValue = BINARY_UNIT;
    let targetValue: number | undefined;

    if (isCount) {
      floorValue = Number(floor);
      unitValue = floorUnit.trim();
      // §3.2 requires only `floor >= 1`, not an integer: a 1.5km run or a 1.5h
      // session is a legitimate floor, and the intensity XP math (§4.2) is
      // amount-based, so fractional amounts carry through unchanged.
      if (!Number.isFinite(floorValue) || floorValue < 1) {
        next.floor = '최소량은 1 이상의 숫자로 적어 주세요.';
      }
      if (unitValue.length === 0) next.floorUnit = '단위를 적어 주세요 (예: 회, 쪽, 분).';
      if (target.trim().length > 0) {
        const parsed = Number(target);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          next.target = '목표는 숫자로 적어 주세요.';
        } else if (!next.floor && parsed <= floorValue) {
          // §3.2 (strict): a target at or below the floor says nothing, so `over`
          // would be unreachable-by-design rather than a stretch.
          next.target = '목표는 최소량보다 커야 합니다.';
        } else {
          targetValue = parsed;
        }
      }
    }

    if (Object.keys(next).length > 0) return { errors: next };

    const trimmedCue = cue.trim();
    const trimmedIdentity = identity.trim();

    return {
      habit: {
        id: newId(),
        name: trimmedName,
        statId: statId as string,
        kind,
        floor: floorValue,
        floorUnit: unitValue,
        // Absent optionals stay absent — `LocalRepository` never invents keys, and
        // the diagnosis rules read cue/identity emptiness (§4.4 rule 4).
        ...(targetValue != null ? { target: targetValue } : {}),
        ...(trimmedCue.length > 0 ? { cue: trimmedCue } : {}),
        ...(trimmedIdentity.length > 0 ? { identity: trimmedIdentity } : {}),
        lifecycle: 'forming',
        createdAt: new Date().toISOString(),
      },
    };
  }

  async function onSubmit() {
    if (saving) return;
    const result = validate();
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaveError(null);
    setSaving(true);
    try {
      await repository.upsertHabit(result.habit);
      router.back();
    } catch {
      // A storage write can genuinely fail (quota, a browser in private mode). Saying
      // so is the difference between "retry" and "the button does nothing".
      setSaveError('저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.surface }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.rowline}>
        <View>
          <Eyebrow>새 습관</Eyebrow>
          <Text style={[styles.heading, { color: colors.text }]}>습관 만들기</Text>
        </View>
        <Chip label="첫 설계" />
      </View>

      <Hint>
        지금은 아무 기록도 없으니 <Text style={{ color: colors.text, fontWeight: '600' }}>일단 추측으로</Text>{' '}
        정합니다. 해 보고 안 맞으면 나중에 같이 고쳐요. 가볍게 정하세요.
      </Hint>

      <Field label="이름" required error={errors.name}>
        <TextField
          accessibilityLabel="이름"
          value={name}
          onChangeText={(next) => {
            setName(next);
            clear('name');
          }}
          placeholder="예: 턱걸이"
          invalid={errors.name != null}
        />
      </Field>

      <Field label="측정 방식" required>
        <SegmentedControl
          label="측정 방식"
          options={KIND_OPTIONS}
          value={kind}
          onChange={(next) => {
            setKind(next);
            // The amount fields unmount for binary; their errors must not survive a
            // flip back to 횟수·양.
            setErrors((prev) => ({ ...prev, floor: undefined, floorUnit: undefined, target: undefined }));
          }}
        />
      </Field>

      {isCount ? (
        <>
          <Field
            label="최소량"
            required
            error={errors.floor ?? errors.floorUnit}
            hint={
              <Hint>
                아무리 바빠도 할 수 있는 양으로 잡으세요. 이만큼만 하면{' '}
                <Text style={{ color: colors.done, fontWeight: '600' }}>그날은 성공</Text>입니다.
              </Hint>
            }
          >
            <View style={styles.amountRow}>
              <NumberField
                accessibilityLabel="최소량"
                value={floor}
                onChangeText={(next) => {
                  setFloor(next);
                  clear('floor');
                  clear('target');
                }}
                placeholder="5"
                invalid={errors.floor != null}
              />
              <TextField
                accessibilityLabel="단위"
                value={floorUnit}
                onChangeText={(next) => {
                  setFloorUnit(next);
                  clear('floorUnit');
                }}
                placeholder="회"
                invalid={errors.floorUnit != null}
                style={styles.grow}
              />
            </View>
          </Field>

          <Field
            label="목표"
            required={false}
            error={errors.target}
            hint="더 하고 싶은 양 · 안 채워도 괜찮아요"
          >
            <View style={styles.amountRow}>
              <NumberField
                accessibilityLabel="목표"
                value={target}
                onChangeText={(next) => {
                  setTarget(next);
                  clear('target');
                }}
                placeholder="10"
                invalid={errors.target != null}
              />
              {/* The target shares the floor's unit — one source, never re-typed. */}
              <StaticField
                text={floorUnit.trim().length > 0 ? floorUnit.trim() : '단위'}
                muted={floorUnit.trim().length === 0}
                style={styles.grow}
              />
            </View>
          </Field>
        </>
      ) : (
        <Field
          label="최소량 · 목표"
          hint={
            <Hint>
              양이 없는 습관이에요. <Text style={{ color: colors.text, fontWeight: '600' }}>며칠 이어 갔는지만</Text>{' '}
              봅니다. 5일·10일처럼 이어 간 날이 쌓일 때 보너스를 받아요.
            </Hint>
          }
        >
          <StaticField text="정할 게 없어요 — 했다 / 안 했다 뿐" muted />
        </Field>
      )}

      <Field label="스탯" required error={errors.statId} hint="이 습관을 하면 고른 능력치가 올라갑니다.">
        <View style={styles.chiprow}>
          {TUNING.stats.map((stat) => (
            <Button
              key={stat.id}
              label={`${stat.icon} ${stat.name}`}
              variant={statId === stat.id ? 'sel' : 'default'}
              onPress={() => {
                setStatId(stat.id);
                clear('statId');
              }}
            />
          ))}
        </View>
      </Field>

      {/* Placed above the two optional fields so "아래 두 칸" names them (see report). */}
      <Banner variant="neutral">
        아래 두 칸은 <Text style={{ color: colors.text, fontWeight: '600' }}>비워 두셔도 됩니다.</Text> 나중에 잘 안 될 때, “언제
        할지부터 정해 볼까요?” 하고 저희가 먼저 물어볼게요. 그때 채우는 게 훨씬 잘 붙습니다.
      </Banner>

      <Field label="신호 — 언제·어디서 할지" required={false}>
        <TextField
          accessibilityLabel="신호"
          value={cue}
          onChangeText={setCue}
          placeholder="예: 아침 커피 마신 뒤, 문틀 바에서"
        />
      </Field>

      <Field label="이유 — 어떤 사람이 되고 싶은지" required={false}>
        <TextField
          accessibilityLabel="이유"
          value={identity}
          onChangeText={setIdentity}
          placeholder="예: 나는 매일 몸을 쓰는 사람이니까"
        />
      </Field>

      {saveError != null && <Banner>{saveError}</Banner>}

      <Button label="습관 만들기" variant="pri" block disabled={saving} onPress={onSubmit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.xl - 2 },
  rowline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md + 2 },
  heading: { fontSize: FONT_SIZE.lg, fontWeight: '600', letterSpacing: -0.16 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md - 2 },
  grow: { flex: 1 },
  chiprow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md - 2 },
});
