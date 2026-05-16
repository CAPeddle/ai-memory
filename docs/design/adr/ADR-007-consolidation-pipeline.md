---
name: "ADR-007: Consolidation Pipeline"
asset_type: "adr"
status: "revised"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-007-consolidation-pipeline.md"
created: "2026-05-15"
revised: "2026-05-16"
investigation: "docs/investigations/memory-architecture-design.md"
---

# ADR-007: Consolidation Pipeline

**Status:** Revised  
**Date:** 2026-05-15 | **Revised:** 2026-05-16  
**Deciders:** PO (sole maintainer)  
**Source investigations:** [memory-architecture-design.md](../../investigations/memory-architecture-design.md), [openbrain-pivot-evaluation.md](../../investigations/openbrain-pivot-evaluation.md)

---

## Context

The consolidation pipeline (Shard → Wiki promotion) was designed as a C# background service triggered manually or on a schedule. The language stack has changed: the cloud server is TypeScript/Deno. The consolidation pipeline runs server-side alongside the MCP server in the Docker container.

Additionally, OB1's `entity-extraction` schema includes an `AFTER INSERT OR UPDATE` trigger on `thoughts` that queues thoughts for async processing. The consolidation pipeline can use the same trigger + queue pattern — writing to a `consolidation_queue` table and processing it in a dedicated Deno worker.

The scoring formula, promotion thresholds, and deduplication logic are unchanged.

---

## Decision

### Consolidation runs server-side as a Deno worker

The consolidation worker is a Deno process that runs inside the Docker container alongside the MCP server. It processes queued thoughts and promotes eligible shards to wiki tier.

```
PostgreSQL AFTER INSERT trigger on thoughts
  │ (queues thought_id to consolidation_queue)
  ▼
Deno Consolidation Worker (server-side)
  ├── Reads consolidation_queue
  ├── Scores candidates (frequency + diversity + relevance)
  ├── Calls OpenRouter for LLM-assisted content normalisation (if score ≥ 0.5)
  ├── Promotes: INSERT wiki thought, UPDATE shard active=false
  ├── Logs: consolidation_log entry
  └── Clears: processed queue entries
```

The worker can also be triggered on demand via the `consolidate` MCP tool (with optional `dry_run` parameter).

### At-write entity extraction (co-located)

OB1's entity-extraction trigger pattern is adopted for the entity extraction worker as well. Both workers — entity extraction and consolidation — share the queue infrastructure:

```sql
-- OB1-inherited trigger (entity extraction)
CREATE TRIGGER trg_queue_entity_extraction
AFTER INSERT OR UPDATE ON thoughts
FOR EACH ROW EXECUTE FUNCTION queue_for_entity_extraction();

-- Consolidation equivalent
CREATE TRIGGER trg_queue_consolidation
AFTER INSERT ON thoughts
FOR EACH ROW
WHEN (NEW.memory_type = 'shard')
EXECUTE FUNCTION queue_for_consolidation();
```

Entity extraction calls **OpenRouter** to identify entities and relationships, then writes nodes and edges into the AGE graph. Consolidation uses OpenRouter for content normalisation of near-threshold candidates.

### Consolidation scoring formula (unchanged)

```
score = (0.40 × normalised_frequency)
      + (0.35 × normalised_diversity)
      + (0.25 × normalised_relevance)
```

Where:
- **frequency**: recall event count for this shard (normalised 0–1 against batch maximum)
- **diversity**: distinct projects in which it was recalled (normalised 0–1)
- **relevance**: proportion of `helpful` feedback on this shard's recall events

### Promotion threshold (unchanged)

| Score band | Action |
|-----------|--------|
| ≥ 0.7 | Automatic promotion to wiki |
| 0.5 – 0.69 | Flagged for manual review in `consolidation_log` |
| < 0.5 | Skipped; remains shard |

### Pre-conditions for promotion eligibility (unchanged)

- Minimum 2 recall events
- `content_fingerprint` not already present in wiki thoughts (deduplication)

### Promotion record (adjusted for OB1 schema)

When a shard is promoted:
1. New `thoughts` row inserted with `memory_type = 'wiki'`, `source = 'auto-promoted'`, `confidence` = consolidation score
2. Source shard: `active = false` (soft-deleted)
3. New wiki thought: `supersedes = null` (new fact, not a correction)
4. `consolidation_log` entry records the full decision, score breakdown, and worker run ID

### Dry-run mode

`consolidate` MCP tool called with `dry_run: true` returns promotion candidates and scores without writing anything.

---

## Consequences

### Positive
- Consolidation runs server-side; no dependency on the local synthesis service being active
- OB1's trigger + queue pattern is reused for both entity extraction and consolidation — consistent infrastructure
- OpenRouter provides model flexibility for both workers; switching models requires only a configuration change
- Dry-run mode gives full visibility before any writes

### Negative / Trade-offs
- Consolidation worker requires OpenRouter API key to be configured in the Docker environment; without it, LLM-assisted normalisation for near-threshold candidates is unavailable (consolidation still runs with scoring only, just skips the normalisation step)
- The Deno worker runs as a persistent process or scheduled task inside the container; Docker Compose service management handles restart on failure
- Weights (0.40/0.35/0.25) remain heuristic; real-usage tuning is deferred until baseline is established

### Future evolution (unchanged from v1.0)

- Configurable weight tuning via environment variable
- Six-dimension scoring (add: recency, consolidation_status, conceptual_richness) as optional upgrade
- Importance tagging on shards (i=0.0–1.0) for retention policy expression

---

## Alternatives Considered

| Alternative | Why Not Chosen |
|-------------|---------------|
| **C# background service (original design)** | Superseded by TypeScript/Deno cloud server; running a C# background service in the Docker container adds a second runtime |
| **Local synthesis service triggers consolidation** | Consolidation requires access to recall events and all shards; running it locally would require downloading the full candidate set. Server-side is simpler. |
| **Real-time per-ingest consolidation (synchronous)** | Would double write latency on every shard capture; batch consolidation via queue is more efficient |
| **Fully external Janitor Agent** | A cron-based external caller to the `consolidate` MCP tool is supported but adds an external scheduling dependency; server-side worker is simpler |

---

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-05-15 | Initial — C# IHostedService; triggered via REST `POST /api/v1/consolidate` or schedule |
| 2.0 | 2026-05-16 | Revised — Deno worker process in Docker; OB1 trigger + queue pattern; OpenRouter for LLM normalisation; entity extraction and consolidation share queue infrastructure; MCP `consolidate` tool replaces REST endpoint |
