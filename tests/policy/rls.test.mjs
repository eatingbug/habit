/**
 * RLS 정책 테스트 — **실제 Supabase 에 붙는다.**
 *
 * 왜 `npm test` 가 아니라 `npm run test:policy` 인가: 네트워크가 필요하다. jest 의
 * `testMatch` 는 `<rootDir>/src/**` 라 이 파일은 애초에 잡히지도 않는다.
 *
 * 이 스위트가 없으면 검증되지 않는 것: `HabitRepository` 12 메서드에는 사용자 인자가
 * 없고 앞으로도 없다(#47). `getHabits()` 가 "내 습관"이 되는 유일한 이유는 SQL 안의
 * 정책이다. TypeScript 에는 그것을 틀리게 만들 자리도, 잡아낼 자리도 없다.
 *
 * === 이 파일이 조심하는 두 가지 거짓 green ===
 *
 * 1. **RLS 는 테이블 소유자에게 적용되지 않는다.** 그래서 여기서는 오직 사용자
 *    access token(= authenticated 역할)으로만 붙는다. 비밀 키는 사용자 생성·삭제에만
 *    쓰고 데이터 경로에는 절대 쓰지 않는다.
 * 2. **교차 UPDATE·DELETE 는 에러를 내지 않는다 — 0 행에 적용될 뿐이다.** SELECT 도
 *    빈 배열이지 에러가 아니다. 에러가 나는 것은 남의 user_id 로 INSERT 할 때뿐이다.
 *    그래서 "0 행"을 확인하고, **거기서 멈추지 않고 B 로 다시 읽어** 행이 그대로
 *    남아 있고 바뀌지도 않았음을 확인한다. A 쪽에서 보면 "막힌 삭제"와 "조용히 된
 *    삭제"가 똑같이 생겼다.
 *
 * 또 하나: 막는 것만 확인하면 **전부 거부하는 정책도 통과한다.** 그래서 네 테이블
 *  모두에서 A 가 자기 행에 대해 읽기·쓰기·수정·삭제를 할 수 있다는 쪽도 함께 본다.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createUser, deleteUser, rest, sweepOrphans } from './client.mjs';

const DAY = '2026-09-14';
const AT = '2026-09-14T12:00:00.000Z';
/** 동쪽이 양수 — KST. getTimezoneOffset() 의 반대 부호다 (마이그레이션 컬럼 주석 참조). */
const KST = 540;

let A;
let B;
/** 각 사용자가 소유한 앵커 습관 — entries·reflection_sessions 의 FK 대상. */
let anchorA;
let anchorB;

const uuid = () => crypto.randomUUID();

function habitRow(userId) {
  return {
    id: uuid(),
    user_id: userId,
    name: '앵커 습관',
    stat_id: 'strength',
    kind: 'count',
    floor: 10,
    floor_unit: 'reps',
    lifecycle: 'forming',
    created_at: AT,
    pauses: [],
  };
}

/**
 * 테이블마다: 행을 만드는 법, 무엇을 고쳐 보는지, 그 값을 어떻게 읽는지.
 * `anchorFor` 가 있는 테이블은 습관 FK 를 쓴다.
 */
const TABLES = [
  {
    table: 'habits',
    row: (userId) => habitRow(userId),
    patch: { name: '바뀐 이름' },
    read: (r) => r.name,
    original: '앵커 습관',
  },
  {
    table: 'habit_entries',
    row: (userId, habitId) => ({
      id: uuid(),
      user_id: userId,
      habit_id: habitId,
      local_date: DAY,
      logged_at: AT,
      actual: 12,
      utc_offset_minutes: KST,
    }),
    patch: { note: '바뀐 메모' },
    read: (r) => r.note,
    original: null,
  },
  {
    table: 'free_logs',
    row: (userId) => ({
      id: uuid(),
      user_id: userId,
      local_date: DAY,
      logged_at: AT,
      type: 'note',
      body: '원래 본문',
      utc_offset_minutes: KST,
    }),
    patch: { body: '바뀐 본문' },
    read: (r) => r.body,
    original: '원래 본문',
  },
  {
    table: 'reflection_sessions',
    row: (userId, habitId) => ({
      id: uuid(),
      user_id: userId,
      habit_id: habitId,
      week_of: DAY,
      flags: [],
      suggested_action: 'keep',
      chosen_action: 'keep',
      design_before: { floor: 10, floorUnit: 'reps' },
      design_after: { floor: 10, floorUnit: 'reps' },
      committed_at: null,
    }),
    patch: { chosen_action: 'archive' },
    read: (r) => r.chosen_action,
    original: 'keep',
  },
];

/** 그 사용자의 시야에서 id 로 읽는다. RLS 가 걸러 내면 빈 배열이다. */
function selectById(token, table, id) {
  return rest(`${table}?id=eq.${id}&select=*`, { token });
}

before(async () => {
  // 이전 실행이 중간에 죽어 남긴 사용자부터 치운다.
  await sweepOrphans();

  [A, B] = await Promise.all([createUser(), createUser()]);

  anchorA = habitRow(A.id);
  anchorB = habitRow(B.id);
  for (const [user, habit] of [
    [A, anchorA],
    [B, anchorB],
  ]) {
    const res = await rest('habits', { method: 'POST', token: user.token, body: habit });
    assert.equal(res.status, 201, `앵커 습관 생성 실패: ${JSON.stringify(res.body)}`);
  }
});

after(async () => {
  // 사용자를 지우면 네 테이블의 on delete cascade 가 그 사람 행을 전부 데려간다.
  await Promise.all([A && deleteUser(A.id), B && deleteUser(B.id)].filter(Boolean));
});

for (const spec of TABLES) {
  describe(`${spec.table} — auth.uid() = user_id`, () => {
    it('A 는 자기 행에 대해 insert·select·update·delete 를 **할 수 있다** (전부 막는 정책이면 여기서 걸린다)', async () => {
      const row = spec.row(A.id, anchorA.id);

      const inserted = await rest(spec.table, { method: 'POST', token: A.token, body: row });
      assert.equal(inserted.status, 201, `insert 실패: ${JSON.stringify(inserted.body)}`);
      assert.equal(inserted.body.length, 1);

      const read = await selectById(A.token, spec.table, row.id);
      assert.equal(read.body.length, 1, '자기 행을 못 읽는다');

      const updated = await rest(`${spec.table}?id=eq.${row.id}`, {
        method: 'PATCH',
        token: A.token,
        body: spec.patch,
      });
      assert.equal(updated.body.length, 1, '자기 행을 못 고친다');
      assert.equal(spec.read(updated.body[0]), Object.values(spec.patch)[0]);

      const deleted = await rest(`${spec.table}?id=eq.${row.id}`, {
        method: 'DELETE',
        token: A.token,
      });
      assert.equal(deleted.body.length, 1, '자기 행을 못 지운다');

      const gone = await selectById(A.token, spec.table, row.id);
      assert.equal(gone.body.length, 0);
    });

    describe('A 는 B 의 행에 닿을 수 없다', () => {
      let bRow;

      before(async () => {
        bRow = spec.row(B.id, anchorB.id);
        const res = await rest(spec.table, { method: 'POST', token: B.token, body: bRow });
        assert.equal(res.status, 201, `B 의 행 준비 실패: ${JSON.stringify(res.body)}`);
      });

      it('select — 빈 배열. (B 로는 보인다는 것도 같이 확인한다: 행이 없어서 빈 게 아니다)', async () => {
        const asB = await selectById(B.token, spec.table, bRow.id);
        assert.equal(asB.body.length, 1, '전제가 틀렸다 — B 의 행이 실제로 있어야 한다');

        const asA = await selectById(A.token, spec.table, bRow.id);
        assert.equal(asA.status, 200);
        assert.deepEqual(asA.body, []);
      });

      it('insert on behalf of — 남의 user_id 로 쓰면 거부된다 (with check 절)', async () => {
        const forged = spec.row(B.id, anchorB.id);
        const res = await rest(spec.table, { method: 'POST', token: A.token, body: forged });
        assert.ok(!res.ok, `거부됐어야 한다. status=${res.status} body=${JSON.stringify(res.body)}`);
        assert.equal(res.body?.code, '42501', `RLS 위반(42501)이어야 한다: ${JSON.stringify(res.body)}`);

        const leaked = await selectById(B.token, spec.table, forged.id);
        assert.deepEqual(leaked.body, [], 'B 의 시야에 위조 행이 들어왔다');
      });

      it('update — 0 행이고, B 로 다시 읽어도 값이 그대로다', async () => {
        const res = await rest(`${spec.table}?id=eq.${bRow.id}`, {
          method: 'PATCH',
          token: A.token,
          body: spec.patch,
        });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, [], 'A 가 B 의 행을 고쳤다');

        const asB = await selectById(B.token, spec.table, bRow.id);
        assert.equal(asB.body.length, 1);
        assert.equal(spec.read(asB.body[0]), spec.original, 'B 의 행 값이 바뀌었다');
      });

      it('update 로 소유권을 넘겨받을 수도 없다 (using 만으로는 못 막는 구멍)', async () => {
        const aRow = spec.row(A.id, anchorA.id);
        await rest(spec.table, { method: 'POST', token: A.token, body: aRow });

        const res = await rest(`${spec.table}?id=eq.${aRow.id}`, {
          method: 'PATCH',
          token: A.token,
          body: { user_id: B.id },
        });
        assert.ok(!res.ok, `거부됐어야 한다. status=${res.status} body=${JSON.stringify(res.body)}`);
        assert.equal(res.body?.code, '42501', `RLS 위반(42501)이어야 한다: ${JSON.stringify(res.body)}`);

        await rest(`${spec.table}?id=eq.${aRow.id}`, { method: 'DELETE', token: A.token });
      });

      it('delete — 0 행이고, B 로 다시 읽으면 행이 그대로 남아 있다', async () => {
        const res = await rest(`${spec.table}?id=eq.${bRow.id}`, {
          method: 'DELETE',
          token: A.token,
        });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, [], 'A 가 B 의 행을 지웠다');

        const asB = await selectById(B.token, spec.table, bRow.id);
        assert.equal(asB.body.length, 1, 'B 의 행이 사라졌다 — A 의 delete 가 통했다는 뜻');
      });
    });
  });
}
