## 10. Hybrid Architecture Consideration

### 10.1 Could You Use Both?

Yes. A reasonable architecture:

```
┌─────────────────────────────────────────────────┐
│              IMemoryRepository                   │
│  (interface: Store, Recall, Search, etc.)        │
└────────────┬──────────────────────┬─────────────┘
             │                      │
    ┌────────▼────────┐   ┌────────▼────────┐
    │ SqliteMemoryRepo│   │ PgMemoryRepo    │
    │ (local, fast)   │   │ (server, shared)│
    └─────────────────┘   └─────────────────┘
```

**Sync patterns:**
- SQLite as primary, async replicate to PostgreSQL for durability/sharing
- PostgreSQL as source of truth, SQLite as local cache
- Litestream for real-time SQLite → S3 → PostgreSQL pipeline

### 10.2 Migration Path (SQLite → PostgreSQL)

The migration is straightforward because: both use standard SQL, the data model is simple, and no stored procedures or engine-specific logic lives in the database.

**Migration steps:**
1. Export: `sqlite3 memories.db .dump > export.sql`
2. Transform: Adjust `TEXT` → `text`, `INTEGER` → `boolean`, add `vector` type
3. Recreate FTS: Replace FTS5 virtual table with tsvector column + GIN index
4. Import: Load transformed SQL into PostgreSQL
5. Generate embeddings: Backfill `vector` column in PostgreSQL

**What changes in code:**
- Connection string
- SQL dialect differences (minimal for standard operations)
- FTS query syntax (`MATCH` → `@@` operators)
- Vector storage (BLOB → `vector` type)

With a well-designed repository interface, switching backends requires implementing a new class — no changes to the memory engine core.

### 10.3 Hybrid Verdict

Design for the abstraction, ship with SQLite. Add PostgreSQL when one of these triggers fires:
- The service moves from local to shared/team server
- Vector search scale exceeds sqlite-vec's comfortable range (>100K embeddings with sub-10ms latency requirement)
- Multiple machines need to share the same memory store in real-time

---

