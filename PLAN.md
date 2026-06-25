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

### 3. 기록 삭제
저장소에 `deleteEntry`/`deleteLog`가 이미 있음. UI만 추가하면 됨:
- Today 피드 / 저널 항목에 삭제 어포던스(롱프레스 또는 수정 폼 내 "삭제" 버튼).
- 삭제 확인(Alert) → `useToday`/`useHabitDetail`에 `remove(id)` 핸들러 추가 → reload.

### 4. 백필 중복 방지 (알려진 기존 동작)
`app/habit/[id].tsx` — 히트맵 셀 탭 / "+ 과거 기록 추가"는 이미 기록이 있는 날짜에도 `newId()`로 **새 기록을 또 만듦**(같은 날짜 중복). 수정은 저널 항목 탭으로만 진입함. 개선안:
- 백필 시 해당 날짜에 기존 기록이 있으면 그 기록을 수정하도록 분기(날짜 기준 upsert) — 또는 히트맵 셀 탭 시 기존 기록이 있으면 `openEditEntry`로 라우팅.

### 5. 수정 시 시간 정밀도
Composer 분(minute) 피커는 10분 단위만 제공. 백필 기록은 `nowTimestamp()`로 임의 분이 저장되므로 Today에서 수정 진입 시 10분 단위로 내림됨(`toInitial`). 결정 필요: 분 단위 자유 입력 허용 vs 현재대로 내림 유지.

---

## P2 — 인프라 / 장기

### 6. 클라우드 동기화 (Supabase)
`src/data/SupabaseRepository.ts`는 전 메서드가 `throw "not yet configured"`인 스텁. 현재는 로컬 저장소만 동작(AsyncStorage / 웹 IndexedDB). 다기기 동기화가 필요해지면 구현 + `RepositoryContext`에서 주입 교체.

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
