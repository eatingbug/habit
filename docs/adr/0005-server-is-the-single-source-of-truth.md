# ADR-0005 — 진실 원본은 서버 하나다: 로컬 전용과 오프라인을 버린다

- **상태:** 채택됨
- **날짜:** 2026-09-14
- **관계:** `docs/SPEC.md` §5.3 의 "V1 is single-device, local-only" 를 **뒤집는다**
  (ADR-0003 과 같은 방식 — SPEC 을 고쳐 쓰지 않고 ADR 이 이긴다)
- **영향 범위:** `supabase/migrations/`, `data/SupabaseRepository`(#50),
  `RepositoryContext`(#51), `docs/SPEC.md` §5.2·§5.3

## 문제

사용자가 폰과 PC 에서 **같은 기록**을 보는 것이 요구사항이 됐다(#47). V1 의 저장은
브라우저 IndexedDB / AsyncStorage 라 기기마다 다른 기록을 갖고, 오리진이 바뀌면
사라진다. 그 순간 로컬 전용은 성립하지 않는다.

SPEC 은 이것을 "V2 동기화"로 미뤄 뒀고, 미루면서 두 가지 위험을 이름까지 붙여 남겼다
(`docs/SPEC.md:839–845`). 동기화를 실제로 지으려면 병합 규칙·톰브스톤·충돌 해결이
필요한데, 그 전부가 **진실 원본이 둘 이상일 때만** 필요한 것들이다.

## 결정

**Supabase Postgres 하나를 진실 원본으로 삼고, 로컬 사본을 두지 않는다.**

원본이 하나이므로 병합·톰브스톤·충돌 해결은 설계할 필요조차 없어진다. SPEC 이 남긴
**위험 1(삭제 부활)은 구조적으로 사라진다** — 부활시킬 두 번째 사본이 없다.

행 소유권은 전부 SQL 안에 산다: 네 테이블 모두 `user_id uuid references auth.users`,
RLS 활성화, `auth.uid() = user_id` 정책(select/insert/update/delete). `HabitRepository`
12 메서드에는 사용자 인자가 **없고 앞으로도 없다**(#47) — `getHabits()` 가 "내 습관"이
되는 유일한 이유가 이 정책이다.

### 뒤집는 문장

`docs/SPEC.md:831`:

> **V1 is single-device, local-only** — offline is the default and only mode; there is
> no sync in V1.

이 문장은 더 이상 유효하지 않다. **SPEC 을 고쳐 쓰지 않는다** — 권위 순서(`docs/adr/*`
> `docs/SPEC.md`, #19 에서 확정)에 따라 여기서 뒤집는다. SPEC 의 저 줄은 그 시점에
무엇을 결정했는지의 기록으로 남는다.

## 무엇을 버렸는가

이 결정의 대가는 실재하고, 가볍지 않다.

- **오프라인을 버렸다.** 지하철에서, 비행기에서, 신호가 나쁜 곳에서 기록할 수 없다.
  로컬 사본이 없다는 것이 병합을 없애 준 바로 그 성질이므로, 이것은 부작용이 아니라
  **같은 결정의 뒷면**이다.
- **로그인 전에는 앱을 쓸 수 없다.** 첫 실행에서 "일단 하나 기록해 보기"가 불가능해진다.
  V1 은 설치 즉시 쓸 수 있었다.
- **원탭 기록이 네트워크 위에 올라간다.** `LocalRepository` 의 promise 는 절대 reject
  하지 않지만 Supabase 는 오프라인·토큰 만료·프로젝트 정지에서 일상적으로 실패한다.
  `src/hooks/` 전체에 `catch` 가 0개라는 사실(#47)이 여기서 버그가 된다 — 조용히 삼켜진
  탭은 사용자가 기록했다고 믿는 사이에 연속을 끊는다. #51 이 맡는다.

## "한 줄 교체" 약속이 깨진다

`docs/SPEC.md:827–829`:

> Class stub implementing `HabitRepository`. All methods throw
> `'SupabaseRepository not yet configured'`. **Swapped in by changing one line in the**
> app's DI/context provider — no domain or UI code changes needed.

`src/data/HabitRepository.ts:6–8` 의 주석도 같은 약속을 반복한다.

**이 약속은 인증이 생기는 순간 깨진다.** 저장소를 만들려면 세션이 필요하고, 세션은
비동기로 확인되며, 로그인·로그아웃마다 저장소가 다시 만들어져야 한다. `RepositoryProvider`
는 "세션 확인 중" 상태와 재생성 경로를 갖게 된다 — 한 줄이 아니다.

실제로 깨지는 곳은 #51 이지만 **원인은 이 문서의 결정이다.** 코드 주석이 인용과
어긋난 채 남는 것은 이 저장소가 반복해서 겪은 실패이므로(#33 · #35) 미루지 않고 여기
적는다. 깨지지 않은 부분도 정확히 적어 둔다: **도메인과 UI 는 정말로 바뀌지 않는다.**
`HabitRepository` 인터페이스가 불변이므로 SPEC §5.1 은 그대로 살아남는다.

## 행마다 UTC 오프셋을 저장한다

`docs/SPEC.md:841–845` 가 위험 2 를 이렇게 적었다:

> (2) `date` is the device-local calendar day, so the same physical evening logged on
> two devices in different offsets can split one `done` into two sub-floor `partial`
> days — capturing a per-row UTC offset **at write time** is the (deferred) insurance,
> since that provenance is unrecoverable on an append-only model once the row is
> written.

**서버 단일 원본은 이 위험을 없애지 못한다.** 위험 1 과 달리 이것은 저장 위치의 문제가
아니다. `date` 는 행이 어디에 저장되든 **쓰는 순간 기기의 로컬 달력으로** 계산된다.
원본을 하나로 모으면 창이 좁아질 뿐(같은 저녁이 두 행으로 갈라지는 대신 한 행이 어느
날에 속하는지가 흔들린다) 사라지지 않는다.

그리고 SPEC 이 적은 대로 **행이 쓰인 뒤에는 복구할 수 없다.** 스키마를 만드는 지금이
마지막 기회다. 그래서 **결정: 기기 로컬 `date` 를 가진 두 테이블에 오프셋 컬럼을 둔다.**

- `habit_entries.utc_offset_minutes` · `free_logs.utc_offset_minutes`, `smallint`.
- `habits`(`created_at` 은 UTC 순간)와 `reflection_sessions`(`week_of` 는 주 경계)에는
  기기 로컬 달력일이 없으므로 달지 않는다.
- **`not null`, 기본값 없음.** 기본값을 주면 빠뜨린 provenance 가 조용한 거짓말이 된다.
  복구 불가능한 값이라면 빠뜨렸을 때 **시끄러운 쓰기 실패**여야 한다.
- **부호 규약: UTC 기준 동쪽이 양수.** KST = `+540`, ISO-8601 의 `+09:00` 과 같은 부호다.
  JavaScript 의 `Date#getTimezoneOffset()` 은 **부호가 반대**(KST 에서 `-540`)이므로 쓰는
  쪽에서 뒤집어야 한다. 부호를 틀리는 것이 정확히 #31 이 열려 있는 이유라, 규약을 ADR 과
  컬럼 주석 양쪽에 못박는다.

이 값을 **읽는 규칙은 아직 없다.** 지금 저장하는 이유는 나중에 읽을 규칙을 지을 수
있게 하기 위해서다. 저장하지 않으면 그 규칙은 영원히 지을 수 없다.

## 스키마에서 함께 정한 것

- **중첩 구조는 jsonb 다** — `habits.pauses`, `reflection_sessions.flags` ·
  `design_before` · `design_after`. `HabitRepository` 12 메서드 중 중첩 배열의 내부를
  필터·정렬·페이지네이션하는 것이 **하나도 없다**; 전부 aggregate 를 통째로 읽고 쓴다
  (`upsertHabit(habit)` / `getHabits()`). 인터페이스가 불변인 이상(#47) 자식 테이블은
  아무도 요구하지 않는 쿼리를 위한 구조다. 요구가 생기면 그때 정규화한다 — jsonb 에서
  테이블로 가는 마이그레이션은 가능하고, 그 반대도 가능하다.
- **컬럼은 snake_case 다.** `user_id` 가 필수인 이상 한 테이블 안에서 `habitId` 와
  섞일 수 없고, 따옴표로 싼 camelCase 는 이후 모든 손SQL 을 오염시킨다. PostgREST 는
  컬럼명을 그대로 노출하므로 **#50 의 `SupabaseRepository` 는 명시적 매핑 계층을 반드시
  갖는다 — 선택이 아니다.** 기계적 변환에서 벗어나는 컬럼은 다섯 개뿐이고 모두 Postgres
  타입 키워드를 피한 것이다(`date`→`local_date`, `timestamp`→`logged_at`,
  `FreeLog.text`→`body`); 마이그레이션 상단에 표로 적어 뒀다.
- **`Stat` 은 테이블이 아니다** — `src/models/index.ts:3` 이 "populated from
  `TUNING.stats`; not stored per-user in V1" 이라고 적는다. `habits.stat_id` 는 FK 가
  아니라 text 다.
- **`authenticated` 에서 여분의 권한을 회수한다.** 프로젝트 default ACL 이 테이블
  권한을 통째로 주는데 거기에 `TRUNCATE` 가 들어 있고, **`TRUNCATE` 는 RLS 를 거치지
  않는다.** "경계 전체가 정책 안에 산다"가 참이려면 정책을 우회하는 권한이 남아 있으면
  안 된다. `anon` 에는 아무것도 주지 않는다.

## 지켜야 할 성질

- **`HabitRepository` 12 메서드 시그니처는 바뀌지 않는다.** 사용자 인자가 생기는
  순간 경계가 TypeScript 로 새어 나오고, RLS 가 유일한 경계라는 전제가 무너진다.
- **소유권은 서버에서만 검증된다.** 클라이언트가 보내는 `user_id` 는 신뢰 대상이 아니다
  — `with check` 가 거부한다. `for update` 에는 `using` 과 `with check` 를 **둘 다** 단다;
  `using` 만으로는 자기 행의 `user_id` 를 남에게 넘길 수 있다.
- **정책은 서버에 붙어 검증한다.** 인메모리 테스트로는 검증 불가능하다. `tests/policy/`
  가 두 계정으로 교차 접근이 읽기·쓰기·수정·삭제 **전부**에서 막히는지 본다. 막는 것만
  보면 전부 거부하는 정책도 통과하므로 **자기 행에 대한 네 동작이 되는지도 함께** 본다.
  네트워크 의존이라 `npm test` 가 아니라 `npm run test:policy` 다.
- **오프셋은 쓸 때만 얻을 수 있다.** 나중에 채워 넣는 백필은 존재할 수 없다.
