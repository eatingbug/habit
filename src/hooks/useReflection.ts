import { useEffect, useRef, useState } from 'react';

import {
  chartBestLabel,
  chartFloorLabel,
  chartSpanLabel,
  chartSummary,
  chartTargetLabel,
  chartWeeksAgoLabel,
  COMPONENT_LABELS,
  DAY_WORDS,
  DECLINE_BADGE,
  declineEvidence,
  declineMessage,
  diagnosisBadge,
  habitIcon,
  LOAD_FAILED_NOTE,
  moreDiagnosesLabel,
  proposalLine,
  reflectionTitle,
  REFLECTION_ACTION_LABELS,
  REFLECTION_ACTION_REASONS,
  REFLECTION_CHART_WORDS,
  REFLECTION_COPY,
  REFLECTION_CUE_PLACEHOLDER,
  SAVE_FAILED_NOTE,
  shortDateLabel,
  skipSheetTitle,
  WEEKDAY_LABELS,
  weekdayDateLabel,
  WRITE_FAILED_NOTE,
} from '@/config/copy';
import { useRepository } from '@/context/RepositoryContext';
import { backfillPrompt } from '@/domain/backfillPrompt';
import { dayStates } from '@/domain/classify';
import { dateOf, mondayOf, weekdayOf, windowEndingAt } from '@/domain/dates';
import { diagnose } from '@/domain/diagnose';
import { archiveHabit, pauseHabit } from '@/domain/lifecycle';
import { offeredActions, suggestAction } from '@/domain/recommend';
import { decliningWeeks, guardLevel } from '@/domain/statusLight';
import { localToday, newId } from '@/lib/device';
import type {
  DayState,
  DiagnosisComponent,
  DiagnosisFlag,
  Habit,
  HabitDesignSnapshot,
  HabitEntry,
  ReflectionAction,
  Severity,
  SkipReason,
} from '@/models';

import { useFailure, type Failure } from './failure';
import { designErrors, growthChart, type GrowthBar } from './useHabitDetail';
import { useQuickLog, type QuickLogToast } from './useQuickLog';

/**
 * The Reflection screen's data path — SPEC §6.4, issue #21.
 *
 * The hook is the test seam, as on every other screen (jest.config.js: hooks + an
 * in-memory repository, `testMatch` is `<rootDir>/src/**`): which state a mirror cell
 * shows, which card opens, which actions are offered, which one is pre-selected and
 * what a commit writes are all decided here, and every word the screen shows is made
 * here (#131). `app/reflect/[id].tsx` places words and decides nothing.
 *
 * The diagnosis itself is not re-derived: `diagnose` (#20) names the flags,
 * `suggestAction` picks the prescription, and `decliningWeeks` supplies the one 🔴 that
 * has no flag. A `missed` day therefore reaches no card here (ADR-0002): such a
 * history is asked about instead, by `recover` (#22), and its answers are written
 * through `useQuickLog` like every other row.
 */

/** One day of the mirror (`ReReflection`, §6.7). */
export interface MirrorCell {
  date: string;
  /** The word under the mark: `월`…`일`, or `오늘` for today. */
  label: string;
  /**
   * The day's computed state, or `null` for a day the habit does not classify — before
   * its birth, or paused with no rows (ADR-0003). The mirror still draws the cell, so
   * it is always 7 wide. The mark itself is the common day-state mark (§6.0).
   */
  state: DayState | null;
}

/** A note written on a mirrored day — the "journal notes" §6.4 puts beside the mirror. */
export interface MirrorNote {
  date: string;
  /** "3/24". */
  label: string;
  text: string;
}

/**
 * The weekly chart under a `load` or decline card (`ReReflectionChart`, #147): the
 * geometry of `growthChart` and every word around it. The screen only places them.
 */
export interface WeeklyChart {
  /** Oldest first, `TUNING.growthChartWeeks` of them. The last is this week. */
  bars: GrowthBar[];
  /** The weekly floor line's height, 0–100. */
  floorLine: number;
  /** The weekly target line's height, or `null` when the habit has no effective target. */
  targetLine: number | null;
  /** "최근 12주". */
  span: string;
  /** "최고 64". */
  best: string;
  /** "최소 35". */
  floorLabel: string;
  /** "목표 70", or `null` with `targetLine`. */
  targetLabel: string | null;
  /** "11주 전" — under the oldest bar. */
  startLabel: string;
  /** "이번 주" — under the last bar. */
  endLabel: string;
  /** The ⭐'s accessible name. */
  bestWeekLabel: string;
  /** The whole chart's accessible name. */
  summary: string;
}

/**
 * One diagnosis card (§6.7): a flag from `diagnose`, or the Established decline 🔴
 * (§4.6), which `diagnose` never flags — without that card the light would open onto a
 * screen with nothing to cite.
 */
export interface DiagnosisCard {
  /** The flag's component, or `decline`. Unique among the cards. */
  key: DiagnosisComponent | 'decline';
  /** `critical` for Rule 4 and for the decline card, `warning` otherwise. */
  severity: Severity;
  /** The palette colour of the badge and the left rule: `crit` for `critical`, else `warn`. */
  tone: 'crit' | 'warn';
  /** The severity's mark and the component's name: "▲ 언제·어디서" (§6.7 Diagnosis copy). */
  badge: string;
  message: string;
  /** Always shown in the open card's body — the guard against rubber-stamping (§6.7). */
  evidence: string;
  /**
   * The weekly-totals chart (#15), on a `load` flag and the decline card only — both
   * are claims about weeks, so the weeks are their evidence (§6.7, CONCEPT §6.2 rule 4).
   */
  chart: WeeklyChart | null;
}

/** The design field an action writes. */
type ActionField = 'cue' | 'identity' | 'floor' | 'target';

/** The input the screen shows for an action that writes a field. */
export interface ActionInput {
  /** The cue's example (`ReReflection`); empty for the other fields. */
  placeholder: string;
  /** A number pad: the floor and the target. */
  numeric: boolean;
  /** The habit's unit beside an amount, or `null` beside text. */
  unit: string | null;
}

export interface ActionOption {
  action: ReflectionAction;
  label: string;
  /** The explanation shown with the action when it is the chosen one (§6.4). */
  reason: string;
  /** `null` for an action that writes no field — pause, archive, keep. */
  input: ActionInput | null;
  /** The field's current value, to prefill the input. Empty when unset. */
  current: string;
}

/** ADR-0002's question as the screen asks it (`ReReflection`, §6.7). */
export interface RecoverPrompt {
  /** `이 N일, 하셨나요?` — N counts the dates still listed. */
  question: string;
  /**
   * The `missed` dates still unanswered, ascending, each with its "3/25 (수)" and the
   * accessible names of its two answers.
   */
  rows: { date: string; label: string; didLabel: string; didNotLabel: string }[];
}

/** The skip reason sheet that 안 했어요 opens for one date (§6.2 B5). */
export interface AskingSheet {
  date: string;
  /** "💪 턱걸이". */
  eyebrow: string;
  /** "3/25 (수) 못 했어요 · 왜?". */
  title: string;
}

export interface ReflectionView {
  loading: boolean;
  /** A failed read, commit, answer or undo, or `null` (`useFailure`). */
  failure: Failure | null;
  /** `null` when the id names no stored habit. */
  habit: Habit | null;
  /** "{습관 이름}, 잠깐 볼까요". Empty while there is no habit. */
  title: string;
  /** The screen's fixed words and its three `?` tooltips (`REFLECTION_COPY`). */
  words: typeof REFLECTION_COPY;
  /** The last 7 days ending today, oldest first. */
  mirror: MirrorCell[];
  notes: MirrorNote[];
  /**
   * The most severe card, the one §6.7 opens. Ties keep `diagnose`'s order, with the
   * decline card after every flag. `null` when there is no card.
   */
  lead: DiagnosisCard | null;
  /** Every other card, in the same order, folded under `moreLabel`. */
  folded: DiagnosisCard[];
  /** "다른 점 N개 더 보기", or `null` when nothing is folded. */
  moreLabel: string | null;
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
  /** "✓ 이렇게 해 볼까요: {chosen's label}". Empty while there is no habit. */
  proposal: string;
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
  /**
   * The recover-first prompt, or `null`. Whether it opens is decided **once**, on the
   * visit's first load (`backfillPrompt.shouldPrompt`): one answer can break the run
   * that triggered it, and the rest of the question must not vanish mid-answer. What
   * it lists is re-read after every write, so an answered date drops out and an undone
   * one comes back. `null` again once nothing is left to ask.
   */
  recover: RecoverPrompt | null;
  /** "했어요": appends one activity row at the floor, noon-pinned (§6.3). */
  fill(date: string): Promise<void>;
  /** "안 했어요": opens the skip reason sheet for `date`. Writes nothing yet. */
  askWhy(date: string): void;
  /** The open skip reason sheet, or `null`. */
  asking: AskingSheet | null;
  /** Closes the sheet without writing. */
  cancelAsk(): void;
  /** The chip tap: appends the skip row carrying `reason` and `note`, and closes the sheet. */
  skip(date: string, reason: SkipReason, note?: string): Promise<void>;
  /**
   * An answer is being written. `fill` and `skip` ignore a second call until the list
   * that reflects the first has loaded — two taps would otherwise both read the date
   * empty and write it twice.
   */
  answering: boolean;
  /** The answer's undo toast (`useQuickLog`). */
  toast: QuickLogToast | null;
  undoLast(): Promise<void>;
}

const SEVERITY_RANK: Record<Severity, number> = { ok: 0, warning: 1, critical: 2 };

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

function inputFor(habit: Habit, field: ActionField): ActionInput {
  const numeric = field === 'floor' || field === 'target';
  return {
    placeholder: field === 'cue' ? REFLECTION_CUE_PLACEHOLDER : '',
    numeric,
    unit: numeric ? habit.floorUnit : null,
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

  return dates.map((date) => ({
    date,
    label: date === today ? DAY_WORDS.today : WEEKDAY_LABELS[weekdayOf(date)],
    state: classified.get(date)?.state ?? null,
  }));
}

function notesFor(entries: HabitEntry[], today: string): MirrorNote[] {
  const from = windowEndingAt(today, 7)[0];
  return entries
    .filter((entry) => entry.date >= from && entry.date <= today && entry.note)
    .sort((a, b) => a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp))
    .map((entry) => ({ date: entry.date, label: shortDateLabel(entry.date), text: entry.note! }));
}

function weeklyChart(habit: Habit, entries: HabitEntry[], today: string): WeeklyChart | null {
  const chart = growthChart(habit, entries, today);
  if (chart == null) return null;

  const weeks = chart.bars.length;
  return {
    bars: chart.bars,
    floorLine: chart.floorLine,
    targetLine: chart.targetLine,
    span: chartSpanLabel(weeks),
    best: chartBestLabel(chart.best),
    floorLabel: chartFloorLabel(chart.weeklyFloor),
    targetLabel: chart.weeklyTarget == null ? null : chartTargetLabel(chart.weeklyTarget),
    startLabel: chartWeeksAgoLabel(weeks - 1),
    endLabel: REFLECTION_CHART_WORDS.thisWeek,
    bestWeekLabel: REFLECTION_CHART_WORDS.bestWeek,
    summary: chartSummary(weeks, chart.best),
  };
}

function declineFor(habit: Habit, entries: HabitEntry[], today: string): DiagnosisCard | null {
  const totals = decliningWeeks(habit, entries, today);
  if (totals == null) return null;

  // The level the C5 guard compared against. Above the floor it can only be the
  // honoured target; otherwise the guard fell back to the floor itself.
  const level = guardLevel(habit);
  return {
    key: 'decline',
    severity: 'critical',
    tone: 'crit',
    badge: diagnosisBadge('critical', DECLINE_BADGE),
    message: declineMessage(totals.length),
    evidence: declineEvidence(totals, level > habit.floor ? 'target' : 'floor', level),
    chart: weeklyChart(habit, entries, today),
  };
}

/** Every card, most severe first (§6.7). */
function cardsFor(
  habit: Habit,
  entries: HabitEntry[],
  today: string,
  flags: DiagnosisFlag[],
): DiagnosisCard[] {
  const cards: DiagnosisCard[] = flags.map((flag) => ({
    key: flag.component,
    severity: flag.severity,
    tone: flag.severity === 'critical' ? 'crit' : 'warn',
    badge: diagnosisBadge(flag.severity, COMPONENT_LABELS[flag.component]),
    message: flag.message,
    evidence: flag.evidence,
    chart: flag.component === 'load' ? weeklyChart(habit, entries, today) : null,
  }));
  const decline = declineFor(habit, entries, today);
  if (decline != null) cards.push(decline);
  // `sort` is stable, so equal severities keep the order above.
  return cards.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
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
      return text.length > 0 ? { next: { ...habit, cue: text } } : { error: REFLECTION_COPY.cueRequired };
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
  const [prompting, setPrompting] = useState<boolean | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);
  // The guard itself: two taps in one render share one `answering` value.
  const inFlight = useRef(false);
  const quick = useQuickLog({ today, now, onChange: () => setVersion((current) => current + 1) });

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
        if (habit != null) {
          setPrompting((latched) => latched ?? backfillPrompt(habit, entries, today).shouldPrompt);
        }
        inFlight.current = false;
        setAnswering(false);
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
  const [lead = null, ...folded] = habit == null ? [] : cardsFor(habit, entries, today, flags);
  const prompt = habit == null || !prompting ? null : backfillPrompt(habit, entries, today);
  const chosenLabel = REFLECTION_ACTION_LABELS[chosen];

  /** One answer. The guard lifts when the reload lands, or here if the write failed. */
  async function answer(write: (subject: Habit) => Promise<void>): Promise<void> {
    if (habit == null || inFlight.current) return;
    inFlight.current = true;
    setAnswering(true);
    let wrote = false;
    await attempt(WRITE_FAILED_NOTE, async () => {
      await write(habit);
      wrote = true;
    });
    if (!wrote) {
      inFlight.current = false;
      setAnswering(false);
    }
  }

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
    // 실행취소의 실패는 `useQuickLog` 가 들고 있다 — 한 배너 자리를 둘이 나눠 쓴다.
    failure: failure ?? quick.failure,
    habit,
    title: habit == null ? '' : reflectionTitle(habit.name),
    words: REFLECTION_COPY,
    mirror: habit == null ? [] : mirrorFor(habit, entries, today),
    notes: habit == null ? [] : notesFor(entries, today),
    lead,
    folded,
    moreLabel: folded.length === 0 ? null : moreDiagnosesLabel(folded.length),
    diagnosed: lead != null,
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
              input: field == null ? null : inputFor(habit, field),
              current: currentValue(habit, field),
            };
          }),
    chosen,
    proposal: habit == null ? '' : proposalLine(chosenLabel),
    choose: (action) => {
      if (offered.includes(action)) setPicked(action);
    },
    commit,
    committed,
    recover:
      prompt == null || prompt.dates.length === 0
        ? null
        : {
            question: prompt.question,
            rows: prompt.dates.map((date) => {
              const label = weekdayDateLabel(date, weekdayOf(date));
              return {
                date,
                label,
                didLabel: `${label} ${REFLECTION_COPY.did}`,
                didNotLabel: `${label} ${REFLECTION_COPY.didNot}`,
              };
            }),
          },
    fill: (date) => answer((subject) => quick.logActivity(subject, subject.floor, { date })),
    askWhy: setAsking,
    asking:
      habit == null || asking == null
        ? null
        : {
            date: asking,
            eyebrow: `${habitIcon(habit)} ${habit.name}`,
            title: skipSheetTitle(weekdayDateLabel(asking, weekdayOf(asking))),
          },
    cancelAsk: () => setAsking(null),
    skip: async (date, reason, note) => {
      await answer((subject) => quick.logSkip(subject, reason, { date, note }));
      // Closed either way: a failure is said once, in the banner, and the date stays
      // listed to be answered again.
      setAsking(null);
    },
    answering,
    toast: quick.toast,
    undoLast: quick.undoLast,
  };
}
