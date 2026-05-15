---
name: "ADR-007: Consolidation Pipeline"
asset_type: "adr"
status: "accepted"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-007-consolidation-pipeline.md"
created: "2026-05-15"
investigation: "docs/investigations/memory-architecture-design.md"
---

# ADR-007: Consolidation Pipeline

**Status:** Accepted  
**Date:** 2026-05-15  
**Deciders:** PO (sole maintainer)  
**Source investigations:** [memory-architecture-design.md](../../investigations/memory-architecture-design.md), [openclaw-official-docs-review.md](../../investigations/openclaw-official-docs-review.md), [openclaw-memory-architecture-analysis.md](../../investigations/openclaw-memory-architecture-analysis.md)

---

## Context

The system accumulates episodic memories (Shards) over time from agent sessions. Without curation, the knowledge base becomes noisy and retrieval degrades as the ratio of raw observations to curated facts grows.

A consolidation mechanism is needed to:
1. Identify patterns in episodic memories that represent stable, reusable knowledge
2. Promote those patterns to semantic memories (the Wiki tier)
3. Prevent duplicates and false promotions
4. Give the developer visibility and control over the process

Two reference systems were studied:
- **OpenClaw's dreaming pipeline**: a three-phase background sweep (Light → REM → Deep) with six scoring dimensions and importance tagging
- **Our design**: simpler three-factor scoring appropriate for solo personal use

---

## Decision

### Consolidation scoring formula

Each episodic memory is scored as a promotion candidate:

```
score = (0.40 × normalised_frequency) 
      + (0.35 × normalised_diversity) 
      + (0.25 × normalised_relevance)
```

Where:
- **frequency**: number of recall events referencing this episodic memory (normalised 0–1 against the maximum in the current batch)
- **diversity**: number of distinct projects in which it was recalled (normalised 0–1)
- **relevance**: proportion of `helpful` feedback out of all feedback on this memory's recall events

### Promotion threshold

| Score band | Action |
|-----------|--------|
| ≥ 0.7 | Automatic promotion to semantic memory |
| 0.5 – 0.69 | Flagged for manual review in consolidation log |
| < 0.5 | Skipped; remains episodic |

### Pre-conditions for promotion eligibility

- Minimum 2 recall events (prevents single-recall noise from auto-promoting)
- Content hash not present in existing semantic memories (deduplication)

### Trigger strategy

Consolidation is **triggered manually** (via `POST /api/v1/consolidate`) or on a configurable schedule (default: not scheduled). A `dry_run` mode shows candidates without writing anything.

Rationale: automated scheduling adds operational complexity; the Janitor Agent pattern (trigger from a workflow or cron) is deferred to a later story.

### Promotion record

When an episodic memory is promoted:
1. A new semantic memory record is created with `source = "auto-promoted"` and `confidence` derived from the consolidation score
2. The source episodic memory has `active = false` set (soft-deleted)
3. The new semantic memory has `supersedes = null` (it is a new fact, not a correction)
4. A `consolidation_log` entry records the full decision

### Content-hash deduplication

Before promotion, the system computes a content hash of the normalised memory text. If an identical hash exists in semantic memories, the promotion is skipped and logged as `rejected-duplicate`.

---

## Consequences

### Positive
- Three-factor scoring (frequency + diversity + relevance) captures the most valuable episodic memories
- Dry-run mode gives full visibility before any writes
- Minimum recall threshold prevents "once and done" observations from polluting semantic memory
- Content-hash deduplication prevents duplicate promotions even when the same concept is captured in multiple episodes
- The developer controls the cadence; no unexpected background mutations

### Negative / Trade-offs
- Weights (0.40/0.35/0.25) are heuristic; they may need tuning after observing real usage patterns in production. Tuning is deferred to Phase 4.
- Diversity scoring favours cross-project patterns, which may under-promote deeply project-specific knowledge (e.g., a quirk specific only to one project that is very frequently recalled)
- No real-time event-driven consolidation yet; patterns may lag by hours or days if consolidation is not run frequently

### Future evolution

- Configurable weight tuning via `appsettings.json` (after baseline established)
- Background scheduled consolidation ("Janitor Agent" pattern from OpenClaw / MicrosoftCopilotProjectOverview.md)
- Six-dimension scoring (add: recency, consolidation_status, conceptual_richness) as optional upgrade path based on OpenClaw model
- Importance tagging on episodic memories (i=0.0–1.0) to express retention policy (deferred to Phase 4+)

---

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| **Temporal decay (Hebbian activation)** | OpenClaw schema is ready but integration is incomplete; marked as deferred even there; premature for ai-memory Phase 1 |
| **Six-factor OpenClaw scoring** | More dimensions = more tuning complexity; three factors sufficient for personal scale; upgrade path documented |
| **Fully automated background Janitor Agent** | Automation introduces unexpected writes; manual trigger gives PO control; automation deferred to later story |
| **Real-time per-ingest consolidation** | Would double write latency on every ingest; batch consolidation is more efficient and controllable |
| **Single promotion threshold** | Near-threshold band (0.5–0.7) enables human review of borderline candidates; this is valuable for quality control |
