import type { FreeLog, Habit, HabitEntry, ReflectionSession } from '@/models';

import { MemoryKV } from './KVStore';
import { LocalRepository } from './LocalRepository';
import { SupabaseRepository } from './SupabaseRepository';

/**
 * Repository behaviour, exercised through `LocalRepository` + `MemoryKV` — no device,
 * no storage driver (SPEC §5.2, and the KV seam the architecture test enforces).
 *
 * Row order is deliberately not asserted: the domain sorts a day's rows itself
 * (`sortDayRows`, §7.3), so persisted order is not part of the contract.
 */

function makeRepo() {
  return new LocalRepository(new MemoryKV());
}

const habit: Habit = {
  id: 'h1',
  name: '푸시업',
  statId: 'strength',
  kind: 'count',
  floor: 10,
  floorUnit: 'reps',
  lifecycle: 'forming',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function entry(over: Partial<HabitEntry> & Pick<HabitEntry, 'id' | 'date'>): HabitEntry {
  return {
    habitId: 'h1',
    timestamp: `${over.date}T09:00:00.000Z`,
    actual: 10,
    ...over,
  };
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1);

describe('LocalRepository — a fresh store', () => {
  it('reads as empty rather than throwing', async () => {
    const repo = makeRepo();
    expect(await repo.getHabits()).toEqual([]);
    expect(await repo.getHabit('nope')).toBeNull();
    expect(await repo.getEntries('h1', '2026-01-01', '2026-12-31')).toEqual([]);
    expect(await repo.getFreeLogs('2026-01-01', '2026-12-31')).toEqual([]);
    expect(await repo.getReflectionSessions('h1')).toEqual([]);
  });

  it('deletes of absent rows are no-ops', async () => {
    const repo = makeRepo();
    await expect(repo.deleteHabit('nope')).resolves.toBeUndefined();
    await expect(repo.deleteEntry('nope')).resolves.toBeUndefined();
    await expect(repo.deleteLog('nope')).resolves.toBeUndefined();
  });
});

describe('LocalRepository — habits', () => {
  it('round-trips a habit through getHabits and getHabit', async () => {
    const repo = makeRepo();
    await repo.upsertHabit(habit);

    expect(await repo.getHabits()).toEqual([habit]);
    expect(await repo.getHabit('h1')).toEqual(habit);
  });

  it('round-trips every optional field losslessly and keeps absent optionals absent', async () => {
    const repo = makeRepo();
    const full: Habit = {
      ...habit,
      id: 'h2',
      target: 30,
      cue: '아침 양치 후',
      identity: '나는 매일 몸을 쓰는 사람',
      lifecycle: 'paused',
      pauses: [{ from: '2026-02-01', to: '2026-02-05' }, { from: '2026-03-01' }],
    };
    await repo.upsertHabit(full);
    await repo.upsertHabit(habit);

    const loadedFull = await repo.getHabit('h2');
    expect(loadedFull).toEqual(full);
    expect(loadedFull!.pauses![1]).not.toHaveProperty('to');

    const loadedBare = (await repo.getHabit('h1'))!;
    for (const key of ['target', 'cue', 'identity', 'pauses'] as const) {
      expect(loadedBare).not.toHaveProperty(key);
    }
  });

  it('upsertHabit with an existing id updates in place instead of duplicating', async () => {
    const repo = makeRepo();
    await repo.upsertHabit(habit);
    await repo.upsertHabit({ ...habit, name: '푸시업 20', floor: 20 });

    const habits = await repo.getHabits();
    expect(habits).toHaveLength(1);
    expect(habits[0]).toMatchObject({ id: 'h1', name: '푸시업 20', floor: 20 });
  });

  it('backfills a missing `kind` to count on read (SPEC §5.2 forward-compat)', async () => {
    const kv = new MemoryKV();
    const { kind: _kind, ...legacy } = habit;
    await kv.set('habiquest:habits', JSON.stringify([legacy]));
    const repo = new LocalRepository(kv);

    expect((await repo.getHabits())[0].kind).toBe('count');
    expect((await repo.getHabit('h1'))!.kind).toBe('count');
  });

  it('deleteHabit removes the habit and cascades to its entries and sessions', async () => {
    const repo = makeRepo();
    await repo.upsertHabit(habit);
    await repo.upsertHabit({ ...habit, id: 'h2' });
    await repo.upsertEntry(entry({ id: 'e1', date: '2026-01-02' }));
    await repo.upsertEntry(entry({ id: 'e2', date: '2026-01-02', habitId: 'h2' }));
    await repo.upsertReflectionSession(session);

    await repo.deleteHabit('h1');

    expect(await repo.getHabits()).toHaveLength(1);
    expect(await repo.getHabit('h1')).toBeNull();
    expect(await repo.getEntries('h1', '2026-01-01', '2026-12-31')).toEqual([]);
    expect(await repo.getReflectionSessions('h1')).toEqual([]);
    expect(await repo.getEntries('h2', '2026-01-01', '2026-12-31')).toHaveLength(1);
  });
});

describe('LocalRepository — entries', () => {
  it('round-trips optional fields; an absent optional stays absent', async () => {
    const repo = makeRepo();
    const skip = entry({
      id: 'e1',
      date: '2026-01-02',
      actual: 0,
      skipReason: 'exception',
      note: '출장',
    });
    const bare = entry({ id: 'e2', date: '2026-01-02' });
    await repo.upsertEntry(skip);
    await repo.upsertEntry(bare);

    const rows = (await repo.getEntries('h1', '2026-01-02', '2026-01-02')).sort(byId);
    expect(rows).toEqual([skip, bare]);
    expect(rows[1]).not.toHaveProperty('skipReason');
    expect(rows[1]).not.toHaveProperty('note');
  });

  it('keeps every row of the same (habitId, date) — the multi-entry model', async () => {
    const repo = makeRepo();
    await repo.upsertEntry(entry({ id: 'e1', date: '2026-01-02', actual: 4 }));
    await repo.upsertEntry(entry({ id: 'e2', date: '2026-01-02', actual: 6 }));
    await repo.upsertEntry(entry({ id: 'e3', date: '2026-01-02', actual: 1 }));

    const rows = await repo.getEntries('h1', '2026-01-02', '2026-01-02');
    expect(rows.map((r) => r.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('upsertEntry with an existing id updates that row in place', async () => {
    const repo = makeRepo();
    await repo.upsertEntry(entry({ id: 'e1', date: '2026-01-02', actual: 4 }));
    await repo.upsertEntry(entry({ id: 'e2', date: '2026-01-02', actual: 6 }));
    await repo.upsertEntry(entry({ id: 'e1', date: '2026-01-02', actual: 12, note: '정정' }));

    const rows = (await repo.getEntries('h1', '2026-01-02', '2026-01-02')).sort(byId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'e1', actual: 12, note: '정정' });
    expect(rows[1]).toMatchObject({ id: 'e2', actual: 6 });
  });

  it('deleteEntry removes exactly one row and leaves the day intact', async () => {
    const repo = makeRepo();
    await repo.upsertHabit(habit);
    await repo.upsertEntry(entry({ id: 'e1', date: '2026-01-02', actual: 4 }));
    await repo.upsertEntry(entry({ id: 'e2', date: '2026-01-02', actual: 6 }));

    await repo.deleteEntry('e1');

    const rows = await repo.getEntries('h1', '2026-01-02', '2026-01-02');
    expect(rows.map((r) => r.id)).toEqual(['e2']);
  });

  it('deleteEntry is a no-op when no habit in the list owns the row', async () => {
    // The bucket is found through the habit list, so an unowned row is unreachable.
    const repo = makeRepo();
    await repo.upsertEntry(entry({ id: 'e1', date: '2026-01-02' }));

    await repo.deleteEntry('e1');

    expect(await repo.getEntries('h1', '2026-01-02', '2026-01-02')).toHaveLength(1);
  });

  it('getEntries filters by `date` inclusively at both ends', async () => {
    const repo = makeRepo();
    for (const date of ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']) {
      await repo.upsertEntry(entry({ id: `e-${date}`, date }));
    }

    const rows = await repo.getEntries('h1', '2026-01-02', '2026-01-03');
    expect(rows.map((r) => r.date).sort()).toEqual(['2026-01-02', '2026-01-03']);
  });

  it('getEntries filters by `date`, not `timestamp`', async () => {
    const repo = makeRepo();
    // Declared day 2026-01-02, logged after midnight UTC on the 3rd (§3.3: `date` wins).
    await repo.upsertEntry({
      id: 'e1',
      habitId: 'h1',
      date: '2026-01-02',
      timestamp: '2026-01-03T01:00:00.000Z',
      actual: 10,
    });

    expect(await repo.getEntries('h1', '2026-01-02', '2026-01-02')).toHaveLength(1);
    expect(await repo.getEntries('h1', '2026-01-03', '2026-01-03')).toEqual([]);
  });

  it("getEntries ignores other habits' rows", async () => {
    const repo = makeRepo();
    await repo.upsertEntry(entry({ id: 'e1', date: '2026-01-02' }));
    await repo.upsertEntry(entry({ id: 'e2', date: '2026-01-02', habitId: 'h2' }));

    const rows = await repo.getEntries('h1', '2026-01-01', '2026-12-31');
    expect(rows.map((r) => r.id)).toEqual(['e1']);
  });
});

describe('LocalRepository — free logs', () => {
  const log: FreeLog = {
    id: 'l1',
    date: '2026-01-02',
    timestamp: '2026-01-02T21:00:00.000Z',
    type: 'win',
    text: '오늘은 쉬웠다',
  };

  it('round-trips and filters inclusively by date', async () => {
    const repo = makeRepo();
    await repo.upsertFreeLog(log);
    await repo.upsertFreeLog({ ...log, id: 'l2', date: '2026-01-05', type: 'mood' });

    expect(await repo.getFreeLogs('2026-01-02', '2026-01-02')).toEqual([log]);
    expect((await repo.getFreeLogs('2026-01-02', '2026-01-05')).map((l) => l.id).sort()).toEqual([
      'l1',
      'l2',
    ]);
    expect(await repo.getFreeLogs('2026-01-03', '2026-01-04')).toEqual([]);
  });

  it('upsertFreeLog with an existing id updates in place', async () => {
    const repo = makeRepo();
    await repo.upsertFreeLog(log);
    await repo.upsertFreeLog({ ...log, text: '고쳐 씀' });

    const logs = await repo.getFreeLogs('2026-01-01', '2026-12-31');
    expect(logs).toHaveLength(1);
    expect(logs[0].text).toBe('고쳐 씀');
  });

  it('deleteLog removes exactly one row', async () => {
    const repo = makeRepo();
    await repo.upsertFreeLog(log);
    await repo.upsertFreeLog({ ...log, id: 'l2' });

    await repo.deleteLog('l1');

    expect((await repo.getFreeLogs('2026-01-01', '2026-12-31')).map((l) => l.id)).toEqual(['l2']);
  });
});

const session: ReflectionSession = {
  id: 's1',
  habitId: 'h1',
  weekOf: '2026-01-05',
  flags: [
    { component: 'cue', severity: 'warning', message: '신호가 약합니다', evidence: '7일 중 3일' },
  ],
  suggestedAction: 'adjust_cue',
  chosenAction: 'keep',
  designBefore: { floor: 10, floorUnit: 'reps' },
  designAfter: { floor: 10, floorUnit: 'reps' },
};

describe('LocalRepository — reflection sessions', () => {
  it('round-trips, keeps `committedAt` absent until committed, and scopes by habit', async () => {
    const repo = makeRepo();
    await repo.upsertReflectionSession(session);
    await repo.upsertReflectionSession({ ...session, id: 's2', habitId: 'h2' });

    const loaded = await repo.getReflectionSessions('h1');
    expect(loaded).toEqual([session]);
    expect(loaded[0]).not.toHaveProperty('committedAt');
    expect(await repo.getReflectionSessions('h2')).toHaveLength(1);
  });

  it('round-trips a committed session with full design snapshots', async () => {
    const repo = makeRepo();
    const committed: ReflectionSession = {
      ...session,
      chosenAction: 'lower_floor',
      designBefore: { floor: 10, floorUnit: 'reps', target: 30, cue: '양치 후', identity: '운동하는 사람' },
      designAfter: { floor: 5, floorUnit: 'reps', target: 30, cue: '양치 후', identity: '운동하는 사람' },
      committedAt: '2026-01-11T10:00:00.000Z',
    };
    await repo.upsertReflectionSession(committed);

    expect(await repo.getReflectionSessions('h1')).toEqual([committed]);
  });

  it('upsertReflectionSession with an existing id updates in place', async () => {
    const repo = makeRepo();
    await repo.upsertReflectionSession(session);
    await repo.upsertReflectionSession({ ...session, chosenAction: 'pause' });

    const loaded = await repo.getReflectionSessions('h1');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].chosenAction).toBe('pause');
  });
});

describe('SupabaseRepository', () => {
  const repo = new SupabaseRepository();
  const calls: Array<[string, () => unknown]> = [
    ['getHabits', () => repo.getHabits()],
    ['getHabit', () => repo.getHabit('h1')],
    ['upsertHabit', () => repo.upsertHabit(habit)],
    ['deleteHabit', () => repo.deleteHabit('h1')],
    ['getEntries', () => repo.getEntries('h1', '2026-01-01', '2026-01-02')],
    ['upsertEntry', () => repo.upsertEntry(entry({ id: 'e1', date: '2026-01-02' }))],
    ['deleteEntry', () => repo.deleteEntry('e1')],
    ['getFreeLogs', () => repo.getFreeLogs('2026-01-01', '2026-01-02')],
    [
      'upsertFreeLog',
      () =>
        repo.upsertFreeLog({
          id: 'l1',
          date: '2026-01-02',
          timestamp: '2026-01-02T00:00:00.000Z',
          type: 'note',
          text: 'x',
        }),
    ],
    ['deleteLog', () => repo.deleteLog('l1')],
    ['getReflectionSessions', () => repo.getReflectionSessions('h1')],
    ['upsertReflectionSession', () => repo.upsertReflectionSession(session)],
  ];

  it.each(calls)('%s throws until configured', (_name, call) => {
    expect(call).toThrow('SupabaseRepository not yet configured');
  });
});

describe('MemoryKV', () => {
  it('stores strings, overwrites, and removes', async () => {
    const kv = new MemoryKV();
    expect(await kv.get('k')).toBeNull();
    await kv.set('k', 'a');
    await kv.set('k', 'b');
    expect(await kv.get('k')).toBe('b');
    await kv.remove('k');
    expect(await kv.get('k')).toBeNull();
  });
});
