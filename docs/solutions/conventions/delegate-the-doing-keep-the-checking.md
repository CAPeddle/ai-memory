---
title: "Delegate the doing, keep the checking — orchestrator context is the scarce resource"
date: 2026-08-18
category: conventions
module: agent-workflow
problem_type: convention
component: development_workflow
severity: high
applies_when:
  - "Running a wave-based GSD phase (`/gsd-execute-phase`) where each plan is dispatched to an executor subagent"
  - "Invoking any skill whose documented workflow dispatches subagents, such as ce-compound's parallel Phase 1"
  - "Deciding whether to answer a question by reading files yourself or by dispatching a read-only explorer"
  - "Authoring the prompt for a subagent that will commit, edit files, or produce an artifact"
  - "Accepting a subagent's completion report at the end of a long multi-step run"
symptoms:
  - "An orchestrator runs out of usable context mid-phase and starts missing cross-cutting errors it would have caught at wave 1"
  - "A subagent returns an executive summary instead of the requested prose body, and the original output is unrecoverable"
  - "A completion report claims success; the artifact it names is missing, or the repo convention it claimed to follow was not applied"
  - "A skill designed around parallel subagents is run inline, so every file read it was designed to keep out of the main window lands in it"
  - "A vaguely scoped subagent returns something unusable and the work is redone by hand — paid for twice"
tags:
  - agent-orchestration
  - subagents
  - context-budget
  - gsd
  - verification
  - delegation
related_components:
  - development_workflow
  - documentation
---

# Delegate the doing, keep the checking — orchestrator context is the scarce resource

## Context

Multi-agent execution is now normal in this repo: `/gsd-execute-phase` dispatches an executor per plan,
`ce-compound` runs three research subagents in parallel, and the `Workflow` tool can fan out further.

The instinct is to treat token count as the budget and minimise it by doing work inline. That is the
wrong variable. **The scarce resource is orchestrator context** — the single window that has to hold the
plan, the accumulated decisions, and the judgment that spans waves. Subagent context is nearly free: each
gets a fresh window that evaporates when it returns.

The right question is therefore never "is this worth the tokens?" It is:

> Does the intermediate material need to be in the *orchestrator's* window, or only the conclusion?

## Guidance

### The dividing line: intermediate material ÷ conclusion

Reading eight files to produce three lines means eight files of pure context tax — delegate it. Reading
one file to produce three lines — just read it. The ratio, not the token count, is the trigger.

### Do it inline ("ordinary work")

| Trait | Example |
|---|---|
| The exact location is already known | Read one named file; grep a symbol you can already name |
| One or two tool calls | `git log -1`, check a config value, confirm a file exists |
| The material *is* the deliverable | Someone asked to see the file — summarising it destroys the ask |
| Judgment being asked of you | Which approach to take; whether a risk is acceptable |
| Verification of delegated work | Delegating the check to the thing being checked is circular |

### Delegate, in two tiers

**Read-only explorers** — fan-out search across many files, directories, or naming conventions where only
the conclusion is needed: "where is X handled", "find every call site", "does this pattern exist
anywhere". They locate code; they do not judge it, so do not ask them for a verdict.

**Executors** — a bounded unit of work with a definable artifact: implement a plan, produce a document,
run an experiment.

### Write a task brief, not a topic

> **Terminology.** "Task brief" here means the prompt handed to a subagent. It is deliberately *not*
> [Work Packet](../../../CONCEPTS.md), which is this codebase's Workflow Operations entity — a supervised
> unit with a lifecycle, a Policy Scope, and a Completion Gate. Do not use the two interchangeably.

A vague brief is the worst outcome available: it returns something unusable, the work gets redone by
hand, and the run is paid for twice while learning nothing. A good brief states:

- **The question, not the method** — unless the method is itself the point
- **Return shape and a size budget** — "≤10 lines", a `file:line` list, JSON with named keys. An
  unbounded return defeats the purpose of delegating
- **Boundaries** — which directories, which time window, what is explicitly out of scope
- **What not to return** — no file dumps, no full transcripts
- **Something spot-checkable in one command** — this is what makes delegation safe rather than merely cheap

For repo-specific conventions a generic agent cannot infer, state them in the brief rather than trusting
that a referenced instruction file will be applied. See
[the GSD commit-helper learning](../workflow-issues/gsd-commit-helper-omits-story-trailer.md) for a case
where the convention was documented, the executor read the documentation, and the tooling still dropped it.

### Keep a mechanical verification layer

Delegation moves the doing. It never moves responsibility. After each unit returns, check the claims
independently of the report:

```bash
# The artifact the agent said it wrote actually exists and is non-empty
test -s "$EXPECTED_ARTIFACT" || echo "MISSING: $EXPECTED_ARTIFACT"

# Work actually landed as commits
git log --oneline --grep="$UNIT_ID" | head

# Repo conventions were applied (trailer example — count the line; parsing
# %(trailers:...) splits records on the value's trailing newline)
for h in $(git log "$BASE"..HEAD --format='%H'); do
  git show -s --format='%B' "$h" | grep -q '^Story: ST-NNN[[:space:]]*$' \
    || echo "MISSING TRAILER: $(git show -s --format='%h %s' "$h")"
done

# Blast radius was respected — paths the unit had no business touching
git diff --stat "$BASE"..HEAD -- <paths-that-should-be-untouched>
```

## Why This Matters

**Preserved context is what keeps oversight sharp late in a run.** During ST-088 Phase 3, five executor
subagents consumed roughly 1.2M tokens across 394 tool calls over about 76 minutes. The orchestrator
absorbed five compact completion reports instead of 394 tool results. That headroom is why, at wave 5, a
summary stating `389 ok / 9 FAILED` out of 400 was noticed to sum to 398 — the figure was Deno's test
*function* count rather than the JUnit *testcase* count, and it was about to be quoted verbatim into a
permanent findings document. An orchestrator that had spent its window on tool output would have had
nothing left for that check.

**Subagent reports are not evidence.** They are claims, and they fail in known ways: summary-collapse,
where a long prose body is replaced by an executive summary and the original is unrecoverable (ce-compound
mitigates this by having subagents write full output to disk and return only a path — a pattern worth
copying); and honest-but-surprising deviations, such as executors in this phase self-reporting a
prohibited `git stash` and an amended commit. Honest agents disclose these. A less careful one would not,
and the mechanical checks above are what close that gap.

**A third failure mode, and the checks above do not close it: the worker dies without
reporting.** Both modes named above presuppose that a report exists. A transport error or a
usage-limit kill leaves partial work on disk and no report at all — the checking half
survives, but there is nothing to check a claim *against*. Treat such a unit as unverified
and reconstruct what the diff, the log and the artifacts can carry.

What they cannot carry is the point. An observation only the worker witnessed — a test seen
failing on its assertion *before* the fix, a control that discriminated — lived solely in a
transcript that is now gone. No mechanical check recovers it, and re-deriving it from the
finished tree is not the same claim. Record it as unverified rather than inferring it.

Two mitigations, both cheap and both learned by losing the work: split a large unit before
dispatching it, so a mid-run death costs half rather than all of it; and tell the worker in
its brief to report partial progress on the piece it is holding rather than only a final
summary, since a partial report honestly given is worth more than a lost complete one.

**Running a subagent-based skill inline inverts its design.** Those subagents usually exist *for* context
efficiency. Collapsing them into a single pass lowers total token spend slightly while sharply raising
main-window burn — optimising the variable that is not constrained at the expense of the one that is.

## When to Apply

- Every wave boundary in a GSD phase: dispatch the executor, then spot-check before advancing.
- Whenever a question would require sweeping unfamiliar territory — reach for an explorer rather than
  reading candidates one by one in the main window.
- Before writing any subagent prompt: check it against the task-brief list above, especially the return
  size budget and the repo conventions the agent cannot infer.
- Never for the judgment call itself. The decision, the trade-off, and the recommendation stay with the
  orchestrator.

## Examples

**Delegated, correctly** — "Execute plan 03-04: add the two non-200 branches. Commit each task atomically
with a `Story: ST-088` trailer. Create `03-04-SUMMARY.md`." Bounded, artifact-producing, and verifiable.
It returned four commits and a summary; the spot-check confirmed the summary's Self-Check marker, both
key files on disk, all four trailers, and that `server/src` was untouched.

**Kept inline, correctly** — re-deriving the regression diff from the two capture artifacts rather than
accepting the executor's stated counts. Two `grep -c` calls, and it is the check itself, so it cannot be
delegated to the agent being checked.

**The anti-pattern** — running `ce-compound`'s Phase 1 inline "to avoid spawning agents". Every source
slice, schema read, and reproduction transcript landed permanently in the orchestrator window to produce
a single document, while the skill's own design had those reads going to scratch artifacts that return
only a path.
