### 5.2 SQLite WAL Mode

```sql
PRAGMA journal_mode = WAL;         -- Write-Ahead Logging
PRAGMA busy_timeout = 5000;        -- Wait 5s for locks instead of failing
PRAGMA synchronous = NORMAL;       -- Good durability without fsync on every commit
PRAGMA cache_size = -64000;        -- 64MB page cache
PRAGMA mmap_size = 268435456;      -- Memory-map up to 256MB
```

**Characteristics in WAL mode:**
- Unlimited concurrent readers
- Single writer at a time (others queue, don't fail)
- Writers don't block readers
- Readers don't block the writer
- Write transactions serialize — at 5 concurrent sessions, write contention is negligible
- `busy_timeout` handles the rare collision gracefully

**For ai-memory's workload**: WAL mode is more than adequate. The write rate is low (a few inserts per minute during active sessions) and reads dominate. Write serialization is invisible at this scale.

