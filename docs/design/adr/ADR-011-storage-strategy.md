---
name: "ADR-011: Storage Strategy"
asset_type: "adr"
status: "accepted"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-011-storage-strategy.md"
created: "2026-05-16"
supersedes: "docs/design/adr/ADR-002-storage-backend.md"
---

# ADR-011: Storage Strategy

**Status:** Accepted — supersedes [ADR-002](ADR-002-storage-backend.md)  
**Date:** 2026-05-16  
**Deciders:** PO (sole maintainer)

---

## Context

ADR-002 selected SQLite as the v1.0 storage backend for local-first deployment. All four migration triggers documented in ADR-002 have now fired simultaneously:

1. **Cloud deployment with managed database required** — the MCP server is cloud-hosted (ADR-009)
2. **Multi-user potential** — the server is publicly accessible; the architecture must not foreclose multi-user access even if single-user is the current target
3. **100K+ vector performance** — pgvector HNSW outperforms sqlite-vec at this scale
4. **Graph traversal requirement** — Apache AGE requires PostgreSQL; structural search via openCypher is a confirmed requirement (ADR-003)

SQLite is dropped entirely. PostgreSQL 15 with pgvector and Apache AGE v1.7.0 is the starting point, not the migration target.

The local synthesis service (C#, WSL2) has no persistent storage of its own. It is a stateless pull client that queries the cloud MCP server and writes Markdown files to the local filesystem.

---

## Decision

### PostgreSQL 15 + pgvector + Apache AGE v1.7.0

All three extensions are co-located in a single PostgreSQL 15 instance running in Docker.

**PostgreSQL 15:** Selected to align with Supabase's managed PostgreSQL version (forward-compatibility if managed hosting is evaluated in future) and to access PG15's performance improvements (vacuuming, query planner).

**pgvector:** Provides HNSW vector indexes for semantic search. Configured at 512 dimensions (ADR-003) using OpenAI `text-embedding-3-small` with native truncation.

```sql
CREATE EXTENSION vector;

-- HNSW index on thoughts embedding column
CREATE INDEX ON thoughts USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**Apache AGE v1.7.0:** Provides openCypher graph query support. AGE v1.7.0 supports PostgreSQL 11–18; PG15 compatibility is confirmed. AGE is installed from source in the custom Docker image.

```sql
CREATE EXTENSION age;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;

CREATE GRAPH memory_graph;
```

**tsvector / tsquery (built-in):** No extension required. BM25-approximation search via `ts_rank_cd`. A generated `search_vector` column on the `thoughts` table is maintained automatically:

```sql
ALTER TABLE thoughts
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX ON thoughts USING GIN (search_vector);
```

### Custom PostgreSQL Docker image

```dockerfile
FROM postgres:15

# pgvector
RUN apt-get update && apt-get install -y postgresql-15-pgvector

# Apache AGE v1.7.0
RUN apt-get install -y build-essential git postgresql-server-dev-15 \
    && git clone --branch v1.7.0 https://github.com/apache/age.git \
    && cd age && make && make install
```

### Embedding dimensions: 512

`text-embedding-3-small` with OpenAI's `dimensions: 512` parameter (native truncation, not post-hoc).

Storage budget at 100K memories:
- Vectors: 100K × 512 × 4 bytes = **200MB**
- Content (avg 500 bytes): 100K × 500B = **50MB**
- Indexes, metadata, AGE graph: ~**100MB**
- Total estimate: ~**350MB** — comfortable within a $6/month VPS volume budget

### No local SQLite

The local synthesis service (C#, WSL2) reads from the cloud PostgreSQL via the MCP StreamableHTTP interface. It does not maintain a local SQLite mirror or cache. Synthesis state (last synthesised thought ID per view) is stored in a local JSON file (`~/.ai-memory/synthesis-state.json`), not a database.

### IMemoryStore abstraction (conceptual carry-forward)

The `IMemoryStore` abstraction principle from ADR-002 carries forward as a design discipline in the TypeScript server: database queries are encapsulated in repository functions (`thoughtsRepo.ts`, `graphRepo.ts`) rather than scattered through tool handlers. This allows the connection target to be changed via environment variable without touching tool logic.

---

## Consequences

### Positive
- Single PostgreSQL instance provides all storage capabilities: relational, vector (pgvector), lexical (tsvector), and graph (AGE)
- No external graph database service (Neo4j, FalkorDB) required
- pgvector HNSW at 512 dimensions provides sub-10ms vector search at 100K+ embeddings
- AGE v1.7.0 + PG15 is the current supported combination; no version mismatch
- 512-dim embeddings keep the storage budget well within the target for a 3-year usage horizon at moderate activity
- Docker image is reproducible and version-pinned

### Negative / Trade-offs
- Self-managed PostgreSQL requires the developer to manage backups. Mitigation: `docker volume` backup script in the repo; daily cron backup to a local or cloud destination
- AGE must be compiled from source in the Docker image; build time is longer than a package install. Mitigation: pre-build the image and push to a container registry once; rebuild only on AGE version updates
- No Supabase managed service means no Supabase Studio admin dashboard. Mitigation: pgAdmin or a simple Deno admin script for database inspection

### Supabase managed (why not)

Supabase managed PostgreSQL does not include Apache AGE in its extension catalogue. AGE v1.7.0 supports PG15, eliminating the version incompatibility that previously existed — but Supabase policy (not version) remains the barrier. If Supabase adds AGE to their extension list in future, migration from self-hosted to Supabase managed would be a connection string change with no schema changes required.

---

## Alternatives Considered

| Alternative | Why Not Chosen |
|-------------|---------------|
| **SQLite (ADR-002 original)** | Superseded: cloud deployment, graph traversal, and HNSW at scale all require PostgreSQL |
| **Supabase managed PostgreSQL** | No AGE extension available; graph traversal is a confirmed requirement |
| **Separate graph database (Neo4j Aura Free, FalkorDB)** | AGE in the same PostgreSQL instance is simpler (one service, one connection string, one backup); Neo4j Aura Free limits (50K nodes, 175K relationships) were also a concern |
| **Managed PostgreSQL on Azure / AWS RDS** | No custom extension support for AGE on managed cloud PostgreSQL services |
| **Neon (serverless PostgreSQL)** | Neon does not support AGE; same extension policy constraint |
| **1536-dim embeddings** | Storage budget: 100K × 6KB = 614MB; exceeds target; 512-dim retains ~95% quality |

---

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-05-16 | Initial — supersedes ADR-002; PostgreSQL 15 + pgvector + AGE v1.7.0 in Docker; 512-dim embeddings; no SQLite; IMemoryStore principle carried forward as TypeScript repository pattern |
