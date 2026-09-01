# design/ — Habiquest 화면 설계 캔버스

`docs/CONCEPT.md` · `docs/SPEC.md` 를 근거로, `mvp/habiquest-linear.html` 의 토큰·컴포넌트
어휘를 그대로 써서 만든 화면 설계 아트보드들입니다.

- `_tokens.css` — 목업에서 가져온 토큰 + 컴포넌트 클래스 (모든 아트보드가 공유)
- `parts/<Name>.body.html` — 아트보드 템플릿
- `parts/<Name>.logic.js` — (있는 경우) 인터랙션 로직
- `canvas.json` — 캔버스 배치 / 페이지 / 주석
- `<Name>.dc.html` — `node build.mjs` 로 생성되는 아트보드 파일 (직접 편집하지 말 것)

수정 절차: `parts/` 를 고치고 `node build.mjs` 실행 → 캔버스 재시딩.
빌드 산출물인 `habiquest-design-canvas.html` 은 커밋하지 않습니다(.gitignore).
