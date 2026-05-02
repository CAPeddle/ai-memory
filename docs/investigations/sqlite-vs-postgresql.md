# Investigation: SQLite vs PostgreSQL for ai-memory Storage

| Field | Value |
|-------|-------|
| **Created** | 2025-05-02 |
| **Status** | Complete |
| **Scope** | Database engine selection for ai-memory service |
| **Decision** | **SQLite** (start), with migration path to PostgreSQL if needed |

---

## 1. Executive Summary

For an AI agent memory service running locally on a Windows dev laptop with 1–5 concurrent agent sessions, **SQLite is the correct starting choice**. It eliminates deployment friction, delivers competitive FTS performance at projected scale (≤500K records in 3 years), and keeps the service self-contained. PostgreSQL becomes the right choice **only** if the service moves to a shared server, requires high write concurrency (>5 simultaneous writers), or needs production-grade vector search at scale (>1M embeddings).

The recommended approach is **phased**: start with SQLite + FTS5, abstract the storage layer behind a repository interface from day one, and add PostgreSQL as a backend option when the scale/deployment model demands it.

---

## 2. Comparison Matrix

| Criterion | SQLite (FTS5 + WAL) | PostgreSQL (tsvector + pgvector) | Verdict |
|-----------|---------------------|----------------------------------|---------|
| **FTS Quality** | BM25 ranking, prefix queries, phrase matching, column filters | BM25 via ts_rank, rich query operators, dictionaries, stemming configs | **PostgreSQL** (richer linguistics, but SQLite is sufficient) |
| **FTS Performance @ 100K** | <5ms typical queries | <5ms typical queries | **Tie** |
| **FTS Performance @ 1M** | 10–50ms depending on index size | 5–20ms with GIN | **PostgreSQL** (slight edge) |
| **Vector Search** | sqlite-vec (new, usable), sqlite-vss (abandoned) | pgvector (production-grade, 60K+ stars) | **PostgreSQL** (clear winner) |
| **Concurrency** | WAL: unlimited readers, 1 writer | Full MVCC, pooled connections | **PostgreSQL** (but SQLite is fine for 1–5 clients) |
| **Deployment** | Zero config, single file | Server process, port, auth, config | **SQLite** (decisive) |
| **Backup & Portability** | Copy the .db file | pg_dump / logical replication | **SQLite** (trivial) |
| **Growth @ 500K records** | ~2GB file, fast | Trivial | **Tie** |
| **Growth @ 5M records** | 10GB+ file, vacuum needed | Trivial, autovacuum | **PostgreSQL** |
| **Memory Footprint** | ~50MB working set | 200MB+ base footprint | **SQLite** |
| **.NET Driver Quality** | Microsoft.Data.Sqlite (1st party) | Npgsql (excellent, EF Core provider) | **Tie** (both excellent) |
| **Windows Deployment** | Embedded in process | Installer/Docker/WSL required | **SQLite** |
| **Cloud Migration** | Litestream, rsync, simple copy | Managed offerings everywhere | **PostgreSQL** (when you need it) |

**Overall**: SQLite wins 5 categories, PostgreSQL wins 4, Tie on 3. For local single-user operation, SQLite's advantages are decisive.

---

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

## 4. Growth Projections

### 4.1 Assumptions

Based on typical Copilot agent usage patterns:

| Metric | Conservative | Moderate | Heavy |
|--------|:------------:|:--------:|:-----:|
| Sessions/day | 3 | 8 | 15 |
| Semantic memories/day (new facts) | 2 | 5 | 15 |
| Episodic entries/session | 5 | 10 | 20 |
| Recall events/session | 10 | 25 | 50 |
| Avg content size | 150 bytes | 200 bytes | 300 bytes |

### 4.2 Projected Record Counts

| Time | Semantic | Episodic | Recall Events | Total Records |
|------|:--------:|:--------:|:-------------:|:-------------:|
| 1 month | 150 | 2,400 | 6,000 | 8,550 |
| 6 months | 900 | 14,400 | 36,000 | 51,300 |
| **1 year** | **1,800** | **28,800** | **72,000** | **102,600** |
| 2 years | 3,600 | 57,600 | 144,000 | 205,200 |
| **3 years** | **5,400** | **86,400** | **216,000** | **307,800** |

*Moderate usage scenario. Conservative would be ~⅓ of these numbers.*

### 4.3 Projected Database Size (Moderate Usage)

| Time | Raw Data | FTS Index | Vector Embeddings* | Total DB File |
|------|:--------:|:---------:|:------------------:|:-------------:|
| 1 year | ~25MB | ~15MB | ~150MB | **~190MB** |
| 3 years | ~75MB | ~45MB | ~450MB | **~570MB** |
| 5 years (if it gets there) | ~125MB | ~75MB | ~750MB | **~950MB** |

*Vector embeddings at 1536 dimensions × 4 bytes × record count. Only relevant when vector search is added.*

### 4.4 Growth Verdict

Both engines handle these sizes trivially:
- **SQLite**: A 1GB database file is well within comfortable operating range. SQLite has been tested to 281TB. The FTS5 index will remain fast at these scales.
- **PostgreSQL**: These numbers wouldn't even register as a small database.

The "unbounded growth" constraint sounds alarming, but in practice a local dev tool generates modest data. Even at heavy usage for 5 years, we're looking at ~1GB — a rounding error for either database.

**Concern point**: If vector embeddings are stored inline (1536-dim float32 = 6KB per record), the database grows faster. At 300K records with embeddings: ~1.8GB of vector data alone. This is still manageable for both engines but makes vacuum/compaction relevant for SQLite.

---

## 5. Concurrency Analysis

### 5.1 Realistic Concurrency for ai-memory

- **Typical**: 1 agent session active at a time
- **Peak**: 2–3 sessions (user has multiple VS Code windows with Copilot)
- **Theoretical max**: 5 simultaneous sessions (user + automated background agents)
- **Write pattern**: Bursty — clusters of writes during active interaction, then quiet

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

### 5.3 PostgreSQL MVCC

- True multi-version concurrency control
- Multiple simultaneous writers
- Row-level locking
- Connection pooling (PgBouncer, Npgsql built-in pooling)
- No write queue — all writers proceed in parallel

**For ai-memory's workload**: Complete overkill, but zero issues. Like using a fire hose to fill a cup.

### 5.4 Concurrency Verdict

SQLite's WAL mode handles 5 concurrent sessions without any observable latency. PostgreSQL's MVCC is irrelevant at this scale. **SQLite wins on simplicity** — no connection pooling to configure, no max_connections to tune.

---

## 6. Vector Search Readiness

### 6.1 SQLite Vector Extensions

#### sqlite-vec (Recommended)

- **Author**: Alex Garcia (creator of sqlite-utils, datasette ecosystem)
- **Status**: v0.1.6 (as of early 2026) — actively developed, nearing stable
- **Approach**: Virtual table for vector storage, brute-force or IVF search
- **Distance functions**: L2 (Euclidean), cosine, inner product
- **Max dimensions**: Unlimited (tested to 4096)
- **Storage**: Vectors stored as BLOB in virtual table
- **.NET binding**: No official NuGet package. Must load as SQLite extension via `sqlite3_load_extension` or bundle the native binary.

```sql
-- Create vector index
CREATE VIRTUAL TABLE semantic_memories_vec USING vec0(
    memory_id TEXT PRIMARY KEY,
    embedding float[1536]
);

-- Insert vector
INSERT INTO semantic_memories_vec(memory_id, embedding)
VALUES ('01HQ...', :embedding_blob);

-- KNN search
SELECT memory_id, distance
FROM semantic_memories_vec
WHERE embedding MATCH :query_embedding
  AND k = 10;
```

**.NET Integration Pattern:**

```csharp
// Load sqlite-vec extension
using var connection = new SqliteConnection("Data Source=memories.db");
connection.Open();

// Load native extension (ship sqlite_vec.dll with app)
var loadExtCmd = connection.CreateCommand();
loadExtCmd.CommandText = "SELECT load_extension('sqlite_vec')";
loadExtCmd.ExecuteNonQuery();

// KNN search
var searchCmd = connection.CreateCommand();
searchCmd.CommandText = @"
    SELECT memory_id, distance
    FROM semantic_memories_vec
    WHERE embedding MATCH @query
      AND k = @k";
searchCmd.Parameters.AddWithValue("@query", queryEmbeddingBytes);
searchCmd.Parameters.AddWithValue("@k", 10);
```

**Assessment**: Usable today for moderate scale (<100K vectors). Performance degrades with brute-force scan at large scale. IVF index helps but isn't as mature as HNSW. Good enough for Phase 2 of ai-memory.

#### sqlite-vss (Deprecated)

- Built on Faiss, was complex to build and distribute
- **Abandoned by the author** in favor of sqlite-vec
- Do not use

### 6.2 PostgreSQL pgvector

- **Status**: v0.8.0+ — production-grade, used in production by thousands of companies
- **Stars**: 14K+ on GitHub
- **Index types**: IVFFlat, HNSW (added in v0.5.0)
- **Distance functions**: L2, cosine, inner product, L1, Hamming, Jaccard
- **Max dimensions**: 16,000 (HNSW), 2,000 (IVFFlat)
- **.NET support**: First-class via Npgsql — `NpgsqlVector` type

```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector column
ALTER TABLE semantic_memories ADD COLUMN embedding vector(1536);

-- Create HNSW index (best for recall quality)
CREATE INDEX idx_semantic_memories_embedding
    ON semantic_memories
    USING hnsw(embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- KNN search
SELECT id, content, project,
       1 - (embedding <=> :query_embedding) AS similarity
FROM semantic_memories
WHERE active = true
  AND project = 'zoom'
ORDER BY embedding <=> :query_embedding
LIMIT 10;

-- Combined: vector similarity + FTS score (hybrid search)
SELECT id, content,
       (0.7 * (1 - (embedding <=> :query_embedding))) +
       (0.3 * ts_rank_cd(search_vector, to_tsquery('english', 'cmake'))) AS combined_score
FROM semantic_memories
WHERE active = true
  AND (search_vector @@ to_tsquery('english', 'cmake')
       OR embedding <=> :query_embedding < 0.5)
ORDER BY combined_score DESC
LIMIT 10;
```

**.NET Integration Pattern:**

```csharp
using Npgsql;
using Pgvector;
using Pgvector.Npgsql;

// Register pgvector type mapping globally
var dataSourceBuilder = new NpgsqlDataSourceBuilder(connectionString);
dataSourceBuilder.UseVector();
await using var dataSource = dataSourceBuilder.Build();

// KNN search
await using var cmd = dataSource.CreateCommand();
cmd.CommandText = @"
    SELECT id, content, project,
           1 - (embedding <=> @query) AS similarity
    FROM semantic_memories
    WHERE active = true
    ORDER BY embedding <=> @query
    LIMIT @k";
cmd.Parameters.AddWithValue("@query", new Vector(queryEmbedding));
cmd.Parameters.AddWithValue("@k", 10);

await using var reader = await cmd.ExecuteReaderAsync();
```

**Assessment**: Production-grade, battle-tested, excellent .NET support. The clear winner for vector search if/when PostgreSQL is adopted.

### 6.3 Vector Search Verdict

| Factor | sqlite-vec | pgvector |
|--------|:----------:|:--------:|
| Maturity | Early (v0.1.x) | Production (v0.8.x) |
| .NET bindings | Manual extension loading | First-class NuGet (Pgvector.Npgsql) |
| Index quality | Brute-force / basic IVF | HNSW (state of the art) |
| Scale ceiling | ~100K vectors comfortably | Millions |
| Hybrid search (FTS + vector) | Separate queries, merge in app | Single SQL query |

**pgvector is objectively superior**, but sqlite-vec is adequate for Phase 2 at the projected scale (<100K vectors). The migration path is clear: start with sqlite-vec, move to pgvector when scale demands it.

---

## 7. Deployment & Operations

### 7.1 SQLite Deployment on Windows

```
ai-memory/
├── ai-memory.exe          (self-contained .NET 8 publish)
├── memories.db            (the entire database)
├── sqlite_vec.dll         (vector extension, when needed)
└── appsettings.json
```

- **Install**: Unzip or `dotnet publish -r win-x64 --self-contained`
- **Configure**: Nothing. The DB file is created on first run.
- **Backup**: Copy `memories.db` (or use `.backup` command while running)
- **Move to another machine**: Copy the entire folder
- **Upgrade**: Replace the exe, DB format is stable

### 7.2 PostgreSQL Deployment on Windows

**Option A: Native installer**
- Download from postgresql.org
- Run installer (requires admin)
- Configure `pg_hba.conf`, `postgresql.conf`
- Create database, user, extensions
- Manage Windows service (auto-start, memory, connections)

**Option B: Docker**
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    volumes: ["./pgdata:/var/lib/postgresql/data"]
    environment:
      POSTGRES_DB: ai_memory
      POSTGRES_PASSWORD: ${PG_PASSWORD}
```

**Option C: WSL2**
- Run PostgreSQL in WSL2 Ubuntu
- Access from Windows via localhost:5432

All options require:
- Service management (start on boot, crash recovery)
- Port configuration and firewall
- Authentication setup
- Periodic maintenance (`VACUUM ANALYZE`, `REINDEX`)

### 7.3 Deployment Verdict

For a local dev tool, **SQLite's zero-configuration deployment is a massive advantage**. No services to manage, no ports to configure, no passwords to set. The user installs ai-memory and it works.

---

## 8. Backup & Portability

### 8.1 SQLite

```powershell
# Hot backup (while service is running)
sqlite3 memories.db ".backup memories-backup.db"

# Or simply copy the file (safe if using WAL and no active writers)
Copy-Item memories.db memories-backup.db

# Move to another machine
Copy-Item memories.db \\other-machine\share\memories.db
# Done. That's it. The database is fully self-contained.
```

**Programmatic backup in .NET:**

```csharp
using var source = new SqliteConnection("Data Source=memories.db");
using var destination = new SqliteConnection("Data Source=backup.db");
source.Open();
destination.Open();
source.BackupDatabase(destination);
```

### 8.2 PostgreSQL

```powershell
# Logical backup
pg_dump -Fc ai_memory > ai_memory.dump

# Restore on another machine
pg_restore -d ai_memory ai_memory.dump

# Or for portability: plain SQL dump
pg_dump ai_memory > ai_memory.sql
psql -d ai_memory -f ai_memory.sql
```

For moving between machines, you need PostgreSQL installed on both, with matching extension versions (pgvector, pg_trgm).

### 8.3 Portability Verdict

SQLite: copy a file. PostgreSQL: install a server, create a database, install extensions, restore a dump. **SQLite wins decisively** for a personal dev tool that might travel between machines.

---

## 9. .NET Driver Quality

### 9.1 Microsoft.Data.Sqlite

- **Publisher**: Microsoft (first party, ships with .NET SDK)
- **NuGet**: `Microsoft.Data.Sqlite` (9M+ downloads/week)
- **FTS5 support**: Full — FTS5 is compiled into the bundled SQLite
- **Custom functions**: `connection.CreateFunction()` — register C# functions callable from SQL
- **Collations**: Custom collation support
- **Streaming BLOBs**: `SqliteBlob` for efficient large binary access
- **Bundled SQLite version**: Matches latest stable (via `Microsoft.Data.Sqlite.Core` + `SQLitePCLRaw`)
- **Extension loading**: Supported via `sqlite3_enable_load_extension`

```csharp
using Microsoft.Data.Sqlite;

var connection = new SqliteConnection("Data Source=memories.db");
connection.Open();

// Enable WAL mode
using var walCmd = connection.CreateCommand();
walCmd.CommandText = "PRAGMA journal_mode=WAL";
walCmd.ExecuteNonQuery();

// Register a custom scoring function
connection.CreateFunction("memory_score", (double bm25, int recallCount, string confidence) =>
{
    return bm25 * (1.0 + Math.Log(1 + recallCount)) * double.Parse(confidence);
});

// Use in queries
var cmd = connection.CreateCommand();
cmd.CommandText = @"
    SELECT m.id, m.content,
           memory_score(bm25(fts, 10.0, 5.0, 1.0), m.recall_count, m.confidence) as score
    FROM semantic_memories_fts fts
    JOIN semantic_memories m ON m.rowid = fts.rowid
    WHERE fts MATCH @query AND m.active = 1
    ORDER BY score
    LIMIT @limit";
cmd.Parameters.AddWithValue("@query", searchTerm);
cmd.Parameters.AddWithValue("@limit", 10);
```

### 9.2 Npgsql

- **Publisher**: Npgsql community (Shay Rojansky et al.)
- **NuGet**: `Npgsql` (5M+ downloads/week)
- **FTS support**: Full tsvector/tsquery type support
- **pgvector support**: Via `Pgvector.Npgsql` package — first-class Vector type
- **Bulk operations**: `COPY` protocol for high-speed inserts
- **Connection pooling**: Built-in, multiplexing mode available
- **NativeAOT**: Supported
- **EF Core**: `Npgsql.EntityFrameworkCore.PostgreSQL`

```csharp
using Npgsql;
using Pgvector;
using Pgvector.Npgsql;

var dataSourceBuilder = new NpgsqlDataSourceBuilder(connectionString);
dataSourceBuilder.UseVector();
await using var dataSource = dataSourceBuilder.Build();

// Full-text search
await using var cmd = dataSource.CreateCommand();
cmd.CommandText = @"
    SELECT id, content, project,
           ts_rank_cd(search_vector, query) AS rank
    FROM semantic_memories,
         websearch_to_tsquery('english', @search) query
    WHERE search_vector @@ query
      AND active = true
    ORDER BY rank DESC
    LIMIT @limit";
cmd.Parameters.AddWithValue("@search", searchTerm);
cmd.Parameters.AddWithValue("@limit", 10);

// Bulk insert with COPY
await using var writer = await connection.BeginBinaryImportAsync(
    "COPY recall_events (id, memory_id, memory_type, query, recalled_at) FROM STDIN (FORMAT BINARY)");
foreach (var evt in events)
{
    await writer.StartRowAsync();
    await writer.WriteAsync(evt.Id);
    await writer.WriteAsync(evt.MemoryId);
    await writer.WriteAsync(evt.MemoryType);
    await writer.WriteAsync(evt.Query);
    await writer.WriteAsync(evt.RecalledAt);
}
await writer.CompleteAsync();
```

### 9.3 Driver Verdict

Both are excellent, mature, well-maintained drivers. Microsoft.Data.Sqlite has the advantage of being first-party and requiring no external dependencies. Npgsql has richer bulk operations and the pgvector integration is smoother. **Tie** — neither driver is a reason to choose one database over the other.

---

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

## 11. Recommendation

### Primary: Start with SQLite

**Use SQLite when (all current conditions):**
- ✅ Service runs locally on one machine
- ✅ 1–5 concurrent agent sessions
- ✅ <500K total records (covers 3+ years of use)
- ✅ FTS is the primary retrieval mechanism
- ✅ Zero deployment friction is valued
- ✅ Single-file backup/portability is desired

### Upgrade to PostgreSQL when:
- ⬜ Service becomes multi-user (team memory server)
- ⬜ Vector search at >100K embeddings needs sub-10ms HNSW performance
- ⬜ Write concurrency from >5 simultaneous heavy writers
- ⬜ Cloud deployment with managed database (RDS, Cloud SQL, Azure Database)
- ⬜ Advanced FTS features needed (synonyms, domain-specific dictionaries, fuzzy matching)

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

### Critical Design Principle

Abstract the storage layer from day one:

```csharp
public interface IMemoryStore
{
    Task<string> StoreSemanticMemory(SemanticMemory memory);
    Task<string> StoreEpisodicMemory(EpisodicMemory memory);
    Task<IReadOnlyList<MemorySearchResult>> Search(MemoryQuery query);
    Task<IReadOnlyList<MemorySearchResult>> VectorSearch(float[] embedding, int k);
    Task LogRecall(RecallEvent recallEvent);
}

// Configuration-driven backend selection
services.AddSingleton<IMemoryStore>(sp =>
    configuration["Storage:Backend"] switch
    {
        "sqlite" => new SqliteMemoryStore(configuration["Storage:SqlitePath"]),
        "postgresql" => new PgMemoryStore(configuration["Storage:PostgresConnection"]),
        _ => throw new InvalidOperationException("Unknown storage backend")
    });
```

This ensures the database engine is an implementation detail, not an architectural commitment.

---

## 12. References

- [SQLite FTS5 Documentation](https://www.sqlite.org/fts5.html)
- [PostgreSQL Full Text Search](https://www.postgresql.org/docs/current/textsearch.html)
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [Microsoft.Data.Sqlite Documentation](https://learn.microsoft.com/en-us/dotnet/standard/data/sqlite/)
- [Npgsql Documentation](https://www.npgsql.org/doc/)
- [Pgvector.Npgsql](https://github.com/pgvector/pgvector-dotnet)
- [SQLite WAL Mode](https://www.sqlite.org/wal.html)
