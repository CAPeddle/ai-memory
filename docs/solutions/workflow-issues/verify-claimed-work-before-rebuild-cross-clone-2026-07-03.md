---
title: Verify claimed work in the target clone before treating a handoff as fabricated
date: 2026-07-03
category: workflow-issues
module: project_management
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - Resuming a cross-clone or cross-machine handoff (e.g. Windows clone -> WSL2 clone)
  - A handoff, memory, or prior session claims commits/files/board entries that a reconciliation step reports as "missing"
  - A steering interface with no repo access (e.g. a web chat) narrates work as "committed"
  - Deciding whether to REBUILD claimed work versus VERIFY-AND-RECONCILE it
  - Any session that begins by trusting a written claim about repository state
tags:
  - cross-clone
  - handoff
  - reconciliation
  - git
  - workflow-issue
  - governance
  - verify-before-act
---

# Verify claimed work in the target clone before treating a handoff as fabricated

## Context

A Contact Memory review + governance thread was steered from a **Web Claude** session
(no repository access) and handed off to a fresh agent in the WSL2 clone via
`docs/investigations/contact-memory-mvp-review-and-governance-handoff.md`. The handoff's
§2 "Reconciliation" table asserted that commit `6623c65`, `AGENTS.md`, board entries
ST-063–066, `captureThoughtAdapter.ts`, and `buildRepairPrompt` **did not exist** on
`origin/main` — and framed the likely conclusion as either "unpushed in WSL2" or
"`6623c65` was a fabricated hash." The resume prompt inherited that framing and told the
next agent the work "must be rebuilt" if the hash was fictitious.

When actually checked **in the WSL2 clone**, every one of those artifacts existed, was
committed, and was pushed to `origin/feat/whatsapp-parser` (and was an ancestor of
`origin/main`). The working tree was clean. Nothing was at risk. The mismatch was a pure
**visibility artifact**: the Windows session that authored the handoff could not see the
WSL2 clone's commits (VS Code blocks the `\\wsl.localhost\` UNC host), so "not in *my*
clone" was mis-recorded as "not in *the* repo."

Had the agent trusted the handoff narrative, it would have **rebuilt work that already
existed** — duplicating the governance refit and the MVP, and likely creating conflicting
board entries.

## Guidance

When a handoff, memory note, or prior-session summary claims repository state, **verify
each claim in the clone you are actually working in before acting on it** — especially
before choosing "rebuild" over "reconcile." Cheap, decisive checks:

```bash
git status                          # is there unpushed/dirty work to secure first?
git log --oneline -20               # is the "missing" commit actually here?
git cat-file -t <claimed-hash>      # does the hash resolve to a real object?
git log --all -S '<symbol>' --oneline   # search ALL branches for a claimed file/function
git branch -a                       # is the work on a branch the author couldn't see?
ls -la <claimed-file>               # does the file exist on disk right now?
```

Interpretation rules:

1. **"Missing" from a narrative usually means "not visible to the author," not
   "nonexistent."** A steering interface with no repo access (web chat) cannot commit and
   cannot see another machine's unpushed branches. Treat its "committed as `<hash>`"
   claims as unverified until `git cat-file -t <hash>` says otherwise.
2. **Secure before you build.** If verification finds real unpushed/dirty work, commit +
   push it on a clearly named branch *first*. If verification finds the work already
   committed and pushed (as here), the "secure at-risk work" step is a no-op — say so and
   move on.
3. **Reconcile, don't duplicate.** If the board/commits already contain the claimed
   entries, the task collapses from "rebuild" to "confirm + fill the genuine gaps"
   (here: only ST-067/ST-068 and the A1/A2/A3 residuals remained).
4. **Ground new board/plan entries against real code, not the narrative.** Before
   board-tracking a finding, read the cited code so acceptance criteria match reality
   (e.g. confirming `captureThoughtAdapter` already fails loudly on a missing key, so the
   extraction story must *preserve* that rather than copy a test helper's defaults).

This is the same failure mode as stale story-board updates, one level up: the source of
truth is the code in the current clone, and a written claim about it is a hypothesis to
test — not a fact to act on.
