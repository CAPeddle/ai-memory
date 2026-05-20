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

