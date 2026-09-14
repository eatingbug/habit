-- 20260914120000 을 적용한 뒤 information_schema.role_table_grants 를 **읽어 보고** 알게
-- 된 것: authenticated 가 네 테이블에 DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,
-- UPDATE 를 갖고 있었다. 앞 마이그레이션이 부여한 것은 네 개뿐이니 나머지 셋은 프로젝트의
-- public 스키마 default ACL 이 준 것이다 (= "새 테이블 자동 노출"이 켜져 있다).
--
-- 그중 **TRUNCATE 가 문제다 — TRUNCATE 는 RLS 를 거치지 않는다.** authenticated 역할
-- 하나면 정책과 무관하게 모든 사용자의 행을 통째로 지울 수 있다. PostgREST 로는 닿지
-- 않으므로 앱 경로의 구멍은 아니지만, #47 이 "경계 전체가 RLS 정책 안에 산다"를 전제로
-- 인터페이스에서 사용자 개념을 뺐다. 정책을 우회하는 권한이 남아 있으면 그 전제가 거짓이
-- 된다.
--
-- 회수 → 부여 순서라야 자동 노출 토글이 켜져 있든 꺼져 있든 끝 상태가 같다.
revoke all
  on public.habits, public.habit_entries, public.free_logs, public.reflection_sessions
  from anon, authenticated;

grant select, insert, update, delete
  on public.habits, public.habit_entries, public.free_logs, public.reflection_sessions
  to authenticated;
