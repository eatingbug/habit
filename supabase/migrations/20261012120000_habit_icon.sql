-- habits 에 icon 열을 더한다 — 새 습관 화면의 습관 아이콘(이모지) (#130, SPEC §6.6).
--
-- 앞선 마이그레이션은 고치지 않는다. 이미 서버에 적용된 파일을 다시 쓰면 적용된 것과
-- 저장된 것이 갈라진다.
--
-- === nullable, default 없음, backfill 없음 ===
-- null 은 "고르지 않음"이고, 화면은 그때 능력치 아이콘을 쓴다 (src/config/copy.ts 의
-- habitIcon). 그래서 기존 행은 한 줄도 바꾸지 않는다. 능력치 아이콘을 열에 복사해 두면
-- 능력치를 바꿔도 아이콘이 따라가지 않는다.
--
-- === 옛 앱은 그대로 동작한다 ===
-- 옛 SupabaseRepository 는 select('*') 로 읽고 매퍼가 아는 열만 옮긴다. 모르는 열은
-- 버려진다. 쓰기는 icon 을 보내지 않고, PostgREST upsert 는 보낸 열만 바꾸므로 고른
-- 아이콘을 지우지도 않는다.

alter table public.habits add column icon text;

comment on column public.habits.icon is
  '습관 아이콘 이모지. null 이면 능력치 아이콘을 쓴다 — SPEC §6.6, #130.';
