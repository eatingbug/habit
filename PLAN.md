# PLAN — 앞으로 진행할 작업

Habiquest (Expo/TypeScript 습관 트래커). 스펙은 `docs/SPEC.md`, 개념은 `docs/CONCEPT.md` 참고.

## 현재까지 완료된 것 (요약)
- **도메인 엔진** (`src/domain/*` + 테스트): classify / score / streak / diagnose / recommend / statusLight / lifecycle.
- **저장소** (`src/data/*`): `HabitRepository` 인터페이스 + KV 시임(Memory / AsyncStorage / Localforage) + `LocalRepository`.
- **UI 4개 화면 + 생성 모달 + 통합 Composer** (`app/`, `src/components/*`, `src/hooks/*`).
- **이진(yes/no) 습관 타입 + 누적 XP→레벨 진행** (`Habit.kind: 'count' | 'binary'`).
- **한글 UI 전환** — 모든 사용자 노출 텍스트 인라인 한글화 (i18n 라이브러리 없음, 언어 전환 없음), 날짜/요일 한글 포맷.
- **기록 수정** — Today 피드(Composer 재사용 수정 모드) + 습관 상세 저널(백필 폼 재사용) 양쪽에서 id 보존 수정. (삭제는 미구현 — 의도적 보류)
- **검증 게이트**: `tsc --noEmit` 0, `jest` 200 green, `expo export --platform web` 9개 라우트 정상.

---

## ★ 기록 서브시스템 재설계 (신규 — 인터뷰 2026-06-26, `ooo interview`)

문서(`docs/SPEC.md` v3 / `docs/CONCEPT.md` v3.2)가 **다중 기록 + 일자 집계** 모델로 갱신됨. 코드는 아직 구 모델(행별 `state`, 하루 1건 가정). 아래는 문서를 코드에 반영하는 연쇄 작업. 상세 결정은 `~/.claude/plans/ooo-interview-mossy-petal.md`.

- **`classifyDay` 도입** (`src/domain/classify.ts`): 행별 `classifyEntry`(actual<floor 시 `RangeError`) 폐지 → 하루 엔트리 합산으로 `unknown|partial|done|over|skip` 계산. `effectiveSkipReason`(최신 skip 우선), `isMissDay` 추가.
- **`HabitEntry`에서 저장 `state` 제거** (`src/models/index.ts`): 엔트리는 사실만(`actual`, 선택 `skipReason`, `note`, `date`, `timestamp`). skip 행 = `actual:0`+`skipReason`, 활동 행 = `actual>0`. `date`가 그룹핑 권위.
- **`partial` 상태 전파**: `score.ts`(partial=floor XP 없음, 스트릭 투명), `streak.ts`(partial 미증가), `diagnose.ts`(`floorCompletionRate` 분모에 partial 포함), 히트맵/미러에 별도 음영.
- **`FreeLog.date` 추가** (생성 시 부여); FreeLog 수정은 text/type/시각 가변.
- **개별 기록 수정·삭제 계약** (아래 §3 참조): 행 단위, Alert 확인, 마지막 삭제 시 `unknown` 복귀.
- **백필 규칙**: createdAt~오늘, 미래 차단, timestamp=타깃일 정오(T12:00). append(덮어쓰기 아님).
- **수용 기준 신설**: SPEC §7.3 시나리오+불변식에 맞춘 `classifyDay`/집계 테스트 추가.

> 범위 외(이 재설계와 분리): 이진 회고 정리(§2), 회고 넛지(§7), 측정형/비-SUM 집계, 다기기 동기화 구현.

---

## ★★ 기록 리뷰 개정 반영 (2026-07-08 — SPEC v3.1 / CONCEPT v3.3)

6-렌즈 리뷰로 요구사항을 개정함. 상세 근거·결정은 `~/.claude/plans/spec-elegant-narwhal.md`.
아래는 개정된 스펙을 코드에 반영하는 구현 백로그(위 ★ 마이그레이션과 **함께** 진행).

**1. 마이그레이션 + 정합성 수정 (Part A — 위 ★ 작업에 포함해 한 번에)**
- A1 `classifyDay`: `done` 먼저→`over` 업그레이드(`over⇒done`), `target>floor` 불변식, 방어적 target(≤floor·binary target 무시). `binary⇒floor=1&no target`.
- A2 공정성 누수 차단: 강등(§4.7)은 **partial-제외 rate** 사용. 주의등은 flag 기반 유지(Rule 1 caution은 의도된 기회).
- A3 저표본 가드: `floorCompletionRate`가 `minEngagedDaysForRate` 미만이면 Rule 1/4 미발화.
- A4 결정성: 동일자 백필 timestamp에 증가 오프셋(T12:00:00,01,…), 전순서 `(timestamp ASC, id ASC)`, `effectiveSkipReason` 결정적.
- A5 partial 효과 잠금(0 XP·스트릭 투명·rate 하락, 그 외 없음) + 공정성 문구 재범위화.
- A6 §5.3 동기화 계약 축소(union/tombstone 삭제, 보류 한 줄 + tz/삭제 위험만 메모).

**2. 도메인 순수 함수 추가 (각 `*.test.ts` 동반, SPEC §7.1 표 참고)**
- `describeLogEffect(before,after,habit)→LogEffect` (C1, `score.ts`).
- `atRiskToday`, `engagementStreak`, `showedUpDays` (C2·C3, `streak.ts`).
- `weeklyActualTotals(entries,weeks)` (C4, `statusLight.ts` 또는 `score.ts`).
- `deriveStatusLight`: 하락 절대수준 가드(C5), lifecycle-aware `personal_best`(C6).
- `diagnose` Rule 5 사유-귀속(cue/floor/identity 임계, 성분 dedup) + 저표본 가드(A3) 배선(D·A3).
- `recommend`: identity `warning`→`fill_identity` 매핑 추가.

**3. UI (SPEC §6 — 모두 신규 시각 언어 §6.0로)**
- B1 원탭 `+floor`/`✓` (Today 행 + Dashboard 행), B2 스마트 기본값+빠른칩, B3 시간 접기, B4 Today "어제" 경로, B5 원탭 사유칩 + Dashboard 롱프레스 skip, B6 append 실행취소 토스트 + 결과-인지 삭제.
- C1 로그시점 보상 표시, C2 Today 저장 배너, C4 습관상세 주간 성장 차트, C7a 진행-투-플로어, C7b Forming 기대 문구.

**4. `config/tuning.ts` 신규 상수**
- `diagnosis.minEngagedDaysForRate`(5), `diagnosis.{cue,floor,identity}SkipThreshold`(2), `statusLight.establishedDeclineFloorGuard`(true), `formingToEstablishedDays` Lally 재조정 메모.

**5. 디자인 피벗 (Linear/Notion 적응형, 미니멀 게임화)**
- SPEC §6.0 시각 언어 + `mvp/habiquest-linear.html` 목업(§6.5)이 데모의 "룩" 대체(레이아웃/플로우는 구 데모 참고 유지).
- `src/theme/` 토큰을 라이트+다크 적응형으로 재정의(중립 스케일+단일 accent+day-state/light 시맨틱, 두 테마 모두 blank≠partial≠skip 가독). 골드-RPG → 얇은 진행바·뮤트 칩·작은 상태점.

> **범위 밖(다음 티어 — 스펙에 "V2/deferred"로만 명시, 이번 구현 제외):** cue-drift 규칙(Rule 2b·성공 타임스탬프), 데이터 기반 추천 floor 값, `Habit.aggregation`/`goalDirection` 판별 필드, 행별 `tzOffsetMin`, HabitEntry `cueFired?`/`load` 사유/구조적 per-occurrence 필드/partial-credit XP. HabitEntry는 `{id,habitId,date,timestamp,actual,skipReason?,note?}`로 **동결**.
>
> **선택적 단순화(보류 — 문서 churn↑, 사용자 가치↓):** `over`를 DayState에서 제거하고 히트맵 음영+XP 보너스로만 표현. 채택 시 §3.3/§4.1/§6/§7 광범위 수정.

---

## P0 — 바로 다음에 할 일

### 1. 브라우저 수동 QA (SPEC §7.2 루프 워크스루)
자동 검증은 통과했으나 사람이 직접 본 적은 없음. `npx expo start --web` 로 확인:
- 모든 화면 텍스트가 한글로 자연스럽게 보이는지 (레이아웃 깨짐/줄바꿈 포함).
- **기록 수정 흐름**: Today 피드 항목 탭 → Composer에 값 채워짐 → 시간/수치/메모 수정 → "수정" 저장 → 같은 항목만 갱신(중복 생성 X). 자유 로그 / 습관 기록 / 건너뛰기 각각, "취소"도 확인.
- **저널 수정 흐름**: 습관 상세에서 저널 항목 탭 → 백필 폼 값 채워짐 → 저장 시 해당 항목만 갱신. 건너뛰기 ↔ 수치 전환 확인.

### 2. 이진(yes/no) 습관의 회고 화면 정리 (알려진 결함)
`src/hooks/useReflection.ts` — `actionsFor`가 binary 습관에도 `lower_floor`/`raise_target`를 제안하고, `buildMirror`가 숫자 `actual`을 표시함. yes/no에는 무의미. kind 인지(kind-aware) 처리 필요:
- binary면 floor/target 관련 액션 숨김.
- 미러 셀 값은 숫자 대신 ✓ / – 등으로.

---

## P1 — 자연스러운 다음 기능

### 3. 기록 삭제 (인터뷰 확정: 행 단위 · Alert 확인)
저장소에 `deleteEntry`/`deleteLog`가 이미 있음. UI만 추가하면 됨:
- **개별 기록 단위**로만 삭제(스와이프 또는 수정 폼 내 "삭제" 버튼). "하루 전체 지우기"는 없음.
- 삭제 확인은 네이티브 **Alert**(undo-토스트 미도입), 전 삭제에 일관 적용 → `useToday`/`useHabitDetail`에 `remove(id)` 핸들러 추가 → reload.
- **마지막 남은 기록**을 지우면 그날은 `unknown` 복귀(스트릭이 깨져도 경고 없음 — blank 의미와 일관).

### 4. 백필 = append (인터뷰로 재해석 — 더 이상 "버그"가 아님)
`app/habit/[id].tsx` — 히트맵 셀 탭 / "+ 과거 기록 추가"가 같은 날짜에 `newId()`로 새 기록을 또 만드는 동작은 **다중 기록 모델에서 의도된 동작**(append). 따라서 "upsert로 수정"하지 **않음**. 남는 실제 과제:
- 특정 행을 고치려면 **저널 항목 탭 → 개별 수정/삭제**(§3)로 진입(날짜 기준 upsert가 아님).
- 백필 timestamp는 타깃일 **정오(T12:00)** 고정(현행 `nowTimestamp()` 폐지) — 정렬/타이브레이크 정합.
- 미래 날짜·createdAt 이전 날짜는 백필 차단.

### 5. 수정 시 시간 정밀도 (인터뷰로 해소)
~~결정 필요~~ → **백필 timestamp를 타깃일 정오(T12:00) 고정**으로 결정(§4). 임의 분이 더 이상 생기지 않으므로 Today 수정 진입 시의 10분 내림(`toInitial`) 불일치도 사라짐. 단, `date`가 그룹핑 권위이고 `timestamp`는 정렬/타이브레이크 전용이므로 분 단위 정밀도 자체는 표시·정렬에만 영향.

---

## P2 — 인프라 / 장기

### 6. 클라우드 동기화 (Supabase)
`src/data/SupabaseRepository.ts`는 전 메서드가 `throw "not yet configured"`인 스텁. 현재는 로컬 저장소만 동작(AsyncStorage / 웹 IndexedDB). 다기기 동기화가 필요해지면 구현 + `RepositoryContext`에서 주입 교체.
- **동기화 계약(자리표시자, SPEC §5.3)**: 엔트리/프리로그는 id 기반 append-only 이벤트 → sync는 **id union**, 삭제는 **tombstone**. 일자 상태가 계산값이라 행별 상태 충돌 해소가 불필요. 구현 시 이 계약을 따를 것.

### 7. 회고 넛지 / 알림
`src/config/tuning.ts`의 `reflectionWeekday`(넛지 요일)는 값만 있고 실제 알림/스케줄링 코드는 없음. 알림 기능 도입 여부 및 방식(expo-notifications 등) 검토 — SPEC의 회고 트리거 요구사항 재확인.

### 8. 다국어/i18n 재고 (필요 시)
현재 한글은 인라인 하드코딩이고 언어 전환은 없음(요청 범위). 추후 영어 등 추가가 필요하면 문자열을 중앙 모듈/ i18n 라이브러리로 추출하는 리팩터링 필요. 날짜/요일 포맷도 현재 한국어 전용(`src/util/date.ts`).

### 9. 테스트 보강
훅 단위 테스트가 없음(도메인/저장소 레벨만 존재). 새로 추가한 수정 경로(`useToday.update`, `useHabitDetail.editEntry`)와 컴포넌트 상호작용에 대한 훅/컴포넌트 테스트 추가 검토.

---

## 검증 방법 (공통)
- 타입: `npx tsc --noEmit`
- 단위 테스트: `npm test`
- 웹 번들: `npx expo export --platform web`
- 수동: `npx expo start --web` (또는 `--ios` / `--android`)
