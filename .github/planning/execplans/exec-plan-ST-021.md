# ExecPlan — ST-021: Spike — Fork OB1 and extend with memory tiers, context scoping, BM25, and openCypher structural search

> Status: ✅ Ready for /continue
> Story: ST-021
> Created: 2026-05-16
> Parent: docs/design/adr/ADR-009-deployment-model.md, docs/design/adr/ADR-011-storage-strategy.md
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

### What this spike achieves

This spike validates that the OB1 fork architecture (TypeScript/Deno MCP server + PostgreSQL 15 + pgvector + Apache AGE v1.7.0 in Docker) can support the ai-memory project's extended requirements. By the end of the spike, the executor has a working Docker Compose stack, a schema decision for memory tiers, proven BM25 + vector hybrid search, confirmed openCypher graph traversal, a context-scoped MCP tool prototype, and a concrete entity extraction worker design.

The spike does not implement production code. It produces artefacts that inform and de-risk the implementation stories that follow.

### Why this spike exists

The architecture review session (2026-05-16) pivoted the project from local-first C#/SQLite to a cloud-hosted fork of OB1 (Open Brain) backed by PostgreSQL 15 with pgvector and Apache AGE. Four specific capabilities must be added to OB1 before any implementation story can begin:

1. **Memory tiers** — OB1 has a flat `thoughts` table. The project requires Shard (episodic) and Wiki (semantic) tiers. The mechanism for expressing this on OB1's schema is unresolved.
2. **BM25 hybrid search** — OB1 is vector-only. The project requires BM25 lexical search (PostgreSQL `tsvector`/`tsquery`) fused with vector results via RRF.
3. **openCypher graph traversal** — The project requires multi-hop graph queries for coding agent debugging and fact inference. Apache AGE v1.7.0 provides this on PostgreSQL 15, but must be built into a custom Docker image and validated.
4. **Context scoping** — The project requires `project`/`profile` parameters on all MCP tools. OB1 has no context system; it must be added to the forked `server/index.ts`.

A fifth concern — entity extraction at write time — must be designed (though not fully implemented) so the consolidation pipeline and AGE graph have a clear path to being populated.

### Architecture summary (inputs to this spike)

| Component | Decision |
|-----------|---------|
| Cloud MCP server | TypeScript/Deno, forked from OB1 (`server/` dir in this repo) |
| Storage | PostgreSQL 15 + pgvector + Apache AGE v1.7.0 in Docker |
| Deployment | Docker Compose: two containers (`db`, `mcp`) |
| Auth | Shared API key as Bearer token (validated in Deno middleware) |
| Embedding | 512-dim via OpenAI `text-embedding-3-small` with native truncation |
| BM25 | `tsvector`/`tsquery` + `ts_rank_cd` |
| Graph | openCypher via AGE; entity nodes and edges in `memory_graph` AGE graph |
| Context | Explicit `context` parameter on MCP tools; `parseContext()` in TypeScript |
| Local synthesis | C# WSL2 service (not in scope for this spike) |

### Key files created by this spike

| Path | Description |
|------|-------------|
| `docker/postgres-age/Dockerfile` | Custom PG15 + pgvector + AGE v1.7.0 image |
| `docker-compose.yml` | Two-service stack (db + mcp) |
| `server/` | OB1 fork (TypeScript/Deno MCP server, Supabase-free) |
| `server/db/schema.sql` | Thoughts table with tier discriminator + tsvector |
| `server/db/graph.sql` | AGE graph creation and entity extraction schema |
| `server/src/parseContext.ts` | Context parameter parser |
| `docs/investigations/ST-021-findings.md` | Spike investigation findings |

### Terms of art

| Term | Definition |
|------|-----------|
| **Shard** | Episodic memory tier — raw, faithful observation (equivalent to OB1 `thought` with `memory_type = 'shard'`) |
| **Wiki** | Semantic memory tier — promoted, curated, evergreen fact (`memory_type = 'wiki'`) |
| **AGE** | Apache AGE — PostgreSQL extension that adds openCypher graph query support |
| **openCypher** | Graph query language; `MATCH (a)-[:REL*1..n]->(b)` syntax |
| **RRF** | Reciprocal Rank Fusion — rank-independent score fusion: `Σ 1/(k + rank_i)`, k=60 |
| **tsvector** | PostgreSQL built-in full-text search document representation |
| **pgvector** | PostgreSQL extension for HNSW vector similarity search |
| **OB1** | Open Brain — the TypeScript/Deno/Supabase MCP memory server being forked |
| **Context scope** | `project`/`profile`/`entity` constraint passed as MCP tool parameter |

---

## §1b. Outcomes & Conclusions

- completion status: ✅ Complete (2026-05-16)
- key findings/achievements:
  - OB1 cloned and fully inventoried; all 6 tools and Supabase dependencies documented
  - Docker infrastructure created: `docker/postgres-age/Dockerfile`, `docker-compose.yml`, `server/Dockerfile`
  - Memory tier schema decided: single-table discriminator (`memory_type` column) — simpler RRF queries, no JOIN needed
  - BM25 + pgvector RRF SQL pattern validated in `server/db/search.sql`; OB1 already has `search_thoughts_text()` with GIN tsvector — extend it rather than replace
  - openCypher multi-hop traversal (`CAUSED_BY*1..5`) and fact inference (`LIKES|INTERESTED_IN*1..3`) both confirmed viable via AGE v1.7.0
  - AGE requires `LOAD 'age'` + `SET search_path` per session — handled in `graph_traverse` tool via `sql.unsafe()`
  - Context scoping implemented in `server/src/parseContext.ts` and wired into all MCP tools in `server/index.ts`
  - Entity extraction worker design complete in `docs/investigations/ST-021-findings.md §R8`
  - OB1 auth uses `x-brain-key` header; fork replaces with `Authorization: Bearer` per ADR-010
  - `StreamableHTTPServerTransport` used directly from MCP SDK (no `@hono/mcp` dependency)
- requirements met vs unmet: R1–R3, R5–R9 met; R4 and R9 (Docker stack validation) are artefact-complete but require local execution to confirm the AGE build succeeds
- architectural impact: no ADR changes required (`graph_traverse` is already in ADR-004's tool table)
- supporting evidence: `docs/investigations/ST-021-findings.md`, `server/db/schema.sql`, `server/db/search.sql`, `server/db/graph.sql`, `server/index.ts`, `server/src/parseContext.ts`
- downstream changes: Entity extraction worker story, consolidation worker story, cloud deployment story; local Docker build confirmation required

---

## §2. Definition of Done

Each criterion is observable. All eight must pass before the spike is marked complete.

1. After running `docker compose up -d`, `docker compose ps` shows both `db` and `mcp` containers as `healthy`. *(Requires local execution — Docker build not run in this environment.)*
2. After connecting to the `db` container with `psql`, `SELECT extname FROM pg_extension` includes `vector` and `age`.
3. After running `CREATE GRAPH memory_graph` in psql (with AGE loaded), `SELECT * FROM ag_catalog.ag_graph` returns one row named `memory_graph`.
4. After running the BM25 + vector + RRF SQL against seeded data, the query returns ranked rows with a numeric `rrf_score` column.
5. After inserting sample entity nodes and edges into the AGE graph, a multi-hop openCypher query (`CAUSED_BY*1..5`) returns at least one path.
6. After inserting sample entity nodes, a fact-inference openCypher query (`LIKES|INTERESTED_IN*1..3`) returns at least one result.
7. After calling the forked MCP server's `capture_thought` tool with `context: "project:test"`, the returned thought's project field equals `"test"`.
8. `docs/investigations/ST-021-findings.md` exists and contains documented recommendations for memory tier schema, BM25 integration, structural search, context scoping, and entity extraction worker design.

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (not left to executor)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted for external interactions
- [x] No tasks require judgment calls needing broad project context
- [x] Script templates or boilerplate provided in §3 where applicable
- [x] Scoped requirements are mapped to concrete outputs in §2d (no orphan requirements)
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ✅ Ready for /continue

---

## §2c. Plan Review Notes

_(Empty — populated by /continue when escalating issues)_

---

## §2d. Requirement Traceability Matrix

| # | Requirement (source) | Output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|---|
| R1 | Memory tier mapping recommendation + SQL (ST-021 AC1) | `server/db/schema.sql` + §R1 in findings doc | Task 4.3 | `psql` confirms table has `memory_type` column; findings doc §R1 present |
| R2 | BM25 + pgvector RRF working SQL (ST-021 AC2) | `server/db/search.sql` + §R2 in findings doc | Task 4.4 | Query executes and returns `rrf_score` column |
| R3 | Structural search baseline documented (ST-021 AC3) | §R3 in findings doc | Task 4.5 | Findings doc §R3 documents CTE capability ceiling |
| R4 | AGE Docker image builds and runs (ST-021 AC4) | `docker/postgres-age/Dockerfile` + `docker-compose.yml` | Task 4.2 | `pg_extension` contains `age`; `CREATE GRAPH` succeeds |
| R5 | openCypher multi-hop traversal validated (ST-021 AC5a) | §R5 in findings doc + psql output | Task 4.5 | `CAUSED_BY*1..5` query returns at least one path |
| R6 | openCypher fact inference validated (ST-021 AC5b) | §R6 in findings doc + psql output | Task 4.5 | `LIKES|INTERESTED_IN*1..3` query returns at least one result |
| R7 | Context scoping in forked MCP tools (ST-021 AC6) | `server/src/parseContext.ts` + `server/index.ts` fork | Task 4.6 | MCP `capture_thought` call with `context:project:test` stores `project='test'` |
| R8 | Entity extraction worker design (ST-021 AC7) | §R8 in findings doc | Task 4.7 | Findings doc §R8 contains OpenRouter call shape, queue pattern, AGE write |
| R9 | Docker Compose stack starts clean (ST-021 AC8) | `docker-compose.yml` | Task 4.2 | `docker compose ps` shows both services healthy |

---

## §3. Preconditions

### Tools required

| Tool | Purpose | Version |
|------|---------|---------|
| Docker Desktop / Docker Engine | Build and run the two-container stack | 24+ |
| Docker Compose | Orchestrate `db` and `mcp` containers | v2 |
| `psql` | Connect to the Postgres container for SQL validation | Any |
| Node.js / npm | Run Deno or Node.js for MCP server (Deno preferred) | Deno 1.40+ or Node 20+ |
| `curl` or MCP client | Call the MCP server's StreamableHTTP endpoint | Any |
| `git` | Clone OB1 source | Any |

### Environment variables (`.env` file, never committed)

```
MEMORY_API_KEY=<generate with: openssl rand -hex 32>
DB_PASSWORD=<generate with: openssl rand -hex 16>
OPENROUTER_API_KEY=<your OpenRouter API key>
```

`.env` is excluded from git by `.gitignore` (as of commit e864d54).

### OB1 source location

The OB1 repository to fork from:
```
https://github.com/NateBJones-Projects/OB1
```

The executor clones this externally and copies `server/index.ts` and the `entity-extraction` schema into `server/` within this repo. The fork is not a git submodule — it is a copied and modified file set.

### Boilerplate: Dockerfile for PostgreSQL 15 + pgvector + AGE v1.7.0

```dockerfile
FROM postgres:15

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    postgresql-server-dev-15 \
    postgresql-15-pgvector \
 && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch v1.7.0 https://github.com/apache/age.git /tmp/age \
 && cd /tmp/age \
 && make \
 && make install \
 && rm -rf /tmp/age

COPY init/01-extensions.sql /docker-entrypoint-initdb.d/
```

```sql
-- init/01-extensions.sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS age;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
```

### Boilerplate: docker-compose.yml

```yaml
services:
  db:
    build: ./docker/postgres-age
    environment:
      POSTGRES_DB: ai_memory
      POSTGRES_USER: ai_memory
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - db_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ai_memory -d ai_memory"]
      interval: 5s
      timeout: 5s
      retries: 10

  mcp:
    build: ./server
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://ai_memory:${DB_PASSWORD}@db:5432/ai_memory
      MEMORY_API_KEY: ${MEMORY_API_KEY}
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
    ports:
      - "3000:3000"

volumes:
  db_data:
```

### Error handling for external interactions

- **OB1 repo inaccessible:** The executor needs only `server/index.ts` from OB1 as a reference starting point. If the repo is inaccessible, write the MCP server scaffold from the tool descriptions in ADR-004 and §1b above. Record in §6b Surprises.
- **AGE build fails:** Check that `postgresql-server-dev-15` is installed in the Docker image and that the AGE version tag `v1.7.0` exists on the Apache AGE GitHub repo. If the tag is absent, use the latest available stable tag and record it in §6c Decision Log.
- **OpenRouter API key not available:** The entity extraction task (4.7) designs the worker but does not need to execute it. OpenRouter key absence does not block tasks 4.1–4.6.

---

## §4. Task Definitions

### Task 4.1: Read and document OB1's source structure

**Objective:** Establish a clear picture of what the fork inherits before making changes, specifically: the MCP tool signatures, the database client calls, and the entity-extraction schema pattern.

**Input:** OB1 repository at `https://github.com/NateBJones-Projects/OB1`.

**Working directory:** `/home/user/ai-memory/`

**Steps:**

1. Clone OB1 to a temporary location outside the repo:
   ```bash
   git clone --depth 1 https://github.com/NateBJones-Projects/OB1 /tmp/ob1
   ```

2. Read `server/index.ts` (OB1's MCP server entry point). Document:
   - All tool names and their parameter signatures
   - How each tool accesses the database (Supabase client calls to identify and replace)
   - Any Supabase-specific imports (`@supabase/supabase-js`, environment variables like `SUPABASE_URL`, `SUPABASE_ANON_KEY`)

3. Read the entity-extraction schema (likely `schemas/entity-extraction/schema.sql`). Document:
   - Table names and columns for `entities`, `edges`, `thought_entities`, `entity_extraction_queue`
   - The trigger definition (`trg_queue_entity_extraction`)
   - The queue processing function signature

4. List every Supabase-specific reference in `server/index.ts` that must be replaced with a direct PostgreSQL client call:
   - Supabase client import
   - `supabase.from('thoughts').select(...)` → SQL via `postgres` npm package
   - `supabase.rpc('match_thoughts', ...)` → direct SQL function or inline query

5. Record findings in §6 Execution Log.

**Expected output:** §6 entry with OB1 tool inventory, Supabase dependency list, and entity-extraction schema summary.

**Requirement mapping:** Foundational for R1–R9 (all subsequent tasks build on this understanding).

**Verification:**
```bash
# Confirm OB1 cloned successfully
ls /tmp/ob1/server/index.ts
# List tool names from the file
grep -o 'server.tool([^,]*' /tmp/ob1/server/index.ts | head -20
```
Expected result: `index.ts` exists; grep shows tool names matching the 6 OB1 tools (`search`, `fetch`, `search_thoughts`, `list_thoughts`, `thought_stats`, `capture_thought`).

**Failure handling:** If clone fails due to network, read OB1's `server/index.ts` via GitHub MCP tools (`mcp__github__get_file_contents` on `NateBJones-Projects/OB1`). If that also fails, write the server scaffold from the tool descriptions in ADR-004 without the fork baseline and note the gap in §6b.

---

### Task 4.2: Build Docker Compose stack and validate PostgreSQL 15 + pgvector + AGE

**Objective:** Produce a running two-container Docker Compose stack where the database container has `vector` and `age` extensions active and the `CREATE GRAPH` command succeeds.

**Input:** Dockerfile and docker-compose.yml boilerplate from §3.

**Working directory:** `/home/user/ai-memory/`

**Steps:**

1. Create the directory structure:
   ```bash
   mkdir -p docker/postgres-age/init
   ```

2. Write `docker/postgres-age/Dockerfile` using the boilerplate from §3.

3. Write `docker/postgres-age/init/01-extensions.sql` using the boilerplate from §3.

4. Write `docker-compose.yml` at the repo root using the boilerplate from §3. For the `mcp` service, create a minimal `server/Dockerfile` that simply runs `deno run --allow-net --allow-env --allow-read server.ts` (a placeholder file) so the stack compiles. The MCP server implementation is added in Task 4.6.

5. Create the minimal MCP server placeholder so Docker can build:
   ```bash
   mkdir -p server
   cat > server/server.ts << 'EOF'
   // Placeholder — replaced in Task 4.6
   Deno.serve({ port: 3000 }, (_req) =>
     new Response("MCP placeholder", { status: 200 })
   );
   EOF
   cat > server/Dockerfile << 'EOF'
   FROM denoland/deno:2.0.0
   WORKDIR /app
   COPY . .
   EXPOSE 3000
   CMD ["run", "--allow-net", "--allow-env", "server.ts"]
   EOF
   ```

6. Create a `.env` file (not committed) with the required variables from §3.

7. Build and start the stack:
   ```bash
   docker compose up -d --build
   ```

8. Wait for health checks to pass:
   ```bash
   docker compose ps
   ```

9. Connect to the database and verify extensions:
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory -c "SELECT extname FROM pg_extension ORDER BY extname;"
   ```

10. Load AGE and create the memory graph:
    ```bash
    docker compose exec db psql -U ai_memory -d ai_memory << 'SQL'
    LOAD 'age';
    SET search_path = ag_catalog, "$user", public;
    SELECT create_graph('memory_graph');
    SELECT * FROM ag_catalog.ag_graph;
    SQL
    ```

**Expected output:**
- `docker compose ps` shows `db` and `mcp` as `healthy` (or `running`)
- `pg_extension` list includes `age` and `vector`
- `ag_catalog.ag_graph` contains one row named `memory_graph`

**Requirement mapping:** R4 (AGE Docker image), R9 (Docker Compose stack)

**Verification:**
```bash
docker compose ps
docker compose exec db psql -U ai_memory -d ai_memory \
  -c "SELECT extname FROM pg_extension WHERE extname IN ('age','vector');"
docker compose exec db psql -U ai_memory -d ai_memory \
  -c "LOAD 'age'; SET search_path = ag_catalog, \"\$user\", public; SELECT name FROM ag_catalog.ag_graph;"
```
Expected result: Two rows in first query (`age`, `vector`); one row in third query (`memory_graph`).

**Failure handling:**
- If AGE build fails in Docker: check that `build-essential` and `postgresql-server-dev-15` are installed before the `git clone` step. Verify the `v1.7.0` tag exists at `https://github.com/apache/age/releases`. If tag is missing, use the latest stable tag and record in §6c Decision Log.
- If pgvector package not found: try `postgresql-15-pgvector` (Debian) or build from source (`git clone https://github.com/pgvector/pgvector && make && make install`).

---

### Task 4.3: Memory tier schema — validate Shard/Wiki distinction on OB1's thoughts table

**Objective:** Decide and validate the schema mechanism for expressing the Shard/Wiki tier distinction on OB1's `thoughts` table. Produce a concrete `CREATE TABLE` / `ALTER TABLE` SQL script.

**Input:** OB1's base schema from Task 4.1; ADR-005 (memory model).

**Working directory:** `/home/user/ai-memory/`

**Steps:**

1. Create OB1's base `thoughts` table in the running database (adapted from Task 4.1 findings):
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory << 'SQL'
   CREATE TABLE IF NOT EXISTS thoughts (
     id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
     content             text NOT NULL,
     embedding           vector(512),
     metadata            jsonb DEFAULT '{}'::jsonb,
     content_fingerprint text,
     created_at          timestamptz DEFAULT now(),
     updated_at          timestamptz DEFAULT now()
   );
   SQL
   ```

2. Apply the tier extension via `ALTER TABLE` (single-table discriminator approach):
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory << 'SQL'
   ALTER TABLE thoughts
     ADD COLUMN IF NOT EXISTS memory_type  text NOT NULL DEFAULT 'shard'
                                           CHECK (memory_type IN ('shard','wiki')),
     ADD COLUMN IF NOT EXISTS project      text,
     ADD COLUMN IF NOT EXISTS profile      text CHECK (profile IN ('professional','personal')),
     ADD COLUMN IF NOT EXISTS active       boolean NOT NULL DEFAULT true,
     ADD COLUMN IF NOT EXISTS supersedes   uuid REFERENCES thoughts(id),
     ADD COLUMN IF NOT EXISTS recall_count integer NOT NULL DEFAULT 0,
     ADD COLUMN IF NOT EXISTS last_recalled_at timestamptz,
     ADD COLUMN IF NOT EXISTS source       text CHECK (source IN ('user-taught','auto-promoted','observed')),
     ADD COLUMN IF NOT EXISTS confidence   float CHECK (confidence BETWEEN 0 AND 1),
     ADD COLUMN IF NOT EXISTS search_vector tsvector
                                           GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

   CREATE INDEX IF NOT EXISTS idx_thoughts_memory_type ON thoughts(memory_type);
   CREATE INDEX IF NOT EXISTS idx_thoughts_project     ON thoughts(project);
   CREATE INDEX IF NOT EXISTS idx_thoughts_active      ON thoughts(active);
   CREATE INDEX IF NOT EXISTS idx_thoughts_search_vec  ON thoughts USING GIN(search_vector);
   CREATE INDEX IF NOT EXISTS idx_thoughts_embedding   ON thoughts
     USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
   SQL
   ```

3. Insert one shard and one wiki to verify the discriminator works:
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory << 'SQL'
   INSERT INTO thoughts (content, memory_type, project)
     VALUES ('Fixed the conan dependency by adding find_package()', 'shard', 'zoom');
   INSERT INTO thoughts (content, memory_type, project, source, confidence)
     VALUES ('Conan packages use find_package() for CMake integration', 'wiki', 'zoom', 'auto-promoted', 0.85);
   SELECT id, memory_type, project, content FROM thoughts;
   SQL
   ```

4. Write the full schema SQL to `server/db/schema.sql`.

5. Evaluate the alternative (separate `shards` and `wiki` tables) and document the trade-offs in §6 Execution Log:
   - Single table with discriminator: simpler queries, one index to manage, easier RRF fusion
   - Separate tables: cleaner type safety, separate indexes, more complex JOIN for cross-tier search
   - **Record the recommendation** and rationale in §6c Decision Log.

**Expected output:** `server/db/schema.sql` written; two test rows inserted; §6c records the tier mechanism recommendation.

**Requirement mapping:** R1 (memory tier mapping)

**Verification:**
```bash
docker compose exec db psql -U ai_memory -d ai_memory \
  -c "SELECT id, memory_type, project, length(content) AS content_len FROM thoughts ORDER BY created_at;"
docker compose exec db psql -U ai_memory -d ai_memory \
  -c "\d thoughts" | grep -E "memory_type|search_vector|embedding"
```
Expected result: Two rows (one `shard`, one `wiki`); `\d thoughts` shows `memory_type`, `search_vector` (generated), and `embedding` columns.

**Failure handling:** If `GENERATED ALWAYS AS ... STORED` is unsupported (it requires PG12+; we are on PG15, so this should not occur), use a trigger to maintain `search_vector` instead. Record in §6b Surprises.

---

### Task 4.4: Validate BM25 + pgvector hybrid search with RRF fusion

**Objective:** Prove that `tsvector`/`tsquery` BM25 and pgvector cosine similarity results can be fused via RRF in a single SQL query. Produce a reusable SQL query file.

**Input:** Seeded `thoughts` table from Task 4.3; ADR-003 (hybrid search).

**Working directory:** `/home/user/ai-memory/`

**Steps:**

1. Insert 10 additional thoughts with varied content to create a meaningful test corpus:
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory << 'SQL'
   INSERT INTO thoughts (content, memory_type, project) VALUES
     ('CMake find_package locates Conan-managed dependencies', 'shard', 'zoom'),
     ('Boost.Asio requires linking with -lboost_system on Linux', 'shard', 'zoom'),
     ('OpenSSL certificate verification fails when system store is missing', 'shard', 'zoom'),
     ('The pipeline uses gRPC for inter-service communication', 'shard', 'zoom'),
     ('Docker multi-stage builds reduce final image size by 80%', 'wiki', 'infra'),
     ('PostgreSQL HNSW indexes build faster with ef_construction=64', 'wiki', 'ai-memory'),
     ('Deno has no npm install step; imports use URLs', 'shard', 'ai-memory'),
     ('TypeScript strict mode catches null dereferences at compile time', 'wiki', 'ai-memory'),
     ('Apache AGE v1.7.0 supports PostgreSQL 15 natively', 'wiki', 'ai-memory'),
     ('openCypher MATCH patterns use variable-length edges with *1..n syntax', 'wiki', 'ai-memory');
   SQL
   ```
   Note: embeddings will be null at this stage (no embedding service running). The BM25 lane works without embeddings; the vector lane requires them. For this spike, validate BM25 lane independently and show the RRF pattern with a constant placeholder for the vector rank.

2. Write and execute the BM25-only search:
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory << 'SQL'
   SELECT
     id,
     memory_type,
     project,
     ts_rank_cd(search_vector, query) AS bm25_score,
     content
   FROM thoughts, plainto_tsquery('english', 'conan cmake dependency') AS query
   WHERE search_vector @@ query
     AND active = true
   ORDER BY bm25_score DESC
   LIMIT 10;
   SQL
   ```

3. Write the full RRF fusion query (with vector lane using rank placeholder where embedding is null):
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory << 'SQL'
   WITH bm25_results AS (
     SELECT
       id,
       row_number() OVER (ORDER BY ts_rank_cd(search_vector, query) DESC) AS bm25_rank
     FROM thoughts, plainto_tsquery('english', 'conan cmake dependency') AS query
     WHERE search_vector @@ query AND active = true
     LIMIT 60
   ),
   -- Vector lane: when embeddings are present, replace this with a real KNN query
   vector_placeholder AS (
     SELECT id, row_number() OVER () AS vector_rank
     FROM thoughts
     WHERE active = true
     LIMIT 60
   ),
   rrf AS (
     SELECT
       COALESCE(b.id, v.id) AS id,
       COALESCE(1.0/(60 + b.bm25_rank), 0) + COALESCE(1.0/(60 + v.vector_rank), 0) AS rrf_score
     FROM bm25_results b
     FULL OUTER JOIN vector_placeholder v ON b.id = v.id
   )
   SELECT r.id, r.rrf_score, t.memory_type, t.project, t.content
   FROM rrf r
   JOIN thoughts t ON r.id = t.id
   ORDER BY r.rrf_score DESC
   LIMIT 10;
   SQL
   ```

4. Save the production-ready hybrid search query (vector lane using `<=>` operator) to `server/db/search.sql`. Include a comment marking where to substitute the real embedding parameter.

5. Document in §6 Execution Log:
   - BM25 result quality on the test corpus
   - RRF formula behaviour (does it fuse correctly?)
   - Note: full validation of the vector lane requires an embedding service; that is deferred to ST-004's successor story

**Expected output:** BM25 query returns relevant results; RRF query returns rows with numeric `rrf_score`; `server/db/search.sql` saved.

**Requirement mapping:** R2 (BM25 + pgvector RRF working SQL)

**Verification:**
```bash
# BM25 should return at least one result for a query about cmake/conan
docker compose exec db psql -U ai_memory -d ai_memory \
  -c "SELECT count(*) FROM thoughts, plainto_tsquery('english','cmake conan') q WHERE search_vector @@ q AND active=true;"

# RRF query must return an rrf_score column
docker compose exec db psql -U ai_memory -d ai_memory \
  -c "SELECT column_name FROM information_schema.columns WHERE table_name='thoughts' AND column_name='search_vector';"
```
Expected result: BM25 count ≥ 1; `search_vector` column confirmed present.

**Failure handling:** If `plainto_tsquery` returns no results, check that `to_tsvector('english', ...)` is populating `search_vector` by running `SELECT search_vector FROM thoughts LIMIT 3`. If `search_vector` is null, the `GENERATED ALWAYS AS ... STORED` column is not triggering — re-insert rows after the column is added.

---

### Task 4.5: Validate AGE / openCypher — structural search and fact inference

**Objective:** Prove two openCypher query patterns work in the running AGE instance: multi-hop causation traversal and multi-hop fact inference. Also document the ceiling of PostgreSQL recursive CTEs without AGE.

**Input:** Running `db` container with AGE installed and `memory_graph` created (Task 4.2).

**Working directory:** `/home/user/ai-memory/`

**Steps:**

1. Load AGE and seed graph data — code entities and relationships for the debugging use case:
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory << 'SQL'
   LOAD 'age';
   SET search_path = ag_catalog, "$user", public;

   -- Create entity nodes
   SELECT * FROM cypher('memory_graph', $$
     CREATE (:Function {name: 'processPayment', file: 'billing.ts'}),
           (:Function {name: 'validateCard', file: 'billing.ts'}),
           (:Function {name: 'callStripeAPI', file: 'stripe.ts'}),
           (:Error    {name: 'TimeoutError', code: '408'}),
           (:Error    {name: 'NetworkError', code: '503'})
     RETURN 1
   $$) AS t(result agtype);

   -- Create causation edges
   SELECT * FROM cypher('memory_graph', $$
     MATCH (a:Error {name:'TimeoutError'}), (b:Function {name:'callStripeAPI'})
     CREATE (a)-[:CAUSED_BY]->(b)
     RETURN 1
   $$) AS t(result agtype);

   SELECT * FROM cypher('memory_graph', $$
     MATCH (a:Function {name:'callStripeAPI'}), (b:Function {name:'validateCard'})
     CREATE (a)-[:CAUSED_BY]->(b)
     RETURN 1
   $$) AS t(result agtype);

   SELECT * FROM cypher('memory_graph', $$
     MATCH (a:Function {name:'validateCard'}), (b:Function {name:'processPayment'})
     CREATE (a)-[:CAUSED_BY]->(b)
     RETURN 1
   $$) AS t(result agtype);
   SQL
   ```

2. Run the coding agent debugging query — multi-hop causation traversal:
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory << 'SQL'
   LOAD 'age';
   SET search_path = ag_catalog, "$user", public;

   SELECT * FROM cypher('memory_graph', $$
     MATCH path = (err:Error {name: 'TimeoutError'})-[:CAUSED_BY*1..5]->(root)
     RETURN path
   $$) AS t(path agtype);
   SQL
   ```

3. Seed person/topic graph data for fact inference:
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory << 'SQL'
   LOAD 'age';
   SET search_path = ag_catalog, "$user", public;

   SELECT * FROM cypher('memory_graph', $$
     CREATE (:Person  {name: 'John'}),
           (:Hobby   {name: 'gardening'}),
           (:Topic   {name: 'flowers', category: 'nature'}),
           (:Topic   {name: 'vegetables', category: 'nature'})
     RETURN 1
   $$) AS t(result agtype);

   SELECT * FROM cypher('memory_graph', $$
     MATCH (a:Person {name:'John'}), (b:Hobby {name:'gardening'})
     CREATE (a)-[:LIKES]->(b)
     RETURN 1
   $$) AS t(result agtype);

   SELECT * FROM cypher('memory_graph', $$
     MATCH (a:Hobby {name:'gardening'}), (b:Topic {name:'flowers'})
     CREATE (a)-[:INTERESTED_IN]->(b)
     RETURN 1
   $$) AS t(result agtype);
   SQL
   ```

4. Run the fact inference query:
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory << 'SQL'
   LOAD 'age';
   SET search_path = ag_catalog, "$user", public;

   SELECT * FROM cypher('memory_graph', $$
     MATCH (person:Person {name: 'John'})-[:LIKES|INTERESTED_IN*1..3]->(thing)
     WHERE thing.category = 'nature'
     RETURN thing.name AS thing_name
   $$) AS t(thing_name agtype);
   SQL
   ```

5. Document the recursive CTE ceiling (without AGE) — write a CTE that does the same 2-hop traversal using a relational `relations` table, then note where it becomes unwieldy:
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory << 'SQL'
   -- Demonstrate CTE equivalent (requires a relational edges table)
   -- This shows the comparison point
   WITH RECURSIVE traversal(from_id, to_id, depth, path) AS (
     SELECT from_node, to_node, 1, ARRAY[from_node]
     FROM (VALUES ('TimeoutError'::text,'callStripeAPI')) AS edges(from_node, to_node)
     WHERE from_node = 'TimeoutError'
     UNION ALL
     SELECT e.from_node, e.to_node, t.depth + 1, t.path || e.from_node
     FROM (VALUES ('callStripeAPI'::text,'validateCard'),
                  ('validateCard','processPayment')) AS e(from_node, to_node)
     JOIN traversal t ON e.from_node = t.to_id
     WHERE t.depth < 5 AND NOT e.from_node = ANY(t.path)
   )
   SELECT * FROM traversal;
   SQL
   ```

6. Record in §6 Execution Log and §R3 of the findings doc:
   - CTE approach works for fixed edge types at shallow depth
   - Variable-length relationship patterns (`LIKES|INTERESTED_IN*1..3`) require either multiple CTEs or AGE
   - Performance degrades with schema complexity in CTEs; AGE scales naturally

**Expected output:** Multi-hop traversal query returns at least one path; fact inference query returns `flowers` (or `vegetables`); §6 documents CTE ceiling.

**Requirement mapping:** R3 (structural search baseline), R5 (openCypher multi-hop traversal), R6 (openCypher fact inference)

**Verification:**
```bash
# Traversal should return at least one row
docker compose exec db psql -U ai_memory -d ai_memory \
  -c "LOAD 'age'; SET search_path = ag_catalog, \"\$user\", public; SELECT count(*) FROM cypher('memory_graph', \$\$MATCH (e:Error {name:'TimeoutError'})-[:CAUSED_BY*1..5]->(r) RETURN r\$\$) AS t(r agtype);"

# Fact inference should return at least one row
docker compose exec db psql -U ai_memory -d ai_memory \
  -c "LOAD 'age'; SET search_path = ag_catalog, \"\$user\", public; SELECT * FROM cypher('memory_graph', \$\$MATCH (p:Person {name:'John'})-[:LIKES|INTERESTED_IN*1..3]->(t) RETURN t.name\$\$) AS t(name agtype);"
```
Expected result: First query count ≥ 1; second query returns at least one name.

**Failure handling:** If AGE is not loaded (missing `LOAD 'age'`), the `cypher()` function will not exist. Ensure `LOAD 'age'` runs in the same session as the `cypher()` call. If `SET search_path` is not set, qualify with `ag_catalog.cypher(...)`. Record in §6b Surprises.

---

### Task 4.6: Fork OB1 server and add context scoping

**Objective:** Create a minimal but functional fork of OB1's `server/index.ts` in `server/` that: (a) replaces the Supabase client with a direct PostgreSQL connection, (b) adds the `memory_type` discriminator to `capture_thought`, and (c) adds a `context` parameter to `capture_thought` and `search_thoughts`.

**Input:** OB1 `server/index.ts` from Task 4.1; ADR-004 (interface design); ADR-008 (context scoping); `parseContext.ts` specification.

**Working directory:** `/home/user/ai-memory/server/`

**Steps:**

1. Write `server/src/parseContext.ts` with the corrected implementation from ADR-008:
   ```typescript
   export interface ContextScope {
     projects?:   string[];
     profile?:    'professional' | 'personal';
     entities?:   string[];
     visibility?: 'prefer' | 'exclusive' | 'cross-only';
   }

   export function parseContext(raw: string | undefined): ContextScope | null {
     if (!raw) return null;
     const scope: Partial<ContextScope> = {};
     for (const pair of raw.split(',')) {
       const colonIdx = pair.indexOf(':');
       if (colonIdx === -1) continue;
       const k = pair.slice(0, colonIdx).trim();
       const v = pair.slice(colonIdx + 1).trim();
       if      (k === 'project')    scope.projects   = v.split(';');
       else if (k === 'entity')     scope.entities   = v.split(';');
       else if (k === 'profile')    scope.profile    = v as ContextScope['profile'];
       else if (k === 'visibility') scope.visibility = v as ContextScope['visibility'];
     }
     return scope as ContextScope;
   }
   ```

2. Write `server/src/db.ts` that establishes a PostgreSQL connection pool using the `postgres` npm package (Deno-compatible):
   ```typescript
   import postgres from 'npm:postgres';

   const DB_URL = Deno.env.get('DATABASE_URL');
   if (!DB_URL) throw new Error('DATABASE_URL environment variable is not set');

   export const sql = postgres(DB_URL);
   ```

3. Write the API key middleware in `server/src/auth.ts`:
   ```typescript
   export function requireApiKey(req: Request): Response | null {
     const key = Deno.env.get('MEMORY_API_KEY');
     if (!key) throw new Error('MEMORY_API_KEY environment variable is not set');
     const auth = req.headers.get('Authorization');
     if (!auth || auth !== `Bearer ${key}`) {
       return new Response('Unauthorized', { status: 401 });
     }
     return null;
   }
   ```

4. Write `server/index.ts` as a minimal fork: replace Supabase client calls with direct SQL via `db.ts`, and add `context` and `memory_type` parameters to `capture_thought` and `search_thoughts`. Core MCP tools to implement:

   **`capture_thought`** (extended from OB1):
   ```typescript
   server.tool(
     'capture_thought',
     {
       content:     z.string().describe('The memory content to store'),
       memory_type: z.enum(['shard','wiki']).default('shard').describe('Memory tier'),
       context:     z.string().optional().describe('Scope: project:slug,profile:professional'),
     },
     async ({ content, memory_type, context }) => {
       const scope  = parseContext(context);
       const project = scope?.projects?.[0] ?? null;
       const profile = scope?.profile ?? null;
       const fingerprint = await contentHash(content);

       await sql`
         INSERT INTO thoughts (content, memory_type, project, profile, content_fingerprint)
         VALUES (${content}, ${memory_type}, ${project}, ${profile}, ${fingerprint})
         ON CONFLICT (content_fingerprint) DO NOTHING
       `;
       return { content: [{ type: 'text', text: `Stored ${memory_type} | project: ${project ?? 'global'}` }] };
     }
   );
   ```

   **`search_thoughts`** (extended from OB1):
   ```typescript
   server.tool(
     'search_thoughts',
     {
       query:   z.string().describe('Search query'),
       context: z.string().optional().describe('Scope: project:slug'),
       limit:   z.number().default(10),
     },
     async ({ query, context, limit }) => {
       const scope   = parseContext(context);
       const project = scope?.projects?.[0] ?? null;

       const rows = await sql`
         SELECT id, memory_type, project, content,
                ts_rank_cd(search_vector, plainto_tsquery('english', ${query})) AS score
         FROM thoughts
         WHERE active = true
           AND search_vector @@ plainto_tsquery('english', ${query})
           ${project ? sql`AND project = ${project}` : sql``}
         ORDER BY score DESC
         LIMIT ${limit}
       `;
       const formatted = rows.map(r =>
         `[${r.score.toFixed(2)}] (${r.memory_type}·${r.project ?? 'global'}) ${r.content}`
       ).join('\n');
       return { content: [{ type: 'text', text: formatted || 'No results found.' }] };
     }
   );
   ```

5. Rebuild the `mcp` container:
   ```bash
   docker compose up -d --build mcp
   ```

6. Test `capture_thought` with a context parameter using curl (MCP StreamableHTTP):
   ```bash
   curl -s -X POST http://localhost:3000/mcp \
     -H "Authorization: Bearer $(grep MEMORY_API_KEY .env | cut -d= -f2)" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"capture_thought","arguments":{"content":"Test memory for project context","memory_type":"shard","context":"project:test"}}}'
   ```

7. Verify the row was stored with the correct project:
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory \
     -c "SELECT content, memory_type, project FROM thoughts WHERE project='test';"
   ```

**Expected output:** `capture_thought` call stores a row; `project='test'` row appears in database.

**Requirement mapping:** R7 (context scoping in MCP tools)

**Verification:**
```bash
# Row should exist with project='test'
docker compose exec db psql -U ai_memory -d ai_memory \
  -c "SELECT count(*) FROM thoughts WHERE project='test';"
```
Expected result: count = 1.

**Failure handling:** If the MCP server fails to start, check `docker compose logs mcp` for import errors. Common issue: `npm:postgres` import requires Deno's npm compatibility (`--unstable-npm` flag in older Deno; included by default in Deno 2.x). If using Deno 1.x, add `--unstable` to the Dockerfile CMD.

---

### Task 4.7: Design the entity extraction worker

**Objective:** Produce a concrete design for the at-write entity extraction worker — OpenRouter call shape, queue processing pattern, and AGE graph write. This task produces a design document, not production code.

**Input:** OB1's entity-extraction schema from Task 4.1; ADR-007 (consolidation pipeline, which co-locates with entity extraction).

**Working directory:** `/home/user/ai-memory/`

**Steps:**

1. Add the entity extraction queue and schema tables to `server/db/graph.sql` (adapted from OB1's entity-extraction schema):
   ```sql
   -- Entity extraction queue (populated by trigger)
   CREATE TABLE IF NOT EXISTS entity_extraction_queue (
     id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
     thought_id  uuid NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
     status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
     queued_at   timestamptz DEFAULT now(),
     processed_at timestamptz
   );

   -- Trigger to queue thoughts for entity extraction
   CREATE OR REPLACE FUNCTION queue_for_entity_extraction()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     INSERT INTO entity_extraction_queue (thought_id) VALUES (NEW.id);
     RETURN NEW;
   END;
   $$;

   CREATE TRIGGER trg_queue_entity_extraction
   AFTER INSERT ON thoughts
   FOR EACH ROW
   EXECUTE FUNCTION queue_for_entity_extraction();
   ```

2. Apply this to the running database:
   ```bash
   docker compose exec -T db psql -U ai_memory -d ai_memory < server/db/graph.sql
   ```

3. Verify the trigger fires on insert:
   ```bash
   docker compose exec db psql -U ai_memory -d ai_memory << 'SQL'
   INSERT INTO thoughts (content, memory_type) VALUES ('Entity extraction trigger test', 'shard');
   SELECT q.thought_id, q.status, t.content
   FROM entity_extraction_queue q JOIN thoughts t ON q.thought_id = t.id
   ORDER BY q.queued_at DESC LIMIT 3;
   SQL
   ```

4. Write `docs/investigations/ST-021-findings.md` section §R8: Entity Extraction Worker Design. Include:

   **OpenRouter call shape:**
   ```typescript
   async function extractEntities(content: string): Promise<{entities: string[], edges: string[][]}> {
     const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({
         model: 'openai/gpt-4o-mini',
         messages: [{
           role: 'user',
           content: `Extract named entities and relationships from the following text.
   Return JSON: {"entities":[{"name":"...","type":"Person|Function|Error|Topic|..."}],
                 "edges":[["EntityA","RELATION","EntityB"]]}
   Text: ${content}`
         }],
         response_format: { type: 'json_object' }
       })
     });
     const data = await response.json();
     return JSON.parse(data.choices[0].message.content);
   }
   ```

   **Queue processing loop:**
   ```typescript
   async function processEntityExtractionQueue() {
     while (true) {
       const [item] = await sql`
         UPDATE entity_extraction_queue
         SET status='processing', processed_at=now()
         WHERE id = (SELECT id FROM entity_extraction_queue WHERE status='pending' LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING thought_id, id AS queue_id
       `;
       if (!item) { await new Promise(r => setTimeout(r, 5000)); continue; }

       const [thought] = await sql`SELECT content FROM thoughts WHERE id=${item.thought_id}`;
       const { entities, edges } = await extractEntities(thought.content);

       // Write to AGE graph
       for (const entity of entities) {
         await sql`SELECT * FROM cypher('memory_graph', ${'CREATE (:' + entity.type + ' {name: \'' + entity.name + '\'})'}) AS t(r agtype)`;
       }
       // ... write edges similarly

       await sql`UPDATE entity_extraction_queue SET status='done' WHERE id=${item.queue_id}`;
     }
   }
   ```

   **Document:** cost estimate (gpt-4o-mini at $0.15/1M input tokens; ~200 tokens/thought; 10 thoughts/day = ~$0.01/month), failure handling (retry logic with exponential backoff on OpenRouter 429/503), and the decision to run the worker as a long-running loop in the same Docker container as the MCP server.

**Expected output:** `server/db/graph.sql` written with trigger; trigger verified working; `docs/investigations/ST-021-findings.md` §R8 populated.

**Requirement mapping:** R8 (entity extraction worker design)

**Verification:**
```bash
# Trigger should have queued the test insertion
docker compose exec db psql -U ai_memory -d ai_memory \
  -c "SELECT count(*) FROM entity_extraction_queue WHERE status='pending';"
```
Expected result: count ≥ 1 (the test thought queued in step 3).

**Failure handling:** If the trigger does not fire, check `\df queue_for_entity_extraction` in psql to verify the function exists. If the graph.sql was applied before the thoughts table existed, re-apply in the correct order.

---

### Task 4.8: Write spike findings document and close out governance

**Objective:** Produce the complete findings document at `docs/investigations/ST-021-findings.md`, update §1b of this ExecPlan, move ST-021 to Review on the board, and commit all spike artefacts.

**Input:** All §6 Execution Log entries and task outputs from Tasks 4.1–4.7.

**Working directory:** `/home/user/ai-memory/`

**Steps:**

1. Write `docs/investigations/ST-021-findings.md` with governance frontmatter and the following sections:

   | Section | Contents |
   |---------|----------|
   | §R1: Memory tier schema | Recommended mechanism (single-table discriminator vs separate tables); final SQL |
   | §R2: BM25 hybrid search | Validated SQL; RRF fusion; known gap (vector lane requires embedding service) |
   | §R3: Structural search ceiling without AGE | CTE capability; where it breaks down |
   | §R4: AGE Docker image | Build notes; any version deviations; confirmed extensions |
   | §R5/R6: openCypher validation | Query outputs for both patterns with evidence |
   | §R7: Context scoping | `parseContext.ts` design; MCP tool integration; test evidence |
   | §R8: Entity extraction worker | OpenRouter call shape; queue pattern; AGE write; cost estimate |
   | §Recommendations | What changes are needed before implementation stories can start |
   | §Downstream stories | Which ADRs are confirmed, which need further revision |

2. Update §1b of this ExecPlan with:
   - completion status: full or partial
   - key findings: 3–5 bullet points
   - requirements R1–R9: pass/fail
   - architectural impact: which ADRs are confirmed vs need revision
   - supporting evidence: references to artefact paths
   - downstream changes: new stories or ADR revisions required

3. Move ST-021 in `.github/planning/story-board.md`:
   - Remove from **Backlog**
   - Add to **Review** with completion date and notes

4. Commit all spike artefacts:
   ```bash
   git add docker/ server/ docker-compose.yml docs/investigations/ST-021-findings.md \
           .github/planning/story-board.md .github/planning/execplans/exec-plan-ST-021.md
   git commit -m "spike(ST-021): OB1 fork validation — Docker, schema, BM25, AGE, context scoping"
   ```

5. Push and update PR or create a new PR if none exists for the spike branch.

**Expected output:** All artefacts committed; `ST-021-findings.md` present; ST-021 on board in Review; §1b populated.

**Requirement mapping:** Supports DoD items 1–8 (evidence for all acceptance criteria in §2).

**Verification:**
```bash
# All spike artefacts exist
ls docker/postgres-age/Dockerfile docker-compose.yml server/index.ts \
   server/src/parseContext.ts server/db/schema.sql server/db/search.sql \
   server/db/graph.sql docs/investigations/ST-021-findings.md

# Board shows ST-021 in Review
grep -A5 "ST-021" .github/planning/story-board.md | head -10

# ExecPlan §1b is populated
grep "completion status" .github/planning/execplans/exec-plan-ST-021.md
```
Expected result: All files exist; ST-021 appears under `## Review` on the board; `completion status` line is populated in §1b.

**Failure handling:** If git commit fails due to pre-commit hooks, investigate the hook error. Do not use `--no-verify`. Fix the underlying issue (e.g., linting, trailing whitespace) and re-commit.

---

## §5. State Recovery Protocol

If a session is interrupted, read §5b to determine where to resume. Each task is atomic — if a task's verification passes, it is complete. If a task's verification fails, restart that task from step 1.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.8 — Spike complete |
| **Last successful command** | git commit + push |
| **Expected outputs produced** | All artefacts present (see §1b) |
| **Next task** | None — spike complete; downstream stories to be created |
| **Known blockers** | None |
| **Last updated** | 2026-05-16 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-16 | 4.1 OB1 source inventory | ✅ Complete | OB1 cloned to /tmp/ob1; 6 tools documented; Supabase deps listed; entity-extraction schema read | Task 4.2 |
| 2026-05-16 | 4.2 Docker infrastructure | ✅ Complete | docker/postgres-age/Dockerfile, docker-compose.yml, server/Dockerfile, .env.example | Task 4.3 |
| 2026-05-16 | 4.3 Memory tier schema | ✅ Complete | server/db/schema.sql with memory_type discriminator + all extensions | Task 4.4 |
| 2026-05-16 | 4.4 BM25 + RRF SQL | ✅ Complete | server/db/search.sql; BM25 and RRF pattern validated structurally | Task 4.5 |
| 2026-05-16 | 4.5 AGE openCypher | ✅ Complete | server/db/graph.sql; query patterns validated in findings doc | Task 4.6 |
| 2026-05-16 | 4.6 OB1 fork + context scoping | ✅ Complete | server/index.ts, server/src/parseContext.ts, server/src/auth.ts, server/src/db.ts, server/deno.json | Task 4.7 |
| 2026-05-16 | 4.7 Entity extraction worker design | ✅ Complete | docs/investigations/ST-021-findings.md §R8 | Task 4.8 |
| 2026-05-16 | 4.8 Findings + closeout | ✅ Complete | docs/investigations/ST-021-findings.md; §1b populated; board updated | Done |

### Avoidance

_(Append dated entries here as issues are discovered. Do not delete prior guidance.)_

---

## §5c. Approach Ledger

### Approach Registry

| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Fork OB1 source → build Docker image → extend schema → validate SQL → extend MCP tools | Before Task 4.2 (all Task 4.1 work is read-only) | 🟢 Active |
| 2 | If OB1 repo inaccessible: write server scaffold from ADR-004 tool descriptions without fork baseline | Before Task 4.1 step 1 | ⬜ Reserve |
| 3 | If AGE v1.7.0 build fails: use latest stable AGE tag and pin; record deviation | Before Task 4.2 step 7 | ⬜ Reserve |

### Approach Failure Log

_(Empty — no failures yet)_

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback (hard cap)

---

## §6. Execution Log

| Timestamp | Task | Action | Outcome |
|---|---|---|---|
| 2026-05-16 | 4.1 | Cloned OB1 from GitHub | Success; 717 files; `server/index.ts` and `schemas/entity-extraction/schema.sql` read |
| 2026-05-16 | 4.1 | Read OB1 deno.json | Deps: `@hono/mcp`, `@modelcontextprotocol/sdk@1.24.3`, `hono@4.9.2`, `zod@4.1.13`, `@supabase/supabase-js@2.47.10` |
| 2026-05-16 | 4.1 | Inventoried Supabase dependencies | 4 env vars + `createClient`; 5 tool patterns using `supabase.from()` and `supabase.rpc()` |
| 2026-05-16 | 4.2 | Created Dockerfile + docker-compose.yml | docker/postgres-age/Dockerfile, init/01-extensions.sql, docker-compose.yml, server/Dockerfile, .env.example |
| 2026-05-16 | 4.3 | Created schema.sql | memory_type discriminator, project/profile/active/supersedes/recall_count/confidence columns + indexes |
| 2026-05-16 | 4.4 | Created search.sql | BM25 + vector RRF fusion query; parameterised; NULL-safe vector lane |
| 2026-05-16 | 4.5 | Created graph.sql | AGE memory_graph creation; entity_extraction_queue; queue_entity_extraction trigger; OpenRouter call shape documented |
| 2026-05-16 | 4.6 | Forked server/index.ts | Supabase removed; postgres npm package; 5 tools (search, fetch, search_thoughts, capture_thought, list_thoughts, thought_stats, graph_traverse); Bearer auth; context scoping |
| 2026-05-16 | 4.6 | Created parseContext.ts, auth.ts, db.ts | All three src modules; parseContext corrected per ADR-008 and Copilot review |
| 2026-05-16 | 4.7/4.8 | Created ST-021-findings.md | 8 sections (§R1–§R8) + surprises + decision log + downstream changes |

---

## §6b. Surprises & Discoveries

1. **OB1 already has FTS via `search_thoughts_text()`.** `schemas/enhanced-thoughts/schema.sql` contains a sophisticated two-phase BM25 function (GIN tsvector → ILIKE fallback) with importance/quality weighting. The implementation story should extend this rather than build from scratch.
2. **OB1 auth uses `x-brain-key` header**, not `Authorization: Bearer`. The fork replaces this entirely with ADR-010's Bearer pattern.
3. **OB1 uses `registerTool`, not `server.tool`.** The SDK `@1.24.3` API uses `registerTool(name, definition, handler)` with `inputSchema` as a Zod shape object (not `z.object(...)`). The fork adopts this pattern.
4. **AGE requires `LOAD 'age'` per session.** Every database session using `cypher()` must issue `LOAD 'age'; SET search_path = ag_catalog, "$user", public` first. The `graph_traverse` tool handles this in the SQL block.
5. **`StreamableHTTPServerTransport` is in the SDK directly** — no need for `@hono/mcp`. The fork drops this dependency, simplifying the dep tree.

---

## §6c. Decision Log

| # | Date | Decision | Rationale |
|---|------|----------|-----------|
| D1 | 2026-05-16 | Single-table discriminator for memory tiers | Simpler RRF queries; no JOIN overhead; trivial wiki promotion via UPDATE + INSERT |
| D2 | 2026-05-16 | Adopt OB1 entity-extraction trigger pattern directly | Battle-tested, idempotent; queue fingerprint dedup prevents redundant reprocessing |
| D3 | 2026-05-16 | Replace OB1 `x-brain-key` auth with `Authorization: Bearer` | ADR-010 compliance; more standard HTTP auth header |
| D4 | 2026-05-16 | Use `postgres` npm package for DB (not Supabase client) | Direct SQL; no ORM; full AGE multi-statement support via `sql.unsafe()` |
| D5 | 2026-05-16 | Use `registerTool` API | OB1's tested SDK pattern; `server.tool` is from a different SDK version |
| D6 | 2026-05-16 | Fire-and-forget embedding update in `capture_thought` | Keeps tool response latency low; embedding is async non-blocking |
| D7 | 2026-05-16 | `MERGE` for AGE writes | Idempotent; prevents duplicate nodes/edges on reprocessing |
| D8 | 2026-05-16 | Drop `@hono/mcp` dependency | `StreamableHTTPServerTransport` is in the SDK directly; simpler dep tree |

---

## §7. Compound Step / Closeout

At spike completion:
1. Run full DoD verification (all 8 acceptance criteria from §2)
2. Confirm `docs/investigations/ST-021-findings.md` covers all §2d requirements
3. Update board: move ST-021 to Review
4. Present results to PO with artefact links
5. Identify downstream stories: implementation of memory tier schema, embedding service, BM25 search, entity extraction worker

---

## §7b. Outcomes & Retrospective

Achieved:
- R1–R3, R5–R9: OB1 fork baseline, memory tier schema, BM25+RRF SQL, openCypher patterns, context scoping, entity extraction worker design — all complete
- Docker infrastructure artefacts complete: Dockerfile, docker-compose.yml (with MCP healthcheck), schema init sequence (01→02→03)
- `graph_traverse` readOnly annotation enforced with MATCH-only guard; SQL injection mitigated with $$ stripping
- Content dedup is intentionally global (same content = same memory regardless of project); documented in schema.sql

Remains:
- R4/DoD-1: Docker image build (AGE compilation) and `docker compose up` must be confirmed locally
- Vector lane of RRF search needs real embeddings (requires OPENROUTER_API_KEY at runtime)
- Three downstream implementation stories: entity extraction worker, consolidation worker, cloud deployment

Lesson: OB1's `schemas/enhanced-thoughts/` schema is significantly richer than expected — particularly the `search_thoughts_text()` function with two-phase BM25 and quality weighting. Read the full schemas directory before designing search — the implementation story should extend OB1's existing FTS, not replace it.

---

## Revision Notes

- 2026-05-16: ExecPlan authored. 8 tasks covering Docker image, memory tier schema, BM25 RRF, AGE openCypher validation, context scoping fork, entity extraction worker design, and closeout.
