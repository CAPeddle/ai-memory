# ExecPlan — ST-022: Implement Entity Extraction Worker (OpenRouter → AGE Graph)

> Status: ✅ Ready for /continue
> Story: ST-022
> Created: 2026-05-18
> Parent: `docs/investigations/ST-021-findings/09-entity-extraction-worker-design.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

The ai-memory MCP server (`server/index.ts`) captures thoughts into PostgreSQL and provides hybrid BM25+vector search. An Apache AGE graph (`memory_graph`) is already initialized in the database via `server/db/graph.sql`, alongside an `entity_extraction_queue` table and a trigger (`trg_queue_entity_extraction`) that automatically queues every new/updated thought for entity extraction.

What is **missing** is the worker that actually processes the queue — calling an LLM to extract structured entities and relationships from thought content, then writing those into the AGE graph. Without this worker, the `memory_graph` remains empty and the existing `graph_traverse` MCP tool returns no useful data.

**After this story is complete:**
1. Every captured thought is automatically processed by a background loop that extracts entities (Person, Function, Error, Topic, Project) and relationships (CAUSED_BY, LIKES, WORKS_ON, USES, RELATED_TO) into the knowledge graph.
2. A new parameterized `graph_search` MCP tool enables agents to traverse the graph by specifying a start node name, optional relationship filter, and hop depth (1–3) — without needing to write raw openCypher.
3. The existing raw-cypher `graph_traverse` tool is preserved for power-user access.
4. An integration test proves the end-to-end pipeline: `capture_thought` → trigger queues → worker extracts → graph populated → `graph_search` returns results.

**Key files (current state):**
- `server/index.ts` — MCP server entry point; registers all tools; starts Hono HTTP server on port 3000
- `server/src/db.ts` — exports `sql` (a `postgres` client instance connected via `DATABASE_URL`)
- `server/db/graph.sql` — AGE graph creation, `entity_extraction_queue` table, trigger function
- `server/db/schema.sql` — `thoughts` table with `content`, `memory_type`, `embedding`, etc.
- `server/Dockerfile` — Deno 2.0 image; runs `index.ts` with `--allow-net --allow-env`
- `docker-compose.yml` — `db` (Postgres+AGE+pgvector) and `mcp` (Deno server) services
- `server/deno.json` — import map (hono, zod, @modelcontextprotocol/sdk)

**Key terms:**
- **AGE** — Apache Graph Extension for PostgreSQL; provides openCypher query language over a property graph stored inside Postgres
- **MERGE** — openCypher clause that creates a node/edge only if it doesn't already exist (idempotent upsert)
- **FOR UPDATE SKIP LOCKED** — PostgreSQL row-locking clause that skips rows already locked by another transaction, enabling safe concurrent queue processing
- **Allow-list** — A fixed set of permitted values. Labels and relationship types from LLM output are validated against these sets before interpolation into openCypher strings, preventing injection
- **RRF** — Reciprocal Rank Fusion; the scoring method used by `search_thoughts`
- **OpenRouter** — API-compatible proxy that routes to multiple LLM providers; the project uses it for both embeddings and chat completions

---

## §1b. Outcomes & Conclusions

(To be populated during execution)

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

1. After inserting a thought via `capture_thought`, the `entity_extraction_queue` row transitions from `pending` → `processing` → `done` within 15 seconds (at default 10s poll interval).
2. After the worker processes a thought containing "Alice uses TypeScript for the Zoom project", the AGE `memory_graph` contains at least nodes `(:Person {name: 'Alice'})` and `(:Project {name: 'Zoom'})` connected by `[:WORKS_ON]` or `[:USES]` edges.
3. After reprocessing the same thought (re-queue by updating content), the graph does not create duplicate nodes (MERGE idempotency).
4. After a thought fails extraction 5 times, its queue status is `failed` and `last_error` contains a meaningful message.
5. After running `graph_search` with `start_node: "Alice"`, the tool returns nodes connected to Alice within the specified hop depth.
6. After running `docker compose up -d` with a valid `OPENROUTER_API_KEY`, the MCP container logs show `[entityWorker] started` within 5 seconds of boot.
7. After running the integration test script, all assertions pass with exit code 0.

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

(Empty — populated by /continue when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Background worker loop polls queue via FOR UPDATE SKIP LOCKED (QP-022 AC1) | `server/src/entityWorker.ts` contains the UPDATE...FOR UPDATE SKIP LOCKED SQL | Task 4.1 | grep for "SKIP LOCKED" in entityWorker.ts |
| OpenRouter LLM call with strict JSON response_format (QP-022 AC2) | `server/src/entityWorker.ts` contains fetch to openrouter with `response_format: { type: "json_object" }` | Task 4.1 | grep for "json_object" in entityWorker.ts |
| Allow-list validation for labels and relationship types (QP-022 AC2) | `server/src/entityWorker.ts` defines ALLOWED_LABELS and ALLOWED_RELS sets and filters against them | Task 4.1 | grep for "ALLOWED_LABELS" in entityWorker.ts |
| MERGE writes to memory_graph (QP-022 AC3) | `server/src/entityWorker.ts` contains AGE MERGE cypher statements | Task 4.1 | grep for "MERGE" in entityWorker.ts |
| Worker runs in MCP container as background loop (QP-022 AC4) | `server/index.ts` imports and starts the worker on boot | Task 4.3 | grep for "startEntityWorker" in index.ts |
| Status transitions pending→processing→done/failed with exponential backoff (QP-022 AC5) | `server/src/entityWorker.ts` implements all three state transitions and backoff calculation | Task 4.1 | grep for "retry_after" and "failed" in entityWorker.ts |
| Per-thought 4000-token input cap (QP-022 AC6) | `server/src/entityWorker.ts` truncates content before LLM call | Task 4.1 | grep for "MAX_TOKENS" or "truncate" in entityWorker.ts |
| Integration test: thought → queue → graph (QP-022 AC7) | `server/tests/entity-worker.test.ts` contains assertion for graph node existence | Task 4.5 | Run test, exit code 0 |
| graph_search MCP tool with parameterized interface (QP-022 AC8) | `server/index.ts` registers `graph_search` tool with start_node, relationship_filter, max_hops params | Task 4.2 | grep for "graph_search" in index.ts |
| Integration test: graph_search returns expected results (QP-022 AC9) | `server/tests/entity-worker.test.ts` tests graph_search via MCP call | Task 4.5 | Run test, exit code 0 |

---

## §3. Preconditions

**Tools required:**
- Docker Desktop (or Docker Engine) with `docker compose` v2+ available
- Deno 2.0+ (for local development/testing; container uses denoland/deno:2.0.0)
- A valid `OPENROUTER_API_KEY` with access to `openai/gpt-4o-mini` (set in `.env`)
- `curl` (for integration test assertions)

**Environment variables (in `.env` at repo root):**
```
DB_PASSWORD=<any-local-dev-password>
MEMORY_API_KEY=<any-local-dev-key>
OPENROUTER_API_KEY=<real-openrouter-key>
```

**Prior stories done:** ST-021 (delivered all schema, trigger, Dockerfile, docker-compose)

**Files that must exist:**
- `server/db/graph.sql` — contains `entity_extraction_queue` table and trigger
- `server/db/schema.sql` — contains `thoughts` table
- `server/src/db.ts` — exports `sql` postgres client
- `server/index.ts` — MCP server with existing tools
- `docker-compose.yml` — db + mcp services

**Schema migration (embedded — no separate migration file):**

The `entity_extraction_queue` table needs one new column (`retry_after`) for exponential backoff. This will be added via an `ALTER TABLE` in a new init script that runs after `graph.sql`.

**Boilerplate — System prompt for entity extraction:**

```
Extract entities and relationships from the following thought. Return a JSON object with exactly two keys:
- "nodes": array of objects with "label" (one of: Person, Function, Error, Topic, Project) and "name" (string, the entity's canonical name)
- "edges": array of objects with "from" (node name), "to" (node name), and "rel" (one of: CAUSED_BY, LIKES, WORKS_ON, USES, RELATED_TO)

Rules:
- Only use the allowed labels and relationship types listed above
- Extract only entities and relationships explicitly stated or strongly implied in the text
- Use singular, title-case names for entities (e.g., "TypeScript" not "typescript")
- If no entities or relationships are found, return {"nodes": [], "edges": []}
```

**Boilerplate — Exponential backoff formula:**

```typescript
// delay_seconds = min(2^(attempt_count - 1), 128)
// attempt 1 → 1s, attempt 2 → 2s, attempt 3 → 4s, attempt 4 → 8s, attempt 5 → fail
function backoffSeconds(attemptCount: number): number {
  return Math.min(Math.pow(2, attemptCount - 1), 128);
}
```

---

## §4. Task Definitions

### Task 4.1: Create the entity extraction worker module

**Objective:** Implement `server/src/entityWorker.ts` — a self-contained module that exports a `startEntityWorker()` function. When called, it begins a polling loop that claims pending queue items, calls OpenRouter for entity extraction, validates output against the allow-list, writes to AGE, and handles failures with exponential backoff.

**Input:** `server/src/db.ts` (provides `sql`), `OPENROUTER_API_KEY` env var, existing `entity_extraction_queue` table.

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. Create `src/entityWorker.ts` with the following structure:

```typescript
import { sql } from "./db.ts";

// --- Configuration ---
const POLL_INTERVAL_MS = 10_000; // 10 seconds
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;
const MAX_INPUT_CHARS = 16_000; // ~4000 tokens at 4 chars/token
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";

// --- Allow-lists (critical injection mitigation) ---
const ALLOWED_LABELS = new Set(["Person", "Function", "Error", "Topic", "Project"]);
const ALLOWED_RELS = new Set(["CAUSED_BY", "LIKES", "WORKS_ON", "USES", "RELATED_TO"]);

// --- String sanitisation for Cypher interpolation ---
function escapeForCypher(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\$\$/g, "");
}

// --- Exponential backoff ---
function backoffSeconds(attemptCount: number): number {
  return Math.min(Math.pow(2, attemptCount - 1), 128);
}

// --- Types ---
interface ExtractedNode {
  label: string;
  name: string;
}
interface ExtractedEdge {
  from: string;
  to: string;
  rel: string;
}
interface ExtractionResult {
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
}

// --- LLM call ---
const SYSTEM_PROMPT = `Extract entities and relationships from the following thought. Return a JSON object with exactly two keys:
- "nodes": array of objects with "label" (one of: Person, Function, Error, Topic, Project) and "name" (string, the entity's canonical name)
- "edges": array of objects with "from" (node name), "to" (node name), and "rel" (one of: CAUSED_BY, LIKES, WORKS_ON, USES, RELATED_TO)

Rules:
- Only use the allowed labels and relationship types listed above
- Extract only entities and relationships explicitly stated or strongly implied in the text
- Use singular, title-case names for entities (e.g., "TypeScript" not "typescript")
- If no entities or relationships are found, return {"nodes": [], "edges": []}`;

async function callLLM(content: string): Promise<ExtractionResult> {
  const truncated = content.slice(0, MAX_INPUT_CHARS);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: truncated },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  return JSON.parse(text) as ExtractionResult;
}

// --- Allow-list filtering ---
function filterExtraction(raw: ExtractionResult): ExtractionResult {
  const nodes = (raw.nodes ?? []).filter(
    (n) => ALLOWED_LABELS.has(n.label) && typeof n.name === "string" && n.name.length > 0
  );
  const validNames = new Set(nodes.map((n) => n.name));
  const edges = (raw.edges ?? []).filter(
    (e) =>
      ALLOWED_RELS.has(e.rel) &&
      typeof e.from === "string" &&
      typeof e.to === "string" &&
      validNames.has(e.from) &&
      validNames.has(e.to)
  );
  return { nodes, edges };
}

// --- AGE graph writes ---
async function writeToGraph(extraction: ExtractionResult): Promise<void> {
  for (const node of extraction.nodes) {
    // Label and name are allow-list–validated; name is escaped
    await sql.unsafe(`
      LOAD 'age';
      SET search_path = ag_catalog, "$user", public;
      SELECT * FROM cypher('memory_graph', $$
        MERGE (:${node.label} {name: '${escapeForCypher(node.name)}'})
      $$) AS t(v agtype);
    `);
  }
  for (const edge of extraction.edges) {
    // Relationship type is allow-list–validated; node names are escaped
    await sql.unsafe(`
      LOAD 'age';
      SET search_path = ag_catalog, "$user", public;
      SELECT * FROM cypher('memory_graph', $$
        MATCH (a {name: '${escapeForCypher(edge.from)}'}), (b {name: '${escapeForCypher(edge.to)}'})
        MERGE (a)-[:${edge.rel}]->(b)
      $$) AS t(v agtype);
    `);
  }
}

// --- Queue processing ---
async function processQueue(): Promise<void> {
  // Claim a batch of pending rows (skip rows not yet eligible for retry)
  const rows = await sql`
    UPDATE entity_extraction_queue
    SET status = 'processing', started_at = now(), attempt_count = attempt_count + 1
    WHERE thought_id IN (
      SELECT thought_id FROM entity_extraction_queue
      WHERE status = 'pending'
        AND (retry_after IS NULL OR retry_after <= now())
      ORDER BY queued_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING thought_id
  `;

  if (!rows.length) return;

  for (const { thought_id } of rows) {
    try {
      // Fetch thought content
      const [thought] = await sql`
        SELECT content FROM thoughts WHERE id = ${thought_id}
      `;
      if (!thought) {
        await sql`
          UPDATE entity_extraction_queue
          SET status = 'failed', last_error = 'Thought not found', processed_at = now()
          WHERE thought_id = ${thought_id}
        `;
        continue;
      }

      // Call LLM
      const raw = await callLLM(thought.content as string);
      const extraction = filterExtraction(raw);

      // Write to graph (may produce zero writes if LLM found nothing)
      await writeToGraph(extraction);

      // Mark done
      await sql`
        UPDATE entity_extraction_queue
        SET status = 'done', processed_at = now(), last_error = NULL
        WHERE thought_id = ${thought_id}
      `;

      console.log(`[entityWorker] processed ${thought_id}: ${extraction.nodes.length} nodes, ${extraction.edges.length} edges`);
    } catch (err) {
      const errorMsg = (err as Error).message?.slice(0, 500) ?? "Unknown error";
      // Check attempt count
      const [row] = await sql`
        SELECT attempt_count FROM entity_extraction_queue WHERE thought_id = ${thought_id}
      `;
      const attempts = Number(row?.attempt_count ?? MAX_ATTEMPTS);

      if (attempts >= MAX_ATTEMPTS) {
        await sql`
          UPDATE entity_extraction_queue
          SET status = 'failed', last_error = ${errorMsg}, processed_at = now()
          WHERE thought_id = ${thought_id}
        `;
        console.error(`[entityWorker] FAILED permanently (${attempts} attempts): ${thought_id} — ${errorMsg}`);
      } else {
        const delaySec = backoffSeconds(attempts);
        await sql`
          UPDATE entity_extraction_queue
          SET status = 'pending',
              last_error = ${errorMsg},
              retry_after = now() + ${delaySec + " seconds"}::interval
          WHERE thought_id = ${thought_id}
        `;
        console.warn(`[entityWorker] retryable failure (attempt ${attempts}/${MAX_ATTEMPTS}, retry in ${delaySec}s): ${thought_id}`);
      }
    }
  }
}

// --- Public entry point ---
export function startEntityWorker(): void {
  if (!OPENROUTER_API_KEY) {
    console.warn("[entityWorker] OPENROUTER_API_KEY not set — entity extraction disabled");
    return;
  }
  console.log("[entityWorker] started (poll every 10s, batch 10)");
  setInterval(processQueue, POLL_INTERVAL_MS);
  // Run once immediately on start
  processQueue().catch((err) =>
    console.error("[entityWorker] initial poll failed:", err)
  );
}
```

2. Ensure the module compiles by running `deno check src/entityWorker.ts` from the `server/` directory.

**Expected output:** File `server/src/entityWorker.ts` exists with approximately 160 lines implementing the full worker loop.

**Requirement mapping:** QP-022 AC1, AC2, AC3, AC4, AC5, AC6 (rows 1–7 in §2d).

**Verification:**
```powershell
cd c:\projects\ai-memory\server
Select-String -Path "src/entityWorker.ts" -Pattern "SKIP LOCKED"
Select-String -Path "src/entityWorker.ts" -Pattern "json_object"
Select-String -Path "src/entityWorker.ts" -Pattern "ALLOWED_LABELS"
Select-String -Path "src/entityWorker.ts" -Pattern "MERGE"
Select-String -Path "src/entityWorker.ts" -Pattern "retry_after"
Select-String -Path "src/entityWorker.ts" -Pattern "MAX_INPUT_CHARS"
```
Expected result: Each grep returns at least one match.

**Failure handling:** If `deno check` reports type errors, fix them inline. The most likely issue is the `sql` template literal types — use `sql.unsafe()` for dynamic queries and `sql` tagged template for parameterized ones.

---

### Task 4.2: Add parameterized `graph_search` MCP tool

**Objective:** Register a new `graph_search` MCP tool in `server/index.ts` that accepts structured parameters (start_node, relationship_filter, max_hops) and builds the openCypher query internally. This is safer than the existing raw-cypher `graph_traverse` tool (which is preserved for power users).

**Input:** `server/index.ts` — existing tool registrations.

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. In `server/index.ts`, add the following tool registration **before** the Hono app section (after the existing `graph_traverse` tool registration):

```typescript
// --- Tool 6: graph_search (parameterized graph traversal) -------------------

const GRAPH_SEARCH_ALLOWED_RELS = new Set(["CAUSED_BY", "LIKES", "WORKS_ON", "USES", "RELATED_TO"]);

server.registerTool(
  "graph_search",
  {
    title: "Graph Search",
    description: "Search the knowledge graph by starting from a named entity and traversing relationships up to a specified depth. Safer alternative to graph_traverse — does not require writing openCypher.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      start_node: z.string().describe("Name of the entity to start from (e.g. 'Alice', 'TypeScript')"),
      relationship_filter: z.string().optional().describe("Limit traversal to this relationship type (e.g. 'CAUSED_BY'). If omitted, all relationship types are traversed."),
      max_hops: z.number().int().min(1).max(3).optional().default(2).describe("Maximum traversal depth (1-3, default 2)"),
    },
  },
  async ({ start_node, relationship_filter, max_hops }) => {
    try {
      // Validate relationship filter against allow-list
      if (relationship_filter && !GRAPH_SEARCH_ALLOWED_RELS.has(relationship_filter)) {
        return {
          content: [{
            type: "text" as const,
            text: `Invalid relationship_filter. Allowed: ${[...GRAPH_SEARCH_ALLOWED_RELS].join(", ")}`,
          }],
          isError: true,
        };
      }

      const escapedName = start_node.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\$\$/g, "");
      const hops = max_hops ?? 2;

      // Build the MATCH pattern
      let relPattern: string;
      if (relationship_filter) {
        relPattern = `-[:${relationship_filter}*1..${hops}]-`;
      } else {
        relPattern = `-[*1..${hops}]-`;
      }

      const cypher = `MATCH (start {name: '${escapedName}'})${relPattern}(connected) RETURN DISTINCT connected`;

      const rows = await sql.unsafe(`
        LOAD 'age';
        SET search_path = ag_catalog, "$user", public;
        SELECT * FROM cypher('memory_graph', $$ ${cypher} $$) AS t(result agtype);
      `);

      const results = rows.map((r) => String(r.result));
      if (!results.length) {
        return { content: [{ type: "text" as const, text: `No nodes found connected to "${start_node}" within ${hops} hops.` }] };
      }
      return { content: [{ type: "text" as const, text: results.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);
```

**Expected output:** `server/index.ts` now registers 6 tools: `search`, `fetch`, `search_thoughts`, `capture_thought`, `list_thoughts`, `thought_stats`, `graph_traverse`, `graph_search`.

**Requirement mapping:** QP-022 AC8 (row 9 in §2d).

**Verification:**
```powershell
cd c:\projects\ai-memory\server
Select-String -Path "index.ts" -Pattern "graph_search"
```
Expected result: At least 2 matches (registration + tool name string).

**Failure handling:** If deno check reports issues with the z.number().optional().default() pattern, use `.optional()` and apply default in the handler body.

---

### Task 4.3: Wire worker startup and add `retry_after` schema migration

**Objective:** Import and start the entity worker in `server/index.ts` on server boot, and add the `retry_after` column to the database init scripts.

**Input:** `server/index.ts` (entry point), `server/db/graph.sql` (existing schema).

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. At the top of `server/index.ts`, add the import (after the existing imports):
```typescript
import { startEntityWorker } from "./src/entityWorker.ts";
```

2. After the `Deno.serve(...)` line at the bottom of `index.ts`, add:
```typescript
// Start entity extraction background worker
startEntityWorker();
```

3. Create a new SQL init script `server/db/04-queue-retry.sql`:
```sql
-- Add retry_after column for exponential backoff (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'entity_extraction_queue'
      AND column_name = 'retry_after'
  ) THEN
    ALTER TABLE public.entity_extraction_queue ADD COLUMN retry_after timestamptz;
  END IF;
END;
$$;
```

4. In `docker/postgres-age/Dockerfile`, check how init scripts are loaded. If they use `/docker-entrypoint-initdb.d/`, add a COPY for the new script. If the existing `graph.sql` is loaded via a different mechanism, follow that pattern.

5. Alternatively, add the ALTER TABLE directly to the end of `server/db/graph.sql` as an idempotent block (simpler if init scripts aren't ordered):

```sql
-- Exponential backoff support (added by ST-022)
ALTER TABLE public.entity_extraction_queue
  ADD COLUMN IF NOT EXISTS retry_after timestamptz;
```

**Note:** PostgreSQL's `ADD COLUMN IF NOT EXISTS` requires PG 9.6+ (we use 15). This is the simplest idempotent approach.

**Expected output:**
- `server/index.ts` imports and starts the worker
- `retry_after` column is added to the init SQL (either via separate file or appended to `graph.sql`)

**Requirement mapping:** QP-022 AC4, AC5 (rows 5, 6 in §2d).

**Verification:**
```powershell
cd c:\projects\ai-memory\server
Select-String -Path "index.ts" -Pattern "startEntityWorker"
Select-String -Path "db/graph.sql" -Pattern "retry_after"
```
Expected result: Both return matches.

**Failure handling:** If the `ADD COLUMN IF NOT EXISTS` syntax isn't supported in the Docker PG image, use the DO $$ block approach from step 3 instead.

---

### Task 4.4: Update Dockerfile permissions

**Objective:** The entity worker needs `--allow-read` for Deno (to read the `deno.json` import map during npm module resolution). Update the CMD in the Dockerfile.

**Input:** `server/Dockerfile`

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. Edit `server/Dockerfile` to update the CMD line:

Before:
```dockerfile
CMD ["run", "--allow-net", "--allow-env", "index.ts"]
```

After:
```dockerfile
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "index.ts"]
```

**Expected output:** Dockerfile CMD includes `--allow-read`.

**Requirement mapping:** Supports AC4 (worker runs in MCP container).

**Verification:**
```powershell
Select-String -Path "c:\projects\ai-memory\server\Dockerfile" -Pattern "allow-read"
```
Expected result: One match on the CMD line.

**Failure handling:** If `--allow-read` is too broad, scope it: `--allow-read=.` (current directory only). Test by running `docker compose build mcp` and verifying the container starts.

---

### Task 4.5: Create integration test script

**Objective:** Create `server/tests/entity-worker.test.ts` — a Deno test file that runs against a live Docker Compose stack and verifies the full pipeline: capture_thought → entity extraction → graph populated → graph_search works.

**Input:** Running Docker Compose stack (db + mcp services).

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. Create directory `server/tests/` if it does not exist.

2. Create `server/tests/entity-worker.test.ts`:

```typescript
/**
 * Integration test for ST-022: Entity Extraction Worker
 *
 * Prerequisites:
 *   docker compose up -d  (from repo root)
 *   Wait for mcp service to be healthy
 *
 * Run:
 *   deno test --allow-net --allow-env tests/entity-worker.test.ts
 */

const MCP_BASE = Deno.env.get("MCP_BASE_URL") ?? "http://localhost:3000";
const API_KEY = Deno.env.get("MEMORY_API_KEY") ?? "test-key";

async function mcpCall(tool: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${MCP_BASE}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`MCP call failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.test("entity extraction: capture_thought → queue → graph populated", async () => {
  // 1. Capture a thought with extractable entities
  const captureResult = await mcpCall("capture_thought", {
    content: "Alice uses TypeScript for the Zoom project and it was caused by a NullReferenceError",
    memory_type: "shard",
    context: "project:test-st022",
  });
  console.log("Capture result:", JSON.stringify(captureResult));

  // 2. Wait for worker to process (poll interval 10s + processing time)
  console.log("Waiting 20s for entity extraction worker...");
  await sleep(20_000);

  // 3. Verify graph contains expected nodes via graph_search
  const searchResult = await mcpCall("graph_search", {
    start_node: "Alice",
    max_hops: 2,
  });
  console.log("Graph search result:", JSON.stringify(searchResult));

  // The result should contain connected nodes (TypeScript, Zoom, NullReferenceError)
  const resultText = JSON.stringify(searchResult);
  const hasConnections = resultText.includes("TypeScript") ||
    resultText.includes("Zoom") ||
    resultText.includes("NullReferenceError");

  if (!hasConnections) {
    throw new Error(
      `Expected graph_search from 'Alice' to find connected entities. Got: ${resultText}`
    );
  }
});

Deno.test("entity extraction: graph_traverse raw cypher still works", async () => {
  // Verify the existing raw cypher tool is preserved and functional
  const result = await mcpCall("graph_traverse", {
    cypher: "MATCH (n:Person) RETURN n LIMIT 5",
  });
  console.log("graph_traverse result:", JSON.stringify(result));
  const resultText = JSON.stringify(result);
  // Should return at least Alice from the previous test
  if (!resultText.includes("Alice")) {
    throw new Error(`Expected graph_traverse to find Person nodes. Got: ${resultText}`);
  }
});

Deno.test("entity extraction: graph_search with relationship filter", async () => {
  const result = await mcpCall("graph_search", {
    start_node: "Alice",
    relationship_filter: "USES",
    max_hops: 1,
  });
  console.log("Filtered graph_search result:", JSON.stringify(result));
  // Should either find TypeScript via USES or return empty (LLM dependent)
  // This test verifies the tool doesn't error — exact results depend on LLM extraction
  const resultText = JSON.stringify(result);
  if (resultText.includes("Error") && resultText.includes("isError")) {
    throw new Error(`graph_search with filter should not error. Got: ${resultText}`);
  }
});

Deno.test("entity extraction: invalid relationship filter rejected", async () => {
  const result = await mcpCall("graph_search", {
    start_node: "Alice",
    relationship_filter: "INVALID_REL",
    max_hops: 1,
  }) as { result?: { content?: Array<{ text?: string }> } };
  console.log("Invalid filter result:", JSON.stringify(result));
  const resultText = JSON.stringify(result);
  // Should return an error about invalid relationship
  if (!resultText.includes("Invalid relationship_filter") && !resultText.includes("Allowed")) {
    throw new Error(`Expected validation error for invalid rel filter. Got: ${resultText}`);
  }
});
```

**Expected output:** `server/tests/entity-worker.test.ts` exists with 4 test cases.

**Requirement mapping:** QP-022 AC7, AC8, AC9 (rows 8, 9, 10 in §2d).

**Verification:**
```powershell
Test-Path "c:\projects\ai-memory\server\tests\entity-worker.test.ts"
Select-String -Path "c:\projects\ai-memory\server\tests\entity-worker.test.ts" -Pattern "Deno.test"
```
Expected result: File exists; 4 occurrences of `Deno.test`.

**Failure handling:** If the MCP server doesn't support bare JSON-RPC over HTTP (requires SSE session initialization), adjust the test to use the MCP SDK client instead. See `npm:@modelcontextprotocol/sdk@1.24.3/client` for the client class.

---

### Task 4.6: Build and run integration test

**Objective:** Rebuild containers with the new worker code and execute the integration test end-to-end.

**Input:** All prior tasks completed; `.env` file with valid keys.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Rebuild containers:
```powershell
docker compose build --no-cache
```

2. Start the stack:
```powershell
docker compose up -d
```

3. Wait for health checks:
```powershell
docker compose ps
# Both db and mcp should show "healthy"
```

4. Check worker started:
```powershell
docker compose logs mcp | Select-String "entityWorker"
# Should see "[entityWorker] started"
```

5. Run integration tests:
```powershell
cd server
$env:MCP_BASE_URL = "http://localhost:3000"
$env:MEMORY_API_KEY = "<your-local-key>"
deno test --allow-net --allow-env tests/entity-worker.test.ts
```

6. Check queue status in DB:
```powershell
docker compose exec db psql -U ai_memory -d ai_memory -c "SELECT thought_id, status, attempt_count FROM entity_extraction_queue ORDER BY queued_at DESC LIMIT 5;"
```
Expected: At least one row with `status = 'done'`.

7. Check graph was populated:
```powershell
docker compose exec db psql -U ai_memory -d ai_memory -c "LOAD 'age'; SET search_path = ag_catalog, \"\$user\", public; SELECT * FROM cypher('memory_graph', \$\$ MATCH (n) RETURN n LIMIT 10 \$\$) AS t(result agtype);"
```
Expected: Returns at least one node (e.g., Person:Alice, Topic:TypeScript).

**Expected output:** All 4 Deno tests pass; queue shows `done` rows; graph contains nodes.

**Requirement mapping:** All §2d rows (full end-to-end proof).

**Verification:**
```powershell
# The deno test command above must exit with code 0
echo $LASTEXITCODE
# Must be 0
```

**Failure handling:**
- If the worker doesn't start: check `docker compose logs mcp` for import errors. Fix TypeScript issues in entityWorker.ts.
- If LLM call fails (401): verify `OPENROUTER_API_KEY` is valid and the `.env` is mounted.
- If AGE writes fail: check that the `memory_graph` exists and `LOAD 'age'` succeeds. Run `docker compose exec db psql -U ai_memory -d ai_memory -c "LOAD 'age'; SELECT * FROM ag_catalog.ag_graph;"`.
- If tests time out: increase the sleep duration in the test (worker may need >20s on first cold start).
- If MCP endpoint rejects JSON-RPC: the StreamableHTTP transport may require session initialization. Adjust tests to use SSE-based client or add a non-MCP test endpoint.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | — |
| **Last successful command** | — |
| **Expected outputs produced** | — |
| **Next task** | Task 4.1 — Create the entity extraction worker module |
| **Known blockers** | None |
| **Last updated** | — |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| — | — | — | — | — |

### Avoidance

(Append dated entries here. Do not delete prior guidance.)

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | In-process worker with setInterval poll loop + OpenRouter gpt-4o-mini | Before Task 4.1 | 🟢 Active |
| 2 | Separate worker file spawned as Deno subprocess | Before Task 4.1 | ⬜ Reserve |

### Approach Failure Log
(Empty — no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback (hard cap)

---

## §6. Execution Log

(Populated during execution — timestamped entries of significant actions)

---

## §6b. Surprises & Discoveries

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

---

## §6c. Decision Log

(Record every decision made during execution with rationale.)

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

(To be populated at completion)

---

## Revision Notes

- 2026-05-18: Initial ExecPlan authored from QP-022.
