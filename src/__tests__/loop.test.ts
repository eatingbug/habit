import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ComponentProps, type ReactNode } from 'react';

import { TUNING } from '@/config/tuning';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository } from '@/data';
import { addDays } from '@/domain/dates';
import { levelForXP } from '@/domain/score';
import { useDashboard } from '@/hooks/useDashboard';
import type { Habit } from '@/models';

/**
 * The loop proof — SPEC §7.1's closing paragraph: a binary habit end-to-end, create →
 * 5 done → milestone XP feeds the level → persist → reload.
 *
 * "Create" is the `upsertHabit` the §6.6 form performs (`app/habit/new.tsx`); there are
 * deliberately no component render tests (jest.config.js), so the form itself is out of
 * this seam. Every log after that goes through `useDashboard`'s ✓ path on its own
 * `today`, and the reload is a fresh `LocalRepository` over the same store.
 *
 * Under the current tuning 5 days are 5×60 + 90 = 390 XP, short of level 1 (420): the
 * level is asserted as `levelForXP` of the XP, and a 6th day proves the level moves.
 */

const DAY_1 = '2026-03-01';

const PULL_UPS: Habit = {
  id: 'b1',
  name: '턱걸이',
  statId: 'strength',
  kind: 'binary',
  floor: 1,
  floorUnit: 'time',
  lifecycle: 'forming',
  createdAt: `${DAY_1}T08:00:00.000Z`,
};

function wrapperFor(repository: HabitRepository) {
  return function Wrapper({ children }: { children: ReactNode }) {
    // `children` goes in as the third argument; the cast covers the prop it fills at runtime.
    const props = { repository } as ComponentProps<typeof RepositoryProvider>;
    return createElement(RepositoryProvider, props, children);
  };
}

async function dashboard(repository: HabitRepository, today: string) {
  const { result } = renderHook(() => useDashboard({ today }), {
    wrapper: wrapperFor(repository),
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

async function markDone(repository: HabitRepository, today: string): Promise<void> {
  const result = await dashboard(repository, today);
  act(() => result.current.openRecord(result.current.rows[0].habit.id, today));
  await act(async () => {
    await result.current.recordFromSheet(1);
  });
}

/** The Dashboard's 💪 stat as the stat sheet shows it, and the row's streak label. */
async function strengthOn(repository: HabitRepository, today: string) {
  const result = await dashboard(repository, today);
  act(() => result.current.openStats());
  const sheet = result.current.sheet;
  if (sheet?.kind !== 'stats') throw new Error('no stat sheet');
  const stat = sheet.rows.find((row) => row.id === 'strength');
  if (stat == null) throw new Error('no strength row');
  return { streakLabel: result.current.rows[0].streakLabel, stat };
}

/** "다음 레벨까지 별 N개" for a stat holding `xp`, below the top level. */
function starsLeft(xp: number): string {
  return `다음 레벨까지 별 ${TUNING.statLevelThresholds[levelForXP(xp) + 1] - xp}개`;
}

describe('the loop closes for a binary habit (§7.1)', () => {
  it('turns 5 ✓ days into milestone XP that survives a reload and feeds the level', async () => {
    const kv = new MemoryKV();
    await new LocalRepository(kv).upsertHabit(PULL_UPS);

    for (let day = 0; day < 5; day++) {
      await markDone(new LocalRepository(kv), addDays(DAY_1, day));
    }

    const fifth = addDays(DAY_1, 4);
    const reloaded = await strengthOn(new LocalRepository(kv), fifth);
    const expectedXP = 5 * TUNING.xpPerFloorCompletion + TUNING.binaryStreakMilestones[5];

    expect(reloaded.streakLabel).toBe('🔥 5');
    expect(reloaded.stat.levelLabel).toBe(`레벨 ${levelForXP(expectedXP)}`);
    expect(reloaded.stat.nextLine).toBe(starsLeft(expectedXP));

    await markDone(new LocalRepository(kv), addDays(DAY_1, 5));
    const sixth = await strengthOn(new LocalRepository(kv), addDays(DAY_1, 5));
    const sixthXP = expectedXP + TUNING.xpPerFloorCompletion;

    expect(sixth.stat.levelLabel).toBe(`레벨 ${levelForXP(sixthXP)}`);
    expect(sixth.stat.nextLine).toBe(starsLeft(sixthXP));
    expect(levelForXP(sixthXP)).toBeGreaterThan(levelForXP(expectedXP));
    // The milestone is what carries it: six plain ✓ days alone stay a level lower.
    expect(levelForXP(6 * TUNING.xpPerFloorCompletion)).toBeLessThan(levelForXP(sixthXP));
  });
});
