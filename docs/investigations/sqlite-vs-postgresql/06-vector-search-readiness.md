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

