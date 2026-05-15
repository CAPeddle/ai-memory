---
name: "ADR-002: Primary Storage Backend"
asset_type: "adr"
status: "accepted"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-002-storage-backend.md"
created: "2026-05-15"
investigation: "docs/investigations/sqlite-vs-postgresql.md"
---

# ADR-002: Primary Storage Backend

**Status:** Accepted  
**Date:** 2026-05-15  
**Deciders:** PO (sole maintainer)  
**Source investigations:** [sqlite-vs-postgresql.md](../../investigations/sqlite-vs-postgresql.md), [MicrosoftCopilotStorageBasedADR.md](../Discussions/MicrosoftCopilotStorageBasedADR.md), [openbrain-pivot-evaluation.md](../../investigations/openbrain-pivot-evaluation.md)

---

## Context

The ai-memory service needs to store:
- Semantic memories (~5,400 records at 3 years moderate usage)
- Episodic memories (~86,400 records at 3 years)
- Recall events (~216,000  records at 3 years)
- Vector embeddings (1,536 dimensions per record)
- FTS5 full-text index
- Structural entity and relationship data

Storage requirements at project scale (100K memories, single user, Windows local):
- No concurrent writes beyond 1–5 sessions
- Zero external service dependencies at startup
- Portable single-file backup
- €0/month hosting

PostgreSQL was evaluated as an alternative, with Supabase as its managed cloud variant.

The `IMemoryStore` abstraction was introduced to decouple the engine from the backend.

---

## Decision

**SQLite 3 with FTS5, WAL mode, and sqlite-vec is the v1.0 default storage backend.**

PostgreSQL (with pgvector) is a documented and supported upgrade path, activated via `Storage:Backend = "postgresql"` configuration. Both backends implement `IMemoryStore`.

### SQLite configuration

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -65536;  -- 64 MB
PRAGMA mmap_size = 268435456; -- 256 MB
```

### Migration triggers (when to move to PostgreSQL)

Migrate when **any one** of these conditions is met:
- Service becomes multi-user (shared team memory server)
- Vector search at > 100K embeddings requires sub-10ms HNSW performance not achievable with sqlite-vec
- Write concurrency exceeds 5 simultaneous heavy writers
- Cloud deployment with managed database is required

### Phase plan

| Phase | Backend | Vector | Trigger |
|-------|---------|--------|---------|
| 1 | SQLite + FTS5 | None | ST-002–ST-003 |
| 2 | SQLite + FTS5 + sqlite-vec | sqlite-vec HNSW | ST-004–ST-005 |
| 3 | PostgreSQL + pgvector | pgvector HNSW | Migration trigger fires |

---

## Consequences

### Positive
- Zero deployment friction: no server to install, configure, or maintain
- Single-file backup via file copy
- Portable across Windows, macOS, Linux without reconfiguration
- Memory footprint ~50 MB (vs ~200 MB+ for PostgreSQL base process)
- Projected database size ~570 MB at 3 years moderate usage — well within 1 GB limit
- WAL mode provides concurrent reads with a single serialised writer

### Negative / Trade-offs
- SQLite HNSW (via sqlite-vec) is less mature than pgvector's HNSW implementation
- No native graph traversal extension (Apache AGE requires PostgreSQL)
- Full-text search missing advanced features: trigram fuzzy matching, multi-language collations, synonym support

### Risks
- sqlite-vec is a relatively young library; if it has a critical bug, fall back to brute-force cosine similarity (still correct, slower)
- At 100K+ vectors, sqlite-vec may not meet the < 100ms latency target; monitor with benchmarks and trigger Phase 3 migration if needed

---

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| **PostgreSQL from day 1** | Requires server installation, Docker, or Supabase subscription; operational overhead unjustified for single-user local use |
| **Supabase Free tier from day 1** | Acceptable cost ($0–5/month) but adds cloud dependency, pauses after 1 week inactivity, and removes direct filesystem write access needed for view synthesis |
| **Milvus Lite** | Windows wheel unavailability confirmed; WSL2 tests failed; rejected per memsearch-applicability-review.md |
| **Hybrid (SQLite + PostgreSQL simultaneously)** | Adds synchronisation complexity with no benefit; explicitly rejected in sqlite-vs-postgresql.md |
| **Elasticsearch** | Heavyweight BM25 engine; $29+/month minimum; unjustified for personal scale with ≤500K records |
