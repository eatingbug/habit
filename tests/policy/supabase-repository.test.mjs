/**
 * `SupabaseRepository` 왕복 테스트 — **실제 클래스를, 실제 서버에.**
 *
 * `src/data/SupabaseRepository.ts` 를 `--experimental-strip-types` 로 **그대로**
 * import 한다. 이 파일의 import 가 전부 `import type` 이라 타입만 지우면 alias 해석도
 * 필요 없다. 감싸는 래퍼도, 복제한 매퍼도 없다 — 검증 대상과 실행 대상이 같은 코드다.
 *
 * === 왜 인메모리 mock 이 아닌가 ===
 *
 * jest 의 515개 테스트는 이 클래스를 **한 줄도 실행하지 않는다.** 순수 도메인 함수도
 * 아니고 인메모리 저장소 위의 훅도 아니라 두 seam 중 어디에도 걸리지 않는다. 그리고
 * 이 클래스가 실제로 틀릴 수 있는 지점은 전부 서버와의 경계에 있다 — snake_case 매핑,
 * PostgREST 의 `+00:00`, `not null default '[]'` 인 컬럼, `default auth.uid()`.
 * mock 은 그 넷을 하나도 재현하지 못하면서 green 만 늘린다(#50 본문의 금지).
 *
 * === 이 스위트가 증명하려는 것: 왕복 동등성 ===
 *
 * 12 메서드를 전부 부르되, 값어치는 "쓰고 다시 읽으면 원본 객체와 **같다**" 에 있다.
 * `LocalRepository` 와 어긋나면 #51 이 구현을 갈아끼울 때 조용히 동작이 바뀌기
 * 때문에(한 줄 교체 약속은 ADR-0005 의 `"한 줄 교체" 약속이 깨진다` 절이 이미
 * 거둬들였다), 특히 네 비대칭을 콕 집어 단언한다:
 *   (a) 없는 optional 을 지운 수정이 예전 값을 남기지 않는다 (모든 컬럼 명시 쓰기)
 *   (b) 없는 optional 은 `null` 이 아니라 **키 자체가 없는 채로** 돌아온다
 *   (c) `pauses` 의 `[]` 는 부재로 되돌아온다
 *   (d) timestamptz 는 `+00:00` 이 아니라 `Z` 로 정규화돼 돌아온다
 *
 * === 계정과 뒷정리 ===
 *
 * 계정은 rls.test.mjs 와 같은 A 를 쓴다 (교차 접근 테스트가 아니므로 B 는 필요 없다).
 * **표식은 rls.test.mjs 와 겹치지 않게 따로 둔다** — `node --test` 는 파일을 병렬로
 * 돌리고 두 스위트의 쓸어내기가 서로의 행을 지워 버리면 간헐적으로 빨개진다.
 * 사용자가 곧 이 DB 를 실제로 쓰므로 남은 행은 위생 문제가 아니라 실사용 오염이다.
 */
/*
 * 아래에서 말하는 "착수 전 결정 N" 은 이슈 본문이 아니라 #50 에 달린 티켓 관리자
 * 코멘트의 번호다: https://github.com/eatingbug/habit/issues/50#issuecomment-5664356446
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createClient } from '@supabase/supabase-js';

import { ACCOUNTS, PUBLISHABLE_KEY, SUPABASE_URL } from './env.mjs';
import { SupabaseRepository } from '../../src/data/SupabaseRepository.ts';

/** rls.test.mjs 의 'rls-policy-test' 와 **다른** 이름이어야 한다 (머리말 참조). */
const SENTINEL_NAME = 'repo-roundtrip-test';
/** rls.test.mjs 의 '1970-01-01' 과 **다른** 날이어야 한다. */
const SENTINEL_DATE = '1970-02-01';
const SENTINEL_DATE_NEXT = '1970-02-02';
const SENTINEL_DATE_AFTER = '1970-02-03';
/** 서버 캡을 넘기는 대량 왕복 전용. 위 셋과도, rls.test.mjs 의 표식과도 겹치지 않는다. */
const BULK_DATE = '1970-04-01';

/** 동쪽이 양수 — KST. 주입값이므로 이 스위트는 기기 시간대와 무관하게 결정적이다. */
const OFFSET = 540;

const uuid = () => crypto.randomUUID();

let client;
let repo;
let uid;

/**
 * 이 스위트가 남긴 행을 전부 지운다. 습관을 먼저 지우면 FK 의 `on delete cascade` 가
 * 그 습관의 entries · reflection_sessions 를 데려간다. RLS 가 A 의 시야만 보여 주므로
 * 남의 데이터에는 닿을 수 없다.
 */
async function sweep() {
  await client.from('habits').delete().eq('name', SENTINEL_NAME);
  await client
    .from('habit_entries')
    .delete()
    .in('local_date', [SENTINEL_DATE, SENTINEL_DATE_NEXT, SENTINEL_DATE_AFTER, BULK_DATE]);
  await client
    .from('free_logs')
    .delete()
    .in('local_date', [SENTINEL_DATE, SENTINEL_DATE_NEXT, SENTINEL_DATE_AFTER, BULK_DATE]);
  await client.from('reflection_sessions').delete().eq('week_of', SENTINEL_DATE);
}

/** 최소 습관 — optional 이 **하나도 없다.** (b)(c) 를 보는 쪽. */
function minimalHabit() {
  return {
    id: uuid(),
    name: SENTINEL_NAME,
    statId: 'strength',
    kind: 'count',
    floor: 10,
    floorUnit: 'reps',
    lifecycle: 'forming',
    createdAt: '1970-02-01T12:00:00.000Z',
  };
}

/** 매퍼가 만들 수 있는 모든 컬럼이 채워진 습관. */
function fullHabit(id) {
  return {
    id,
    name: SENTINEL_NAME,
    statId: 'mind',
    kind: 'count',
    floor: 10,
    floorUnit: 'reps',
    target: 30,
    cue: '양치 후',
    identity: '운동하는 사람',
    lifecycle: 'established',
    createdAt: '1970-02-01T12:00:00.000Z',
    pauses: [{ from: '1970-02-05', to: '1970-02-07', resumeTo: 'established' }],
  };
}

before(async () => {
  client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    // Node 에는 localStorage 가 없고, 이 스위트는 세션을 남길 이유도 없다.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword(ACCOUNTS.A);
  assert.equal(error, null, `로그인 실패: ${error?.message} — 계정 확인(confirmed) 여부와 email provider 가 켜져 있는지 볼 것 (rls.test.mjs 머리말).`);
  uid = data.user.id;

  repo = new SupabaseRepository(client, OFFSET);

  // 이전 실행이 중간에 죽어 남긴 행부터 치운다.
  await sweep();
});

after(async () => {
  if (client != null) await sweep();
});

describe('habits — upsertHabit · getHabits · getHabit · deleteHabit', () => {
  it('optional 이 없는 습관은 **없는 채로** 돌아온다 (b) — `null` 키가 생기지 않는다', async () => {
    const habit = minimalHabit();
    await repo.upsertHabit(habit);

    const loaded = await repo.getHabit(habit.id);
    // 통째 비교가 요점이다: 키가 하나라도 더 생기면 여기서 깨진다.
    assert.deepStrictEqual(loaded, habit);
    for (const key of ['target', 'cue', 'identity', 'pauses']) {
      assert.ok(!(key in loaded), `${key} 키가 생겼다 — LocalRepository 는 만들지 않는다`);
    }
  });

  it('pauses 는 `not null default \'[]\'` 이지만 부재로 되돌아온다 (c)', async () => {
    const habit = minimalHabit();
    await repo.upsertHabit(habit);

    // 서버에는 실제로 `[]` 가 저장돼 있다 — 매퍼가 벗기는지 보려면 raw 를 먼저 본다.
    const raw = await client.from('habits').select('pauses').eq('id', habit.id).single();
    assert.deepStrictEqual(raw.data.pauses, [], '전제가 틀렸다 — 컬럼 기본값이 [] 여야 한다');

    assert.ok(!('pauses' in (await repo.getHabit(habit.id))));
  });

  it('모든 optional 이 채워진 습관도 그대로 돌아온다 (pauses 의 jsonb 포함)', async () => {
    const habit = fullHabit(uuid());
    await repo.upsertHabit(habit);
    assert.deepStrictEqual(await repo.getHabit(habit.id), habit);
  });

  it('optional 을 지운 수정은 예전 값을 남기지 않는다 (a) — merge 가 아니라 전체 교체', async () => {
    const id = uuid();
    await repo.upsertHabit(fullHabit(id));

    // 같은 id 로 optional 없는 버전을 덮어쓴다.
    const cleared = { ...minimalHabit(), id };
    await repo.upsertHabit(cleared);

    assert.deepStrictEqual(await repo.getHabit(id), cleared);
  });

  it('createdAt 은 `+00:00` 이 아니라 `Z` 로 돌아온다 (d)', async () => {
    const habit = minimalHabit();
    await repo.upsertHabit(habit);

    const raw = await client.from('habits').select('created_at').eq('id', habit.id).single();
    assert.ok(
      raw.data.created_at.endsWith('+00:00'),
      `전제가 틀렸다 — PostgREST 가 +00:00 을 주지 않는다: ${raw.data.created_at}`,
    );

    assert.equal((await repo.getHabit(habit.id)).createdAt, habit.createdAt);
  });

  it('getHabits 는 내 습관을 전부 준다 (user_id 인자 없이 — RLS 가 한다)', async () => {
    const a = minimalHabit();
    const b = { ...minimalHabit(), createdAt: '1970-02-01T13:00:00.000Z' };
    await repo.upsertHabit(a);
    await repo.upsertHabit(b);

    const ids = (await repo.getHabits()).map((h) => h.id);
    assert.ok(ids.includes(a.id) && ids.includes(b.id));
  });

  it('getHabit 은 없는 id 에 대해 throw 가 아니라 null 이다', async () => {
    assert.equal(await repo.getHabit(uuid()), null);
  });

  it('user_id 를 보내지 않아도 `default auth.uid()` 가 채운다', async () => {
    const habit = minimalHabit();
    await repo.upsertHabit(habit);

    const raw = await client.from('habits').select('user_id').eq('id', habit.id).single();
    assert.equal(raw.data.user_id, uid);
  });

  it('deleteHabit 은 entries · reflection_sessions 까지 cascade 한다', async () => {
    const habit = minimalHabit();
    await repo.upsertHabit(habit);
    await repo.upsertEntry({
      id: uuid(),
      habitId: habit.id,
      date: SENTINEL_DATE,
      timestamp: '1970-02-01T12:00:00.000Z',
      actual: 12,
    });
    await repo.upsertReflectionSession(reflection(habit.id));

    await repo.deleteHabit(habit.id);

    assert.equal(await repo.getHabit(habit.id), null);
    assert.deepStrictEqual(await repo.getEntries(habit.id, SENTINEL_DATE, SENTINEL_DATE_AFTER), []);
    assert.deepStrictEqual(await repo.getReflectionSessions(habit.id), []);
  });
});

describe('habit_entries — upsertEntry · getEntries · deleteEntry', () => {
  let habitId;

  before(async () => {
    const habit = minimalHabit();
    await repo.upsertHabit(habit);
    habitId = habit.id;
  });

  const activity = (over = {}) => ({
    id: uuid(),
    habitId,
    date: SENTINEL_DATE,
    timestamp: '1970-02-01T21:30:00.000Z',
    actual: 12,
    ...over,
  });

  it('활동 행은 skipReason · note 키 없이 그대로 돌아온다 (b)(d)', async () => {
    const entry = activity();
    await repo.upsertEntry(entry);

    const loaded = (await repo.getEntries(habitId, SENTINEL_DATE, SENTINEL_DATE)).find(
      (e) => e.id === entry.id,
    );
    assert.deepStrictEqual(loaded, entry);
    assert.ok(!('skipReason' in loaded) && !('note' in loaded));
  });

  it('건너뛰기 행은 actual 0 과 사유를 함께 가진다 (§3.3 의 row discriminator)', async () => {
    const skip = activity({ actual: 0, skipReason: 'cue', note: '깜빡했다' });
    await repo.upsertEntry(skip);

    const loaded = (await repo.getEntries(habitId, SENTINEL_DATE, SENTINEL_DATE)).find(
      (e) => e.id === skip.id,
    );
    assert.deepStrictEqual(loaded, skip);
  });

  it('note 를 비운 수정은 예전 메모를 남기지 않는다 (a)', async () => {
    const withNote = activity({ note: '원래 메모' });
    await repo.upsertEntry(withNote);

    const { note: _dropped, ...withoutNote } = withNote;
    await repo.upsertEntry(withoutNote);

    const loaded = (await repo.getEntries(habitId, SENTINEL_DATE, SENTINEL_DATE)).find(
      (e) => e.id === withNote.id,
    );
    assert.deepStrictEqual(loaded, withoutNote);
  });

  it('범위는 **양끝 포함**이고, 걸러 내는 것은 timestamp 가 아니라 date 다', async () => {
    const first = activity({ date: SENTINEL_DATE });
    const second = activity({ date: SENTINEL_DATE_NEXT });
    const outside = activity({ date: SENTINEL_DATE_AFTER });
    for (const e of [first, second, outside]) await repo.upsertEntry(e);

    const ids = (await repo.getEntries(habitId, SENTINEL_DATE, SENTINEL_DATE_NEXT)).map((e) => e.id);
    assert.ok(ids.includes(first.id), 'from 쪽 끝이 빠졌다');
    assert.ok(ids.includes(second.id), 'to 쪽 끝이 빠졌다');
    assert.ok(!ids.includes(outside.id));
  });

  it('utc_offset_minutes 는 **주입된 오프셋 그대로** 찍힌다 — 동쪽이 양수', async () => {
    const entry = activity();
    await repo.upsertEntry(entry);

    const raw = await client
      .from('habit_entries')
      .select('utc_offset_minutes, user_id')
      .eq('id', entry.id)
      .single();
    assert.equal(raw.data.utc_offset_minutes, OFFSET);
    assert.equal(raw.data.user_id, uid, 'default auth.uid() 가 채우지 않았다');
  });

  it('deleteEntry 는 id 하나로 그 행만 지운다', async () => {
    const keep = activity();
    const drop = activity();
    await repo.upsertEntry(keep);
    await repo.upsertEntry(drop);

    await repo.deleteEntry(drop.id);

    const ids = (await repo.getEntries(habitId, SENTINEL_DATE, SENTINEL_DATE)).map((e) => e.id);
    assert.ok(ids.includes(keep.id));
    assert.ok(!ids.includes(drop.id));
  });
});

describe('free_logs — upsertFreeLog · getFreeLogs · deleteLog', () => {
  const log = (over = {}) => ({
    id: uuid(),
    date: SENTINEL_DATE,
    timestamp: '1970-02-01T22:00:00.000Z',
    type: 'note',
    text: '오늘의 한 줄',
    ...over,
  });

  it('text ↔ body 이름 바꿈을 건너 그대로 돌아온다 (d 포함)', async () => {
    const entry = log();
    await repo.upsertFreeLog(entry);

    const loaded = (await repo.getFreeLogs(SENTINEL_DATE, SENTINEL_DATE)).find(
      (l) => l.id === entry.id,
    );
    assert.deepStrictEqual(loaded, entry);
  });

  it('범위는 양끝 포함이고, utc_offset_minutes · user_id 가 채워진다', async () => {
    const first = log();
    const outside = log({ date: SENTINEL_DATE_AFTER });
    await repo.upsertFreeLog(first);
    await repo.upsertFreeLog(outside);

    const ids = (await repo.getFreeLogs(SENTINEL_DATE, SENTINEL_DATE_NEXT)).map((l) => l.id);
    assert.ok(ids.includes(first.id));
    assert.ok(!ids.includes(outside.id));

    const raw = await client
      .from('free_logs')
      .select('utc_offset_minutes, user_id')
      .eq('id', first.id)
      .single();
    assert.equal(raw.data.utc_offset_minutes, OFFSET);
    assert.equal(raw.data.user_id, uid);
  });

  it('수정은 같은 id 를 덮어쓴다 (행이 늘지 않는다)', async () => {
    const entry = log({ date: SENTINEL_DATE_NEXT });
    await repo.upsertFreeLog(entry);
    const edited = { ...entry, text: '고쳐 쓴 한 줄' };
    await repo.upsertFreeLog(edited);

    const rows = (await repo.getFreeLogs(SENTINEL_DATE_NEXT, SENTINEL_DATE_NEXT)).filter(
      (l) => l.id === entry.id,
    );
    assert.equal(rows.length, 1);
    assert.deepStrictEqual(rows[0], edited);
  });

  it('deleteLog 는 id 하나로 그 행만 지운다', async () => {
    const entry = log();
    await repo.upsertFreeLog(entry);
    await repo.deleteLog(entry.id);

    const ids = (await repo.getFreeLogs(SENTINEL_DATE, SENTINEL_DATE)).map((l) => l.id);
    assert.ok(!ids.includes(entry.id));
  });
});

function reflection(habitId, over = {}) {
  return {
    id: uuid(),
    habitId,
    weekOf: SENTINEL_DATE,
    flags: [
      { component: 'cue', severity: 'warning', message: '신호가 약하다', evidence: '3/7일 기록' },
    ],
    suggestedAction: 'lower_floor',
    chosenAction: 'lower_floor',
    designBefore: { floor: 10, floorUnit: 'reps' },
    designAfter: { floor: 5, floorUnit: 'reps', cue: '양치 후' },
    ...over,
  };
}

describe('reflection_sessions — upsertReflectionSession · getReflectionSessions', () => {
  let habitId;

  before(async () => {
    const habit = minimalHabit();
    await repo.upsertHabit(habit);
    habitId = habit.id;
  });

  it('commit 전 세션은 committedAt **키 없이** 돌아온다 (b)', async () => {
    const session = reflection(habitId);
    await repo.upsertReflectionSession(session);

    const loaded = (await repo.getReflectionSessions(habitId)).find((s) => s.id === session.id);
    assert.deepStrictEqual(loaded, session);
    assert.ok(!('committedAt' in loaded), 'committedAt: null 이 생겼다');
  });

  it('commit 하면 committedAt 이 `Z` 로 돌아온다 (d)', async () => {
    const session = reflection(habitId);
    await repo.upsertReflectionSession(session);

    const committed = { ...session, committedAt: '1970-02-02T09:00:00.000Z' };
    await repo.upsertReflectionSession(committed);

    const loaded = (await repo.getReflectionSessions(habitId)).find((s) => s.id === session.id);
    assert.deepStrictEqual(loaded, committed);
  });

  it('user_id 를 보내지 않아도 `default auth.uid()` 가 채운다', async () => {
    const session = reflection(habitId);
    await repo.upsertReflectionSession(session);

    const raw = await client
      .from('reflection_sessions')
      .select('user_id')
      .eq('id', session.id)
      .single();
    assert.equal(raw.data.user_id, uid);
  });

  it('getReflectionSessions 는 그 습관 것만 준다', async () => {
    const other = minimalHabit();
    await repo.upsertHabit(other);
    const mine = reflection(habitId);
    const theirs = reflection(other.id);
    await repo.upsertReflectionSession(mine);
    await repo.upsertReflectionSession(theirs);

    const ids = (await repo.getReflectionSessions(habitId)).map((s) => s.id);
    assert.ok(ids.includes(mine.id));
    assert.ok(!ids.includes(theirs.id));
  });
});


/**
 * 서버 캡을 넘는 왕복 — 이 스위트에서 가장 비싼 테스트이고, 가장 비싼 버그를 막는다.
 *
 * PostgREST 의 `db-max-rows` 는 요청한 만큼이 아니라 **캡만큼만** 돌려주고, 나머지에
 * 대해서는 아무 말도 하지 않는다. `.limit()` 으로도 못 넘는다 (직접 확인했다:
 * `limit=5000` 을 붙여도 1000 행만 온다). `LocalRepository` 는 전부 돌려주므로,
 * 페이지네이션이 없으면 행이 캡을 넘긴 사용자는 #51 이후 조용히 기록을 잃고 그 위에서
 * 계산되는 연속·비율·히트맵이 전부 틀린다. 에러도 경고도 없다. 습관 몇 개를 1년만 써도
 * 넘는 수다.
 *
 * **이 테스트는 스스로가 헛돌지 않는지도 확인한다.** 캡은 코드 상수가 아니라 프로젝트
 * 설정이라 나중에 올라갈 수 있는데, 그러면 "전부 돌아왔다"는 단언은 통과하면서 아무것도
 * 증명하지 않게 된다. 그래서 페이지네이션 없는 raw 읽기가 **실제로 잘렸는지**를 먼저
 * 단언한다 — 그게 거짓이면 이 테스트가 빨개져서 TOTAL 을 올리라고 말한다.
 */
describe('free_logs — 서버 캡을 넘는 왕복 (페이지네이션)', () => {
  /** 관측된 캡(1000)보다 넉넉히 크되, 몇 초 안에 끝나는 수. */
  const TOTAL = 1100;
  /** 마지막 행은 **id 로 콕 집어** 확인한다 — 개수만 보면 중복으로도 통과한다. */
  const lastId = uuid();

  before(async () => {
    // 저장소를 통해 쓴다: 매퍼까지 포함한 실제 경로여야 한다. 1100번의 왕복이라
    // 동시성을 준다 — 직렬이면 분 단위, 이러면 초 단위다.
    const logs = [];
    for (let i = 0; i < TOTAL; i += 1) {
      logs.push({
        id: i === TOTAL - 1 ? lastId : uuid(),
        date: BULK_DATE,
        // 스탬프를 일부러 흩는다. 전부 같은 초면 (logged_at, id) 정렬의 타이브레이크만
        // 일하게 되는데, 페이지 경계에서 검증하고 싶은 것은 양쪽 다이다.
        timestamp: new Date(Date.UTC(1970, 3, 1, 0, Math.floor(i / 60), i % 60)).toISOString(),
        type: 'note',
        text: i === TOTAL - 1 ? '캡 너머 마지막 행' : `대량 ${i}`,
      });
    }

    const CONCURRENCY = 40;
    for (let i = 0; i < logs.length; i += CONCURRENCY) {
      await Promise.all(logs.slice(i, i + CONCURRENCY).map((log) => repo.upsertFreeLog(log)));
    }
  });

  it('페이지네이션 없는 raw 읽기는 **실제로 잘린다** (전제 확인 — 아니면 아래가 헛돈다)', async () => {
    const raw = await client.from('free_logs').select('id').eq('local_date', BULK_DATE);
    assert.equal(raw.error, null);
    assert.ok(
      raw.data.length < TOTAL,
      `서버 캡이 ${TOTAL} 이상으로 올라갔다 (raw 로 ${raw.data.length} 행). ` +
        `캡을 넘지 못하면 아래 단언은 아무것도 증명하지 않는다 — TOTAL 을 올릴 것.`,
    );
  });

  it('getFreeLogs 는 캡과 무관하게 **전부** 돌려준다 (개수 · 중복 없음 · 마지막 행)', async () => {
    const loaded = await repo.getFreeLogs(BULK_DATE, BULK_DATE);

    assert.equal(loaded.length, TOTAL, '행이 잘렸다 — 페이지네이션이 동작하지 않는다');
    // 페이지 경계에서 같은 행이 두 번 오면 개수만으로는 통과할 수 있다.
    assert.equal(new Set(loaded.map((l) => l.id)).size, TOTAL, '중복된 행이 있다');

    const last = loaded.find((l) => l.id === lastId);
    assert.ok(last != null, '마지막 행이 오지 않았다 — 캡 너머가 통째로 잘렸다');
    assert.equal(last.text, '캡 너머 마지막 행');
  });
});

describe('실패는 던진다 (착수 전 결정 7 — #50 의 티켓 관리자 코멘트)', () => {
  it('서버가 거부하면 조용한 void 가 아니라 throw 다', async () => {
    // 존재하지 않는 habit_id — FK 위반. 매퍼는 통과하고 서버가 거부한다.
    await assert.rejects(
      repo.upsertEntry({
        id: uuid(),
        habitId: uuid(),
        date: SENTINEL_DATE,
        timestamp: '1970-02-01T12:00:00.000Z',
        actual: 1,
      }),
      /SupabaseRepository\.upsertEntry/,
    );
  });
});
