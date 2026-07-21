---
name: "ADR-003: Hybrid Search Architecture"
asset_type: "adr"
status: "revised"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-003-hybrid-search.md"
created: "2026-05-15"
revised: "2026-05-16"
investigation: "docs/investigations/memory-architecture-design.md"
---

# ADR-003: Hybrid Search Architecture

**Status:** Revised  
**Date:** 2026-05-15 | **Revised:** 2026-05-16  
**Deciders:** PO (sole maintainer)  
**Source investigations:** [memory-architecture-design.md](../../investigations/memory-architecture-design.md), [openbrain-pivot-evaluation.md](../../investigations/openbrain-pivot-evaluation.md)

---

## Context

The storage backend moved from SQLite (FTS5 + sqlite-vec) to PostgreSQL 15 with pgvector and Apache AGE `PG15/v1.6.0-rc0` (ADR-011). The search architecture must be re-expressed in PostgreSQL terms.

Additionally, the move to PostgreSQL + AGE unlocks a capability that was explicitly deferred in v1.0: **graph traversal as a first-class retrieval mode**. Two confirmed use cases drive this:

1. **Coding agent debugging** — tracing why an implementation is not working requires multi-hop traversal through code entities, dependencies, and error chains. Variable-length relationship patterns (e.g., `CAUSED_BY*1..5`) are native to openCypher and painful in recursive CTEs at depth.

2. **Fact inference** — "Does John like flowers?" requires chaining through entity relationships (`LIKES → INTERESTED_IN → category:flowers`). This is a graph query, not a keyword or vector query.

Three query types must be handled:
1. **Lexical** — exact keyword, symbol, API name: `tsvector`/`tsquery` (BM25 approximation)
2. **Semantic** — natural language concept queries: pgvector HNSW cosine similarity
3. **Structural / graph** — entity relationships, multi-hop traversal: openCypher via AGE

---

## Decision

### Three retrieval modes

**Mode 1 — Lexical + Semantic Hybrid (standard memory retrieval)**

The default retrieval pipeline for `search_thoughts`:

```
Query
  │
  ├── Structural pre-filter (project / entity scope via WHERE clause)
  │          ↓ constrained candidate set
  ├── BM25 lane   (tsvector/tsquery, ranked by ts_rank_cd)   ──┐
  │                                                              ├── RRF → MMR → Top-K
  └── Vector lane (pgvector HNSW cosine, <=> operator)       ──┘
```

BM25 implementation:
```sql
SELECT id, content, ts_rank_cd(search_vector, query) AS bm25_rank
FROM thoughts, plainto_tsquery('english', $1) query
WHERE search_vector @@ query
ORDER BY bm25_rank DESC
LIMIT 60;
```

Vector implementation:
```sql
SELECT id, content, embedding <=> $1 AS vector_distance
FROM thoughts
ORDER BY vector_distance
LIMIT 60;
```

RRF fusion (k=60, rank-independent normalisation):
```
RRF_score(d) = Σ 1 / (k + rank_i),   k = 60
```

MMR re-ranking after fusion (λ=0.7 relevance, 0.3 diversity).

**Mode 2 — Graph Traversal (openCypher via AGE)**

For structural queries — debugging, fact inference, entity relationship exploration:

```cypher
-- Coding agent: trace error causation chain
MATCH path = (error:Error {id: $errorId})-[:CAUSED_BY*1..5]->(root)
RETURN path

-- Fact inference: multi-hop relationship query
MATCH (person:Person {name: $name})-[:LIKES|INTERESTED_IN*1..3]->(thing)
WHERE thing.category = $category
RETURN thing
```

Graph queries are invoked via a dedicated MCP tool (`graph_traverse`) or as a post-retrieval expansion step after Mode 1. They are not fused into the BM25+vector RRF pipeline — the two retrieval modes serve different query intents and are selected at the tool level.

**Mode 3 — Structural Pre-filter (scope constraint)**

Project and entity scoping continues to operate as a WHERE-clause pre-filter on all Mode 1 queries. This constrains the candidate set before BM25 and vector ranking begin.

### Embedding dimensions

512-dimension embeddings using `text-embedding-3-small` with OpenAI's native truncation support. This retains ~95% of retrieval quality at 1536 dimensions while keeping vector storage within the Supabase-free / Docker volume budget (100K × 2KB = ~200MB vs 100K × 6KB = ~600MB at full dimensions).

### RRF parameters (unchanged)

`k = 60` eliminates the need to normalise tsvector BM25 scores against pgvector cosine distances.

### MMR re-ranking (unchanged)

```
MMR = argmax[ λ · sim(d, q) − (1−λ) · max(sim(d, selected)) ]
     λ = 0.7
```

### Recency and project boosting (unchanged)

- Recency: tiebreaker only within ε=0.01 score threshold. No decay.
- Project boosting: 1.2× multiplier for same-project results in Mode 1.

---

## Consequences

### Positive
- `tsvector`/`tsquery` is a mature, production-grade BM25 approximation; no extension required
- pgvector HNSW indexes provide sub-10ms vector search at 100K+ embeddings (superior to sqlite-vec at this scale)
- AGE `PG15/v1.6.0-rc0` runs on PostgreSQL 15; openCypher graph traversal is now first-class, not a deferred capability (see ADR-011 for the AGE version constraint)
- Two distinct retrieval modes (hybrid BM25+vector vs graph traversal) serve different query intents cleanly; no forced fusion of semantically different result types
- 512-dim embeddings fit the storage budget while retaining quality

### Negative / Trade-offs
- `tsvector`/`tsquery` is a BM25 approximation, not a true BM25 implementation; `ts_rank_cd` normalises by document length but does not expose raw IDF scores. Acceptable at personal scale.
- Graph queries (Mode 2) require the entity extraction pipeline (entity extraction worker, ADR-007) to have populated the AGE graph. Empty graph = no graph results. Mode 1 is always available regardless.
- Structural pre-filter (Mode 3) cannot influence ranking within Mode 1; it remains a scope constraint only. Full structural ranking fusion deferred to a future evolution.

### Future evolution (supported)

1. **Structural as a fourth RRF lane** — once entity extraction is validated and graph density is sufficient, structural fingerprint vectors could be added as a third BM25/vector fusion lane
2. **Graph-guided re-ranking** — use graph proximity (hop distance from query entity) as a post-RRF booster in Mode 1

---

## Alternatives Considered

| Alternative | Why Not Chosen |
|-------------|---------------|
| **FTS5 (SQLite)** | Superseded by ADR-002 → ADR-011; PostgreSQL tsvector/tsquery is the equivalent |
| **sqlite-vec** | Superseded; pgvector HNSW is superior at 100K+ embeddings |
| **Elasticsearch BM25** | $29+/month minimum; heavyweight; unjustified at personal scale |
| **Fusing graph results into BM25+vector RRF** | Different query intents should not be force-fused; graph traversal returns relationship paths, not scored documents; Mode 2 separation is cleaner |
| **Recursive CTEs for graph traversal** | Manageable for 2-hop queries; becomes unwieldy at 3–5 hops and for variable-length patterns; openCypher via AGE is purpose-built |
| **1536-dim embeddings** | 100K × 6KB = ~614MB; exceeds free-tier storage budget; 512-dim retains ~95% quality |

---

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-05-15 | Initial — FTS5 + sqlite-vec + RRF + MMR; structural as pre-filter only; graph deferred |
| 2.0 | 2026-05-16 | Revised — tsvector/tsquery replaces FTS5; pgvector replaces sqlite-vec; openCypher via AGE added as first-class Mode 2 retrieval; 512-dim embeddings adopted |
