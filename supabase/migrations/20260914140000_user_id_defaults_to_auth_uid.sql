-- user_id 에 default auth.uid() 를 단다 — 클라이언트가 소유자를 **보내지 않게** 하려고.
--
-- 앞선 마이그레이션(20260914120000)은 고치지 않는다. 이미 병합돼 서버에 적용된 파일을
-- 다시 쓰면 적용된 것과 저장된 것이 갈라진다.
--
-- === 왜 default 인가 (#50) ===
-- src/models 의 네 엔티티 어디에도 `user_id` 가 없다. default 가 없으면 매퍼가 모델에
-- 존재하지 않는 필드를 지어내야 하고, 그러려면 쓰기마다 세션에서 uid 를 읽어야 한다.
-- default 를 달면 SupabaseRepository 는 소유자를 **한 번도 언급하지 않고**, 소유권은
-- 전부 SQL 안에 남는다 — ADR-0005 의 "행 소유권은 전부 SQL 안에 산다" 그대로다.
--
-- === default 는 편의지 경계가 아니다 ===
-- 강제력은 그대로 `with check (auth.uid() = user_id)` 에 있다. default 는 **보내지
-- 않았을 때만** 동작하므로, 남의 id 를 명시적으로 보내는 경로는 전과 똑같이 42501 로
-- 거부된다 (tests/policy/rls.test.mjs 의 "insert on behalf of" 가 그것을 붙잡는다).
-- not null 도 그대로다: 로그인하지 않은 호출은 auth.uid() 가 null 이라 default 가
-- null 을 넣고, not null 이 시끄럽게 거부한다.

alter table public.habits              alter column user_id set default auth.uid();
alter table public.habit_entries       alter column user_id set default auth.uid();
alter table public.free_logs           alter column user_id set default auth.uid();
alter table public.reflection_sessions alter column user_id set default auth.uid();
