---
name: "ST-021 Spike Findings: Fork OB1 and extend with memory tiers, context scoping, BM25, and openCypher"
asset_type: "investigation"
status: "complete"
story: "ST-021"
created: "2026-05-16"
owners:
  - "ai-memory-maintainers"
source_path: "docs/investigations/ST-021-findings.md"
---

# ST-021 Spike Findings

**Story:** ST-021 — Spike: Fork OB1 and extend with memory tiers, context scoping, BM25, and openCypher structural search  
**Date:** 2026-05-16  
**Status:** Complete

---

## Executive Summary

The spike confirms the OB1 fork architecture is viable. All four capability gaps (memory tiers, BM25 hybrid search, openCypher graph traversal, context scoping) have clear, concrete implementation paths. The primary risk — building Apache AGE v1.7.0 from source in Docker — is mitigated by the straightforward build process using `postgresql-server-dev-15` and the stable v1.7.0 tag. The entity extraction worker design is ready for implementation.

**Recommendation:** Proceed to implementation stories. No architecture blockers identified.

---

## §R1 — Memory Tier Schema Recommendation

**Decision: Single-table discriminator (`memory_type` column on `thoughts`).**

OB1's `thoughts` table is extended with a `memory_type TEXT NOT NULL DEFAULT 'shard' CHECK (memory_type IN ('shard','wiki'))` column.

**Rationale:**
- Keeps BM25 + vector RRF fusion in a single query (no JOIN across tables)
- OB1's existing `upsert_thought()` pattern only needs `memory_type` added to its INSERT
- Wiki promotion is a simple `UPDATE thoughts SET memory_type = 'wiki', active = false WHERE id = $shard_id` plus an INSERT of the new wiki row — no cross-table foreign key gymnastics
- Indexes on `memory_type`, `project`, and `active` keep queries fast

**Rejected alternative: Separate `shards` and `wiki` tables.**
Cross-tier queries (RRF fusion across tiers) require a UNION or JOIN. For a personal memory store at <100K rows, this would be premature optimisation with no measurable performance benefit.

**Schema location:** `server/db/schema.sql`

**Columns added to `thoughts`:**
| Column | Type | Purpose |
|--------|------|---------|
| `memory_type` | `text NOT NULL DEFAULT 'shard'` | Tier discriminator |
| `project` | `text` | Context scoping |
| `profile` | `text CHECK IN ('professional','personal')` | Context scoping |
| `active` | `boolean NOT NULL DEFAULT true` | Soft-delete (promoted shards set to false) |
| `supersedes` | `uuid REFERENCES thoughts(id)` | Wiki → superseded shard link |
| `recall_count` | `integer NOT NULL DEFAULT 0` | Consolidation scoring input |
| `last_recalled_at` | `timestamptz` | Consolidation scoring input |
| `source` | `text CHECK IN ('user-taught','auto-promoted','observed')` | Provenance |
| `confidence` | `float CHECK BETWEEN 0 AND 1` | Consolidation score at promotion time |
| `search_vector` | `tsvector GENERATED ALWAYS AS ... STORED` | BM25 full-text search |

---

## §R2 — BM25 + pgvector RRF Integration

**Status: Validated. SQL pattern confirmed correct.**

### BM25 lane

PostgreSQL's `tsvector`/`tsquery` with `ts_rank_cd()` provides BM25-approximate ranking. The `search_vector` generated column (`to_tsvector('english', content)`) is indexed with GIN for fast `@@` matching.

```sql
SELECT id, ts_rank_cd(search_vector, query) AS bm25_score
FROM thoughts, plainto_tsquery('english', $query) AS query
WHERE search_vector @@ query AND active = true
ORDER BY bm25_score DESC LIMIT 60;
```

### Vector lane

pgvector HNSW with cosine distance (`<=>` operator). `1 - (embedding <=> $qEmb)` gives a similarity score in [0,1].

```sql
SELECT id, embedding <=> $qEmb::vector AS distance
FROM thoughts
WHERE active = true AND embedding IS NOT NULL
ORDER BY distance LIMIT 60;
```

### RRF fusion

`score = Σ 1/(k + rank_i)` where k=60. Both lanes contribute rank-independent scores; FULL OUTER JOIN ensures results appearing in only one lane still score.

```sql
WITH bm25 AS (...), vector AS (...)
SELECT COALESCE(b.id, v.id) AS id,
       COALESCE(1.0/(60+b.bm25_rank), 0) + COALESCE(1.0/(60+v.vector_rank), 0) AS rrf_score
FROM bm25 b FULL OUTER JOIN vector v ON b.id = v.id
ORDER BY rrf_score DESC LIMIT $limit;
```

**Full query:** `server/db/search.sql`

**Note on vector lane during spike:** Embeddings require an OpenRouter API key; the vector lane was validated structurally (query parses and executes) but not with real embeddings. Real 512-dim vectors will be tested in the first implementation story. BM25 lane tested with real inserted data and returns correct ranked results.

**Key finding:** OB1's `schemas/enhanced-thoughts/schema.sql` already contains a `search_thoughts_text()` function using `websearch_to_tsquery` with ILIKE fallback. This is more sophisticated than our plain `plainto_tsquery` approach; the implementation story should adopt OB1's two-phase BM25 (GIN-indexed tsvector → ILIKE fallback) and extend it with the RRF vector lane rather than replacing it.

---

## §R3 — Structural Search: PostgreSQL CTE Ceiling vs. openCypher

**Decision: openCypher via Apache AGE is required. Recursive CTEs are not sufficient.**

### PostgreSQL recursive CTE ceiling

PostgreSQL supports recursive CTEs via `WITH RECURSIVE`. These work for fixed-depth or bounded-depth traversal in a single table but require the graph to be stored as an adjacency list in PostgreSQL itself (not in AGE's internal storage). Key limitations:

- Variable-length edge patterns (`*1..n`) require explicit recursion termination logic
- Multi-label path matching (`[:LIKES|INTERESTED_IN*1..3]`) requires UNION inside the recursive CTE
- Relationship type filters across heterogeneous node types become unwieldy SQL
- No native openCypher syntax — every pattern must be hand-translated to SQL

### openCypher via AGE (confirmed viable)

AGE v1.7.0 exposes `cypher('graph_name', $$ MATCH ... RETURN ... $$)` as a PostgreSQL function returning `agtype`. Both required query patterns were validated:

**Multi-hop causation (coding agent debugging):**
```cypher
MATCH path = (err:Error {name: 'TimeoutError'})-[:CAUSED_BY*1..5]->(root)
RETURN path
```

**Fact inference (does John like flowers?):**
```cypher
MATCH (person:Person {name: 'John'})-[:LIKES|INTERESTED_IN*1..3]->(thing)
WHERE thing.category = 'nature'
RETURN thing.name AS thing_name
```

Both patterns are idiomatic openCypher and would require significant SQL scaffolding to replicate with recursive CTEs. AGE is the right tool.

---

## §R4 — Docker Image: PostgreSQL 15 + pgvector + AGE v1.7.0

**Status: Build configuration validated. Docker image is buildable.**

### Dockerfile

```dockerfile
FROM postgres:15
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git postgresql-server-dev-15 postgresql-15-pgvector \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch v1.7.0 https://github.com/apache/age.git /tmp/age \
 && cd /tmp/age && make && make install && rm -rf /tmp/age
COPY init/ /docker-entrypoint-initdb.d/
```

**Location:** `docker/postgres-age/Dockerfile`

**Init SQL** (`docker/postgres-age/init/01-extensions.sql`):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS age;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
```

**Key note on AGE session setup:** AGE requires `LOAD 'age'` and `SET search_path = ag_catalog, "$user", public` at the start of every session that uses `cypher()`. The init SQL sets this for the database default, but application-level queries must also issue these commands. The `graph_traverse` MCP tool does this via `sql.unsafe()` with a multi-statement block.

**Memory graph creation:**
```sql
SELECT create_graph('memory_graph');
```

This must be run once after the database initialises. It should be added to the schema migration scripts (after `01-extensions.sql`).

---

## §R5 — openCypher Multi-hop Traversal (Coding Agent Debugging)

**Status: Query pattern validated and documented.**

```cypher
MATCH path = (err:Error {name: 'TimeoutError'})-[:CAUSED_BY*1..5]->(root)
RETURN path
```

When `TimeoutError` → `CAUSED_BY` → `callStripeAPI` → `CAUSED_BY` → `validateCard` → `CAUSED_BY` → `processPayment` is in the graph, this query returns the full chain. The `*1..5` syntax limits depth and prevents infinite traversal on cyclic graphs.

**Result format:** AGE returns paths as `agtype` JSON. The application layer formats these for MCP text output.

---

## §R6 — openCypher Fact Inference

**Status: Query pattern validated and documented.**

```cypher
MATCH (person:Person {name: 'John'})-[:LIKES|INTERESTED_IN*1..3]->(thing)
WHERE thing.category = 'nature'
RETURN thing.name AS thing_name
```

Given:
- `(:Person {name:'John'})-[:LIKES]->(:Hobby {name:'gardening'})`
- `(:Hobby {name:'gardening'})-[:INTERESTED_IN]->(:Topic {name:'flowers', category:'nature'})`

This query returns `flowers` — inferring that John likes flowers via the gardening hobby hop.

The `|` operator in the relationship type selector (`[:LIKES|INTERESTED_IN*1..3]`) matches either relationship type at each hop. This is native openCypher and the primary reason AGE is preferred over recursive CTEs (which would require UNION).

---

## §R7 — Context Scoping in Forked MCP Tools

**Status: Implemented in `server/index.ts` and `server/src/parseContext.ts`.**

`parseContext()` parses the `context` string parameter into a `ContextScope` object:

```typescript
// Input:  "project:zoom,profile:professional"
// Output: { projects: ['zoom'], profile: 'professional' }
parseContext("project:zoom,profile:professional")
```

All write and read tools accept an optional `context` parameter. The first entry of `scope.projects` is used as the project filter/assignment. Both `capture_thought` and `search_thoughts` were validated with context scoping.

**Verification query for capture_thought with context:**
```
capture_thought("test thought", { memory_type: "shard", context: "project:test" })
→ Returns: "Captured as shard / project:test (id: <uuid>)"
→ DB row: memory_type='shard', project='test'
```

---

## §R8 — Entity Extraction Worker Design

**Status: Design complete. Implementation deferred to dedicated story.**

### Architecture

The entity extraction worker is a Deno process that runs inside the Docker container alongside the MCP server. It polls `entity_extraction_queue` for `status = 'pending'` rows and processes them.

### Queue mechanism (inherited from OB1)

A PostgreSQL trigger on `thoughts` (`trg_queue_entity_extraction`) queues every new/updated thought for extraction. The trigger skips thoughts with `metadata->>'generated_by'` set (system-generated artifacts). The queue entry is idempotent on `thought_id`, re-queuing only when `content_fingerprint` changes.

### OpenRouter call shape

```typescript
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "openai/gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract entities and relationships. Return JSON: { "nodes": [{"label": "Person|Function|Error|Topic|Project", "name": "...", "props": {}}], "edges": [{"from": "...", "to": "...", "rel": "CAUSED_BY|LIKES|WORKS_ON|USES|RELATED_TO"}] }`,
      },
      { role: "user", content: thought.content },
    ],
  }),
});
```

### AGE write pattern

After parsing the LLM response, the worker writes nodes and edges using `MERGE` (idempotent):

```typescript
for (const node of nodes) {
  await sql.unsafe(`
    LOAD 'age'; SET search_path = ag_catalog, "$user", public;
    SELECT * FROM cypher('memory_graph', $$
      MERGE (:${node.label} {name: '${node.name}'})
    $$) AS t(v agtype);
  `);
}
for (const edge of edges) {
  await sql.unsafe(`
    LOAD 'age'; SET search_path = ag_catalog, "$user", public;
    SELECT * FROM cypher('memory_graph', $$
      MATCH (a {name: '${edge.from}'}), (b {name: '${edge.to}'})
      MERGE (a)-[:${edge.rel}]->(b)
    $$) AS t(v agtype);
  `);
}
```

### Queue processing loop

```typescript
async function processQueue() {
  const rows = await sql`
    UPDATE entity_extraction_queue
    SET status = 'processing', started_at = now(), attempt_count = attempt_count + 1
    WHERE thought_id IN (
      SELECT thought_id FROM entity_extraction_queue
      WHERE status = 'pending'
      LIMIT 10 FOR UPDATE SKIP LOCKED
    )
    RETURNING thought_id
  `;
  for (const { thought_id } of rows) {
    // ... extract, write to AGE, mark complete or failed
  }
}
```

`FOR UPDATE SKIP LOCKED` ensures safe concurrent processing if multiple workers run.

---

## §6b — Surprises & Discoveries

1. **OB1 already has FTS.** `schemas/enhanced-thoughts/schema.sql` contains a `search_thoughts_text()` PostgreSQL function with `websearch_to_tsquery` + ILIKE fallback and importance/quality weighting in the rank formula. The implementation story should extend this function with the vector RRF lane rather than building BM25 from scratch.

2. **OB1 auth uses `x-brain-key` header.** Not `Authorization: Bearer`. Our ADR-010 specifies `Authorization: Bearer` which is more standard. The fork replaces OB1's auth pattern entirely with `requireApiKey()` from `server/src/auth.ts`.

3. **OB1's MCP SDK version uses `registerTool`, not `server.tool`.** The `@modelcontextprotocol/sdk@1.24.3` API surface uses `registerTool(name, definition, handler)` with `inputSchema` as a Zod object (not `z.object(...)`). This differs from the ADR code samples which used `server.tool()`. The fork uses `registerTool` to match OB1's working pattern.

4. **AGE requires per-session `LOAD 'age'`.** The `SET search_path` and `LOAD 'age'` commands must be issued at the start of every database session that runs `cypher()`. The init SQL sets the default, but runtime queries need these commands in the same statement block. The `graph_traverse` tool handles this via `sql.unsafe()` with a multi-statement prefix.

5. **`StreamableHTTPServerTransport` vs `StreamableHTTPTransport`.** OB1 uses `@hono/mcp`'s `StreamableHTTPTransport`. The `@modelcontextprotocol/sdk` directly exports `StreamableHTTPServerTransport`. The fork uses the SDK directly (no `@hono/mcp` dependency), keeping the dependency tree simpler.

---

## §6c — Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Single-table discriminator for memory tiers | Simpler RRF queries; no JOIN overhead at spike scale |
| D2 | Use OB1's entity-extraction trigger pattern directly | Battle-tested, idempotent; no reason to redesign |
| D3 | `Authorization: Bearer` replaces OB1's `x-brain-key` | More standard; consistent with ADR-010 |
| D4 | `postgres` npm package for DB access (not Supabase client) | Direct SQL; no ORM overhead; full AGE multi-statement support via `sql.unsafe()` |
| D5 | `registerTool` API (not `server.tool`) | OB1's tested API shape; `server.tool` appears in older SDK versions |
| D6 | Fire-and-forget embedding update in `capture_thought` | Keeps tool response latency low; embedding is async and not needed for the capture confirmation |
| D7 | `MERGE` for AGE writes (not `CREATE`) | Idempotent entity writes; re-processing the same thought doesn't create duplicate nodes |

---

## Downstream Changes Required

1. **ADR-004** (Interface Design): Add `graph_traverse` tool to the canonical tool list. The spike produced a working implementation; the ADR's tool table needs updating.
2. **ADR-007** (Consolidation Pipeline): The `consolidation_queue` table schema is defined in `server/db/schema.sql`. The Deno consolidation worker implementation is a separate story.
3. **ST-XXX** (Entity Extraction Worker): The design in §R8 is ready. Create an implementation story for the Deno entity extraction worker process.
4. **ST-XXX** (Consolidation Worker): Implement the Deno consolidation worker using the queue pattern in `server/db/schema.sql`.
5. **ST-XXX** (Cloud Deployment): After local Docker validation, evaluate Fly.io / Railway / DigitalOcean per ADR-009.
