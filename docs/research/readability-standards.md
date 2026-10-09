# 쉬운 화면의 가독성 기준

- 질문: 쉬운 화면에 필요한 최소 수치를 찾는다.
- 대상: 글씨 크기, 터치 영역, 색 대비, 아이콘과 라벨.
- 1차 출처: WCAG 2.2, Apple HIG, Material Design 3.
- 관련 이슈: #92, 맵 #89.
- 조사일: 2026-10-09.

## 요약

| 항목 | 기준 하한 | 쉬운 화면 권장값 | 근거 |
| --- | --- | --- | --- |
| 본문 글씨 | iOS 최소 11pt | 17 이상 | HIG 기본 17pt |
| 라벨 글씨 | M3 Label Small 11sp | 14 이상 | M3 Body Medium 14sp |
| 터치 영역 | WCAG AA 24px | 48x48 이상 | M3 48dp, HIG 44pt |
| 텍스트 대비 | AA 4.5:1 | 7:1 목표 | WCAG AAA 7:1 |
| 비텍스트 대비 | AA 3:1 | 3:1 이상 | WCAG 1.4.11 |
| 색만 쓰기 | 금지 (Level A) | 아이콘과 글자 병기 | WCAG 1.4.1 |

- 권장값 열은 출처의 기본값에서 고른 값이다.
- 권장값 자체는 이 문서의 판단이다.

## 1. 글씨 크기

### Apple HIG

- iOS 기본 글씨 크기는 17pt다.
- iOS 최소 글씨 크기는 11pt다.
- 출처: <https://developer.apple.com/design/human-interface-guidelines/typography>
- 같은 표가 접근성 페이지에도 있다.
- 출처: <https://developer.apple.com/design/human-interface-guidelines/accessibility>
- iOS 기본 Dynamic Type 크기(Large)에서 Body는 17pt다.
- 같은 크기에서 Footnote는 13pt, Caption 1은 12pt다.
- HIG는 글씨 굵기도 가독성에 영향을 준다고 적는다.
- HIG는 글씨가 커질 때 말줄임을 최소로 하라고 적는다.

### Material Design 3

- Body Large는 16sp다.
- Body Medium은 14sp다.
- Label Large는 14sp다.
- Label Small은 11sp다.
- Title Large는 22sp다.
- 출처: `androidx` Compose Material 3 토큰 소스.
- <https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt>
- 공식 문서: <https://m3.material.io/styles/typography/type-scale-tokens>

### WCAG 2.2

- WCAG는 최소 글씨 크기를 정하지 않는다.
- 1.4.4 Resize Text(AA)는 200%까지 확대해도 내용과 기능이 유지되기를 요구한다.
- 큰 글씨 정의는 18pt 이상 또는 굵은 14pt 이상이다.
- CSS 단위로는 약 24px과 18.5px이다.
- 출처: <https://www.w3.org/TR/WCAG22/#dfn-large-scale>
- 출처: <https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html>

### 한글 고려

- WCAG는 CJK 글꼴에 "같은 크기에 해당하는 크기"를 쓰라고만 적는다.
- WCAG Note 5는 그 크기를 각 언어의 큰 활자 기준으로 정하라고 적는다.
- WCAG는 한글의 구체 수치를 주지 않는다.
- 출처: <https://www.w3.org/TR/WCAG22/#dfn-large-scale>
- 따라서 한글에는 라틴 기준을 그대로 쓰는 편이 보수적이다.
- 이 문장은 출처가 아닌 추론이다.
- React Native의 `fontSize`는 iOS pt, Android dp 단위다.
- `allowFontScaling`을 끄면 Dynamic Type과 1.4.4 확대가 막힌다.

## 2. 터치 영역

| 출처 | 기본 | 최소 |
| --- | --- | --- |
| WCAG 2.5.8 (AA) | 해당 없음 | 24x24 CSS px |
| WCAG 2.5.5 (AAA) | 해당 없음 | 44x44 CSS px |
| Apple HIG (iOS) | 44x44 pt | 28x28 pt |
| Material 3 / Android | 48x48 dp | 48x48 dp |

- WCAG 2.5.8은 24px 미만 목표에 간격 예외를 둔다.
- 예외 조건은 24px 원끼리 겹치지 않는 것이다.
- 출처: <https://www.w3.org/TR/WCAG22/#target-size-minimum>
- 출처: <https://www.w3.org/TR/WCAG22/#target-size-enhanced>
- HIG 버튼 페이지는 히트 영역을 44x44pt 이상으로 하라고 적는다.
- HIG는 컨트롤 사이 간격도 크기만큼 중요하다고 적는다.
- 출처: <https://developer.apple.com/design/human-interface-guidelines/buttons>
- 출처: <https://developer.apple.com/design/human-interface-guidelines/accessibility>
- Android 문서는 터치 영역을 48x48dp 이상으로 권장한다.
- 출처: <https://developer.android.com/guide/topics/ui/accessibility/apps>
- Compose M3 `minimumInteractiveComponentSize`는 48dp를 기본으로 둔다.
- 출처: <https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/InteractiveComponentSize.kt>
- 공식 문서: <https://m3.material.io/foundations/designing/structure>
- 48x48을 쓰면 세 출처의 기본값을 모두 만족한다.

## 3. 색 대비

| 대상 | AA | AAA |
| --- | --- | --- |
| 일반 텍스트 | 4.5:1 | 7:1 |
| 큰 텍스트 | 3:1 | 4.5:1 |
| UI 컴포넌트와 그래픽 | 3:1 | 해당 없음 |

- 1.4.3 Contrast (Minimum)은 AA 기준이다.
- 1.4.6 Contrast (Enhanced)은 AAA 기준이다.
- 1.4.11 Non-text Contrast는 컨트롤 경계와 상태 표시에 3:1을 요구한다.
- 상태등처럼 의미를 가진 그래픽도 1.4.11 대상이다.
- 출처: <https://www.w3.org/TR/WCAG22/#contrast-minimum>
- 출처: <https://www.w3.org/TR/WCAG22/#contrast-enhanced>
- 출처: <https://www.w3.org/TR/WCAG22/#non-text-contrast>
- HIG는 17pt 이하 텍스트에 4.5:1을 요구한다.
- HIG는 18pt 이상과 굵은 텍스트에 3:1을 요구한다.
- HIG는 라이트와 다크 모드 모두에서 대비를 확인하라고 적는다.
- 출처: <https://developer.apple.com/design/human-interface-guidelines/accessibility>
- Android 문서는 18sp 미만 또는 굵은 14sp 미만 텍스트에 4.5:1을 요구한다.
- 출처: <https://developer.android.com/guide/topics/ui/accessibility/apps>

## 4. 아이콘, 라벨, 색에만 의존하지 않기

- WCAG 1.4.1 Use of Color는 Level A다.
- 색은 정보 전달의 유일한 시각 수단이 될 수 없다.
- 출처: <https://www.w3.org/TR/WCAG22/#use-of-color>
- HIG는 색 외의 수단으로도 정보를 전달하라고 적는다.
- HIG는 그 수단으로 텍스트 라벨과 글리프 모양을 예로 든다.
- 출처: <https://developer.apple.com/design/human-interface-guidelines/color>
- HIG 탭 바는 탭마다 심볼과 텍스트 라벨을 함께 두라고 적는다.
- 출처: <https://developer.apple.com/design/human-interface-guidelines/tab-bars>
- HIG는 아이콘과 옆 텍스트의 굵기를 맞추라고 적는다.
- HIG는 커스텀 아이콘에 대체 텍스트 라벨을 달라고 적는다.
- 출처: <https://developer.apple.com/design/human-interface-guidelines/icons>
- Android 문서는 아이콘에 목적을 설명하는 `contentDescription`을 달라고 적는다.
- 출처: <https://developer.android.com/guide/topics/ui/accessibility/apps>
- 상태색에는 아이콘 모양과 글자를 함께 붙여야 1.4.1을 만족한다.
- 예: 초록 원 대신 체크 아이콘과 "했어요" 글자를 함께 쓴다.
- 이 예시는 출처가 아닌 적용안이다.

## 5. 조사 한계

- `m3.material.io`는 스크립트로 그려져 본문을 직접 읽지 못했다.
- Material 수치는 `androidx` 소스와 Android 문서로 확인했다.
- 한글 큰 활자 기준의 국내 1차 출처는 확인하지 못했다.
- "초등학생도 한눈에"를 수치로 정한 1차 출처는 찾지 못했다.
- 권장값은 위 기준의 기본값과 AAA 값에서 고른 것이다.
