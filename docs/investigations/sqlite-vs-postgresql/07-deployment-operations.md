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

