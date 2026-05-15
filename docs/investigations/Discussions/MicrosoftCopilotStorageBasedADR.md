# ADR: Structural Search as Pre-Filter in Hybrid Retrieval System

## Status
Proposed

---

## Context

The system aims to provide a unified **memory layer** for:

1. **Coding agent memory**
   - Recall past solutions to build errors, bugs, and implementations
   - Operates across multiple interconnected codebases

2. **Conversation memory**
   - Recall prior discussions across models and platforms
   - Support long-term idea tracking and knowledge synthesis

3. **Agile task tracking**
   - Maintain and render a live task board
   - Allow agents to update task state via REST/MCP

These use cases introduce **different retrieval paradigms**:

| Use Case | Type | Retrieval Requirement |
|----------|------|----------------------|
| Coding memory | Search | Semantic + lexical recall |
| Conversation memory | Search | Semantic recall |
| Agile board | State/query | Structured filtering |

This distinction reveals that the system must support both:

- **Retrieval-oriented queries** (ranking-based)
- **State-oriented queries** (filtering-based)

---

## Problem Statement

The hybrid retrieval system initially considers:

```

Hybrid Search = BM25 + Vector + Structural (via RRF)

```

However, introducing structural similarity as a ranking signal raises complexity in:

- Ranking normalization
- Graph modeling
- Cross-index consistency
- Latency

The key question:

> Should structural similarity participate in ranking, or constrain the candidate set before ranking?

---

## Decision Drivers

- **Primary use cases are text-first** (natural language queries)
- **Structural relationships provide context**, not primary relevance
- **Strict cost constraint** (€10/month)
- **SQLite-first architecture**
- Need for **fast iteration and low complexity**
- Future extensibility must be preserved

---

## Decision

### Structural retrieval will be implemented as a **pre-filter**, not a ranking signal.

The hybrid search pipeline is defined as:

```

filter(structure)
→ retrieve candidates
→ rank via RRF(BM25, Vector)

```

### Implications:

- RRF remains a **two-lane fusion mechanism**:
  - BM25 (lexical)
  - Vector (semantic)
- Structural data is used to:
  - constrain search scope
  - enforce contextual relevance

---

## Architecture Overview

### Retrieval System (for coding + conversation memory)

```

                ┌──────────────────────┐
                │   Structural Layer   │
                │ (relational tables)  │
                └──────────┬───────────┘
                           ↓
                    Candidate Filter

Query → BM25 index ─┐
├─→ RRF → Results
Query → Vector idx ─┘

```

---

### State System (for Agile board)

- Separate from hybrid retrieval
- Uses:
  - relational schema
  - filtering queries
  - event/state tracking

---

## Storage Strategy

### SQLite-first approach is retained

The system uses:

| Capability | SQLite Mechanism |
|------------|----------------|
| BM25 | FTS5 |
| Vector search | SQLite vector extension |
| Structural data | Relational tables (hierarchy / relationships) |

### No graph database is required in v1

This is valid under the assumptions:

- Structural relationships are:
  - hierarchical or shallow
  - queryable via joins or indexed paths
- No need for:
  - deep graph traversal
  - graph-based ranking

---

## Consequences

### ✅ Positive

- Reduced architectural complexity
- Lower latency (no structural ranking phase)
- Simpler ranking model (2 signals only)
- Compatible with SQLite-first constraint
- Faster delivery and iteration

---

### ⚠️ Negative / Trade-offs

- Structural importance cannot influence ranking
- Potential loss of nuanced relevance (structure-aware ranking)
- Requires careful **chunk ↔ entity mapping**
- May require refactoring if structural queries become more complex

---

## Constraints and Assumptions

- Structural data is primarily used for:
  - scoping (project, module, conversation thread)
  - not for similarity ranking
- Retrieval queries are primarily:
  - natural language (semantic + lexical)
- Structural queries can be expressed using SQL

---

## Risks

### 1. Over-filtering
Incorrect structural filters may reduce recall.

### 2. Misalignment
If chunk-to-structure mapping is inconsistent:
- relevant results may be excluded

### 3. Hidden future complexity
Graph-like requirements may emerge:
- dependency traversal
- concept graphs
- structural similarity queries

---

## Future Evolution (Explicitly Supported)

The design allows evolution toward:

### 1. Structural ranking
```

RRF(BM25, Vector, Structural)

```

### 2. Graph-based retrieval
- Dedicated graph store
- Topology-based similarity

### 3. Hybrid structural strategies
- Structure as filter + score booster

---

## Decision Outcome

For current use cases:

- Coding memory → ✅ structural filter sufficient  
- Conversation memory → ✅ structural filter sufficient  
- Agile board → ✅ separate state system  

Therefore:

> Structural pre-filtering provides the optimal balance of simplicity, performance, and correctness.

---

## Open Questions

- Under what conditions should structural ranking be introduced?
- What structural model (tree vs graph) will best support future needs?
- How to validate recall loss due to structural filtering?

---

## Appendix: Key Insight

> Structural relationships primarily provide **context boundaries**, not **relevance signals**, in the current system.

This enables a simplified architecture while preserving future extensibility.
