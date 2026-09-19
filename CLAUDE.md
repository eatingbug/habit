# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Writing Rules

- Applies to: PR titles and bodies, commit messages, issues, ADRs, repo docs.
- Does not apply to: code comments, docblocks, agent chat replies.
- Rationale and before/after examples: `docs/agents/writing.md`.

### Titles (PRs and commits only)

- Prefix with one type: `feat` `fix` `docs` `refactor` `test` `ci` `chore`. No scope.
- Choose `chore` only after ruling out the other six.
- Noun phrase. No finite-verb sentence.
- 50 characters max, excluding the `type: ` prefix and the `(#N)` GitHub appends.
- No `·` or `+` lists. One title, one change.
- Over the limit, or unwritable without a list: split the PR. Generalize only if it cannot split.

### Bodies (PRs and commits only)

- Required, in order: `## 문제` `## 변경` `## 검증`.
- Optional, and nothing else: `## 트레이드오프` `## 범위 밖`.
- `## 문제`: bullets labelled `증상`, `원인`, `영향`.
- `## 변경`: what was done. No reasons.
- `## 검증`: commands and their output, verbatim. Nothing to verify: `- 동작 변경 없음`.
- Omit the whole body when the title states the change in full.
- Keep the footers: `Closes #N`, `Co-Authored-By:`.

### Style

- One sentence, one fact.
- 20 eojeol (어절) per sentence, max.
- Three noun terms in a row, max. A fixed compound counts as one term.
- One glossary term per concept. Use the term `CONTEXT.md` defines. No synonyms.
- No `—` inside a sentence. Write two sentences.
- No aphorism or maxim as a closing line.
- No personification, no metaphor.
- No first person.

### Notation

- Bullets throughout. No prose paragraphs.
- Markdown allowed: bullets, one level of nesting, tables, code fences, inline code.
- Markdown banned: bold, italic, blockquote, horizontal rule, nesting past one level.
- Tables only for a comparison of 3 or more rows and 2 or more columns.
- Identifiers, file paths and tool names: English original, in backticks.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `eatingbug/habit`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels, unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Writing rules

Korean output style for PRs, commits, issues and docs. See `docs/agents/writing.md`.
