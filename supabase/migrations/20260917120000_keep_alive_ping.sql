-- keep_alive_ping() — Supabase Free 플랜의 7일 자동 정지를 막는 워크플로우(#52)가
-- 부를 함수. 아무 데이터도 노출하지 않고, Postgres 를 실제로 한 번 거친다.
--
-- 앞선 마이그레이션들은 고치지 않는다. 이미 적용된 파일을 다시 쓰면 적용된 것과 저장된
-- 것이 갈라진다 (20260914140000 의 머리말과 같은 이유).
--
-- === 왜 함수인가 — 다른 후보를 **재 보고** 떨어뜨렸다 ===
-- keep-alive 에는 "publishable key 만으로 보낼 수 있고, Postgres 에 닿는 요청" 이
-- 필요하다. 셋을 실제로 쳐 봤다.
--
-- (1) PostgREST 루트 `GET /rest/v1/` — publishable key 로는 **401 이다.** 응답 본문이
--     그대로 말해 준다:
--       {"message":"Secret API key required",
--        "hint":"Only secret API keys can be used for this endpoint."}
--     Authorization: Bearer 를 붙이든 말든 같다. 이 엔드포인트는 비밀 키 전용이고,
--     비밀 키는 이 저장소가 CI 에 두지 않기로 한 물건이다(tests/policy/env.mjs 의
--     "비밀 키(구 service_role)는 쓰지 않는다" 와 같은 선).
--
-- (2) `/auth/v1/health` · `/auth/v1/settings` — publishable key 로 200 이 온다. 하지만
--     그건 **Auth 서비스가 살아 있다**는 뜻이지 Postgres 에 닿았다는 뜻이 아니다.
--     활동 증거로 삼으면 반증할 수 없는 신호가 된다.
--
-- (3) 테이블을 로그인해서 읽기 — `authenticated` 에는 20260914130000 이 select 를
--     다시 부여해 뒀으므로 **읽을 수는 있다.** 떨어뜨린 이유는 권한이 아니라 결합이다:
--     이메일 로그인 경로에 keep-alive 를 매달면 그 경로가 닫히는 날 keep-alive 가 조용히
--     죽는다. 정지를 막으려던 장치가 소리 없이 멈추는 것이 #52 가 막으려는 바로 그
--     실패다.
--
-- 남는 것이 이 함수다. `anon` 이 실행할 수 있고, 테이블을 하나도 건드리지 않으므로
-- 20260914130000 이 일부러 세운 자세 — "anon 은 이 테이블들에 볼일이 없다" — 를
-- 되돌리지 않는다. 노출하는 값은 서버 시각 하나뿐이라 새로 새는 것이 없다.
--
-- === security definer 인데 왜 안전한가 ===
-- 본문이 `now()` 하나라 소유자 권한으로 읽을 것이 없다. 그래도 `set search_path = ''`
-- 를 단다: definer 함수에서 search_path 를 고정하지 않으면 호출자가 심은 스키마의
-- 같은 이름 함수가 먼저 잡힐 수 있다. 그래서 본문도 `pg_catalog.now()` 로 스키마를
-- 명시한다.
--
-- === 회수 → 부여 ===
-- Postgres 는 새 함수의 EXECUTE 를 `public` 롤에 자동으로 준다. 회수부터 하고 필요한
-- 롤에만 다시 주는 이유는 20260914130000 이 자기 자신에 대해 적어 둔 것과 같다 —
-- 프로젝트의 default ACL 이 무엇을 주고 있든 **끝 상태가 같아야** 한다. 받는 쪽은
-- `anon` 뿐이다. 워크플로우는 publishable key 만 들고 오고, 앱은 이 함수를 부르지 않는다.

create function public.keep_alive_ping()
  returns timestamptz
  language sql
  security definer
  set search_path = ''
as $$ select pg_catalog.now() $$;

comment on function public.keep_alive_ping() is
  'Supabase 7일 자동 정지를 막는 keep-alive 워크플로우(#52) 전용. 서버 시각만 돌려주고 테이블을 건드리지 않는다. .github/workflows/keep-alive.yml 이 유일한 호출자다.';

revoke execute on function public.keep_alive_ping() from public;
grant  execute on function public.keep_alive_ping() to anon;
