# Writing Rules

- Reference for `CLAUDE.md` §5. The rules themselves live there, and only there.
- This file holds the rationale, the exceptions, and a before/after pair per style clause.
- Examples are Korean because the outputs are Korean.
- Every "before" is quoted from this repo's log at the commit hash shown. `…` marks an elision.

## What the rules cover

- PRs and commits: every rule group, title template included.
- Issues, ADRs, repo docs: the style clauses and the notation rules only.
- Code comments and docblocks: nothing here applies. They keep their English conventions.
- Agent chat replies: out of scope.
- This repo squash-merges. The PR body becomes the commit body, so they are one text.

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

## Bodies

- A body has to read in `git log`, which renders no Markdown. Tables survive there under a
  four-space indent, confirmed by inspection. Bold and blockquotes do not.
- Reasons stay out of `## 변경` so that a reader comparing the diff to the text has one
  place to look for each question.

## Style clauses

### 1. One sentence, one fact

```
before  61ca747  둘 다 `public/` 에 정적 파일로 두고, 등록은 `app/+html.tsx` 의
                 인라인 스크립트로 넣는다 — export 산출물을 기본 껍데기와 diff 해서
                 스크립트가 `dist/index.html` 에 그대로 들어가는 것을 확인했고,
                 그래야 등록이 앱 트리의 하이드레이션에 기대지 않는다.
after            manifest 와 `sw.js` 는 `public/` 에 정적 파일로 둔다.
                 등록은 `app/+html.tsx` 의 인라인 스크립트가 한다.
                 export 산출물에 스크립트가 그대로 들어가는 것을 diff 로 확인했다.
```

### 2. 20 eojeol per sentence

- Eojeol (어절) are whitespace-separated chunks. The limit approximates the 20-word limit
  in ASD-STE100 Part 1. It is a conversion, not a number from the standard.
- Measured before this rule: median 12 eojeol, top decile 25, max 71.

```
before  61d325f  515개 훅 테스트가 그 prop 으로 `LocalRepository over MemoryKV` 를
                 주입하고 `SessionProvider` 를 세우지 않으므로, 세션은 throw 하는
                 훅이 아니라 컨텍스트를 직접 읽어 본다.  (25어절)
after            515개 훅 테스트는 `SessionProvider` 를 세우지 않는다.
                 그래서 세션은 컨텍스트를 직접 읽는다.  (7어절 + 4어절)
```

### 3. Three nouns in a row

- Count terms, not whitespace chunks. A fixed compound such as `글쓰기 규칙`
  counts as one term. The checker ticket needs this convention.

```
before  bc0c7c4  예약 워크플로우 비활성화 판단을 파일 머리말에 남긴다: …
after            예약 워크플로우가 언제 꺼지는지를 파일 머리말에 적는다.
```

### 4. One glossary term per concept

- `CONTEXT.md` defines the terms and lists the synonyms to avoid under `_Avoid_`.

```
before  f17365e  …피드 제목과 빈 날 문구…        (`빈 날` is an _Avoid_ entry for `missed`)
after            …피드 제목과 `missed` 문구…
```

### 5. No mid-sentence em dash

- The dominant defect before this rule. #74 counted 210 occurrences in 25 commit bodies.
- The dash usually joins two sentences. Write both.

```
before  1509670  따라갈 수 없는 결정 번호 19개를 지운다 — 근거는 이미 주석 안에 있다
after            docs: 따라갈 수 없는 결정 번호 19개 삭제
```

### 6. No aphorism as a closing line

- 7 occurrences before this rule. A closing verdict gives the reader nothing to check.

```
before  1ed9a8c  주석이 참이 되도록 권위 문서를 고치는 것은 코드에 맞춰 사양을
                 쓰는 것이라 이 티켓이 다루는 병 그 자체다.
after            주석에 맞춰 사양을 고치면 #15 가 고친 결함이 되돌아온다.
```

### 7. No personification, no metaphor

- 21 occurrences before this rule, including `병`, `고질병`, `사는 곳`.

```
before  1ed9a8c  숫자의 외부 근거는 44 가 실제로 사는 곳, 즉 토큰 자신의
                 docblock 에 적는다.
after            숫자의 외부 근거는 `TAP_TARGET` 토큰의 docblock 에 적는다.
```

### 8. No first person

- 7 occurrences before this rule. A reader of `git log` cannot resolve `내`.

```
before  1ed9a8c  …경로만 남기도록 정리했다 — 내 변경이 만든 고아다.
after            …경로만 남기도록 정리했다. 이 변경이 줄 번호를 밀어냈다.
```

## On ASD-STE100

- The standard has two parts: Part 1 writing rules, Part 2 an approved vocabulary of about
  900 English words.
- Part 2 is English-only and cannot be ported to Korean. Clause 4 uses `CONTEXT.md` instead.
- Clauses 1 through 4 borrow the language-independent rules of Part 1. Clauses 5 through 8
  come from measuring this repo's log.
- Nothing here claims conformance to ASD-STE100.

## Not covered

- A rule-violation checker. Separate ticket, per #74. It has to skip inline code and fenced
  blocks, because this file quotes the banned constructs as examples.
- Retroactive edits to existing commits, PRs, and issues.
- Release automation from the type prefixes. This repo has no release pipeline.
