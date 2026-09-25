---
name: project-st-008-consolidation-1to1
description: ST-008 (consolidation worker) v1 scope decisions made during 2026-05-19 /plan Round 1
metadata: 
  node_type: memory
  type: project
  originSessionId: 1e807240-f859-451f-bfbc-553a4f7f2a7a
---

ST-008 consolidation worker, v1 scope decisions (Round 1, 2026-05-19):

- **Promotion model:** 1:1 (each shard scoring ≥ threshold becomes one wiki row). N:1 cluster-based consolidation deferred to a future story (placeholder: ST-031).
- **Relevance fallback:** Read `feedback_events` rows when present; otherwise fall back to the shard's `confidence` column (already in `public.thoughts` schema). When ST-029 ships, this naturally enriches without a code change. See [[feedback-dependency-gaps-use-schema-fallback]] for the general PO philosophy this resolution reflects.
- **Spec precedence:** PO chose "resolve each contradiction case-by-case" when ADR-007 and the board AC disagreed — no global rule like "ADR always wins." Implies that during scoping for other stories, surface contradictions explicitly rather than auto-applying a precedence rule.

**Why:** ADR-007's three-factor scoring (frequency + diversity + relevance) was designed assuming feedback was available. ST-029 (feedback API) was deferred from ST-005 scope-lock and is still backlog. Without a fallback, ST-008 would be blocked on a non-critical story.

**How to apply:** Use these decisions when writing QP-008 and exec-plan-ST-008. If ST-008 evolves in future planning rounds, the 1:1 model and confidence-fallback are PO-locked unless re-opened.
