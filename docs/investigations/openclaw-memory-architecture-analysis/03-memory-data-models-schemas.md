## 3. Memory Data Models / Schemas

### facts.db — Core Knowledge Graph

```sql
CREATE TABLE IF NOT EXISTS facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity TEXT NOT NULL,          -- "Sascha", "Postiz", "decision"
    key TEXT NOT NULL,             -- "birthday", "stack", "always use trash"
    value TEXT NOT NULL,           -- "March 15, 1990", "Next.js + PostgreSQL"
    category TEXT NOT NULL,        -- 14 enforced categories
    source TEXT,                   -- "metabolism", "manual", "conversation 2026-02-14"
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_accessed TEXT,            -- updated on every retrieval
    access_count INTEGER DEFAULT 0,
    permanent BOOLEAN DEFAULT 0,   -- 1 = never decays
    decay_score REAL DEFAULT 1.0,  -- computed decay for pruning
    activation REAL DEFAULT 0.0,   -- Hebbian: bumped on retrieval
    importance REAL DEFAULT 0.5    -- baseline importance (0.0-1.0)
);

CREATE TABLE IF NOT EXISTS relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object TEXT NOT NULL,
    source TEXT DEFAULT 'metabolism',
    category TEXT DEFAULT 'person',
    permanent BOOLEAN DEFAULT 1,
    activation REAL DEFAULT 0.0,
    decay_score REAL DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS aliases (
    alias TEXT NOT NULL COLLATE NOCASE,
    entity TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (alias, entity)
);

CREATE TABLE IF NOT EXISTS facts_changelog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity TEXT NOT NULL,
    key TEXT NOT NULL,
    operation TEXT NOT NULL,       -- "insert", "update", "delete", "prune"
    old_value TEXT,
    new_value TEXT,
    source TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS co_occurrences (
    fact_a TEXT NOT NULL,
    fact_b TEXT NOT NULL,
    weight REAL NOT NULL
);

-- FTS5 index for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
    entity, key, value,
    content=facts,
    content_rowid=id
);

-- Auto-sync triggers for FTS
CREATE TRIGGER facts_ai AFTER INSERT ON facts BEGIN
    INSERT INTO facts_fts(rowid, entity, key, value)
    VALUES (new.id, new.entity, new.key, new.value);
END;

-- Relations also get FTS
CREATE VIRTUAL TABLE IF NOT EXISTS relations_fts USING fts5(
    subject, predicate, object,
    content=relations,
    content_rowid=id
);
```

### 14-Category Taxonomy (enforced)

| Domain | Categories |
|--------|-----------|
| People | `person`, `family`, `friend`, `pet` |
| Knowledge | `psychedelic`, `reference` |
| Tech | `project`, `infrastructure`, `tool` |
| Decisions | `decision`, `preference`, `convention` |
| Ops | `automation`, `workflow` |

**Born permanent** (never decay): `family`, `friend`, `person`, `pet`, `psychedelic`, `decision`, `preference`

### LCM (Lossless Context Management) — lcm.db

- Every message (user, assistant, tool I/O) stored with FTS5 indexing
- Summary DAG: leaf summaries (depth 0) from oldest messages, merged into higher levels
- Nothing ever deleted — drill into any summary to recover originals
- Context assembly walks DAG to reconstruct most relevant context per turn

---

