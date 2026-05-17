### 3.2 Episodic Memory (Session Logs)

Records of specific development sessions. Each episode captures what happened, what was learned, and the context.

```sql
CREATE TABLE episodic_memories (
    id              TEXT PRIMARY KEY,  -- ULID
    session_id      TEXT NOT NULL,     -- Groups entries from same session
    content         TEXT NOT NULL,     -- What happened / was learned
    embedding       BLOB,             -- Vector embedding
    project         TEXT,             -- Project context
    tags            TEXT,             -- JSON array of tags
    occurred_at     TEXT NOT NULL,     -- When this happened (ISO 8601)
    created_at      TEXT NOT NULL,     -- When stored (ISO 8601)
    agent_context   TEXT,             -- JSON: agent type, tool, file context
    promoted        INTEGER DEFAULT 0, -- 1 if promoted to semantic memory
    recall_count    INTEGER DEFAULT 0,
    last_recalled   TEXT
);
```

**Examples:**
| content | project | occurred_at |
|---------|---------|-------------|
| "Refactored BCF import module; discovered it depends on libxml2" | bcf-managers | 2025-04-15T14:30:00Z |
| "Fixed CMake find_package for Conan 2 — needed CMAKE_PREFIX_PATH from toolchain" | zoom | 2025-04-18T09:15:00Z |

