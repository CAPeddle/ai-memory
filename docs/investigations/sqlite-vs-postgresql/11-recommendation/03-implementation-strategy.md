### Implementation Strategy

```
Phase 1 (Now):     SQLite + FTS5
                   - Define IMemoryStore interface
                   - Implement SqliteMemoryStore
                   - Full FTS5 with BM25 ranking

Phase 2 (Future):  Add Vector Search
                   - sqlite-vec for local embeddings
                   - Evaluate if scale warrants PostgreSQL

Phase 3 (If needed): PostgreSQL Backend
                   - Implement PgMemoryStore (same interface)
                   - pgvector for production vector search
                   - appsettings.json toggles backend choice
```

