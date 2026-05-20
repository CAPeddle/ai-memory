## 3. Full-Text Search Deep Dive

### 3.1 SQLite FTS5

**Setup:**

```sql
-- Create the FTS5 virtual table mirroring semantic_memories
CREATE VIRTUAL TABLE semantic_memories_fts USING fts5(
    content,
    tags,
    project,
    content=semantic_memories,
    content_rowid=rowid,
    tokenize='porter unicode61 remove_diacritics 2'
);

-- Keep FTS index in sync via triggers
CREATE TRIGGER semantic_memories_ai AFTER INSERT ON semantic_memories BEGIN
    INSERT INTO semantic_memories_fts(rowid, content, tags, project)
    VALUES (new.rowid, new.content, new.tags, new.project);
END;

CREATE TRIGGER semantic_memories_ad AFTER DELETE ON semantic_memories BEGIN
    INSERT INTO semantic_memories_fts(semantic_memories_fts, rowid, content, tags, project)
    VALUES ('delete', old.rowid, old.content, old.tags, old.project);
END;

CREATE TRIGGER semantic_memories_au AFTER UPDATE ON semantic_memories BEGIN
    INSERT INTO semantic_memories_fts(semantic_memories_fts, rowid, content, tags, project)
    VALUES ('delete', old.rowid, old.content, old.tags, old.project);
    INSERT INTO semantic_memories_fts(rowid, content, tags, project)
    VALUES (new.rowid, new.content, new.tags, new.project);
END;
```

**Query Examples:**

```sql
-- Basic search with BM25 ranking
SELECT m.id, m.content, m.project, rank
FROM semantic_memories_fts fts
JOIN semantic_memories m ON m.rowid = fts.rowid
WHERE fts MATCH 'cmake AND conan'
ORDER BY rank  -- FTS5 rank is negative BM25 (lower = better)
LIMIT 10;

-- Phrase matching
SELECT m.id, m.content, rank
FROM semantic_memories_fts fts
JOIN semantic_memories m ON m.rowid = fts.rowid
WHERE fts MATCH '"find_package" AND cmake'
ORDER BY rank
LIMIT 10;

-- Column-filtered search (only match content, not tags)
SELECT m.id, m.content, rank
FROM semantic_memories_fts fts
JOIN semantic_memories m ON m.rowid = fts.rowid
WHERE fts MATCH 'content: conan AND project: zoom'
ORDER BY rank
LIMIT 10;

-- Prefix matching (autocomplete-style)
SELECT m.id, m.content, rank
FROM semantic_memories_fts fts
JOIN semantic_memories m ON m.rowid = fts.rowid
WHERE fts MATCH 'cmake*'
ORDER BY rank
LIMIT 10;

-- BM25 with column weights (content 10x, tags 5x, project 1x)
SELECT m.id, m.content, bm25(fts, 10.0, 5.0, 1.0) as score
FROM semantic_memories_fts fts
JOIN semantic_memories m ON m.rowid = fts.rowid
WHERE fts MATCH 'libxml2'
ORDER BY score
LIMIT 10;

-- Combined: FTS + project filter + active only
SELECT m.id, m.content, m.confidence, rank
FROM semantic_memories_fts fts
JOIN semantic_memories m ON m.rowid = fts.rowid
WHERE fts MATCH 'conan profile'
  AND m.project = 'zoom'
  AND m.active = 1
ORDER BY rank
LIMIT 10;
```

**FTS5 Capabilities:**
- ✅ BM25 ranking (built-in via `rank` or `bm25()` function)
- ✅ Phrase matching (`"exact phrase"`)
- ✅ Prefix queries (`term*`)
- ✅ Boolean operators (`AND`, `OR`, `NOT`)
- ✅ Column filters (`column: term`)
- ✅ Porter stemming tokenizer
- ✅ Unicode support with diacritics removal
- ✅ NEAR operator (`NEAR(term1 term2, 5)`)
- ❌ Linguistic stemming beyond Porter (no Snowball, no per-language dictionaries)
- ❌ Synonym expansion (must implement in application layer)
- ❌ Fuzzy matching (no trigram support built-in)

### 3.2 PostgreSQL Full-Text Search

**Setup:**

```sql
-- Add tsvector column and GIN index
ALTER TABLE semantic_memories
    ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(content, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(tags, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(project, '')), 'C')
    ) STORED;

CREATE INDEX idx_semantic_memories_search ON semantic_memories USING GIN(search_vector);

-- Trigram index for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_semantic_memories_trgm ON semantic_memories
    USING GIN(content gin_trgm_ops);
```

**Query Examples:**

```sql
-- Basic search with ts_rank (BM25-like ranking)
SELECT id, content, project,
       ts_rank_cd(search_vector, query) AS rank
FROM semantic_memories,
     to_tsquery('english', 'cmake & conan') query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 10;

-- Phrase matching
SELECT id, content,
       ts_rank_cd(search_vector, query) AS rank
FROM semantic_memories,
     phraseto_tsquery('english', 'find_package cmake') query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 10;

-- Prefix matching
SELECT id, content,
       ts_rank_cd(search_vector, query) AS rank
FROM semantic_memories,
     to_tsquery('english', 'cmake:*') query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 10;

-- Complex boolean with weights
SELECT id, content,
       ts_rank_cd(search_vector, query, 32) AS rank  -- 32 = divide by rank+1
FROM semantic_memories,
     to_tsquery('english', 'conan & (profile | toolchain) & !v1') query
WHERE search_vector @@ query
  AND project = 'zoom'
  AND active = true
ORDER BY rank DESC
LIMIT 10;

-- Fuzzy matching via trigrams (catches typos)
SELECT id, content, similarity(content, 'libxlm2') AS sim
FROM semantic_memories
WHERE content % 'libxlm2'  -- trigram similarity operator
ORDER BY sim DESC
LIMIT 10;

-- Websearch-style query (more natural syntax)
SELECT id, content,
       ts_rank_cd(search_vector, websearch_to_tsquery('english', 'conan cmake profiles')) AS rank
FROM semantic_memories
WHERE search_vector @@ websearch_to_tsquery('english', 'conan cmake profiles')
ORDER BY rank DESC
LIMIT 10;

-- Headline generation (highlighted snippets)
SELECT id,
       ts_headline('english', content, query,
                   'StartSel=**, StopSel=**, MaxFragments=2') AS snippet,
       ts_rank_cd(search_vector, query) AS rank
FROM semantic_memories,
     to_tsquery('english', 'cmake & conan') query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 10;
```

**PostgreSQL FTS Capabilities:**
- ✅ Ranking via `ts_rank` and `ts_rank_cd` (not pure BM25 but comparable)
- ✅ Phrase matching (`phraseto_tsquery`)
- ✅ Prefix queries (`term:*`)
- ✅ Boolean operators (`&`, `|`, `!`)
- ✅ Weighted fields (A/B/C/D weights in tsvector)
- ✅ Multiple language dictionaries (Snowball stemmers for 20+ languages)
- ✅ Synonym dictionaries and thesaurus
- ✅ Trigram fuzzy matching (pg_trgm extension)
- ✅ `websearch_to_tsquery` for natural language input
- ✅ Headline/snippet generation
- ✅ Custom text search configurations
- ❌ True BM25 (ts_rank is TF-IDF-based, but close enough in practice)
- ❌ Zero-config (requires explicit configuration choices)

### 3.3 FTS Verdict

PostgreSQL's FTS is objectively richer — synonym expansion, fuzzy matching, multiple language stemmers, headline generation. However, for ai-memory's use case (English-only technical content, queries generated by AI agents that don't make typos), **SQLite FTS5 provides everything needed**:

- BM25 ranking ✓
- Phrase matching ✓
- Boolean queries ✓
- Column-weighted scoring ✓
- Prefix search ✓

The gap narrows to: PostgreSQL wins on fuzzy matching (irrelevant for AI-generated queries) and linguistic diversity (irrelevant for English technical content).

---

