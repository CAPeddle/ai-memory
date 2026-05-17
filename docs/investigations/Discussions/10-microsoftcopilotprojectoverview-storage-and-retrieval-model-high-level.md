## Storage and Retrieval Model (High Level)

- Brain storage:
  - SQLite‑first
  - FTS5 for BM25
  - vector extension for embeddings
  - relational tables for structure
- Structural relationships:
  - used as **pre‑filters**, not ranking signals
- Ranking:
  - BM25 + Vector fused via RRF

Views are materialized or queried on demand.

---

