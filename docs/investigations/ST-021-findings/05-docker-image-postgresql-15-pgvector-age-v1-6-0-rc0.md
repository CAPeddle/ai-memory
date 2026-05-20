## §R4 — Docker Image: PostgreSQL 15 + pgvector + AGE v1.6.0-rc0

**Status: Build validated locally. Both containers started healthy; `vector` and `age` extensions loaded; `memory_graph` created by init SQL.**

### Version note

AGE `v1.7.0` does not exist for PostgreSQL 15. The latest stable PG15-compatible release is `PG15/v1.6.0-rc0`. AGE v1.7.0 is available only for PG17 and PG18. Use `PG15/v1.6.0-rc0` for all PG15 deployments.

### Corporate SSL proxy workaround

`git clone` inside Docker fails with an SSL CA certificate error when a Fortinet (or similar) HTTPS-intercepting proxy is active on the host. The solution is to download the AGE tarball on the Windows host and COPY it into the image:

```powershell
# Run once on host to download the tarball
Invoke-WebRequest -Uri https://github.com/apache/age/archive/refs/tags/PG15/v1.6.0-rc0.tar.gz `
  -OutFile docker/postgres-age/age-v1.6.0-rc0.tar.gz
```

### Dockerfile

```dockerfile
FROM postgres:15
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    flex \
    bison \
    postgresql-server-dev-15 \
    postgresql-15-pgvector \
 && rm -rf /var/lib/apt/lists/*
COPY docker/postgres-age/age-v1.6.0-rc0.tar.gz /tmp/age.tar.gz
RUN tar -xzf /tmp/age.tar.gz -C /tmp \
 && mv /tmp/age-PG15-v1.6.0-rc0 /tmp/age \
 && cd /tmp/age \
 && make \
 && make install \
 && rm -rf /tmp/age /tmp/age.tar.gz
COPY docker/postgres-age/init/01-extensions.sql /docker-entrypoint-initdb.d/01-extensions.sql
COPY server/db/schema.sql                        /docker-entrypoint-initdb.d/02-schema.sql
COPY server/db/graph.sql                         /docker-entrypoint-initdb.d/03-graph.sql
```

**`flex` and `bison` are required** for AGE's parser generation step (`make` fails without them on the `postgres:15` base image).

**Location:** `docker/postgres-age/Dockerfile`

**Init SQL** (`docker/postgres-age/init/01-extensions.sql`):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS age;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
```

**Key note on AGE session setup:** AGE requires `LOAD 'age'` and `SET search_path = ag_catalog, "$user", public` at the start of every **database session** that uses `cypher()`. `SET search_path` in the init SQL is session-local and does not persist as a database default — it applies only for the duration of the init script's session. To make the search_path permanent, add `ALTER DATABASE ai_memory SET search_path = ag_catalog, "$user", public` to the init SQL. Application-level queries must issue `LOAD 'age'` regardless. The `graph_traverse` MCP tool handles this in the `sql.unsafe()` block.

**Memory graph creation:**
```sql
SELECT create_graph('memory_graph');
```

This must be run once after the database initialises. It should be added to the schema migration scripts (after `01-extensions.sql`).

---

