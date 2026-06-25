/**
 * Habit Detail (SPEC §6.3) — design (cue/floor/identity) with inline edit, stat pills,
 * a tappable heatmap + "add past entry" for backfill, and the journal timeline.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHabitDetail } from '@/hooks/useHabitDetail';
import {
  DesignBox,
  EmptyState,
  Heatmap,
  JournalEntry,
  NumberField,
  Panel,
  Pill,
  PrimaryButton,
  SectionLabel,
  SkipReasonPicker,
  Tag,
  TextField,
  Wrap,
} from '@/components';
import { color, font, fontSize, space } from '@/theme/tokens';
import { formatShortDate } from '@/util/date';
import type { SkipReason } from '@/models';
import type { JournalItem } from '@/components/types';

export default function HabitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const d = useHabitDetail(id);

  const [editing, setEditing] = useState(false);
  const [cue, setCue] = useState('');
  const [identity, setIdentity] = useState('');
  const [floor, setFloor] = useState('');
  const [target, setTarget] = useState('');

  const [backfillDate, setBackfillDate] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [bfAmount, setBfAmount] = useState('');
  const [bfNote, setBfNote] = useState('');
  const [bfSkip, setBfSkip] = useState(false);
  const [bfReason, setBfReason] = useState<SkipReason>('cue');

  if (!d.habit) {
    return (
      <Wrap>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>← 대시보드로</Text>
        </Pressable>
        <EmptyState>{d.loading ? '불러오는 중…' : '이 퀘스트는 더 이상 존재하지 않습니다.'}</EmptyState>
      </Wrap>
    );
  }
  const habit = d.habit;

  const openEdit = () => {
    setCue(habit.cue ?? '');
    setIdentity(habit.identity ?? '');
    setFloor(String(habit.floor));
    setTarget(habit.target != null ? String(habit.target) : '');
    setEditing(true);
  };
  const saveEdit = async () => {
    const floorNum = parseInt(floor, 10);
    await d.updateDesign({
      cue: cue.trim() || undefined,
      identity: identity.trim() || undefined,
      floor: Number.isFinite(floorNum) && floorNum >= 1 ? floorNum : habit.floor,
      target: target.trim() ? parseInt(target, 10) : undefined,
    });
    setEditing(false);
  };

  const closeBackfill = () => {
    setBackfillDate(null);
    setEditingEntryId(null);
  };
  const openBackfill = (date: string) => {
    setBackfillDate(date);
    setEditingEntryId(null);
    setBfAmount('');
    setBfNote('');
    setBfSkip(false);
    setBfReason('cue');
  };
  const openEditEntry = (j: JournalItem) => {
    setBackfillDate(j.date);
    setEditingEntryId(j.id);
    setBfAmount(j.isBinary ? '' : String(j.actual));
    setBfNote(j.note ?? '');
    setBfSkip(j.state === 'skip');
    setBfReason(j.skipReason ?? 'cue');
  };
  const saveBackfill = async () => {
    if (!backfillDate) return;
    const note = bfNote.trim() || undefined;
    let n = 0;
    if (!bfSkip && habit.kind !== 'binary') {
      n = parseInt(bfAmount, 10);
      if (!Number.isFinite(n) || n < habit.floor) return;
    }
    if (editingEntryId) {
      if (bfSkip) {
        await d.editEntry(editingEntryId, { skip: true, skipReason: bfReason, note });
      } else {
        await d.editEntry(editingEntryId, { skip: false, actual: habit.kind === 'binary' ? 1 : n, note });
      }
    } else if (bfSkip) {
      await d.logSkip(backfillDate, bfReason, note);
    } else {
      await d.logEntry(backfillDate, habit.kind === 'binary' ? 1 : n, note);
    }
    closeBackfill();
  };

  return (
    <Wrap>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>← 대시보드로</Text>
      </Pressable>

      <Panel>
        <View style={styles.head}>
          <View style={styles.headLeft}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{habit.name}</Text>
              <Tag>{d.statName}</Tag>
            </View>
            {habit.identity ? <Text style={styles.sub}>{habit.identity}</Text> : null}
          </View>
          <View style={styles.pillset}>
            <Pill n={d.streak} label="연속" />
            <Pill n={`${d.floorRatePct}%`} label="최소 달성률" />
            <Pill n={`+${d.xpWeek}`} label="주간 XP" />
          </View>
        </View>

        <View style={styles.designHead}>
          <SectionLabel>설계 — 현재 가설</SectionLabel>
          <Pressable onPress={editing ? () => setEditing(false) : openEdit} hitSlop={8}>
            <Text style={styles.edit}>{editing ? '취소' : '수정'}</Text>
          </Pressable>
        </View>

        {editing ? (
          <View style={styles.editBox}>
            <FieldLabel>신호 · 언제/어디서</FieldLabel>
            <TextField value={cue} onChangeText={setCue} placeholder="아침 커피 마신 뒤…" />
            <FieldLabel>정체성</FieldLabel>
            <TextField value={identity} onChangeText={setIdentity} placeholder="나는 ~하는 사람이다…" />
            {habit.kind === 'count' ? (
              <View style={styles.editRow}>
                <View style={styles.editCol}>
                  <FieldLabel>최소 기준</FieldLabel>
                  <NumberField value={floor} onChangeText={setFloor} placeholder="1" />
                </View>
                <View style={styles.editCol}>
                  <FieldLabel>목표 (선택)</FieldLabel>
                  <NumberField value={target} onChangeText={setTarget} placeholder="—" />
                </View>
              </View>
            ) : null}
            <PrimaryButton label="설계 저장" onPress={saveEdit} />
          </View>
        ) : (
          <DesignBox
            cue={habit.cue}
            floor={habit.floor}
            floorUnit={habit.floorUnit}
            identity={habit.identity}
            kind={habit.kind}
          />
        )}

        <View style={styles.journalHead}>
          <SectionLabel>저널 — 한 주를 돌아보기</SectionLabel>
          <Pressable onPress={() => openBackfill(d.cellDates[d.cellDates.length - 1])} hitSlop={8}>
            <Text style={styles.edit}>+ 과거 기록 추가</Text>
          </Pressable>
        </View>

        <Heatmap cells={d.cells} onCellPress={(i) => openBackfill(d.cellDates[i])} />

        {backfillDate ? (
          <View style={styles.backfill}>
            <Text style={styles.backfillTitle}>
              {formatShortDate(backfillDate)} {editingEntryId ? '기록 수정' : '기록'}
            </Text>
            <Pressable onPress={() => setBfSkip((s) => !s)} hitSlop={6}>
              <Text style={styles.toggle}>{bfSkip ? '↺ 수치 입력으로' : '⨯ 건너뛰기'}</Text>
            </Pressable>
            {bfSkip ? (
              <SkipReasonPicker value={bfReason} onValueChange={setBfReason} />
            ) : habit.kind === 'binary' ? (
              <Text style={styles.binaryHint}>✓ 완료로 기록됩니다.</Text>
            ) : (
              <NumberField value={bfAmount} onChangeText={setBfAmount} placeholder={`${habit.floor}`} />
            )}
            <TextField value={bfNote} onChangeText={setBfNote} placeholder="메모 (선택)" />
            <View style={styles.backfillActions}>
              <PrimaryButton label="기록 저장" onPress={saveBackfill} />
              <Pressable onPress={closeBackfill} hitSlop={8}>
                <Text style={styles.edit}>취소</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.journalList}>
          {d.journal.length === 0 ? (
            <EmptyState>아직 기록이 없어요 — 위에서 추가하세요.</EmptyState>
          ) : (
            d.journal.map((j) => <JournalEntry key={j.id} item={j} onPress={() => openEditEntry(j)} />)
          )}
        </View>
      </Panel>
    </Wrap>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  back: { fontFamily: font.mono, fontSize: fontSize.meta, color: color.inkDim, marginBottom: space.md },
  head: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.lg, marginBottom: space.lg },
  headLeft: { flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  title: { fontFamily: font.serifBlack, fontSize: fontSize.detail, color: color.ink },
  sub: { fontFamily: font.sans, fontSize: fontSize.meta, color: color.inkFaint, marginTop: 6 },
  pillset: { flexDirection: 'row', gap: space.lg },
  designHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  journalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.lg },
  edit: { fontFamily: font.mono, fontSize: fontSize.meta, color: color.gold },
  editBox: { gap: space.sm, marginBottom: space.lg },
  editRow: { flexDirection: 'row', gap: space.md },
  editCol: { flex: 1 },
  fieldLabel: { fontFamily: font.mono, fontSize: fontSize.tag, color: color.inkFaint, textTransform: 'uppercase', marginTop: space.xs },
  backfill: { gap: space.sm, marginTop: space.md, padding: space.md, backgroundColor: color.panel2, borderRadius: 12, borderWidth: 1, borderColor: color.line },
  backfillTitle: { fontFamily: font.sansSemiBold, fontSize: fontSize.bodySm, color: color.ink },
  backfillActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  toggle: { fontFamily: font.mono, fontSize: fontSize.micro, color: color.inkDim },
  binaryHint: { fontFamily: font.serifItalic, fontStyle: 'italic', fontSize: fontSize.small, color: color.green4 },
  journalList: { marginTop: space.lg, gap: 0 },
});
