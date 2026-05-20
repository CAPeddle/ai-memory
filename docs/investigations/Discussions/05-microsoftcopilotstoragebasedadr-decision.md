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

