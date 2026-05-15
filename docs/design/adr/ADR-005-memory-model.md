---
name: "ADR-005: Memory Model and Tier Architecture"
asset_type: "adr"
status: "accepted"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-005-memory-model.md"
created: "2026-05-15"
investigation: "docs/investigations/memory-architecture-design.md"
---

# ADR-005: Memory Model and Tier Architecture

**Status:** Accepted  
**Date:** 2026-05-15  
**Deciders:** PO (sole maintainer)  
**Source investigations:** [memory-architecture-design.md](../../investigations/memory-architecture-design.md), [MicrosoftCopilotProjectOverview.md](../Discussions/MicrosoftCopilotProjectOverview.md), [openclaw-memory-architecture-analysis.md](../../investigations/openclaw-memory-architecture-analysis.md)

---

## Context

The system needs to model two distinct types of personal knowledge:

1. **Raw observations** — timestamped units of input that are not yet curated: transcripts, commit messages, brainstorms, session logs. These should be stored faithfully with no write-time judgement.

2. **Evergreen facts** — curated, promoted knowledge that represents stable truths about a domain, project, or person. These should never decay and should be immediately surfaced in retrieval.

Additionally, two "views" must exist over this knowledge:
- A **Wiki view** — a curated synthesis of semantic knowledge per project
- A **Storyboard view** — a stateful task board for personal and professional task management

The conceptual model is inspired by the Open Brain / LLM Wiki hybrid architecture and the OpenClaw three-tier model.

---

## Decision

### Three-tier conceptual model

```
TIER 1: SHARDS (Episodic Memories)
  → Raw, faithful capture of observations
  → No write-time curation or judgement
  → Source: user input, agent observations, session logs, uploads

TIER 2: WIKI (Semantic Memories)
  → Promoted, curated, evergreen facts
  → Transition: Consolidation Pipeline promotes Shards to Wiki
  → Source: user-taught facts, auto-promoted via consolidation scoring

VIEWS (Projections over The Brain)
  → Wiki View:      synthesis of Tier 2 per project → Markdown
  → Storyboard:     stateful task board → REST/MCP API + optional Markdown

The Brain = Tier 1 + Tier 2 (the persistent storage)
Views = derived and rendered on demand or via synthesis trigger
```

### Memory never decays

All memories retain full weight regardless of age. Recency is used only as a tiebreaker (within ε=0.01 score threshold). This is intentional: development knowledge, past decisions, and relationship facts do not become less relevant over time.

### Memory identifier strategy

All memory records use **ULID** primary keys: time-sortable, globally unique, URL-safe.

### Soft-delete and corrections model

- Deletion: `active = false` flag; soft-deleted records are excluded from search but preserved for audit
- Correction: A new memory record is created with `supersedes` pointing to the old ID; the old record is soft-deleted. Preserves full correction history.

### Memory schema (key fields)

**semantic_memories**
```
id TEXT PRIMARY KEY (ULID)
content TEXT NOT NULL
project TEXT
tags TEXT (JSON array)
source TEXT (user-taught | auto-promoted | observed)
confidence REAL DEFAULT 1.0
active INTEGER DEFAULT 1
recall_count INTEGER DEFAULT 0
last_recalled TEXT
embedding BLOB (via sqlite-vec)
created_at TEXT
updated_at TEXT
supersedes TEXT (ULID of prior version or NULL)
```

**episodic_memories**
```
id TEXT PRIMARY KEY (ULID)
session_id TEXT NOT NULL
content TEXT NOT NULL
project TEXT
tags TEXT (JSON array)
agent_context TEXT
active INTEGER DEFAULT 1
recall_count INTEGER DEFAULT 0
embedding BLOB (via sqlite-vec)
occurred_at TEXT
```

**recall_events**
```
id TEXT PRIMARY KEY (ULID)
memory_id TEXT
query TEXT
relevance_score REAL
position_in_results INTEGER
feedback TEXT (helpful | irrelevant | NULL)
recalled_at TEXT
```

---

## Consequences

### Positive
- Clear separation between raw data (Shards) and curated knowledge (Wiki) aligns with human cognitive patterns
- "Never decay" philosophy ensures old project decisions remain accessible
- Soft-delete preserves audit trail; corrections are traceable
- ULID provides global uniqueness + chronological order in a single field
- Views as projections keep the Brain clean; rendering is separate from storage

### Negative / Trade-offs
- Two memory types require two storage tables and two search paths (manageable but adds schema complexity)
- "No decay" means the database grows monotonically; archival strategy needed for zero-recall memories after ~2 years (documented as future work)
- ULID requires a generator dependency; not as trivial as auto-increment integer PKs

---

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| **Single unified memory table** | Cannot distinguish raw observations from promoted facts; conflates curation levels |
| **Temporal decay (Alfred-style forgetting curve)** | Explicitly rejected: development knowledge does not expire; a CMake pattern from 2 years ago is equally relevant |
| **File-as-truth (Markdown SQLite-synced)** | Weakens atomic updates, recall-event logging, and consolidation pipelines; rejected per memsearch-applicability-review.md |
| **12-layer tiered architecture (OpenClaw-style)** | Appropriate for very large-scale personal agents; over-engineered for ai-memory's personal use case |
| **Hard delete** | Removes audit trail; prevents correction history; soft-delete preferred |
