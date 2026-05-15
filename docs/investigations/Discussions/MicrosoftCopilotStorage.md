# ADR: Database Considerations for Hybrid Retrieval (BM25 + Vector + Structural via RRF)

## Status
Proposed

---

## Context

The system introduces **hybrid retrieval** combining three independent relevance signals:

- **Lexical retrieval** via BM25 (keyword-based)
- **Semantic retrieval** via vector similarity (embeddings)
- **Structural retrieval** via hierarchy/graph-based similarity

These signals are combined using **Reciprocal Rank Fusion (RRF)** to produce final ranked results.

This shifts the system from a traditional database into a **multi-index retrieval architecture**, where the same logical entity must be accessed efficiently via multiple representations.

---

## Problem Statement

Supporting hybrid retrieval requires a database layer capable of:

- Representing data across **multiple indexing paradigms**
- Supporting **top-K ranked retrieval** per signal
- Maintaining **cross-index consistency**
- Enabling **low-latency parallel query execution**
- Integrating **structural relationships as a first-class concern**

The primary design challenge is determining how to store, index, and query data to support these requirements without excessive complexity or degraded performance.

---

## Key Requirements

### 1. Multi-Index Representation

Each document or chunk must exist in three forms:

| Retrieval Signal | Required Index Structure |
|----------------|-------------------------|
| BM25           | Inverted index          |
| Vector         | Approximate nearest neighbor (ANN) index |
| Structural     | Graph or hierarchical index |

**Implication:**  
The database must support **multiple representations of the same logical entity**.

---

### 2. Stable Identity Across Indexes

All retrieval systems must use a **shared identifier (doc_id)**:

- Required for RRF fusion
- Enables merging of rankings across systems

**Implication:**  
A **canonical ID mapping layer** is mandatory.

---

### 3. Efficient Top-K Retrieval

Each retrieval lane must return **top-K ranked results efficiently**:

- No full scans
- Optimized index access required

**Implication:**  
Each index must support **native ranking and pagination**.

---

### 4. Parallel Query Execution

Hybrid retrieval requires querying all lanes concurrently:

```

Total latency ≈ max(BM25, Vector, Structural)

```

**Implication:**  
- Queries must be executed in parallel
- Slowest lane determines system latency

---

### 5. Metadata Filtering

All retrieval modes must support filtering:

- Project / model scoping
- Access control
- Domain-specific constraints

**Implication:**  
Filtering must be **consistently implemented across all indices**.

---

### 6. Chunking and Structural Alignment

A major challenge arises from differing granularities:

| Representation | Typical Granularity |
|--------------|--------------------|
| BM25         | Text chunks        |
| Vector       | Text chunks        |
| Structural   | Nodes / entities   |

**Implication:**  
A mapping is required:

```

chunk → node\_id
node → multiple chunks

```

---

## Architectural Options

### Option A — Single Unified Database

Example:
- PostgreSQL (BM25 + vector extensions)
- Elasticsearch / OpenSearch

#### Pros
- Single deployment
- Simpler data consistency
- Shared indexing layer

#### Cons
- Limited structural query capabilities
- Difficult to model complex graphs
- Less flexibility

---

### Option B — Polyglot Persistence (Recommended)

Split responsibilities:

```

BM25 + Vector → Search engine
Structural     → Graph or relational system
Fusion         → Application layer

```

#### Pros
- Best-of-breed for each retrieval type
- Scales independently
- Enables advanced structural queries

#### Cons
- Increased complexity
- Requires synchronization layer
- Requires orchestration logic

---

### Option C — Embedded Approach

Example:
- SQLite (FTS5 + vector + custom structure)

#### Pros
- Simple deployment
- Suitable for local-first or edge

#### Cons
- Limited scalability
- Reduced ranking quality
- Weak structural modeling

---

## Structural Data Modeling

Structural retrieval requires explicit modeling.

### Option 1 — Hierarchical Structure (Tree)

Use:
- `parent_id`
- `path`
- `depth`

Applicable for:
- IFC models
- document hierarchies

---

### Option 2 — Graph Structure

Use:
- Nodes
- Typed edges

Applicable for:
- knowledge graphs
- linked documents
- IFC relationships

---

### Implication

The database evolves from:

> Document store → **Graph-aware retrieval system**

---

## Indexing Considerations

### Multi-Index Ingestion

Each write operation must update:

```

→ BM25 index
→ Vector index
→ Structural index

```

**Implication:**
- Requires ingestion pipeline
- Eventual consistency is likely

---

### Ranking Fusion Constraints

RRF requires:
- Comparable top-K outputs
- Stable ranking sizes

**Implication:**
- Normalize retrieval sizes across lanes

---

## Latency Considerations

Structural queries can be expensive.

```

Total latency = max(all retrieval lanes)

```

### Mitigations
- Limit graph traversal depth
- Precompute structural features
- Cache structural relationships

---

## Key Insights

### 1. Structure as Filter vs Ranker

Structural signals are often more effective as:

```

Filter → then rank with BM25 + Vector

```

rather than:

```

Competing ranking signal

```

---

### 2. Alignment is Harder than Retrieval

The biggest challenge is not search performance, but:

> Ensuring all signals refer to the same conceptual entities

---

### 3. System Evolution

This design moves the system from:

- CRUD-oriented database

to:

- **Retrieval-oriented architecture**

---

## Decision

Adopt a **polyglot architecture** with:

- BM25 + Vector in a shared search system (if possible)
- Structural data in a dedicated structure-aware store
- Fusion handled at the application layer via RRF

Design all components with:

- Shared document identifiers
- Consistent metadata filtering
- Parallel query execution

---

## Consequences

### Positive
- High-quality retrieval across multiple relevance dimensions
- Future-proof extensibility (new signals can be added)
- Alignment with modern RAG system design

### Negative
- Increased system complexity
- Data synchronization overhead
- Higher operational burden

---

## Open Questions

- Should structural similarity be:
  - a ranking signal?
  - a filtering constraint?
- What structural model best fits the domain?
- How to benchmark impact of structural retrieval on relevance?

---

