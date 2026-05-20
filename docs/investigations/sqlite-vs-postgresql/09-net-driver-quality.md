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

