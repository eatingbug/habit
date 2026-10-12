import { useState } from 'react';

import { habitIcon, NEW_HABIT_COPY, NEW_HABIT_ICONS, SAVE_FAILED_NOTE, TOOLTIPS } from '@/config/copy';
import { TUNING } from '@/config/tuning';
import { useRepository } from '@/context/RepositoryContext';
import { newId } from '@/lib/device';
import type { Habit, HabitKind } from '@/models';

import { useFailure, type Failure } from './failure';

/**
 * The New habit screen's form — SPEC §6.6, `ReNewHabit` and `ReNewHabitYesNo` (#130).
 *
 * The form is the *only* place the §3.2 creation invariants are enforced, which is why
 * they are checked here rather than trusted to the engine: `classifyDay` ignores a bad
 * `target` defensively, but a stored habit that violates an invariant is a data defect
 * that survives every later screen.
 *
 * `cue` and `identity` stay optional on purpose (§5): asking a beginner to design a
 * trigger and an identity before any data exists is the friction that kills the first
 * habit. The diagnosis engine asks for them later, at the moment they explain a failure.
 */

export interface NewHabitErrors {
  name?: string;
  floor?: string;
  floorUnit?: string;
  target?: string;
}

export interface NewHabitView {
  /** Title, field labels in screen order, the "· 선택" mark, placeholders, button words. */
  copy: typeof NEW_HABIT_COPY;
  /** The `?` copy per field (§6.8). 측정 방식 has one copy whatever the selection. */
  tooltips: {
    kind: string;
    floor: string;
    target: string;
    cue: string;
    stat: string;
    identity: string;
  };
  kindOptions: { value: HabitKind; label: string }[];
  statOptions: { id: string; label: string; selected: boolean }[];
  name: string;
  setName(next: string): void;
  kind: HabitKind;
  setKind(next: HabitKind): void;
  /** 최소량 and 목표 show for 횟수 · 양 only; 예 · 아니오 hides them (§6.6). */
  showAmounts: boolean;
  floor: string;
  setFloor(next: string): void;
  floorUnit: string;
  setFloorUnit(next: string): void;
  target: string;
  setTarget(next: string): void;
  /** The target shares the floor's unit, so it is shown, never typed. Empty until typed. */
  targetUnit: string;
  cue: string;
  setCue(next: string): void;
  identity: string;
  setIdentity(next: string): void;
  statId: string;
  pickStat(id: string): void;
  /** The icon on the button left of 이름: the picked one, else the stat's (§6.6). */
  icon: string;
  iconOptions: { icon: string; selected: boolean }[];
  /** `null` clears the pick, so the stat's icon shows again. */
  pickIcon(icon: string | null): void;
  /** Per-field messages from the last submit; a field clears its own on change. */
  errors: NewHabitErrors;
  saving: boolean;
  /** A failed save (`SAVE_FAILED_NOTE`) with its retry, or `null`. */
  failure: Failure | null;
  /** Validates and saves. `true` once the habit is stored, so the screen can close. */
  submit(): Promise<boolean>;
}

/** Binary habits have no amount to unit-ise; §3.2 fixes the unit to 'time'. */
const BINARY_UNIT = 'time';

/** §6.6: one stat is picked by default, so the user can move on without picking. */
const DEFAULT_STAT_ID = TUNING.stats[0].id;

const TIPS: NewHabitView['tooltips'] = {
  kind: TOOLTIPS.kind,
  floor: TOOLTIPS.floor,
  target: TOOLTIPS.target,
  cue: TOOLTIPS.cue,
  stat: TOOLTIPS.stat,
  identity: TOOLTIPS.identity,
};

const KIND_OPTIONS: NewHabitView['kindOptions'] = [
  { value: 'count', label: NEW_HABIT_COPY.kinds.count },
  { value: 'binary', label: NEW_HABIT_COPY.kinds.binary },
];

const ERR = NEW_HABIT_COPY.errors;

export function useNewHabit(): NewHabitView {
  const repository = useRepository();
  const { failure, report, clear: clearFailure } = useFailure();

  const [name, setNameValue] = useState('');
  const [kind, setKindValue] = useState<HabitKind>('count');
  const [floor, setFloorValue] = useState('');
  const [floorUnit, setFloorUnitValue] = useState('');
  const [target, setTargetValue] = useState('');
  const [cue, setCue] = useState('');
  const [identity, setIdentity] = useState('');
  const [statId, setStatId] = useState<string>(DEFAULT_STAT_ID);
  const [pickedIcon, setPickedIcon] = useState<string | null>(null);
  const [errors, setErrors] = useState<NewHabitErrors>({});
  const [saving, setSaving] = useState(false);

  /** A corrected field must stop looking wrong before the next submit. */
  function clear(...keys: (keyof NewHabitErrors)[]) {
    setErrors((prev) => (keys.every((key) => prev[key] == null) ? prev : omit(prev, keys)));
  }

  /**
   * Validation returns the habit it would persist, so the invariant check and the
   * payload cannot drift apart. Count-only fields are read only when `kind` is
   * 'count': a value typed before switching to 예 · 아니오 never leaks into a binary
   * habit (§3.2: binary ⇒ floor 1, no target).
   */
  function validate(): { habit: Habit } | { errors: NewHabitErrors } {
    const next: NewHabitErrors = {};
    const trimmedName = name.trim();
    if (trimmedName.length === 0) next.name = ERR.name;

    let floorValue = 1;
    let unitValue = BINARY_UNIT;
    let targetValue: number | undefined;

    if (kind === 'count') {
      floorValue = Number(floor);
      unitValue = floorUnit.trim();
      // §3.2 requires only `floor >= 1`, not an integer: a 1.5km run is a legitimate floor.
      if (!Number.isFinite(floorValue) || floorValue < 1) {
        next.floor = ERR.floor;
      }
      if (unitValue.length === 0) next.floorUnit = ERR.floorUnit;
      if (target.trim().length > 0) {
        const parsed = Number(target);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          next.target = ERR.target;
        } else if (next.floor == null && parsed <= floorValue) {
          // §3.2 (strict): a target at or below the floor makes `over` unreachable.
          next.target = ERR.targetNotAboveFloor;
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
        statId,
        kind,
        floor: floorValue,
        floorUnit: unitValue,
        // Absent optionals stay absent: `LocalRepository` never invents keys, and the
        // diagnosis rules read cue/identity emptiness (§4.4 rule 4).
        ...(targetValue != null ? { target: targetValue } : {}),
        ...(trimmedCue.length > 0 ? { cue: trimmedCue } : {}),
        ...(trimmedIdentity.length > 0 ? { identity: trimmedIdentity } : {}),
        ...(pickedIcon != null ? { icon: pickedIcon } : {}),
        lifecycle: 'forming',
        createdAt: new Date().toISOString(),
      },
    };
  }

  async function submit(): Promise<boolean> {
    if (saving) return false;
    const result = validate();
    if ('errors' in result) {
      setErrors(result.errors);
      return false;
    }
    setErrors({});
    clearFailure();
    setSaving(true);
    try {
      await repository.upsertHabit(result.habit);
      return true;
    } catch {
      report(SAVE_FAILED_NOTE, () => void submit());
      return false;
    } finally {
      setSaving(false);
    }
  }

  return {
    copy: NEW_HABIT_COPY,
    tooltips: TIPS,
    kindOptions: KIND_OPTIONS,
    statOptions: TUNING.stats.map((stat) => ({
      id: stat.id,
      label: `${stat.icon} ${stat.name}`,
      selected: stat.id === statId,
    })),
    name,
    setName(next) {
      setNameValue(next);
      clear('name');
    },
    kind,
    setKind(next) {
      setKindValue(next);
      // The amount fields hide for binary; their errors must not survive a flip back.
      clear('floor', 'floorUnit', 'target');
    },
    showAmounts: kind === 'count',
    floor,
    setFloor(next) {
      setFloorValue(next);
      clear('floor', 'target');
    },
    floorUnit,
    setFloorUnit(next) {
      setFloorUnitValue(next);
      clear('floorUnit');
    },
    target,
    setTarget(next) {
      setTargetValue(next);
      clear('target');
    },
    targetUnit: floorUnit.trim(),
    cue,
    setCue,
    identity,
    setIdentity,
    statId,
    pickStat: setStatId,
    icon: habitIcon({ statId, icon: pickedIcon ?? undefined }),
    iconOptions: NEW_HABIT_ICONS.map((icon) => ({ icon, selected: icon === pickedIcon })),
    pickIcon: setPickedIcon,
    errors,
    saving,
    failure,
    submit,
  };
}

function omit(errors: NewHabitErrors, keys: (keyof NewHabitErrors)[]): NewHabitErrors {
  const next = { ...errors };
  for (const key of keys) delete next[key];
  return next;
}
