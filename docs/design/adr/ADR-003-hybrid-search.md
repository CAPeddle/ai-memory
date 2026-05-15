---
name: "ADR-003: Hybrid Search Architecture"
asset_type: "adr"
status: "accepted"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-003-hybrid-search.md"
created: "2026-05-15"
investigation: "docs/investigations/memory-architecture-design.md"
---

# ADR-003: Hybrid Search Architecture

**Status:** Accepted  
**Date:** 2026-05-15  
**Deciders:** PO (sole maintainer)  
**Source investigations:** [memory-architecture-design.md](../../investigations/memory-architecture-design.md), [MicrosoftCopilotStorage.md](../Discussions/MicrosoftCopilotStorage.md), [MicrosoftCopilotStorageBasedADR.md](../Discussions/MicrosoftCopilotStorageBasedADR.md), [openclaw-official-docs-review.md](../../investigations/openclaw-official-docs-review.md)

---

## Context

A memory retrieval system must handle three types of queries:
1. **Lexical** — exact keyword, symbol, API name (e.g., "include_directories", "IsNullOrEmpty")
2. **Semantic** — natural language concept queries (e.g., "how do I handle conan dependencies?")
3. **Structural** — entity/project/relationship scoping (e.g., "memories about cmake in the zoom project")

Single-mode search is insufficient:
- FTS5-only (BM25): excellent for exact lexical matches; poor for synonyms and paraphrases
- Vector-only: excellent for semantic similarity; poor for exact symbol/ID lookups
- Both are needed; combined retrieval achieves ~100% recall (validated by OpenClaw analysis)

A third dimension — structural — needs to be incorporated without adding excessive complexity or ranking normalisation challenges.

---

## Decision

### Two-lane hybrid search with structural pre-filter

The retrieval pipeline is:

```
Query
  │
  ├── Structural pre-filter (entity / project scope)
  │      ↓ constrained candidate set
  ├── BM25 lane (FTS5 MATCH query)       ───┐
  │                                          ├── RRF → MMR → Top-K results
  └── Vector lane (sqlite-vec KNN query) ───┘
```

**Structural search operates as a pre-filter, not a ranking signal.**

This means RRF fuses exactly **two lanes** (BM25 + Vector). Structural data constrains the search space before ranking begins.

### RRF formula

```
RRF_score(d) = Σ 1 / (k + rank_i),   k = 60
```

k=60 eliminates the need to normalise FTS5 BM25 scores and vector cosine similarity scores.

### MMR re-ranking

After RRF fusion, Maximal Marginal Relevance re-ranks the result list to reduce near-duplicate results:

```
MMR = argmax[ λ · sim(d, q) − (1−λ) · max(sim(d, selected)) ]
     λ = 0.7  (relevance weight; 0.3 diversity weight)
```

### Recency handling

Recency is a **tiebreaker only** (within ε=0.01 score threshold). It is never used as a decay factor. Stored memories do not lose weight over time.

### Project boosting

Same-project results receive a **1.2× relevance multiplier**. Cross-project results are not penalised but are not boosted.

---

## Consequences

### Positive
- Two-lane RRF is proven to achieve ~100% recall at personal knowledge graph scale
- No score normalisation required between BM25 and cosine similarity (RRF formula is rank-independent)
- Structural pre-filter (a fast SQL/CTE query) adds < 10 ms overhead
- MMR prevents near-duplicate results from dominating the result window
- "No-decay" philosophy matches the use case: development knowledge does not expire

### Negative / Trade-offs
- Structural similarity cannot influence ranking in v1.0 — it can only constrain scope
- If a query benefits from structural ranking (e.g., "find memories structurally similar to this planning document"), it cannot be expressed as a pre-filter; this use case is deferred to a future evolution
- The chunk ↔ entity mapping layer adds schema complexity (managed in ST-018)

### Future evolution (explicitly supported)

The design allows evolution toward:
1. **Structural as a ranking signal** — add a third RRF lane once structural fingerprints are validated
2. **Graph-based retrieval** — dedicated graph store, topology-based similarity (requires PostgreSQL + AGE)
3. **Hybrid structural strategies** — structure as filter + score booster

---

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| **FTS5-only (BM25)** | ~46.7% recall on semantic queries per OpenClaw benchmarks; insufficient |
| **Vector-only** | Poor performance on exact symbol/ID lookups; insufficient for coding memory use case |
| **Structural as RRF ranking signal** | Requires normalising graph topology scores against BM25 and cosine; complex tuning problem; MicrosoftCopilotStorageBasedADR.md recommends pre-filter model |
| **Elasticsearch BM25** | $29+/month minimum; heavyweight; overkill for ≤500K records |
| **Polyglot BM25 + separate vector store** | Multiple processes, complex sync; retrieval quality equivalent to SQLite embedded approach at this scale |
| **Temporal decay (cognitive science model)** | Explicitly rejected: development knowledge does not expire; recency as tiebreaker captures the needed ranking nuance |
