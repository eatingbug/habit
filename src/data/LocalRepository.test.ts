import { MemoryKV } from "./kv/MemoryKV";
import { LocalRepository } from "./LocalRepository";
import type {
  Habit,
  HabitEntry,
  FreeLog,
  ReflectionSession,
} from "../models";

function makeHabit(over: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Pushups",
    statId: "strength",
    kind: "count",
    floor: 1,
    floorUnit: "reps",
    lifecycle: "forming",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function makeEntry(over: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: "e1",
    habitId: "h1",
    date: "2026-06-10",
    timestamp: "2026-06-10T08:00:00.000Z",
    actual: 5,
    state: "done",
    ...over,
  };
}

function makeLog(over: Partial<FreeLog> = {}): FreeLog {
  return {
    id: "l1",
    timestamp: "2026-06-10T08:00:00.000Z",
    type: "note",
    text: "hello",
    ...over,
  };
}

let kv: MemoryKV;
let repo: LocalRepository;

beforeEach(() => {
  kv = new MemoryKV();
  repo = new LocalRepository(kv);
});

describe("habits", () => {
  test("upsert -> getHabit / getHabits", async () => {
    const h = makeHabit();
    await repo.upsertHabit(h);
    expect(await repo.getHabit("h1")).toEqual(h);
    expect(await repo.getHabits()).toEqual([h]);
    expect(await repo.getHabit("nope")).toBeNull();
  });

  test("kind:'binary' round-trips losslessly", async () => {
    const h = makeHabit({ kind: "binary", floor: 1, floorUnit: "time" });
    await repo.upsertHabit(h);
    expect(await repo.getHabit("h1")).toEqual(h);
  });

  test("a habit persisted without `kind` reads back as 'count' (forward-compat)", async () => {
    const legacy = {
      id: "old",
      name: "Legacy",
      statId: "strength",
      floor: 1,
      floorUnit: "reps",
      lifecycle: "forming",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    await kv.setItem("habiquest:habits", JSON.stringify([legacy]));
    expect((await repo.getHabit("old"))?.kind).toBe("count");
  });

  test("update-in-place replaces by id, no dup", async () => {
    await repo.upsertHabit(makeHabit());
    await repo.upsertHabit(makeHabit({ name: "Squats" }));
    const habits = await repo.getHabits();
    expect(habits).toHaveLength(1);
    expect(habits[0].name).toBe("Squats");
  });

  test("deleteHabit clears that habit's entries + reflections keys", async () => {
    await repo.upsertHabit(makeHabit());
    await repo.upsertEntry(makeEntry());
    await repo.upsertReflectionSession(makeReflection());

    await repo.deleteHabit("h1");

    expect(await repo.getHabits()).toEqual([]);
    expect(await repo.getEntries("h1", "2000-01-01", "2100-01-01")).toEqual([]);
    expect(await kv.getItem("habiquest:reflections:h1")).toBeNull();
  });
});

describe("entries", () => {
  test("upsert across two habits stays separate", async () => {
    await repo.upsertEntry(makeEntry({ id: "a", habitId: "h1" }));
    await repo.upsertEntry(makeEntry({ id: "b", habitId: "h2" }));
    const h1 = await repo.getEntries("h1", "2000-01-01", "2100-01-01");
    const h2 = await repo.getEntries("h2", "2000-01-01", "2100-01-01");
    expect(h1.map((e) => e.id)).toEqual(["a"]);
    expect(h2.map((e) => e.id)).toEqual(["b"]);
  });

  test("getEntries date-range inclusive filtering + ordering", async () => {
    await repo.upsertEntry(makeEntry({ id: "before", date: "2026-06-09" }));
    await repo.upsertEntry(makeEntry({ id: "lo", date: "2026-06-10" }));
    await repo.upsertEntry(makeEntry({ id: "mid", date: "2026-06-12" }));
    await repo.upsertEntry(makeEntry({ id: "hi", date: "2026-06-15" }));
    await repo.upsertEntry(makeEntry({ id: "after", date: "2026-06-16" }));

    const got = await repo.getEntries("h1", "2026-06-10", "2026-06-15");
    expect(got.map((e) => e.id)).toEqual(["lo", "mid", "hi"]);
  });

  test("ordering by date then timestamp", async () => {
    await repo.upsertEntry(
      makeEntry({ id: "later", date: "2026-06-10", timestamp: "2026-06-10T12:00:00.000Z" })
    );
    await repo.upsertEntry(
      makeEntry({ id: "earlier", date: "2026-06-10", timestamp: "2026-06-10T06:00:00.000Z" })
    );
    const got = await repo.getEntries("h1", "2026-06-10", "2026-06-10");
    expect(got.map((e) => e.id)).toEqual(["earlier", "later"]);
  });

  test("update-in-place by id", async () => {
    await repo.upsertEntry(makeEntry({ id: "e1", actual: 5 }));
    await repo.upsertEntry(makeEntry({ id: "e1", actual: 9 }));
    const got = await repo.getEntries("h1", "2000-01-01", "2100-01-01");
    expect(got).toHaveLength(1);
    expect(got[0].actual).toBe(9);
  });

  test("deleteEntry prefix scan removes right one, leaves others", async () => {
    await repo.upsertEntry(makeEntry({ id: "keep1", habitId: "h1" }));
    await repo.upsertEntry(makeEntry({ id: "target", habitId: "h2" }));
    await repo.upsertEntry(makeEntry({ id: "keep2", habitId: "h2" }));

    await repo.deleteEntry("target");

    const h1 = await repo.getEntries("h1", "2000-01-01", "2100-01-01");
    const h2 = await repo.getEntries("h2", "2000-01-01", "2100-01-01");
    expect(h1.map((e) => e.id)).toEqual(["keep1"]);
    expect(h2.map((e) => e.id)).toEqual(["keep2"]);
  });
});

describe("freelogs", () => {
  test("upsert + getFreeLogs filters by timestamp date inclusive", async () => {
    await repo.upsertFreeLog(makeLog({ id: "before", timestamp: "2026-06-09T23:00:00.000Z" }));
    await repo.upsertFreeLog(makeLog({ id: "lo", timestamp: "2026-06-10T00:00:00.000Z" }));
    await repo.upsertFreeLog(makeLog({ id: "hi", timestamp: "2026-06-15T23:59:00.000Z" }));
    await repo.upsertFreeLog(makeLog({ id: "after", timestamp: "2026-06-16T00:00:00.000Z" }));

    const got = await repo.getFreeLogs("2026-06-10", "2026-06-15");
    expect(got.map((l) => l.id)).toEqual(["lo", "hi"]);
  });

  test("update-in-place by id (edit preserves id, overwrites fields)", async () => {
    await repo.upsertFreeLog(makeLog({ id: "l1", type: "note", text: "hello" }));
    await repo.upsertFreeLog(makeLog({ id: "l1", type: "win", text: "edited" }));
    const got = await repo.getFreeLogs("2000-01-01", "2100-01-01");
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ id: "l1", type: "win", text: "edited" });
  });

  test("deleteLog removes by id", async () => {
    await repo.upsertFreeLog(makeLog({ id: "a" }));
    await repo.upsertFreeLog(makeLog({ id: "b" }));
    await repo.deleteLog("a");
    const got = await repo.getFreeLogs("2000-01-01", "2100-01-01");
    expect(got.map((l) => l.id)).toEqual(["b"]);
  });
});

function makeReflection(over: Partial<ReflectionSession> = {}): ReflectionSession {
  return {
    id: "r1",
    habitId: "h1",
    weekOf: "2026-06-08",
    flags: [
      {
        component: "floor",
        severity: "warning",
        message: "Floor too high",
        evidence: "3 skips in 7 days",
      },
    ],
    suggestedAction: "lower_floor",
    chosenAction: "lower_floor",
    designBefore: {
      floor: 10,
      floorUnit: "reps",
      target: 20,
      cue: "after coffee",
      identity: "athlete",
    },
    designAfter: {
      floor: 5,
      floorUnit: "reps",
      target: 20,
      cue: "after coffee",
      identity: "athlete",
    },
    committedAt: "2026-06-15T09:00:00.000Z",
    ...over,
  };
}

describe("reflection sessions", () => {
  test("round-trip is lossless", async () => {
    const session = makeReflection();
    await repo.upsertReflectionSession(session);
    const got = await repo.getReflectionSessions("h1");
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual(session);
  });
});

describe("parseCollection robustness", () => {
  test("invalid JSON yields []", async () => {
    await kv.setItem("habiquest:habits", "{bad");
    expect(await repo.getHabits()).toEqual([]);
  });
});
