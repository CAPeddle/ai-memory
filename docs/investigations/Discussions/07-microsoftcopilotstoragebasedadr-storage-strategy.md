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

