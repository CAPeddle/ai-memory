### 3.1 Semantic Memory (Evergreen Facts)

Permanent truths about projects, tools, conventions, and patterns. These never expire.

```sql
CREATE TABLE semantic_memories (
    id              TEXT PRIMARY KEY,  -- ULID for time-sortable unique IDs
    content         TEXT NOT NULL,     -- The fact in natural language
    embedding       BLOB,             -- Vector embedding for semantic search
    source          TEXT NOT NULL,     -- 'user_taught' | 'promoted' | 'observed'
    project         TEXT,             -- NULL = cross-project, else project slug
    tags            TEXT,             -- JSON array of tags
    confidence      REAL DEFAULT 1.0, -- 0.0–1.0, user-taught starts at 1.0
    created_at      TEXT NOT NULL,     -- ISO 8601
    updated_at      TEXT NOT NULL,     -- ISO 8601
    promoted_from   TEXT,             -- episodic_memory ID if promoted
    recall_count    INTEGER DEFAULT 0, -- Times this memory was returned in search
    last_recalled   TEXT,             -- ISO 8601 of last recall
    supersedes      TEXT,             -- ID of memory this corrects/replaces
    active          INTEGER DEFAULT 1  -- 0 = soft-deleted/corrected
);
```

**Examples:**
| content | source | project |
|---------|--------|---------|
| "The zoom project uses CMake 3.25+" | user_taught | zoom |
| "Conan v2 profiles are in ~/.conan2/profiles" | user_taught | NULL |
| "BCF Manager uses .NET 8" | user_taught | bcf-managers |
| "libxml2 must be linked with ICU on macOS" | promoted | zoom |

