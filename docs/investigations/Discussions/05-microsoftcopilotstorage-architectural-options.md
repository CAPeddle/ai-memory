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

