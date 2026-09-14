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
 * === 의존: 이메일 비밀번호 로그인이 켜져 있어야 한다 ===
 *
 * 이 스위트는 미리 만들어 둔 계정 두 개를 `POST /auth/v1/token?grant_type=password` 로
 * 로그인시킨다. 브라우저가 타는 것과 같은 publishable key 경로다. **비밀 키(구
 * service_role)는 쓰지 않는다** — 그 키는 RLS 를 통째로 우회하므로 정책을 검증하는
 * 스위트가 들고 있을 물건이 아니고, 카카오 로그인(#51)만으로는 자동화가 세션을 얻을
 * 방법이 없다.
 *
 * 따라서 이 스위트는 **Auth 의 email provider 가 켜져 있는 데 의존한다.** #55 가
 * 열린 가입을 닫을 때 **`disable_signup` 만 닫아야 하고, email provider 자체를 끄면
 * 안 된다** — 끄는 순간 이 스위트는 로그인하지 못하고, 저장소의 유일한 RLS 검증이
 * 사라진다. 가입을 막는 것과 로그인을 막는 것은 다른 스위치다.
 *
 * === 이 파일이 조심하는 두 가지 거짓 green ===
 *
 * 1. **RLS 는 테이블 소유자에게 적용되지 않는다.** 그래서 여기서는 오직 사용자
 *    access token(= authenticated 역할)으로만 붙는다. 권한을 올려 주는 키는 이 파일
 *    어디에도 없다.
 * 2. **교차 UPDATE·DELETE 는 에러를 내지 않는다 — 0 행에 적용될 뿐이다.** SELECT 도
 *    빈 배열이지 에러가 아니다. 에러가 나는 것은 남의 user_id 로 INSERT 할 때뿐이다.
 *    그래서 "0 행"을 확인하고, **거기서 멈추지 않고 B 로 다시 읽어** 행이 그대로
 *    남아 있고 바뀌지도 않았음을 확인한다. A 쪽에서 보면 "막힌 삭제"와 "조용히 된
 *    삭제"가 똑같이 생겼다.
 *
 * 또 하나: 막는 것만 확인하면 **전부 거부하는 정책도 통과한다.** 그래서 네 테이블
 * 모두에서 A 가 자기 행에 대해 읽기·쓰기·수정·삭제를 할 수 있다는 쪽도 함께 본다.
 *
 * === 뒷정리 ===
 *
 * 계정은 사람 소유이고 오래 산다. 지우지 않는다. 대신 **행은 이 스위트가 직접
 * 치운다.** 시작할 때와 끝날 때 두 번 쓸어 내므로, 이전 실행이 중간에 죽어 행을 남겨
 * 두었어도 다음 실행이 깨끗한 상태에서 시작한다. 표식은 아래 SENTINEL 둘이고,
 * 실제 사용자 데이터와 겹칠 수 없는 값이다. 그와 별개로 모든 단언은 그 실행에서 갓
 * 만든 UUID 를 `id=eq.` 로 콕 집어 보므로, 남은 행이 통과나 실패를 만들어 낼 수 없다.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ACCOUNTS } from './env.mjs';
import { rest, signIn } from './client.mjs';

/** 이 이름의 습관은 전부 이 스위트의 것이다. 삭제하면 entries·reflections 가 FK 로 딸려 온다. */
const SENTINEL_NAME = 'rls-policy-test';
/** 이 날짜의 행도 전부 이 스위트의 것이다. 습관에 딸리지 않는 free_logs 를 위한 표식. */
const SENTINEL_DATE = '1970-01-01';
const AT = '1970-01-01T12:00:00.000Z';
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
    name: SENTINEL_NAME,
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
 * `patch` 가 SENTINEL 을 건드리지 않아야 뒷정리가 그 행도 알아본다.
 */
const TABLES = [
  {
    table: 'habits',
    row: (userId) => habitRow(userId),
    patch: { floor_unit: 'pages' },
    read: (r) => r.floor_unit,
    original: 'reps',
  },
  {
    table: 'habit_entries',
    row: (userId, habitId) => ({
      id: uuid(),
      user_id: userId,
      habit_id: habitId,
      local_date: SENTINEL_DATE,
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
      local_date: SENTINEL_DATE,
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
      week_of: SENTINEL_DATE,
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

/**
 * 한 사용자의 시야에서 이 스위트가 남긴 행을 전부 지운다. RLS 가 자기 행만 보여 주므로
 * 남의 데이터에는 닿을 수 없고, SENTINEL 이 실제 사용자 데이터와 겹칠 수 없다.
 */
async function sweepRows(token) {
  // 습관을 먼저 — on delete cascade 가 그 습관의 entries·reflections 를 데려간다.
  await rest(`habits?name=eq.${SENTINEL_NAME}`, { method: 'DELETE', token });
  // 앵커에 딸리지 않은 나머지.
  await rest(`habit_entries?local_date=eq.${SENTINEL_DATE}`, { method: 'DELETE', token });
  await rest(`free_logs?local_date=eq.${SENTINEL_DATE}`, { method: 'DELETE', token });
  await rest(`reflection_sessions?week_of=eq.${SENTINEL_DATE}`, { method: 'DELETE', token });
}

before(async () => {
  [A, B] = await Promise.all([signIn(ACCOUNTS.A), signIn(ACCOUNTS.B)]);
  assert.notEqual(A.id, B.id, 'A 와 B 가 같은 계정이다 — 교차 접근 테스트가 성립하지 않는다');

  // 이전 실행이 중간에 죽어 남긴 행부터 치운다.
  await Promise.all([sweepRows(A.token), sweepRows(B.token)]);

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
  if (!A || !B) return;
  await Promise.all([sweepRows(A.token), sweepRows(B.token)]);
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
        const seeded = await rest(spec.table, { method: 'POST', token: A.token, body: aRow });
        assert.equal(seeded.status, 201, `전제 준비 실패: ${JSON.stringify(seeded.body)}`);

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
