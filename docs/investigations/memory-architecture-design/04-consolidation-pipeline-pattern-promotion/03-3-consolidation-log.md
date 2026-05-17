### 4.3 Consolidation Log

```sql
CREATE TABLE consolidation_log (
    id              TEXT PRIMARY KEY,
    run_at          TEXT NOT NULL,
    candidates      INTEGER,          -- Number of candidates evaluated
    promoted        INTEGER,          -- Number promoted
    skipped         INTEGER,          -- Number skipped
    details         TEXT              -- JSON array of decisions with reasoning
);
```

