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

