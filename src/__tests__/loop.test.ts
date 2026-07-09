/**
 * loop.test.ts — the product's primary bet, proven end-to-end at the data+domain level
 * (SPEC §7.2): create → log → flag → reflect → commit → persist → light re-derives.
 *
 * This exercises the real LocalRepository + domain engine the UI hooks orchestrate (the
 * hooks are thin wrappers; this is the loop-closure proof without a browser).
 */
import { LocalRepository } from '../data/LocalRepository';
import { MemoryKV } from '../data/kv/MemoryKV';
import { diagnose } from '../domain/diagnose';
import { suggestAction } from '../domain/recommend';
import { computeStatLevel, computeXP, levelForXP } from '../domain/score';
import { deriveStatusLight } from '../domain/statusLight';
import { startOfWeek } from '../domain/util';
import { TUNING } from '../config/tuning';
import type { Habit, HabitEntry, ReflectionAction } from '../models';

const TODAY = '2026-06-23'; // a Tuesday; week (Mon-start) is 06-22..06-28

function makeRepo() {
  return new LocalRepository(new MemoryKV());
}

function done(habitId: string, date: string): HabitEntry {
  return { id: `e-${date}`, habitId, date, timestamp: `${date}T08:00:00.000Z`, actual: 1 };
}
function skipCue(habitId: string, date: string): HabitEntry {
  return {
    id: `e-${date}`,
    habitId,
    date,
    timestamp: `${date}T22:00:00.000Z`,
    actual: 0,
    skipReason: 'cue',
  };
}

function snapshot(h: Habit) {
  return { floor: h.floor, floorUnit: h.floorUnit, target: h.target, cue: h.cue, identity: h.identity };
}

function applyAction(h: Habit, action: ReflectionAction, input: { cue?: string; identity?: string }): Habit {
  if (action === 'fill_cue' || action === 'adjust_cue') return { ...h, cue: input.cue ?? h.cue };
  if (action === 'fill_identity') return { ...h, identity: input.identity ?? h.identity };
  return h;
}

/** Mirrors useReflection.commit: writes the design change AND the ReflectionSession. */
async function commitReflection(
  repo: LocalRepository,
  habit: Habit,
  entries: HabitEntry[],
  chosenAction: ReflectionAction,
  input: { cue?: string; identity?: string },
): Promise<Habit> {
  const flags = diagnose(habit, entries, TODAY);
  const suggested = suggestAction(flags, habit);
  const designBefore = snapshot(habit);
  const updated = applyAction(habit, chosenAction, input);
  await repo.upsertHabit(updated);
  await repo.upsertReflectionSession({
    id: `refl-${chosenAction}`,
    habitId: habit.id,
    weekOf: startOfWeek(TODAY, TUNING.weekStartsOn),
    flags,
    suggestedAction: suggested,
    chosenAction,
    designBefore,
    designAfter: snapshot(updated),
    committedAt: `${TODAY}T23:00:00.000Z`,
  });
  return updated;
}

describe('the loop closes (SPEC §7.2)', () => {
  it('create → log skip → flag → reflect(fill_cue, fill_identity) → persist → light clears', async () => {
    const kv = new MemoryKV();
    const repo = new LocalRepository(kv);
    const habitId = 'h-pullups';

    // 1. CREATE — floor 1, no cue/identity (deliberate; CONCEPT §5).
    const habit: Habit = {
      id: habitId,
      name: 'Pull-ups',
      statId: 'strength',
      kind: 'count',
      floor: 1,
      floorUnit: 'reps',
      lifecycle: 'forming',
      createdAt: '2026-06-01T00:00:00.000Z',
    };
    await repo.upsertHabit(habit);

    // 2. LOG — 4 done + 1 skip(cue). Skip is the oldest day so the streak is intact and
    //    floor-rate stays healthy (4/5 = 0.80), isolating the missing-cue signal.
    await repo.upsertEntry(skipCue(habitId, '2026-06-19'));
    for (const d of ['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23']) {
      await repo.upsertEntry(done(habitId, d));
    }

    // 3. FLAG — Rule 4 fires on the missing cue (a recent miss exists); floor-rate is fine
    //    so Rule 1 stays silent. Suggested action is fill_cue; the light is not stable.
    let entries = await repo.getEntries(habitId, '1970-01-01', TODAY);
    let flags = diagnose(habit, entries, TODAY);
    expect(flags.some((f) => f.component === 'cue' && f.severity === 'critical')).toBe(true);
    expect(flags.some((f) => f.component === 'floor')).toBe(false); // 0.80 ≥ 0.60
    expect(suggestAction(flags, habit)).toBe('fill_cue');
    expect(deriveStatusLight(habit, entries, TODAY)).toBe('caution');

    // 4–6. REFLECT + COMMIT fill_cue → design change + ReflectionSession written.
    const afterCue = await commitReflection(repo, habit, entries, 'fill_cue', {
      cue: 'After my morning coffee, at the doorway bar',
    });

    // The cue diagnosis clears; the engine now points at the still-missing identity.
    entries = await repo.getEntries(habitId, '1970-01-01', TODAY);
    flags = diagnose(afterCue, entries, TODAY);
    expect(flags.some((f) => f.component === 'cue')).toBe(false);
    expect(flags.some((f) => f.component === 'identity' && f.severity === 'critical')).toBe(true);
    expect(suggestAction(flags, afterCue)).toBe('fill_identity');

    // Second reflection closes the identity gap too.
    const afterIdentity = await commitReflection(repo, afterCue, entries, 'fill_identity', {
      identity: 'I’m someone who trains daily',
    });

    // 7–8. PERSIST — reload from a FRESH repository over the SAME store (round-trip).
    const reloaded = new LocalRepository(kv);
    const persisted = await reloaded.getHabit(habitId);
    expect(persisted?.cue).toBe('After my morning coffee, at the doorway bar');
    expect(persisted?.identity).toBe('I’m someone who trains daily');

    const sessions = await reloaded.getReflectionSessions(habitId);
    expect(sessions).toHaveLength(2);
    const cueSession = sessions.find((s) => s.chosenAction === 'fill_cue')!;
    expect(cueSession.designBefore.cue).toBeUndefined();
    expect(cueSession.designAfter.cue).toBe('After my morning coffee, at the doorway bar');
    expect(cueSession.committedAt).toBeDefined();
    expect(cueSession.flags.length).toBeGreaterThan(0); // evidence captured for the record

    // 9. LIGHT CLEARS — with both design gaps fixed and floor-rate healthy, no flags fire
    //    and the habit reads stable (🟢). The loop closed: records updated the design.
    const finalEntries = await reloaded.getEntries(habitId, '1970-01-01', TODAY);
    expect(diagnose(persisted!, finalEntries, TODAY)).toEqual([]);
    expect(deriveStatusLight(persisted!, finalEntries, TODAY)).toBe('stable');
    void afterIdentity;
  });

  it('binary habit: streak-milestone XP feeds the stat level and persists', async () => {
    const kv = new MemoryKV();
    const repo = new LocalRepository(kv);
    const habitId = 'h-meditate';
    const habit: Habit = {
      id: habitId,
      name: 'Meditate',
      statId: 'willpower',
      kind: 'binary',
      floor: 1,
      floorUnit: 'time',
      cue: 'after waking',
      identity: 'I am calm',
      lifecycle: 'forming',
      createdAt: '2026-06-01T00:00:00.000Z',
    };
    await repo.upsertHabit(habit);

    // 5 consecutive done days → reaches the 5-day milestone.
    for (const d of ['2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23']) {
      await repo.upsertEntry(done(habitId, d));
    }

    const entries = await repo.getEntries(habitId, '1970-01-01', TODAY);
    const xp = computeXP(entries, habit);
    expect(xp).toBe(5 * TUNING.xpPerFloorCompletion + TUNING.binaryStreakMilestones[5]);
    expect(computeStatLevel(entries, habit)).toBe(levelForXP(xp));

    // A healthy binary habit never shows a stagnation flag, and reads stable.
    expect(diagnose(habit, entries, TODAY).some((f) => f.component === 'load')).toBe(false);
    expect(deriveStatusLight(habit, entries, TODAY)).toBe('stable');

    // Persist round-trip preserves the discriminator.
    const reloaded = new LocalRepository(kv);
    expect((await reloaded.getHabit(habitId))?.kind).toBe('binary');
  });
});
