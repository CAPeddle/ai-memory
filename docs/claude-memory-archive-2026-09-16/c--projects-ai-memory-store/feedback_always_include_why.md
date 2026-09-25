---
name: always-include-why
description: "PO requires \"why\" rationale alongside \"what\" in every plan, design doc, spec, ADR, and story entry — not just the decision but the reason behind it."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 15affaa0-d891-4792-941b-55520ef15dc5
---

Every plan, spec, design doc, ADR, story-board entry, and ExecPlan section must include the **why** alongside the **what**. State the decision, then state the rationale.

**Why:** PO directive given 2026-05-22 during entity↔thought provenance brainstorming. Documents without rationale rot fast — future readers (including future-Claude in a new session) can't judge whether a decision still holds when the constraint that drove it changes. The "why" is what lets someone judge edge cases instead of cargo-culting the rule.

**How to apply:**
- In specs: every scope inclusion/exclusion gets a "Why this is in/out" line. Every architectural choice gets a "Why this option" paragraph.
- In ExecPlans: every task gets a rationale, not just an instruction. Surprises & Discoveries entries explain *why* the surprise mattered.
- In story-board entries: the `Notes:` line carries the why; ACs state the what.
- In ADRs: rationale is already the centre of gravity, but enforce it for "Decision" sections that drift into pure prescription.
- In commit messages: Conventional Commit subject = what; body = why.
- When the why is "PO said so," that's still a valid why — record who and when, so the next reader knows where to escalate if context shifts.

Aligns with [[project_execplan_verification_scope]] (minimal evidence matched to scope) — both are about future readers being able to reason about a decision rather than just execute it.
