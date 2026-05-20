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

