### 5.3 Database Story

Both SQLite and PostgreSQL are first-class citizens in .NET:
- **SQLite**: `Microsoft.Data.Sqlite` (Microsoft-maintained) with full FTS5 support. EF Core has a SQLite provider.
- **PostgreSQL**: `Npgsql` (the .NET PostgreSQL driver) has native support for `pgvector` via `Npgsql.EntityFrameworkCore.PostgreSQL` — making the future vector search story straightforward.

