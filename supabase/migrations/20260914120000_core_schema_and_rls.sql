-- HabitQuest V2 — 네 엔티티의 테이블 · 소유권 · RLS 정책.
--
-- 이 마이그레이션은 앱 동작을 바꾸지 않는다 (#49). 앱은 여전히 LocalRepository 위에서
-- 돌고, 이 스키마를 읽는 코드는 #50 이 처음 쓴다.
--
-- 출처: src/models/index.ts (SPEC §3) 의 네 엔티티.
--   Habit · HabitEntry · FreeLog · ReflectionSession.
--   `Stat` 은 테이블이 아니다 — "populated from `TUNING.stats`; not stored per-user in V1"
--   (src/models/index.ts:3). 그래서 `stat_id` 는 FK 가 아니라 text 다.
--
-- === 이름 규약 — #50 이 따라야 할 것 ===
-- TypeScript 는 camelCase, Postgres 는 snake_case 로 간다. PostgREST 는 컬럼명을
-- 그대로 노출하므로 #50 의 SupabaseRepository 는 **명시적 매핑 계층을 반드시 갖는다**
-- (선택이 아니다). camelCase 를 따옴표로 싸서 쓰는 쪽은 이 파일과 이후 모든 손SQL 을
-- 영구히 오염시키고, `user_id` 와 `habitId` 가 한 테이블에 나란히 서게 된다.
--
-- 기계적 변환(`habitId` → `habit_id`)에서 벗어나는 컬럼은 셋뿐이고, 모두 Postgres
-- 타입 키워드를 피하려는 것이다:
--   HabitEntry.date      → local_date          (`date` 는 타입 키워드)
--   HabitEntry.timestamp → logged_at           (`timestamp` 는 타입 키워드)
--   FreeLog.date         → local_date
--   FreeLog.timestamp    → logged_at
--   FreeLog.text         → body                (`text` 는 타입 키워드)
-- `local_date` 는 덤으로 이 값이 **기기 로컬 달력일**이라는 사실을 이름에 담는다 —
-- 아래 utc_offset_minutes 결정의 핵심이 그것이다.
--
-- === 중첩 구조는 JSONB ===
-- Habit.pauses · ReflectionSession.flags/designBefore/designAfter 는 자식 테이블이
-- 아니라 jsonb 다. HabitRepository 12 메서드(src/data/HabitRepository.ts) 중 중첩
-- 배열의 내부를 **필터·정렬·페이지네이션하는 메서드가 하나도 없다** — 전부 aggregate
-- 통째로 읽고 쓴다(upsertHabit(habit) / getHabits()). 인터페이스는 #47 에서 불변으로
-- 못박혔으므로 자식 테이블은 아무도 요구하지 않는 쿼리를 위한 구조다.
--
-- === utc_offset_minutes — 되돌릴 수 없는 결정 ===
-- docs/SPEC.md:841–845 가 이름까지 붙여 남긴 위험이다:
--   "`date` is the device-local calendar day, so the same physical evening logged on
--    two devices in different offsets can split one `done` into two sub-floor `partial`
--    days — capturing a per-row UTC offset **at write time** is the (deferred)
--    insurance, since that provenance is unrecoverable on an append-only model once
--    the row is written."
-- 서버 단일 원본은 이 위험을 없애지 못한다. `local_date` 는 행이 어디에 저장되든
-- **쓰는 순간 기기에서** 계산되기 때문이다. 스키마를 만드는 지금이 마지막 기회다.
-- 기기 로컬 `date` 를 가진 두 테이블(habit_entries · free_logs)에만 붙는다 —
-- habits 와 reflection_sessions 의 날짜는 기기 로컬 달력일이 아니다.
-- 근거 전문은 docs/adr/0005-server-is-the-single-source-of-truth.md.
--
-- === 권한 ===
-- 이 프로젝트의 public 스키마 default ACL 은 생성자가 supabase_admin 일 때만 걸리는데
-- 마이그레이션은 postgres 로 돈다. 그래서 토글 상태와 무관하게 **끝 상태가 같도록**
-- GRANT/REVOKE 와 ENABLE ROW LEVEL SECURITY 를 전부 명시한다. 자동 노출·자동 RLS
-- 설정에 기대지 않는다.

-- ---------------------------------------------------------------------------
-- habits — SPEC §3.2
-- ---------------------------------------------------------------------------
create table public.habits (
  id          uuid        primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  name        text        not null,
  stat_id     text        not null,
  kind        text        not null check (kind in ('count', 'binary')),
  floor       numeric     not null check (floor >= 1),
  floor_unit  text        not null,
  target      numeric     check (target is null or target > floor),
  cue         text,
  identity    text,
  lifecycle   text        not null check (lifecycle in ('forming', 'established', 'paused', 'archived')),
  created_at  timestamptz not null,
  pauses      jsonb       not null default '[]'::jsonb check (jsonb_typeof(pauses) = 'array')
);

comment on column public.habits.stat_id is
  'TUNING.stats 의 id (''strength'' 등). Stat 은 테이블이 아니므로 FK 가 아니다 — src/models/index.ts:3.';
comment on column public.habits.floor is
  'numeric — useHabitDetail.ts:674 의 검증은 Number.isFinite(floor) && floor >= 1 이라 정수를 요구하지 않는다.';
comment on column public.habits.target is
  'SPEC §3.2 — count 전용 stretch goal. target > floor 은 strict.';
comment on column public.habits.pauses is
  'PauseInterval[] — { from, to?, resumeTo? }. ADR-0003 · ADR-0004. 겹치지 않고 from ASC, append-only. 자식 테이블이 아닌 이유는 파일 상단 참조.';

-- ---------------------------------------------------------------------------
-- habit_entries — SPEC §3.3. 유일하게 평평하고 범위 조회되는 테이블.
-- ---------------------------------------------------------------------------
create table public.habit_entries (
  id                 uuid        primary key,
  user_id            uuid        not null references auth.users (id) on delete cascade,
  habit_id           uuid        not null references public.habits (id) on delete cascade,
  local_date         date        not null,
  logged_at          timestamptz not null,
  actual             numeric     not null check (actual >= 0),
  skip_reason        text        check (skip_reason in ('cue', 'floor', 'exception', 'identity')),
  note               text,
  utc_offset_minutes smallint    not null check (utc_offset_minutes between -1080 and 1080),

  -- src/models/index.ts 의 row discriminator 를 그대로 옮긴 것:
  -- "an **activity row** has `actual > 0` and no `skipReason`; a **skip row** has
  --  `actual: 0` and a `skipReason`." state/kind 필드는 없다.
  constraint habit_entries_row_discriminator check (
    (skip_reason is null and actual > 0) or (skip_reason is not null and actual = 0)
  )
);

comment on column public.habit_entries.local_date is
  'HabitEntry.date — 기기 로컬 달력일. 날짜 그룹핑의 권위(SPEC §3.3). (habit_id, local_date) 는 유일하지 않다 — 하루에 여러 행이 올 수 있고 그 날의 상태는 집계다(§4.1).';
comment on column public.habit_entries.logged_at is
  'HabitEntry.timestamp — ISO-8601 UTC. 정렬과 최신 skip 타이브레이크 전용이며 날짜 그룹핑에 쓰지 않는다.';
comment on column public.habit_entries.utc_offset_minutes is
  '이 행을 쓴 기기의 UTC 오프셋. **부호 규약: UTC 기준 동쪽이 양수** — KST = +540, ISO-8601 의 "+09:00" 과 같은 부호다. JavaScript 의 Date#getTimezoneOffset() 은 이 값의 **부호가 반대**(KST 에서 -540)이므로 쓰는 쪽에서 반드시 뒤집어야 한다. 부호를 틀리는 것이 정확히 #31 이 열려 있는 이유라 여기 못박는다. NOT NULL 이고 DEFAULT 가 없다 — 쓰는 시점에 provenance 를 빠뜨리면 조용한 NULL 이 아니라 시끄러운 쓰기 실패여야 한다(SPEC:844 "unrecoverable ... once the row is written").';

-- getEntries(habitId, from, to) — LocalRepository.ts:50–52 기준 [from, to] **양끝 포함**.
-- RLS 가 모든 쿼리에 user_id = auth.uid() 를 주입하므로 선두 컬럼이 user_id 다.
create index habit_entries_owner_habit_date_idx
  on public.habit_entries (user_id, habit_id, local_date);

-- ---------------------------------------------------------------------------
-- free_logs — SPEC §3.4. habitId 링크가 **의도적으로** 없다 (CONCEPT §9.4).
-- ---------------------------------------------------------------------------
create table public.free_logs (
  id                 uuid        primary key,
  user_id            uuid        not null references auth.users (id) on delete cascade,
  local_date         date        not null,
  logged_at          timestamptz not null,
  type               text        not null check (type in ('note', 'win', 'mood', 'idea')),
  body               text        not null,
  utc_offset_minutes smallint    not null check (utc_offset_minutes between -1080 and 1080)
);

comment on column public.free_logs.body is
  'FreeLog.text — 이름만 바꿨다. `text` 는 Postgres 타입 키워드다.';
comment on column public.free_logs.utc_offset_minutes is
  'habit_entries.utc_offset_minutes 와 같은 규약 — 동쪽이 양수, KST = +540, getTimezoneOffset() 의 반대 부호.';

-- getFreeLogs(from, to) — 습관별이 아니다.
create index free_logs_owner_date_idx on public.free_logs (user_id, local_date);

-- ---------------------------------------------------------------------------
-- reflection_sessions — SPEC §3.5
-- ---------------------------------------------------------------------------
create table public.reflection_sessions (
  id               uuid        primary key,
  user_id          uuid        not null references auth.users (id) on delete cascade,
  habit_id         uuid        not null references public.habits (id) on delete cascade,
  week_of          date        not null,
  flags            jsonb       not null default '[]'::jsonb check (jsonb_typeof(flags) = 'array'),
  suggested_action text        not null check (suggested_action in ('adjust_cue', 'lower_floor', 'raise_target', 'fill_cue', 'fill_identity', 'pause', 'archive', 'keep')),
  chosen_action    text        not null check (chosen_action in ('adjust_cue', 'lower_floor', 'raise_target', 'fill_cue', 'fill_identity', 'pause', 'archive', 'keep')),
  design_before    jsonb       not null check (jsonb_typeof(design_before) = 'object'),
  design_after     jsonb       not null check (jsonb_typeof(design_after) = 'object'),
  committed_at     timestamptz
);

comment on column public.reflection_sessions.week_of is
  'ReflectionSession.weekOf — 되돌아본 주의 월요일. 기기 로컬 달력일이 아니라 주 경계라 utc_offset_minutes 를 달지 않는다.';
comment on column public.reflection_sessions.committed_at is
  'commit 전에는 NULL — SPEC §3.5 "absent until committed".';

-- getReflectionSessions(habitId) — 범위 조회가 없다.
create index reflection_sessions_owner_habit_idx
  on public.reflection_sessions (user_id, habit_id);

-- ---------------------------------------------------------------------------
-- 소유권 — 경계 전체가 여기에 있다.
--
-- HabitRepository 12 메서드에는 사용자 인자가 없고 앞으로도 없다(#47). getHabits() 가
-- "내 습관"이 되는 것은 오직 아래 정책 때문이다. 이 블록이 틀리면 타입 시스템 어디에도
-- 그것을 잡아낼 자리가 없다 — 그래서 이 티켓은 서버에 실제로 붙는 정책 테스트를 함께
-- 낸다(tests/policy/).
--
-- for update 에 using 과 with check 를 **둘 다** 단다. using 만 달면 A 가 자기 행의
-- user_id 를 B 로 바꿔 넘겨줄 수 있다.
-- ---------------------------------------------------------------------------
alter table public.habits              enable row level security;
alter table public.habit_entries       enable row level security;
alter table public.free_logs           enable row level security;
alter table public.reflection_sessions enable row level security;

create policy habits_owner_select on public.habits
  for select to authenticated using (auth.uid() = user_id);
create policy habits_owner_insert on public.habits
  for insert to authenticated with check (auth.uid() = user_id);
create policy habits_owner_update on public.habits
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy habits_owner_delete on public.habits
  for delete to authenticated using (auth.uid() = user_id);

create policy habit_entries_owner_select on public.habit_entries
  for select to authenticated using (auth.uid() = user_id);
create policy habit_entries_owner_insert on public.habit_entries
  for insert to authenticated with check (auth.uid() = user_id);
create policy habit_entries_owner_update on public.habit_entries
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy habit_entries_owner_delete on public.habit_entries
  for delete to authenticated using (auth.uid() = user_id);

create policy free_logs_owner_select on public.free_logs
  for select to authenticated using (auth.uid() = user_id);
create policy free_logs_owner_insert on public.free_logs
  for insert to authenticated with check (auth.uid() = user_id);
create policy free_logs_owner_update on public.free_logs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy free_logs_owner_delete on public.free_logs
  for delete to authenticated using (auth.uid() = user_id);

create policy reflection_sessions_owner_select on public.reflection_sessions
  for select to authenticated using (auth.uid() = user_id);
create policy reflection_sessions_owner_insert on public.reflection_sessions
  for insert to authenticated with check (auth.uid() = user_id);
create policy reflection_sessions_owner_update on public.reflection_sessions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy reflection_sessions_owner_delete on public.reflection_sessions
  for delete to authenticated using (auth.uid() = user_id);

-- PostgREST 가 필요로 하는 권한. RLS 가 행을 거르고, 이 GRANT 가 테이블 자체에 닿을 수
-- 있는 역할을 정한다 — 둘 다 있어야 한다.
grant select, insert, update, delete
  on public.habits, public.habit_entries, public.free_logs, public.reflection_sessions
  to authenticated;

-- anon 은 이 테이블들에 볼일이 없다. RLS 만으로도 auth.uid() 가 null 이라 아무 행도
-- 맞지 않지만, 프로젝트 default ACL 이 anon 에 테이블 권한을 주고 있으므로 명시적으로
-- 회수해 토글 상태와 무관하게 끝 상태를 같게 만든다.
revoke all
  on public.habits, public.habit_entries, public.free_logs, public.reflection_sessions
  from anon;
