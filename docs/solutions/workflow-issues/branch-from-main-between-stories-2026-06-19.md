---
title: Branch from fresh main before starting a new story
date: 2026-06-19
category: workflow-issues
module: story workflow
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - "Starting a new story (ST-XXX) after the previous story's PR was merged"
  - "Transitioning between stories on the story board"
  - "A story moves from In Progress or In Review to Done"
  - "Beginning /continue or /plan-new for the next story"
  - "After running ce-clean-gone-branches or fast-forwarding main"
symptoms:
  - "New story commits land on the previous story's feature branch"
  - "PR for the new story contains unrelated commits from the prior story"
  - "git log shows the new story branch diverging from a feature branch, not main"
  - "Story board WIP limits appear respected but branches are contaminated"
root_cause: missing_workflow_step
resolution_type: workflow_improvement
tags:
  - git
  - branching
  - workflow
  - story-board
  - execplan
  - wip-limits
  - main
  - pr-merge
---

# Branch from fresh main before starting a new story

## Context

The ai-memory repo runs a story-driven workflow: work items are tracked as `ST-XXX` on [.github/planning/story-board.md](.github/planning/story-board.md) with WIP limits of **1 In Progress, 1 in Review**. Implementation is gated by ExecPlans in `.github/planning/execplans/`, and the workflow prompts in `.github/prompts/` (`/plan-new`, `/plan`, `/continue`, `/recover`) drive the cycle. Each story is meant to live on its own `feat/ST-XXX-...` branch, flow through a PR, merge into `main`, and be closed out before the next story starts.

The gap: **story closeout is not enforced as an explicit step.** After PR #12 merged `feat/ST-043-context-validation-feature-flags` and `ce-clean-gone-branches` cleaned up the local branch (`git fetch --prune` → branch gone → switch to `main` → delete local → fast-forward `main` to `origin/main`), the session moved straight on. When `ST-041` was later started, the new branch was cut from the **tip of the previous feature branch**, not from the freshly-updated `main`. The closeout sequence (return to `main`, confirm `main` is current with `origin/main`, then branch fresh) was either skipped or never verified. The result: `ST-041`'s branch started life on the wrong base, dragging the previous story's commits (already on `main` via the merge) into the new branch's history.

This is a workflow-hygiene defect, not a tooling failure — the git plumbing was all correct (`ce-clean-gone-branches` did its job), but nothing in the workflow **requires the agent to confirm it is on `main` and `main` is up to date before creating the next feature branch**.

This is a sibling facet of the closeout-hygiene gap documented in [story-board-stale-updates-2026-06-19.md](./story-board-stale-updates-2026-06-19.md), which covers the board-state facet. Both share the same root cause: a missing post-merge workflow step.

## Guidance

Treat **story closeout + next-story branch creation** as one atomic, verified step. Do not start `ST-XXX+1` until the previous story is fully closed out *and* the new branch is confirmed to branch from an up-to-date `main`.

### Closeout sequence (after PR merge)

```bash
# 1. Pull latest refs and prune deleted remote branches
git fetch --prune

# 2. Switch to main and fast-forward only (never merge into main locally)
git switch main
git pull --ff-only

# 3. Delete the local branch that was deleted on the remote
#    (ce-clean-gone-branches automates this; manual equivalent:)
git branch -d feat/ST-043-context-validation-feature-flags

# 4. Confirm main is the current branch and matches origin/main
git rev-parse --abbrev-ref HEAD       # => main
git status -sb                        # => ## main...origin/main  (no ahead/behind)
git log -1 --oneline                  # => the merge commit from PR #12
```

### Pre-flight check (BEFORE creating the next story branch)

```bash
# Hard requirement: must be on main, and main must equal origin/main
test "$(git rev-parse --abbrev-ref HEAD)" = "main" || { echo "NOT ON MAIN — abort"; exit 1; }
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" || { echo "main is stale — run: git pull --ff-only"; exit 1; }
```

### Create the new story branch from updated main

```bash
git switch -c feat/ST-041-<short-slug> main
# Verify the branch point is the current origin/main tip, not a stale ref
git merge-base --is-ancestor origin/main HEAD && echo "branch base OK" || echo "WRONG BASE — recreate from main"
```

### Update the story board in the same closeout step

In [.github/planning/story-board.md](.github/planning/story-board.md), in the same commit that closes out the prior story:

- Move the completed story (`ST-043`) from **In Progress** → **Done** (or **Review** → **Done**)
- Set the next story (`ST-041`) to **In Progress**
- Confirm WIP limits still hold: 1 In Progress, 1 in Review — no more

Commit the board update with a conventional commit + story trailer, e.g.:

```
chore(planning): close out ST-043, start ST-041

Story: ST-043
Task: closeout
```

### Where this belongs in the ExecPlan

Add an explicit **§Closeout** subsection to every ExecPlan's final task (or a standalone post-merge task) that lists the four closeout commands and the pre-flight check. The `/continue` prompt mechanically executes Ready ExecPlans, so the closeout must be *written into the plan*, not left to agent judgment. A `/recover` pass on a failed session should also verify the closeout step ran before declaring the story done.

## Why This Matters

**Branch contamination** is the direct consequence. When `ST-041` branches from the tip of `feat/ST-043` instead of `main`:

- **The next PR lies.** `ST-041`'s PR diff will include `ST-043`'s commits *that are already on `main` via the merge*. Reviewers see noise, "why is this commit here again?" questions, and the diff no longer represents what `ST-041` actually changed.
- **Confusing diffs and merge conflicts.** GitHub may auto-detect and squash cleanly, or it may not — depending on whether `ST-043` was squash-merged or merge-committed. The former silently hides the problem; the latter surfaces conflicts that shouldn't exist.
- **WIP-limit discipline breaks.** The board says "1 In Progress" but two stories' commits are physically interleaved on one branch. The board's state no longer reflects what's actually on disk.
- **`/recover` becomes harder.** Forensic analysis of a failed session assumes one story per branch. A contaminated branch makes it ambiguous which commits belong to which story, which is exactly the kind of ambiguity `/recover` is supposed to resolve.
- **Story trailers become ambiguous.** Conventional commits carry `Story: ST-XXX` trailers, but git history no longer cleanly partitions by story when the base is wrong.

The cost of the pre-flight check is two `test` commands. The cost of skipping it is a contaminated branch that may need to be recreated mid-story, losing work or at minimum forcing a rebase.

## When to Apply

- **After every PR merge**, before any further story work — even if the next story won't start immediately. Run the closeout sequence the moment the PR is merged, not "later."
- **Before creating any new `feat/ST-XXX-...` branch.** The pre-flight check is mandatory; if it fails, fix `main` first, then branch.
- **Especially when working through a sequence of stories** on the board (the common case: ST-043 → ST-041 → ...). Each transition is a closeout+branch-fresh cycle.
- **At the start of a fresh session** that picks up a story mid-flight: verify the current branch's base with `git merge-base --is-ancestor origin/main HEAD`. If it fails, the branch was created wrong in a prior session — recreate it from `main` before continuing.
- **During `/recover`**: include closeout verification in the forensic checklist before marking a story Done.
- **Trivial docs/housekeeping edits** that don't touch a story slot can skip this — they're exempt from the ExecPlan gate per CLAUDE.md, as long as they don't conflict with an active story.

## Examples

### Wrong sequence (what happened with ST-041)

```bash
# PR #12 (ST-043) merges on GitHub. Session continues without verifying base.
git fetch --prune                         # feat/ST-043... gone
git switch main
git pull --ff-only                        # main now at merge commit
git branch -d feat/ST-043-context-validation-feature-flags

# ...time passes, session context shifts...

# WRONG: still on the mental model of "continue from where we were."
# If the agent never ran `git switch main` (or ran it but then later
# checked out the old branch tip), the next branch cuts from the wrong base:
git switch -c feat/ST-041-something feat/ST-043-context-validation-feature-flags
#   ^ branches from ST-043's tip, NOT from main.
#   ^ ST-043's commits are now in ST-041's history even though they're already on main.

# The PR for ST-041 now shows ST-043's commits in the diff. Reviewers confused.
git log --oneline main..feat/ST-041-something
#   => includes ST-043's 3 commits AND ST-041's new commits
```

### Right sequence (the enforced closeout)

```bash
# PR #12 (ST-043) merges on GitHub.
git fetch --prune                         # feat/ST-043... gone
git switch main
git pull --ff-only                        # main fast-forwards to merge commit
git branch -d feat/ST-043-context-validation-feature-flags

# --- CLOSEOUT VERIFICATION (mandatory) ---
test "$(git rev-parse --abbrev-ref HEAD)" = "main" || { echo "NOT ON MAIN"; exit 1; }
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" || { echo "main stale"; exit 1; }
# Both pass. We are on main, main == origin/main.

# Update the story board in the same step:
#   ST-043: In Progress -> Done
#   ST-041: Backlog -> In Progress
# Commit:  chore(planning): close out ST-043, start ST-041   Story: ST-043  Task: closeout

# --- BRANCH FRESH FROM main ---
git switch -c feat/ST-041-something main
git merge-base --is-ancestor origin/main HEAD && echo "branch base OK"
#   => branch base OK

# Later, ST-041's PR diff is clean — only ST-041's commits:
git log --oneline main..feat/ST-041-something
#   => only ST-041's new commits
```

### Inline pre-flight guard (reusable)

Drop this at the top of any ExecPlan §Closeout or any `/continue` step that starts a new story:

```bash
set -e
git fetch --prune
git switch main
git pull --ff-only
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || { echo "main diverged — investigate before branching"; exit 1; }
git switch -c "feat/ST-${STORY_ID}-${SLUG}" main
git merge-base --is-ancestor origin/main HEAD
echo "Branch feat/ST-${STORY_ID}-${SLUG} created from $(git rev-parse --short origin/main)"
```

## Related

- [story-board-stale-updates-2026-06-19.md](./story-board-stale-updates-2026-06-19.md) — sibling facet of the same closeout-hygiene gap. Covers the board-state facet (move merged stories to Done, check ACs). This doc covers the branch-hygiene facet (branch fresh from main). Both share the root cause: a missing post-merge workflow step in the ExecPlan closeout.
- [missing-start-stop-scripts-planning-gap-2026-06-18.md](./missing-start-stop-scripts-planning-gap-2026-06-18.md) — same root-cause family (post-execution bookkeeping as blind spot), different problem domain.
