---
name: feedback-dependency-gaps-use-schema-fallback
description: "PO preference for resolving \"feature B is blocked on feature A that hasn't shipped yet\" — use a defensible default from existing schema fields rather than gate or block"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1e807240-f859-451f-bfbc-553a4f7f2a7a
---

When a feature depends on data from another not-yet-built feature, prefer a **schema-resident fallback** over blocking or gating.

**Why:** The PO articulated this during ST-008 (consolidation worker) scoping, 2026-05-19, when ST-008's `relevance` scoring factor needed `feedback_events` data — but ST-029 (feedback API) was still backlog. Rather than block ST-008 on ST-029, the PO chose: "use `feedback_events` rows when they exist, else fall back to the shard's `confidence` field already in schema". Quote: *"Blocking ST-008 on ST-029 is wrong for a single-user tool — feedback is a quality improvement, not a correctness requirement."*

**How to apply:**

- When scoping a feature that reads from a dependency table/column owned by an unplanned story, look for an existing column on a related table that approximates the missing signal.
- The fallback must be expressible as "use X if present, else use Y" — no branching code on whether the dependency has shipped. The newer source naturally takes precedence as it lands.
- Surface this option in scoping rounds alongside "block on dependency" and "treat as 1.0" so the PO can pick.
- This is a single-user-tool design ethos: don't let quality-improvement dependencies become correctness gates.

Related: [[project-st-008-consolidation-1to1]] for the specific ST-008 application.
