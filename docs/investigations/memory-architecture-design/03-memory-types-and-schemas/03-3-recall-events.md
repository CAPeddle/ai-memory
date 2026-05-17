### 3.3 Recall Events

Every search hit is logged to feed the consolidation pipeline.

```sql
CREATE TABLE recall_events (
    id              TEXT PRIMARY KEY,
    memory_id       TEXT NOT NULL,     -- FK to semantic or episodic memory
    memory_type     TEXT NOT NULL,     -- 'semantic' | 'episodic'
    query           TEXT NOT NULL,     -- The search query that triggered recall
    query_embedding BLOB,             -- Embedding of the query
    project_context TEXT,             -- What project the agent was working in
    relevance_score REAL,             -- How relevant the result was (search score)
    position        INTEGER,          -- Rank position in results
    recalled_at     TEXT NOT NULL,     -- ISO 8601
    feedback        TEXT              -- 'helpful' | 'irrelevant' | NULL (no feedback)
);
```

