# design/ — Habiquest 화면 설계 캔버스

`docs/SPEC.md` §6의 시각 기준인 리디자인(#89) 아트보드입니다. 근거는 ADR-0007입니다.

- `_tokens.redesign.css` — 토큰과 컴포넌트 클래스 (모든 아트보드가 공유)
- `parts/redesign/<Name>.body.html` — 아트보드 템플릿. 정적 그림이고 인터랙션 로직은 없음
- `parts/redesign/_icons.svg` — Lucide 선 아이콘
- `canvas.json` — 캔버스 배치 / 페이지 / 주석
- `<Name>.dc.html`(라이트), `<Name>.dark.dc.html`(다크) — `node build.mjs` 로 파트 하나에서 함께 생성되는 아트보드 파일 (직접 편집하지 말 것)

수정 절차: `parts/redesign/` 를 고치고 `node build.mjs` 실행 → 캔버스 재시딩.
빌드 산출물인 `habiquest-design-canvas.html` 은 커밋하지 않습니다(.gitignore).
