# PLAN — 앞으로 진행할 작업

Habiquest (Expo/TypeScript 습관 트래커). 스펙은 `docs/SPEC.md`, 개념은 `docs/CONCEPT.md` 참고.

## 현재까지 완료된 것 (요약)
- **도메인 엔진** (`src/domain/*` + 테스트): classify / score / streak / diagnose / recommend / statusLight / lifecycle / **logging**.
- **저장소** (`src/data/*`): `HabitRepository` 인터페이스 + KV 시임(Memory / AsyncStorage / Localforage) + `LocalRepository`.
- **UI 4개 화면 + 생성 모달 + 통합 Composer** (`app/`, `src/components/*`, `src/hooks/*`).
- **이진(yes/no) 습관 타입 + 누적 XP→레벨 진행** (`Habit.kind: 'count' | 'binary'`).
- **한글 UI** — 모든 사용자 노출 텍스트 인라인 한글화(i18n 없음), 날짜/요일 한글 포맷.
- **v3.1 기록 마이그레이션 (Phase 1)** — 사실만 저장 + 계산된 일자 상태(`classifyDay`, `partial`), Part A 정합성.
- **UI Phase (Phase 2)** — 2a facts-only 완성 · 2b §6.0 적응형 라이트+다크 피벗 · 2c B-tier 원탭 로깅. (아래 ★/★★ 참고)
- **검증 게이트**: `tsc --noEmit` 0, `jest` **245** green, `expo export --platform web` 9개 라우트 정상.

> 현재 작업 브랜치 `recording-v3.1` (커밋 `16c0445`, `8e0a253`, `7664a6a`, `54f3243`, `bc88ae3` + 문서 `42109c1`). `main`은 아직 초기 커밋 `91c94a0` — 원하면 fast-forward. 상세 진행: `~/.claude/plans/spec-elegant-narwhal.md` (+ 테마 설계 `-agent-ac41aad77be71d3b2.md`).

---

## ✅ ★ 기록 서브시스템 재설계 — 완료 (Phase 1 + UI Phase)

문서(SPEC v3 / CONCEPT v3.2)의 **다중 기록 + 일자 집계** 모델을 코드에 반영 완료:
- ✅ `classifyDay`(`unknown|partial|done|over|skip`) + `effectiveSkipReason` + `isMissDay`; 행별 `classifyEntry` 폐지.
- ✅ `HabitEntry`에서 저장 `state` 제거 → 사실만(`{id,habitId,date,timestamp,actual,skipReason?,note?}`). skip 행 = `actual:0`+`skipReason`.
- ✅ `partial` 전파: score(0 XP·스트릭 투명) / streak(미증가) / diagnose(rate 분모 포함) / 히트맵·미러 별도 음영.
- ✅ `FreeLog.date` 추가(write-side 포함).
- ✅ 개별 기록 수정·삭제 계약(행 단위, 결과-인지 Alert, 마지막 삭제 시 `unknown` 복귀).
- ✅ 백필 규칙(createdAt~오늘, 미래 차단, 타깃일 정오 timestamp + 동일자 증가 오프셋, append).
- ✅ 수용 기준(SPEC §7.3) `classifyDay`/집계/`logging` 테스트.

---

## ★★ 기록 리뷰 개정 (SPEC v3.1 / CONCEPT v3.3) — 부분 완료

**1. 마이그레이션 + 정합성 (Part A) — ✅ 완료 (Phase 1)**
A1(done→over·`target>floor`·방어 target)·A2(강등 partial-제외 rate)·A3(`minEngagedDaysForRate` 저표본 가드)·A4(증가 오프셋·전순서·결정적 `effectiveSkipReason`)·A5(partial 효과 잠금)·A6(§5.3 동기화 계약 축소, 문서).

**2. 도메인 순수 함수 (C/D) — ⏳ 미착수 = "Domain Phase 2"**
- `describeLogEffect` (C1, `score.ts`).
- `atRiskToday` / `engagementStreak` / `showedUpDays` (C2·C3, `streak.ts`).
- `weeklyActualTotals` (C4, `statusLight.ts` 또는 `score.ts`).
- `deriveStatusLight`: 하락 절대수준 가드(C5), lifecycle-aware `personal_best`(C6).
- `diagnose` Rule 5 사유-귀속(cue/floor/identity 임계) + 저표본 가드 배선(D).
- `recommend`: identity `warning`→`fill_identity` 매핑.

**3. UI (§6, 모두 §6.0 시각 언어) — 부분**
- ✅ **B-tier (2c)**: B1 원탭 `+floor`/`✓`(Dashboard 행) · B2 스마트 기본값+빠른칩 · B3 시간 접기 · B4 "어제"/날짜 스테퍼 · B5 원탭 사유칩 + Dashboard 롱프레스 skip · B6 실행취소 토스트 + 결과-인지 삭제 · C7a 진행-투-플로어.
- ⏳ **C-tier 성장 UI** (§2 순수 함수 의존): C1 로그시점 보상 표시 · C2 never-miss-twice 배너 · C4 습관상세 주간 성장 차트 · C7b Forming 기대 문구. (C3 나타남 스트릭 pill 포함.)
- 참고: 원탭은 Dashboard에 구현(Today는 Composer가 커버). Today per-habit 원탭 스트립은 미구현(선택).

**4. `config/tuning.ts` 상수 — 부분**
- ✅ `diagnosis.minEngagedDaysForRate`(5).
- ⏳ `diagnosis.{cue,floor,identity}SkipThreshold`(2), `statusLight.establishedDeclineFloorGuard`(true), `formingToEstablishedDays` Lally 재조정 — §2(D·C5)와 함께.

**5. 디자인 피벗 (Linear/Notion 적응형) — ✅ 완료 (2b)**
- `src/theme/tokens.ts` 라이트+다크 `ColorTheme`(중립 스케일 + 단일 indigo accent + day-state/status 시맨틱 + weak 변형 + shadow) + 소형 타입 스케일 + 시스템 폰트.
- `ThemeProvider`(OS-follow + system→dark→light 토글) + `useThemedStyles(makeStyles)`. `Gradient.tsx` 삭제(깊이 = 테두리 + 옅은 그림자). 모든 컴포넌트/화면 `makeStyles` 전환. 히트맵 플랫 5색.
- `app.json` automatic + 다크 splash, `+html` prefers-color-scheme, 테마 셸/StatusBar/탭바.
- 목업 `mvp/habiquest-linear.html`(§6.5)이 "룩" 소스오브트루스.

> **범위 밖(V2/deferred):** cue-drift(Rule 2b), 데이터 기반 추천 floor, `Habit.aggregation`/`goalDirection`, 행별 `tzOffsetMin`, HabitEntry `cueFired?`/`load`/per-occurrence/partial-credit. HabitEntry는 `{id,habitId,date,timestamp,actual,skipReason?,note?}`로 **동결**.
>
> **선택적 단순화(보류):** `over`를 DayState에서 제거하고 음영+XP로만 표현.

---

## P0 — 바로 다음에 할 일

### 1. 브라우저 수동 QA (⏳ 진행 예정)
자동 게이트는 통과했으나 **아직 브라우저에서 눈으로 확인 안 함**. `npx expo start --web`으로:
- **라이트/다크** 두 테마를 목업 `mvp/habiquest-linear.html`과 대조(헤더 토글 ◐/☾/☀ + OS 설정). 단일 indigo accent, 얇은(hairline) 테두리, 플랫 진행바/5색 히트맵, gradient/glow 없음, mono 숫자, 한글 시스템 폰트, `blank≠partial≠skip` 가독.
- **원탭 로깅(B1)**: Dashboard 행 `+floor`/`✓` → 즉시 갱신 + 실행취소 토스트. 이진 완료 후 `완료 ✓` 비활성. 롱프레스 히트맵 today 셀 → 사유칩(B5).
- **Composer(B2·B3·B4·C7a)**: 스마트 기본값, `+1/+floor/직전값` 칩, `🕑 지금` 접기, `오늘/어제` 스테퍼, 진행-투-플로어 미리보기.
- **삭제(B6)**: Today 수정 모드 · 저널 수정 폼의 `삭제` → 결과-인지 확인("이 날이 비워지고 N일 스트릭…"). 자유 로그는 즉시 삭제.
- **SPEC §7.2 루프**: 다중기록 → feed 2행·히트맵 1 done 셀, 편집/삭제 live 재분류, 어제 백필 2회 skip → 🔴, 🔴 탭 → 회고(근거 표시) → commit → 재로드 시 등 해제.

### 2. 이진(yes/no) 습관의 회고 화면 정리 (⏳ 알려진 결함, 미해결)
`src/hooks/useReflection.ts` — `actionsFor`가 binary에도 `lower_floor`/`raise_target` 제안, `buildMirror`가 숫자 표시(현재는 done/over 시 `sumActual`). yes/no에는 무의미:
- binary면 floor/target 관련 액션 숨김.
- 미러 셀 값은 숫자 대신 ✓ / – 로.

---

## P1 — 자연스러운 다음 기능

### 3. Domain Phase 2 + C-tier 성장 UI (★★ §2 + §3 C-tier + §4 잔여)
위 ★★ **2** 순수 함수를 먼저 구현(각 `*.test.ts` 동반) → 그다음 **3**의 C-tier 성장 UI를 §6.0 룩으로 배선. `tuning.ts` 잔여 상수(§4)도 함께. C-tier UI는 이 순수 함수들에 의존하므로 순서 고정.

### 4. (완료) 기록 삭제 · 백필 append · 시간 정밀도
- ✅ 삭제: 행 단위 + 결과-인지 Alert(단순 Alert 대신 스트릭/공백 경고), `useToday`/`useHabitDetail`에 `requestDelete`/`removeEntry`.
- ✅ 백필: 같은 날짜 append(덮어쓰기 아님), 타깃일 정오 timestamp + 동일자 증가 오프셋, 미래/생성 이전 차단.
- ✅ 시간 정밀도: 백필 정오 고정으로 해소.

---

## P2 — 인프라 / 장기

### 5. 클라우드 동기화 (Supabase)
`src/data/SupabaseRepository.ts`는 전 메서드 스텁. 현재 로컬만(AsyncStorage / 웹 IndexedDB). 다기기 필요 시 구현 + `RepositoryContext` 주입 교체. 동기화 계약은 SPEC §5.3(보류) 참고 — 일자 상태가 계산값이라 행 상태 충돌 해소 불필요, id union + append-only.

### 6. 회고 넛지 / 알림
`tuning.ts`의 `reflectionWeekday`는 값만 있고 스케줄링 코드 없음. expo-notifications 등 도입 검토.

### 7. 다국어/i18n (필요 시)
한글 인라인 하드코딩, 언어 전환 없음. 영어 등 추가 시 문자열 중앙화/i18n 리팩터 + `src/util/date.ts` 포맷 일반화.

### 8. 테스트 보강
도메인/저장소 + `logging` 순수 함수는 테스트됨. 훅(`useToday`/`useDashboard`/`useHabitDetail`)·컴포넌트 상호작용 테스트는 없음 — 낙관적 갱신/삭제 가드/원탭 경로에 추가 검토.

### 9. 테마 토글 영속화 (소형 후속)
`ThemeProvider`의 `pref`는 현재 인메모리(system→dark→light). AsyncStorage(`AsyncStorageKV` 존재)로 하이드레이트/저장하는 ~10줄 후속.

---

## 검증 방법 (공통)
- 타입: `npx tsc --noEmit`
- 단위 테스트: `npm test`
- 웹 번들: `npx expo export --platform web`
- 수동: `npx expo start --web` (또는 `--ios` / `--android`)
