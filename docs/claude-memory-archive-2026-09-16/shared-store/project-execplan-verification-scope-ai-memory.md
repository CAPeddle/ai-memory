---
name: project-execplan-verification-scope-ai-memory
description: "When authoring an ExecPlan for the ai-memory project, the verification step must match the deliverable's actual scope — don't drag in unrelated subsystems as a safety net"
metadata:
  type: project
  consolidatedFrom: c--projects-ai-memory
  consolidatedDate: 2026-08-31
  originSessionId: 1e807240-f859-451f-bfbc-553a4f7f2a7a
  modified: 2026-08-31T12:05:38.254Z
---

When writing an ExecPlan's verification commands and "no regression" checks, match the verification to **what the deliverable actually changes**, not to a generic catch-all.

**Why:** ST-030 (line-ending hygiene story, 2026-05-19/20) hit **two plan-reviews** I caused. Both were the same mistake class: ACs/tasks not aligned to the deliverable's actual scope.

1. First plan-review: AC3 asserted `i/crlf` for `.ps1` files. Git-impossible — Git stores text as LF in the index regardless of `eol=crlf`. See [[project-git-eol-semantics]].
2. Second plan-review: Task 4.4 ran the Deno test suite to "prove no semantic regression". A whitespace-only renormalize cannot break runtime behaviour; tests exercise a subset of files; `git diff -w --stat` covers all files and is mathematically conclusive. The Deno step also pulled in Docker as a precondition. Both unnecessary for a whitespace story.

**How to apply** when authoring ExecPlans:

- **Frame the verification as: "what minimal command would prove the AC?"** Not "what's our standard test suite?"
- **For pure-whitespace stories** (renormalize, formatting, lint fixes): use `git diff -w` to prove zero substantive change. Empty output = mathematical proof. No runtime needed.
- **For schema-only stories** (DDL, migrations): use `psql \d` introspection or `pg_get_functiondef`. No app code needed.
- **For docs-only stories**: use `Select-String` / `Test-Path`. No build/test needed.
- **For runtime behaviour changes**: tests are correct. But verify the test suite actually covers the changed code paths — don't run tests as a vague "sanity check."
- **Audit §3 Preconditions before locking the plan:** every item there must be referenced by at least one task's verification. If a precondition exists only because of one over-engineered task, the task is probably wrong.

The smaller the deliverable, the smaller the verification should be. An ExecPlan whose verification is heavier than its deliverable is mis-scoped.

**Project context:** the `ai-memory` project was not found under `C:\projects` as of this 2026-08-31 consolidation — verify it still exists before applying this.
