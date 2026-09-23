import { useEffect, useState } from 'react';

import {
  COMPONENT_LABELS,
  DECLINE_BADGE,
  declineEvidence,
  declineMessage,
  LOAD_FAILED_NOTE,
  REFLECTION_ACTION_LABELS,
  REFLECTION_ACTION_REASONS,
  SAVE_FAILED_NOTE,
} from '@/config/copy';
import { useRepository } from '@/context/RepositoryContext';
import { dayStates } from '@/domain/classify';
import { dateOf, mondayOf, weekdayOf, windowEndingAt } from '@/domain/dates';
import { diagnose } from '@/domain/diagnose';
import { archiveHabit, pauseHabit } from '@/domain/lifecycle';
import { offeredActions, suggestAction } from '@/domain/recommend';
import { decliningWeeks, guardLevel } from '@/domain/statusLight';
import { localToday, newId } from '@/lib/device';
import type {
  DayState,
  DiagnosisFlag,
  Habit,
  HabitDesignSnapshot,
  HabitEntry,
  ReflectionAction,
  Severity,
} from '@/models';

import { useFailure, type Failure } from './failure';
import { designErrors, growthChart, type GrowthChart } from './useHabitDetail';

/**
 * The Reflection screen's data path — SPEC §6.4, issue #21.
 *
 * The hook is the test seam, as on every other screen (jest.config.js: hooks + an
 * in-memory repository, `testMatch` is `<rootDir>/src/**`): which mark a mirror cell
 * wears, which actions are offered, which one is pre-selected and what a commit writes
 * are all decided here. `app/reflect/[id].tsx` places words and decides nothing.
 *
 * The diagnosis itself is not re-derived: `diagnose` (#20) names the flags,
 * `suggestAction` picks the prescription, and `decliningWeeks` supplies the one 🔴 that
 * has no flag. A `missed` day therefore reaches no card here (ADR-0002); the bulk
 * backfill question such a history asks instead is #22's.
 */

const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

/** One day of the mirror (`design/parts/Reflection.body.html:23–31`). */
export interface MirrorCell {
  date: string;
  /** `월`…`일` — the cell's header (`.mw`). */
  weekday: string;
  /**
   * The day's computed state, or `null` for a day the habit does not classify — before
   * its birth, or paused with no rows (ADR-0003). The mirror still draws the cell, so
   * it is always 7 wide.
   */
  state: DayState | null;
  /**
   * What the cell says (`.mv`). `missed` is the outline `·` and `skip` the filled `✕`
   * (`Reflection.body.html:32`): both are misses and only the second carries a reason,
   * so they never share a mark. A day with activity shows its sum, or `✓` on a binary
   * habit, which has no quantity (§4.5's yes/no refinement). Empty when `state` is null.
   */
  mark: string;
}

/** A note written on a mirrored day — the "journal notes" §6.4 puts beside the mirror. */
export interface MirrorNote {
  date: string;
  text: string;
}

/** One diagnosis card (§6.4): the flag plus what the screen needs to render it. */
export interface FlagCard {
  flag: DiagnosisFlag;
  /** The badge's word (`Reflection.body.html:37`). */
  componentLabel: string;
  /**
   * The weekly-totals chart (#15), on a `load` flag only — Rule 3's stagnation is a
   * claim about weeks, so the weeks are its evidence (§6.4, CONCEPT §6.2 rule 4).
   */
  chart: GrowthChart | null;
}

/**
 * The Established decline 🔴 (§4.6), which `diagnose` never flags. Without this card
 * that light would open onto a screen with nothing to cite.
 */
export interface DeclineCard {
  /** The completed-week totals the light read, oldest first. */
  totals: number[];
  badge: string;
  /** Always `critical`: the card stands for a 🔴 (§4.6). */
  severity: Severity;
  message: string;
  evidence: string;
  chart: GrowthChart | null;
}

/** The design field an action writes, which is also the input the screen shows. */
export type ActionField = 'cue' | 'identity' | 'floor' | 'target';

export interface ActionOption {
  action: ReflectionAction;
  label: string;
  /** The explanation shown with the action when it is the chosen one (§6.4). */
  reason: string;
  /** `null` for an action that writes no field — pause, archive, keep. */
  field: ActionField | null;
  /** The field's current value, to prefill the input. Empty when unset. */
  current: string;
}

export interface ReflectionView {
  loading: boolean;
  /** A failed read or a failed commit, or `null` (`useFailure`). */
  failure: Failure | null;
  /** `null` when the id names no stored habit. */
  habit: Habit | null;
  /** The last 7 days ending today, oldest first. */
  mirror: MirrorCell[];
  notes: MirrorNote[];
  flags: FlagCard[];
  decline: DeclineCard | null;
  /**
   * Is there any card at all? False on a 🔴 made only of `missed` days, which carries
   * no flag by design (ADR-0002) — the screen then says so instead of an empty section.
   */
  diagnosed: boolean;
  /** The engine's pre-selected action (`suggestAction`). */
  suggested: ReflectionAction;
  /** The actions the habit offers, in the screen's order (`offeredActions`). */
  options: ActionOption[];
  /** The action the commit will apply — `suggested` until the user picks another. */
  chosen: ReflectionAction;
  /** Ignores an action the habit does not offer. */
  choose(action: ReflectionAction): void;
  /**
   * Apply `chosen`. `value` is the chosen action's field input, ignored when it has
   * none. Resolves to a message when the input is illegal and **nothing is written**,
   * or to `null` otherwise — a failed write lands in `failure` instead.
   */
  commit(value: string): Promise<string | null>;
  /** True once the commit's two writes have both landed — the screen then leaves. */
  committed: boolean;
}

const FIELDS: Partial<Record<ReflectionAction, ActionField>> = {
  fill_cue: 'cue',
  adjust_cue: 'cue',
  fill_identity: 'identity',
  lower_floor: 'floor',
  raise_target: 'target',
};

function snapshot(habit: Habit): HabitDesignSnapshot {
  return {
    floor: habit.floor,
    floorUnit: habit.floorUnit,
    target: habit.target,
    cue: habit.cue,
    identity: habit.identity,
  };
}

function currentValue(habit: Habit, field: ActionField | null): string {
  if (field === 'cue') return habit.cue ?? '';
  if (field === 'identity') return habit.identity ?? '';
  if (field === 'floor') return String(habit.floor);
  if (field === 'target') return habit.target == null ? '' : String(habit.target);
  return '';
}

function mirrorFor(habit: Habit, entries: HabitEntry[], today: string): MirrorCell[] {
  const dates = windowEndingAt(today, 7);
  const classified = new Map(
    dayStates(habit, entries, dates[0], dates[dates.length - 1], today).map((day) => [day.date, day]),
  );

  return dates.map((date) => {
    const day = classified.get(date);
    const weekday = WEEKDAY_SHORT[weekdayOf(date)];
    if (day == null) return { date, weekday, state: null, mark: '' };

    const mark =
      day.state === 'pending'
        ? '오늘'
        : day.state === 'missed'
          ? '·'
          : day.state === 'skip'
            ? '✕'
            : habit.kind === 'binary'
              ? '✓'
              : String(day.sum);
    return { date, weekday, state: day.state, mark };
  });
}

function notesFor(entries: HabitEntry[], today: string): MirrorNote[] {
  const from = windowEndingAt(today, 7)[0];
  return entries
    .filter((entry) => entry.date >= from && entry.date <= today && entry.note)
    .sort((a, b) => a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp))
    .map((entry) => ({ date: entry.date, text: entry.note! }));
}

function declineFor(habit: Habit, entries: HabitEntry[], today: string): DeclineCard | null {
  const totals = decliningWeeks(habit, entries, today);
  if (totals == null) return null;

  // The level the C5 guard compared against. Above the floor it can only be the
  // honoured target; otherwise the guard fell back to the floor itself.
  const level = guardLevel(habit);
  return {
    totals,
    badge: DECLINE_BADGE,
    severity: 'critical',
    message: declineMessage(totals.length),
    evidence: declineEvidence(totals, level > habit.floor ? 'target' : 'floor', level),
    chart: growthChart(habit, entries, today),
  };
}

/** The habit the chosen action would write, or the input's error. */
function applied(
  habit: Habit,
  action: ReflectionAction,
  value: string,
  today: string,
): { next: Habit } | { error: string } {
  const text = value.trim();
  switch (action) {
    case 'fill_cue':
    case 'adjust_cue':
      return text.length > 0 ? { next: { ...habit, cue: text } } : { error: '언제 할지를 적어 주세요.' };
    case 'fill_identity':
      return text.length > 0
        ? { next: { ...habit, identity: text } }
        : { error: '왜 하는지를 적어 주세요.' };
    case 'lower_floor': {
      const floor = text.length > 0 ? Number(text) : NaN;
      const errors = designErrors(floor, habit.floorUnit, habit.target);
      if (errors.floor != null) return { error: errors.floor };
      if (floor >= habit.floor) return { error: '지금 최소량보다 작게 적어 주세요.' };
      return { next: { ...habit, floor } };
    }
    case 'raise_target': {
      const target = text.length > 0 ? Number(text) : NaN;
      const errors = designErrors(habit.floor, habit.floorUnit, target);
      if (errors.target != null) return { error: errors.target };
      if (habit.target != null && target <= habit.target) {
        return { error: '지금 목표보다 크게 적어 주세요.' };
      }
      return { next: { ...habit, target } };
    }
    case 'pause':
      return { next: pauseHabit(habit, today) };
    case 'archive':
      return { next: archiveHabit(habit, today) };
    case 'keep':
      return { next: habit };
  }
}

interface Loaded {
  habit: Habit | null;
  entries: HabitEntry[];
}

export function useReflection(
  habitId: string,
  {
    today = localToday(),
    now = () => new Date(),
  }: { today?: string; now?: () => Date } = {},
): ReflectionView {
  const repository = useRepository();
  const { failure, report, clear, attempt } = useFailure();
  const [loaded, setLoaded] = useState<Loaded>({ habit: null, entries: [] });
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<ReflectionAction | null>(null);
  const [committed, setCommitted] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const habit = await repository.getHabit(habitId);
      // From birth: the growth chart, the decline arm and every diagnosis window read
      // back from today, and a clipped range would cite totals the user never had.
      const entries =
        habit == null ? [] : await repository.getEntries(habit.id, dateOf(habit.createdAt), today);
      if (!cancelled) {
        setLoaded({ habit, entries });
        clear();
        setLoading(false);
      }
    }

    load().catch(() => {
      if (cancelled) return;
      setLoading(false);
      report(LOAD_FAILED_NOTE, () => setVersion((current) => current + 1));
    });

    return () => {
      cancelled = true;
    };
  }, [repository, habitId, today, version]);

  const { habit, entries } = loaded;
  const flags = habit == null ? [] : diagnose(habit, entries, today);
  const suggested = habit == null ? 'keep' : suggestAction(flags, habit);
  const offered = habit == null ? [] : offeredActions(habit);
  const chosen = picked != null && offered.includes(picked) ? picked : suggested;
  const decline = habit == null ? null : declineFor(habit, entries, today);

  async function commit(value: string): Promise<string | null> {
    if (habit == null) throw new Error('useReflection.commit: 습관을 아직 불러오지 못했습니다');

    const result = applied(habit, chosen, value, today);
    if ('error' in result) return result.error;

    const { next } = result;
    await attempt(SAVE_FAILED_NOTE, async () => {
      // The habit first: a session recorded for a design change that never landed would
      // be a history of something that did not happen. The reverse failure — design
      // written, session lost — leaves the habit right and only the log short.
      await repository.upsertHabit(next);
      await repository.upsertReflectionSession({
        id: newId(),
        habitId: habit.id,
        weekOf: mondayOf(today),
        flags,
        suggestedAction: suggested,
        chosenAction: chosen,
        designBefore: snapshot(habit),
        designAfter: snapshot(next),
        committedAt: now().toISOString(),
      });
      setCommitted(true);
    });
    return null;
  }

  return {
    loading,
    failure,
    habit,
    mirror: habit == null ? [] : mirrorFor(habit, entries, today),
    notes: habit == null ? [] : notesFor(entries, today),
    flags:
      habit == null
        ? []
        : flags.map((flag) => ({
            flag,
            componentLabel: COMPONENT_LABELS[flag.component],
            chart: flag.component === 'load' ? growthChart(habit, entries, today) : null,
          })),
    decline,
    diagnosed: flags.length > 0 || decline != null,
    suggested,
    options:
      habit == null
        ? []
        : offered.map((action) => {
            const field = FIELDS[action] ?? null;
            return {
              action,
              label: REFLECTION_ACTION_LABELS[action],
              reason: REFLECTION_ACTION_REASONS[action],
              field,
              current: currentValue(habit, field),
            };
          }),
    chosen,
    choose: (action) => {
      if (offered.includes(action)) setPicked(action);
    },
    commit,
    committed,
  };
}
