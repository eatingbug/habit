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

- Applies to: PR titles, commit titles, issues, ADRs, repo docs.
- Does not apply to: code comments, docblocks, agent chat replies.
- PR bodies follow the `pr` skill template. Keep the `Closes #N` footer.
- Squash merge records the PR body on `main`. Commit bodies are free form; keep the `Closes #N` and `Co-Authored-By:` footers.
- Rationale and before/after examples: `docs/agents/writing.md`.

### Titles (PRs and commits)

- Prefix with one type: `feat` `fix` `docs` `refactor` `test` `ci` `chore`. No scope.
- Choose `chore` only after ruling out the other six.
- Noun phrase, 50 characters max, excluding the `type: ` prefix and the `(#N)` GitHub appends.
- One title, one change. Over the limit: split the PR.

### Style

- Write two sentences where a `—` would join them.
- Write without first person, personification or metaphor.
- Use the term `CONTEXT.md` defines for each concept.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `eatingbug/habit`, via the `gh` CLI. See `docs/agents/issue-tracker.md`. Claim the issue there before implementing it.

### Triage labels

The five canonical triage labels, unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Writing rules

Korean output style for PRs, commits, issues and docs. See `docs/agents/writing.md`.
