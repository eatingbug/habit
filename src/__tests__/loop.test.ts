import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

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
    return createElement(RepositoryProvider, { repository, children });
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
  await act(async () => {
    await result.current.logActivity(result.current.rows[0].habit, 1);
  });
}

function strengthCard(view: Awaited<ReturnType<typeof dashboard>>['current']) {
  const card = view.stats.find((entry) => entry.stat.id === 'strength');
  if (card == null) throw new Error('no strength card');
  return card;
}

describe('the loop closes for a binary habit (§7.1)', () => {
  it('turns 5 ✓ days into milestone XP that survives a reload and feeds the level', async () => {
    const kv = new MemoryKV();
    await new LocalRepository(kv).upsertHabit(PULL_UPS);

    for (let day = 0; day < 5; day++) {
      await markDone(new LocalRepository(kv), addDays(DAY_1, day));
    }

    const fifth = addDays(DAY_1, 4);
    const reloaded = (await dashboard(new LocalRepository(kv), fifth)).current;
    const expectedXP = 5 * TUNING.xpPerFloorCompletion + TUNING.binaryStreakMilestones[5];

    expect(reloaded.rows[0].streak).toBe(5);
    expect(strengthCard(reloaded).xp).toBe(expectedXP);
    expect(strengthCard(reloaded).level).toBe(levelForXP(expectedXP));

    await markDone(new LocalRepository(kv), addDays(DAY_1, 5));
    const sixth = (await dashboard(new LocalRepository(kv), addDays(DAY_1, 5))).current;

    expect(strengthCard(sixth).xp).toBe(expectedXP + TUNING.xpPerFloorCompletion);
    expect(strengthCard(sixth).level).toBe(levelForXP(expectedXP + TUNING.xpPerFloorCompletion));
    expect(strengthCard(sixth).level).toBeGreaterThan(strengthCard(reloaded).level);
    // The milestone is what carries it: six plain ✓ days alone stay a level lower.
    expect(levelForXP(6 * TUNING.xpPerFloorCompletion)).toBeLessThan(strengthCard(sixth).level);
  });
});
