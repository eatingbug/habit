# Writing Rules

- Reference for `CLAUDE.md` §5. The rules themselves live there, and only there.
- This file holds the rationale and a before/after pair per rule.
- Examples are Korean because the outputs are Korean.
- Every "before" is quoted from this repo's log at the commit hash shown. `…` marks an elision.

## What the rules cover

- PR titles and commit titles: the title rules and the style clauses.
- PR bodies: the `pr` skill template. Squash merge records the PR body on `main`.
- Commit bodies: free form, footers kept.
- Issues, ADRs, repo docs: the style clauses only.
- Code comments and docblocks: nothing here applies. They keep their English conventions.
- Agent chat replies: out of scope.

## Titles

- The last English Conventional Commits title in this history is `f2fa0ce`. Korean prose
  titles began after it. The type prefix restores an older convention here.
- `chore` collects everything unless the other six are ruled out first. Hence the ordering.
- The 50-character limit is measured on the title body. The `feat: ` prefix and the `(#N)`
  GitHub appends are excluded, because neither is written by the author.
- A title that needs `·` reports a PR shape problem. In the 25 commits before this rule the
  median title was 47 characters and the max 66, and the excess came from listing three to
  five items in one title.

```
before  8702b30  진행도: 대시보드 스탯 카드 · 로그시점 보상 · 주간 XP 필
after            feat: 진행도 대시보드와 주간 XP 필 추가
```

## Style clauses

### 1. No mid-sentence em dash

- The dominant defect before this rule. #74 counted 210 occurrences in 25 commit bodies.
- The dash usually joins two sentences. Write both.

```
before  1509670  따라갈 수 없는 결정 번호 19개를 지운다 — 근거는 이미 주석 안에 있다
after            docs: 따라갈 수 없는 결정 번호 19개 삭제
```

### 2. No first person

- 7 occurrences before this rule. A reader of `git log` cannot resolve `내`.

```
before  1ed9a8c  …경로만 남기도록 정리했다 — 내 변경이 만든 고아다.
after            …경로만 남기도록 정리했다. 이 변경이 줄 번호를 밀어냈다.
```

### 3. No personification, no metaphor

- 21 occurrences before this rule, including `병`, `고질병`, `사는 곳`.

```
before  1ed9a8c  숫자의 외부 근거는 44 가 실제로 사는 곳, 즉 토큰 자신의
                 docblock 에 적는다.
after            숫자의 외부 근거는 `TAP_TARGET` 토큰의 docblock 에 적는다.
```

### 4. One glossary term per concept

- `CONTEXT.md` defines the terms and lists the synonyms to avoid under `_Avoid_`.

```
before  f17365e  …피드 제목과 빈 날 문구…        (`빈 날` is an _Avoid_ entry for `missed`)
after            …피드 제목과 `missed` 문구…
```

## Trimmed in #173

- The `pr` skill template took over PR bodies. Squash merge now records the PR body.
- The commit body template (`## 문제` `## 변경` `## 검증`) repeated the PR body, so it went.
- The notation rules went with it. The `pr` template sets PR body notation.
- Four style clauses went: one fact per sentence, 20 eojeol, three nouns in a row, closing aphorisms.
- The remaining four were the frequent defects that #74 measured.
- No rule-violation checker. Review applies these rules.
