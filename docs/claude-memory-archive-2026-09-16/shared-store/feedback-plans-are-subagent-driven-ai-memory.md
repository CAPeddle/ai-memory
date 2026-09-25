---
name: feedback-plans-are-subagent-driven-ai-memory
description: "In the ai-memory project specifically, all implementation plans (ExecPlans, design plans, writing-plans output) must describe subagent dispatch + orchestrator oversight — not inline step-by-step execution."
metadata:
  type: feedback
  consolidatedFrom: c--projects-ai-memory
  consolidatedDate: 2026-08-31
  originSessionId: 15affaa0-d891-4792-941b-55520ef15dc5
  modified: 2026-08-31T12:00:58.122Z
---

**Scope caveat (added during 2026-08-31 consolidation):** this directive is specific to the `ai-memory` project's own plan-writing convention. It is *broader* than the global `~/.claude/CLAUDE.md` "Subagent Mandate," which only routes four specific kinds of work (build-and-verify, multi-file sweep, log/test-output parsing, third-party doc lookup) to subagents by default. Don't apply this file's "every plan must be subagent-driven" rule outside the `ai-memory` project without checking whether it still applies there.

Every implementation plan written for `ai-memory` must be structured as **subagent-driven with orchestrator oversight**, not as a bite-sized inline TDD checklist for one agent to grind through. The agent picking up the plan ("the orchestrator") dispatches subagents per task and performs the QA/direction layer themselves.

**Why:** Directive given 2026-05-22 after producing an inline TDD plan via `superpowers:writing-plans`. Subagent dispatch keeps each task's context isolated (no context bloat in the orchestrator), forces each task to be self-contained and clearly scoped, and lets the orchestrator focus on judgement — reviewing diffs, running verification, deciding when work is done — rather than typing every Edit themselves. Also leverages the full skill library (TDD, verification-before-completion, systematic-debugging, requesting-code-review) more naturally because the orchestrator invokes them at decision points rather than narrating through them.

**How to apply (within ai-memory):**

Per-task structure:
- **Scope:** what the subagent owns end-to-end.
- **Files:** exact paths.
- **Prerequisites:** state the orchestrator confirms before dispatch (prior task complete, tests in known state, container healthy).
- **Subagent dispatch prompt:** self-contained instructions — code, commands, expected outcomes. The subagent has no prior context; the prompt must brief it like a smart colleague who just walked in.
- **Required skills the subagent must invoke:** name them explicitly (e.g. `superpowers:test-driven-development`, `superpowers:verification-before-completion`).
- **Orchestrator review checklist:** what to verify before marking the task complete — read the diff, check return value matches expectations, run a confirming command.
- **Orchestrator commit step:** orchestrator-issued, after review passes, with Conventional Commits and (where applicable) project Story/Task trailers.

Cross-cutting at the plan level:
- A `superpowers:subagent-driven-development` invocation framing at the top so the orchestrator picks up the pattern.
- A final stage that invokes `superpowers:requesting-code-review` before declaring the work done.
- Explicit reference to the spec/design doc this plan implements so subagents can be pointed at it for context.

This pairs with [[feedback-always-include-why]] — every task should explain *why* it exists, not just what it does, so the subagent (cold start) can make judgement calls. And it pairs with [[project-execplan-verification-scope-ai-memory]] — verification commands stay minimal and scope-matched even when an orchestrator is the one running them.

**Project context:** this applies on top of `ai-memory`'s own CLAUDE.md gate that "implementation work is gated by a written ExecPlan." All code work there goes through `/plan-new`; ExecPlans produced that way (and any superpowers `writing-plans` output that feeds them) follow this subagent-driven structure. **The `ai-memory` project was not found under `C:\projects` as of this 2026-08-31 consolidation** — verify it still exists before relying on this before applying it.
