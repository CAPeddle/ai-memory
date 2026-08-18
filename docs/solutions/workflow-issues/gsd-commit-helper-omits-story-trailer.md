---
title: The GSD commit helper omits the Story trailer, and its --amend cannot add one back
date: 2026-08-18
category: workflow-issues
module: planning-workflow
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - "A GSD workflow (gsd-execute-phase, gsd-execute-plan, or any skill calling `gsd_run query commit`) is committing on behalf of this repo"
  - "A commit must carry a repo-specific trailer that no generic tool knows about"
  - "You are about to fix a wrong commit message with the helper's --amend flag"
related_components: [tooling, documentation]
tags: [gsd, commit-trailer, conventional-commits, story-traceability, git-amend, subagent-dispatch]
---

# The GSD commit helper omits the Story trailer, and its `--amend` cannot add one back

## Context

This repo treats the `Story: ST-NNN` commit trailer as load-bearing. [CLAUDE.md](../../../CLAUDE.md)
states that for `docs/plans/*.md`-driven work, "execution progress is derived from git history, not
stored in the plan body" — which is only true because `git log --grep="Story: ST-088"` resolves a
story's shipped work.

GSD execution workflows commit on your behalf. Executor subagents are instructed to finish a plan by
calling the bundled helper:

```bash
gsd_run query commit "docs({phase}-{plan}): complete [plan-name] plan" --files ...
```

During ST-088 Phase 3, a wave-3 executor noticed its metadata commit had landed without the trailer and
amended it. That catch was luck, not process — four more waves were queued behind it, and nothing in the
workflow would have flagged the omission.

## Guidance

### 1. The helper is not buggy — the message templates are repo-agnostic

`gsd-tools.cjs` contains no trailer logic at all (`grep -c 'trailer\|Story:'` over its 4028 lines returns
zero). `routeCommit` collects the positional message and hands it straight to `cmdCommit`, which execs:

```js
// ~/.claude/gsd-core/bin/lib/commands.cjs:898-900
const commitArgs = amend
    ? ['commit', '--amend', '--no-edit']
    : ['commit', '-m', sanitizedMessage];
```

The message is committed exactly as supplied. The omission originates upstream, in the workflow's own
template at `~/.claude/gsd-core/workflows/execute-plan.md:507,509`, which renders
`docs({phase}-{plan}): complete [plan-name] plan` and stops there. No GSD workflow file mentions `Story:`
anywhere — correctly so, since GSD ships to many repos and cannot know this one's convention.

**So the fix is not to avoid the helper. It is to pass a message that already carries the trailer.**
Multi-line messages survive: `sanitizeForPrompt` strips only zero-width characters and prompt-injection
markers, and preserves newlines.

```bash
# Works — the trailer lands intact
gsd_run query commit "$(printf 'docs(03-02): complete plan\n\nStory: ST-088')" --files path/to/file
```

### 2. The trap: `--amend` reports success while discarding your new message

Because the amend branch above passes `--no-edit` and no `-m`, git reuses the *existing* message. A new
message passed alongside `--amend` is silently dropped. The command still exits 0, still prints a fresh
short hash, and still reports `"reason": "committed"` — so it looks like the fix worked:

```bash
# Before: HEAD message is "docs(03-01): complete some plan" (no trailer)
gsd_run query commit "$(printf 'docs(03-01): complete some plan\n\nStory: ST-088')" --amend
# -> {"committed": true, "hash": "<a new short hash>", "reason": "committed"}
# After:  HEAD message is STILL "docs(03-01): complete some plan" — no trailer
```

Use raw git to repair a message:

```bash
git commit --amend -m "$(printf 'docs(03-01): complete some plan\n\nStory: ST-088')"
```

### 3. When dispatching executor subagents, state the contract and then audit

An executor reads CLAUDE.md, but reading a convention is not the same as applying it through a helper
that quietly drops it. Put the requirement in the dispatch prompt explicitly, including the known gap:

> Each commit message MUST end with `Story: ST-NNN`. KNOWN TOOLING GAP: `gsd-tools query commit`
> generates a message that OMITS this trailer. If you use that helper, verify with
> `git show -s --format=%B HEAD` and repair with raw `git commit --amend` before moving on.

Then verify mechanically rather than trusting the report. Parsing `%(trailers:...)` in a shell loop is
error-prone because the trailer value carries a trailing newline that splits records; count the line
instead:

```bash
for h in $(git log <base>..HEAD --format='%H'); do
  n=$(git show -s --format='%B' "$h" | grep -c '^Story: ST-088[[:space:]]*$')
  [ "$n" -ge 1 ] || echo "MISSING: $(git show -s --format='%h %s' "$h")"
done

# One-line sanity check — these two numbers must match:
git log --grep='Story: ST-088' --oneline <base>..HEAD | wc -l
git rev-list --count <base>..HEAD
```

## Why This Matters

The trailer is the *only* durable link between a commit and its story. Losing it on the metadata commit
is the worst case: that is the commit that records a plan as complete, so a plan's completion record gets
orphaned from the story it completes while every individual code commit still resolves.

Squash-merge amplifies it. CLAUDE.md already warns that GitHub's default squash message drops the
trailer and that the squash message must be written deliberately. A branch whose commits are themselves
missing the trailer gives the person writing that squash message nothing to copy from.

The failure is silent in both directions — the helper reports success on the original commit, and reports
success again on the `--amend` that was supposed to fix it. Nothing surfaces until someone runs
`git log --grep` months later and finds a gap.

## When to Apply

- Any `gsd-execute-phase` / `gsd-execute-plan` run in this repo, on every wave.
- Any orchestrator dispatching executor subagents that will commit — state the contract in the prompt,
  do not rely on the subagent inferring it from CLAUDE.md.
- Immediately before a PR is squash-merged, since that is the last point the trailer can be recovered
  cheaply.
- Any time a commit message needs repair: reach for raw `git commit --amend`, never the helper's
  `--amend`.

## Examples

Observed during ST-088 Phase 3 (`feat/st-088-phase-3-node-client`), which ran six plans across six waves
with a subagent executor per wave:

- **Wave 3** produced the metadata commit `docs(03-03): complete node client spool bounding...` through
  the helper. The executor checked its own work, found no trailer, and repaired it with raw
  `git commit --amend` while it was still the unshared tip commit.
- The gap was then written into the dispatch prompt for waves 4, 5 and 6 as a named known gap rather
  than a general reminder.
- A full-branch audit at the end confirmed 25/25 commits carried `Story: ST-088`, with
  `git log --grep='Story: ST-088' | wc -l` matching `git rev-list --count` exactly.

The cost of the catch was one amend. The cost of missing it would have been a story whose completion
records are invisible to the query the repo's own governance depends on.
