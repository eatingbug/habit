/**
 * useReflection — the primary bet: resurface the week, diagnose, and CLOSE THE LOOP.
 *
 * Builds the 7-day mirror, runs the rule engine (diagnose → suggestAction), and on commit
 * writes BOTH the habit design change AND a ReflectionSession (designBefore/After,
 * chosenAction, committedAt). That write is where the loop closes in code (CONCEPT §6.2).
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRepository } from '@/context/RepositoryContext';
import { TUNING } from '@/config/tuning';
import { diagnose } from '@/domain/diagnose';
import { suggestAction } from '@/domain/recommend';
import { addDays, dayRecordMap, startOfWeek } from '@/domain/util';
import { newId } from '@/util/id';
import { nowTimestamp, todayLocal, weekdayLetter } from '@/util/date';
import type { DiagnosisFlag, Habit, HabitDesignSnapshot, HabitEntry, ReflectionAction } from '@/models';
import type { ActionOption, MirrorDay } from '@/components/types';

const EPOCH = '1970-01-01';

const ACTION_META: Record<ReflectionAction, { icon: string; title: string; desc: string }> = {
  adjust_cue: { icon: '🎯', title: '신호 조정', desc: '언제·어디서 실행할지 다듬기.' },
  lower_floor: { icon: '⬇', title: '최소 기준 낮추기', desc: '최소 달성을 더 쉽게.' },
  raise_target: { icon: '⬆', title: '목표 올리기', desc: '정체기를 넘어서기.' },
  fill_cue: { icon: '🎯', title: '신호 추가', desc: '분명한 트리거 만들기.' },
  fill_identity: { icon: '🪞', title: '정체성 추가', desc: '이 습관이 만드는 나를 정의하기.' },
  pause: { icon: '⏸', title: '잠시 멈추기', desc: '삭제하지 않고 보류.' },
  archive: { icon: '🗄', title: '보관', desc: '이 퀘스트 마무리.' },
  keep: { icon: '✓', title: '그대로 유지', desc: '이번 주 설계는 유효함.' },
};

export interface ReflectionInput {
  cue?: string;
  identity?: string;
  floor?: number;
  target?: number;
}

function snapshot(h: Habit): HabitDesignSnapshot {
  return { floor: h.floor, floorUnit: h.floorUnit, target: h.target, cue: h.cue, identity: h.identity };
}

function applyAction(h: Habit, action: ReflectionAction, input: ReflectionInput): Habit {
  switch (action) {
    case 'fill_cue':
    case 'adjust_cue':
      return { ...h, cue: input.cue ?? h.cue };
    case 'fill_identity':
      return { ...h, identity: input.identity ?? h.identity };
    case 'lower_floor':
      return { ...h, floor: input.floor ?? h.floor };
    case 'raise_target':
      return { ...h, target: input.target ?? h.target };
    case 'pause':
      return { ...h, lifecycle: 'paused' };
    case 'archive':
    case 'keep':
    default:
      return h;
  }
}

function actionsFor(habit: Habit, suggested: ReflectionAction): ActionOption[] {
  const candidates: (ReflectionAction | null)[] = [
    suggested,
    habit.cue ? 'adjust_cue' : 'fill_cue',
    !habit.identity ? 'fill_identity' : null,
    'lower_floor',
    'raise_target',
    'pause',
    'keep',
  ];
  const seen = new Set<ReflectionAction>();
  const ordered: ReflectionAction[] = [];
  for (const a of candidates) {
    if (a && !seen.has(a)) {
      seen.add(a);
      ordered.push(a);
    }
  }
  return ordered.map((action) => ({ action, ...ACTION_META[action] }));
}

function buildMirror(entries: HabitEntry[], today: string, habit: Habit): MirrorDay[] {
  const recs = dayRecordMap(entries, habit);
  const weekStart = startOfWeek(today, TUNING.weekStartsOn);
  const days: MirrorDay[] = [];
  for (let col = 0; col < 7; col += 1) {
    const date = addDays(weekStart, col);
    const rec = recs.get(date);
    let state: MirrorDay['state'] = 'blank';
    let value = '–';
    if (rec) {
      if (rec.state === 'over') {
        state = 'over';
        value = String(rec.sumActual);
      } else if (rec.state === 'done') {
        state = 'ok';
        value = String(rec.sumActual);
      } else if (rec.state === 'skip' && rec.effectiveSkipReason !== 'exception') {
        state = 'miss';
      }
      // partial / unknown / exception-skip → blank
    }
    days.push({ weekday: weekdayLetter(date), state, value });
  }
  return days;
}

export interface ReflectionData {
  loading: boolean;
  habit: Habit | null;
  statName: string;
  mirror: MirrorDay[];
  flags: DiagnosisFlag[];
  suggestedAction: ReflectionAction | null;
  actions: ActionOption[];
  commit: (chosenAction: ReflectionAction, input: ReflectionInput) => Promise<void>;
  reload: () => void;
}

export function useReflection(id: string): ReflectionData {
  const repo = useRepository();
  const [loading, setLoading] = useState(true);
  const [habit, setHabit] = useState<Habit | null>(null);
  const [entries, setEntries] = useState<HabitEntry[]>([]);

  const load = useCallback(async () => {
    const today = todayLocal();
    const h = await repo.getHabit(id);
    const es = h ? await repo.getEntries(id, EPOCH, today) : [];
    setHabit(h);
    setEntries(es);
    setLoading(false);
  }, [repo, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const today = todayLocal();
  const flags = habit ? diagnose(habit, entries, today) : [];
  const suggestedAction = habit ? suggestAction(flags, habit) : null;

  const commit = useCallback(
    async (chosenAction: ReflectionAction, input: ReflectionInput) => {
      if (!habit) return;
      const designBefore = snapshot(habit);
      const updated = applyAction(habit, chosenAction, input);
      const designAfter = snapshot(updated);

      if (chosenAction === 'archive') {
        await repo.deleteHabit(habit.id);
      } else {
        await repo.upsertHabit(updated);
      }
      await repo.upsertReflectionSession({
        id: newId(),
        habitId: habit.id,
        weekOf: startOfWeek(today, TUNING.weekStartsOn),
        flags,
        suggestedAction: suggestedAction ?? 'keep',
        chosenAction,
        designBefore,
        designAfter,
        committedAt: nowTimestamp(),
      });
    },
    [repo, habit, flags, suggestedAction, today],
  );

  return {
    loading,
    habit,
    statName: habit ? (TUNING.stats.find((s) => s.id === habit.statId)?.name ?? habit.statId) : '',
    mirror: habit ? buildMirror(entries, today, habit) : [],
    flags,
    suggestedAction,
    actions: habit && suggestedAction ? actionsFor(habit, suggestedAction) : [],
    commit,
    reload: load,
  };
}
