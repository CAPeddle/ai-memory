---
title: Keep story board updated as stories progress through development
date: 2026-06-19
category: workflow-issues
module: project_management
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - Stories are committed, merged, or completed without updating their board status
  - The story board's acceptance criteria checkboxes diverge from actual implementation state
  - A project relies on the story board as a source of truth for planning and review
  - Working with a dual system of git-based development tracking and a markdown planning board
tags:
  - story-board
  - workflow-issue
  - planning
  - project-management
  - acceptance-criteria
  - governance
  - process-gap
  - execplan-closeout
---

# Keep story board updated as stories progress through development

## Context

The ai-memory story board (`.github/planning/story-board.md`) is the team's source of truth for what is in progress, backlogged, and done. Three stories — ST-028 (worker observability), ST-039 (embedding resilience), and ST-040 (worker crash isolation) — were fully implemented, committed with conventional-commit story trailers, and merged to `main`. However, the story board was never updated to reflect this. When a subsequent session selected ST-039 from the board to start work, investigation revealed the code was already deployed on main. The board had gone stale, making it unreliable for planning and introducing costly double-work risk.

The gap was a missing post-merge workflow step: nothing tied the merge event to a board update. The `continue.prompt.md` closeout instructions (`continue.prompt.md:46`) direct the executor to "scan Backlog for stories listing completed story in Blocked by and clear resolved references" but never say "move the completed story to the Done column". The ExecPlan template's closeout section (`_TEMPLATE.md:214-218`) only covers the Review transition, not the final Done transition after PO acceptance.

This is a recurring pattern — ST-058 was a dedicated sync-alignment governance story that reconciled ST-041, ST-042, and ST-056 after they were completed but not reflected on the board. The same root cause (board update missing from closeout workflow) produced the same outcome twice.

## Guidance

After every merge to `main` that closes one or more stories, the story board must be updated before the session ends. The update includes:

1. **Move** completed stories from Backlog/In Progress/Review to the Done section
2. **Check** all acceptance criteria boxes: replace `[ ]` with `[x]`
3. **Add** a `Completed: YYYY-MM-DD` line after the Value line
4. **Add** a notes line or update existing notes to reference merge commit SHAs
5. **Update** the header metadata: remove completed stories from the `Unblocked` line, bump `Last updated` date
6. **Remove** any stale blank lines left by the removal

This is not optional — treat board sync as the final mechanical step of every merge cycle.

### Verification

After updating the board, run:

```bash
# Confirm the board's Done section reflects merged stories
grep "### ST-" .github/planning/story-board.md | grep -A1 "Completed"
```

## Why This Matters

A stale story board breaks planning handoff between sessions. New agents and team members rely on the board to select the next task. If it shows completed stories as available, they waste time rediscovering done work or risk attempting duplicate implementation. The board is also the first artifact a `/plan` or `/continue` workflow reads — a stale board propagates incorrect state into the next planning cycle.

The board's `Unblocked` line is particularly important: it tells `/plan` which stories can be scoped next. Keeping a completed story on the `Unblocked` line causes the planner to consider it alongside genuinely available work.

## When to Apply

- Immediately after any merge to `main` that closes a story
- When the `Last updated` date is more than 1 working day old and changes have landed on main
- At the start of a new session if `git log origin/main --oneline | grep "ST-"` shows story-tagged commits not reflected on the board
- At the end of every ExecPlan closeout step, before writing `FollowUpSessionLog.txt`

## Examples

**Before (stale):**

The board showed ST-039 in Backlog with unchecked ACs and `Last updated: 2026-06-17`, but `git log origin/main` showed 5 ST-039 commits already merged on 2026-06-14.

**After (correct):**

ST-039 moved to Done with `[x]` on all ACs, `Completed: 2026-06-14`, and notes referencing the merge commits. Header updated: `Unblocked` line removed ST-028/ST-039/ST-040, `Last updated: 2026-06-19`.

## Prevention

- **Add "Sync story board" to the ExecPlan template closeout checklist.** After the final commit and before writing `FollowUpSessionLog.txt`, verify `git log origin/main --oneline | grep <STORY_ID>` confirms expected commits, then open and update the board. This makes board sync a mechanical checklist item rather than a discretionary afterthought.
- When selecting a story from the board, first verify its actual state with `git log --all --oneline | grep <STORY_ID>` to avoid picking up silently completed work.
- Treat the story board's `Last updated` date as a freshness signal: if it is more than a few days old, audit the board against git history before using it for planning.

## Related

- ST-058: Sync alignment wrap-up — the same gap reconciled for ST-041, ST-042, ST-056 (`docs/design/adr/ADR-009-deployment-model.md`)
- `.github/prompts/continue.prompt.md` — the executor instructions that need a "move to Done" step
- `.github/planning/execplans/_TEMPLATE.md` — the ExecPlan template whose closeout section only covers Review, not Done
- `.github/planning/story-board.md` — the board itself, which must be updated
