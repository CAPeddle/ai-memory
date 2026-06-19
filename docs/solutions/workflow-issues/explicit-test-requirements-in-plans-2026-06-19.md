---
title: Include explicit test requirements in planning artifacts
date: 2026-06-19
category: workflow-issues
module: planning-workflow
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - Authoring or reviewing ExecPlans for stories that introduce or modify tests
  - Test coverage is described only in implementation-unit scenarios or final verification
  - A code review identifies misleading metadata that tests should have caught (e.g., descriptions claiming behavior the runtime does not provide)
  - Planning remediation work where targeted regression assertions matter more than broad suite greens
  - Writing a story's Definition of Ready or Definition of Done
  - Using the /plan prompt to scope a story that changes tool descriptions, API contracts, or runtime behavior
tags:
  - planning
  - execplan
  - testing
  - regression-tests
  - verification
  - doc-review
  - workflow-issue
  - acceptance-criteria
---

# Include explicit test requirements in planning artifacts

## Context

During ST-047 (enrich MCP tool descriptions), the initial ExecPlan treated
testing as a separate, sequential task after the main implementation work. The
plan's Task 4.2 was "write description validation test" — a.checkbox to tick
after descriptions were already written. This produced two problems:

1. **Test design was vague.** The initial plan said "validate that all registered
   tools have descriptions meeting a quality bar" with no specification of what
   "quality bar" meant in structural terms. Without explicit test requirements
   upfront, the first test attempt used exact-prose assertions that were brittle
   and did not catch the real risk: misleading metadata describing behavior the
   runtime did not actually provide.

2. **Review findings outpaced test precision.** A multi-agent code review
   identified that `search`, `search_thoughts`, and `list_thoughts` had
   descriptions implying capabilities (nearest-neighbor fallback, profile
   filtering, profile isolation) that the runtime did not deliver. The existing
   test did not assert against any of these specific regressions because the
   plan never required it to. The remediation plan (ST-047 findings) had to add
   targeted regression assertions for each misleading metadata case as a
   separate unit of work.

The broader pattern: this is the testing facet of the same closeout-hygiene
gap seen in sibling workflow issues. When a plan does not treat testing as an
explicit, first-class requirement — with specific regression targets written
before implementation — tests tend to be structural ("does the test run?")
rather than semantic ("does the test catch the actual risk?").

## Guidance

Treat test requirements as **first-class acceptance criteria**, not
implementation-unit side notes. When writing or reviewing an ExecPlan:

1. **Name the regression risks.** Before writing any code, list what the
   implementation must not regress and what specific incorrect behaviors the
   tests must detect. For ST-047, this would have been: "descriptions must not
   claim `search` has no fallback when it does," "descriptions must not claim
   `search_thoughts` filters by profile when it only filters by project," etc.

2. **Write targeted test assertions before implementation.** The repo's
   `/plan` prompt already mandates TDD sequencing ("Always encode test-bearing
   work with explicit TDD sequencing in the ExecPlan: define the red step
   first" — `plan.prompt.md:103`). Follow this rule: each implementation unit
   that changes behavior must include its regression assertions in the plan
   *before* the implementation step, not after.

3. **Distinguish test-code coverage from test-assertion precision.** A test
   file that runs and passes is necessary but insufficient. Each test must
   assert against a specific, named risk. A test named "tools have
   descriptions" that checks `description.length > 0` is low-precision; a test
   that asserts `search` descriptions mention fallback behavior is
   high-precision.

4. **Include test requirements in the Definition of Ready.** The ExecPlan
   template's §2b "Definition of Ready" should be checked only after the plan
   specifies *what the tests will assert*, not just *that tests will be
   written*.

5. **Use semantic regex patterns over exact prose.** When testing documentation
   or metadata strings, prefer structural pattern assertions (e.g., "description
   contains a usage guidance sentence" or "description mentions fallback")
   over exact-string matching. This avoids brittle test coupling while still
   targeting specific semantic properties.

## Why This Matters

- Plans that describe tests in vague terms produce vague tests. The gap between
  "we have a test" and "the test catches the actual risk" is where regressions
  hide.
- Code review findings that target metadata/contract mismatches reveal the
  testing gap too late — after the implementation is already committed. The
  remediation cost is higher than writing targeted assertions upfront.
- The cross-model review gate in `plan.prompt.md` was introduced precisely
  because "ST-008 shipped with all ACs 'checked' and 34/34 tests green, but a
  cross-model review found 3 contract defects the tests didn't cover." This
  learning is the same pattern: green tests that do not assert against the
  actual risk.
- Without explicit test requirements, the Definition of Ready checkbox "Tests
  planned" is a rubber stamp. The checkbox should require *what* the tests will
  assert, not just *that* tests will exist.

## When to Apply

- When writing or reviewing any ExecPlan that includes test scenarios
- When a story changes tool descriptions, API contracts, error messages, or
  runtime behavior that existing descriptions claim
- When the Definition of Ready or Done mentions "tests pass" without naming
  specific assertions
- During code review: if a reviewer finds a bug that the test suite did not
  catch, the plan's test requirements were under-specified
- During `/plan` or `/plan-new`: before marking a plan as Ready, verify each
  implementation unit specifies named regression targets, not just "add tests"

## Examples

### Before: vague test requirements

```
§4.2 — Write description validation test
- Verify all registered tools have descriptions
- Verify parameter descriptions exist
- Run full test suite to confirm no regressions
```

This passes the "tests planned" bar but does not specify *what* the tests
should catch. A test checking `description.length > 0` would satisfy this
requirement without catching misleading metadata.

### After: explicit test requirements with named regression targets

```
§4.1 — Pin the test contract (red step, TDD)

Targeted regression assertions (must fail before implementation):
- search: description must mention nearest-neighbor fallback behavior
- search_thoughts: description must NOT claim profile-based filtering
  (only project-based per parseContext.ts)
- list_thoughts: description must NOT claim profile-level isolation
  (context scoping is project-wide, not profile-isolated)
- All tools: description must contain at least 2 of 5 metadata signals
  (usage guidance, parameter guidance, example, returns, errors)

Structural assertion (drift resistance):
- tools/list tool names must match server-info.toolNames exactly
  (no parallel hard-coded list that can drift)
```

This plan specifies exactly what the tests must detect. If the implementation
re-introduces a misleading description, the test fails — not because the
description string changed, but because a specific semantic guarantee was
violated.

### Verification: checking that test requirements are explicit

When reviewing an ExecPlan for Ready status, ask:

1. Does each implementation unit name the specific regressions it must not
   introduce?
2. Does the plan specify assertion targets, or only "add tests"?
3. Would the proposed test catch the *most likely* failure mode of the
   implementation, or only confirm that code runs without errors?

If any answer is "no," the plan's test requirements are under-specified.

## Related

- [missing-start-stop-scripts-planning-gap-2026-06-18.md](./missing-start-stop-scripts-planning-gap-2026-06-18.md) — same root-cause family (planning didn't include operational acceptance criteria). This doc generalizes the pattern: whether it's lifecycle scripts or test assertions, requirements not written into the plan do not reliably happen.
- [story-board-stale-updates-2026-06-19.md](./story-board-stale-updates-2026-06-19.md) — sibling facet of the same closeout gap (board sync as a missing required step)
- [branch-from-main-between-stories-2026-06-19.md](./branch-from-main-between-stories-2026-06-19.md) — sibling facet (branch hygiene as a missing required step)
- `.github/prompts/plan.prompt.md` — line 103: TDD sequencing rule; lines 66-73: cross-model review gate introduced after ST-008 shipped with green tests that missed contract defects
- `docs/plans/2026-06-19-002-fix-st047-review-findings-plan.md` — remediation plan that added targeted regression assertions after review identified the gap