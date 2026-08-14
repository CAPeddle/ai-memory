# Phase 2: Remote Node Identity & Hub — Pattern Map

**Mapped:** 2026-08-05
**Files analyzed:** 4 new files (2 migrations, 1 source, 1 test)
**Analogs found:** 4 / 4 — all have exact or role-match analogs in the live codebase

---

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `server/db/workflow/003_execution_nodes.sql` | migration | batch/DDL | `server/db/workflow/002_decision_run_packet_integrity.sql` | exact |
| `server/db/workflow/004_run_events.sql` | migration | batch/DDL | `server/db/workflow/001_workflow_schema.sql` (index + unique constraint shape) | exact |
| `server/src/workflow/remoteNodeHub.ts` | route factory + auth utility | request-response | `server/src/workflow/api.ts` (`createWorkflowApi`) + `server/src/auth.ts` (`requireApiKey`) | exact |
| `server/tests/workflow-remote-node-hub.test.ts` | integration test | request-response | `server/tests/workflow-migrations.test.ts` (`withScratchSchema`) + `server/tests/workflow-agent-key-e2e.test.ts` (auth assertions) | exact |

---

## Pattern Assignments

---

### `server/db/workflow/003_execution_nodes.sql` (migration, DDL)

**Analog:** `server/db/workflow/002_decision_run_packet_integrity.sql`

**Key rule from 002:** Migrations 003+ must NOT use `IF NOT EXISTS` guards on `ADD CONSTRAINT` or new tables (002 explains this at length — the ledger is the idempotency mechanism; re-runnable DDL hollows out the drift check). The one exception from 001 is `CREATE SCHEMA IF NOT EXISTS` on the very first schema creation.

**Header comment pattern** (`002_decision_run_packet_integrity.sql`, lines 1–40):
```sql
-- ST-088 migration 003 — execution nodes for remote hub.
--
-- DELIBERATE STYLE BREAK FROM 001: no `IF NOT EXISTS` on table creation.
-- The ledger (`workflow.schema_migrations`) is the idempotency mechanism.
-- Re-running this file against a database that already has these objects SHOULD
-- fail loudly.
--
-- Every object is schema-qualified `workflow.*`. This is a correctness
-- requirement: four sites in the memory domain set `search_path` session-wide
-- on pooled connections — unqualified objects land in the wrong schema
-- non-deterministically on those connections.
--
-- Full teardown: DROP SCHEMA workflow CASCADE;
```

**Table DDL pattern** — copy column style and CHECK constraint style from `001_workflow_schema.sql` (lines 27–55):
```sql
CREATE TABLE workflow.execution_nodes (
  node_id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bearer_token_hash  text        NOT NULL UNIQUE,
  registered_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  status             text        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'paused', 'offline')),
  hostname           text,
  platform           text
);
```

> **`UNIQUE` on `bearer_token_hash` is required** — it enables the `ON CONFLICT (bearer_token_hash) DO UPDATE` upsert on registration without a separate existence check (see RESEARCH.md §4). Do NOT add `IF NOT EXISTS` to the constraint name.

**Index pattern** — copy from `001_workflow_schema.sql` lines 57–59:
```sql
CREATE INDEX idx_workflow_nodes_status
  ON workflow.execution_nodes (status, registered_at DESC);
```

**What NOT to copy from 001:** The `IF NOT EXISTS` guards on `CREATE TABLE`. 001 predates the migration ledger; 003 does not.

---

### `server/db/workflow/004_run_events.sql` (migration, DDL)

**Analog:** `server/db/workflow/001_workflow_schema.sql` (unique index shape) + `002_decision_run_packet_integrity.sql` (no `IF NOT EXISTS` style)

**Table DDL** — follow 001's column layout and FK ON DELETE CASCADE pattern (lines 75–90):
```sql
CREATE TABLE workflow.run_events (
  event_id     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id      uuid        NOT NULL REFERENCES workflow.execution_nodes (node_id) ON DELETE CASCADE,
  client_seq   bigint      NOT NULL,
  event_type   text        NOT NULL,
  payload      jsonb,
  received_at  timestamptz NOT NULL DEFAULT now()
);
```

**Unique index for idempotent replay** — a named unique index (not a table-level UNIQUE column list) exposes the constraint name for `ON CONFLICT`:
```sql
CREATE UNIQUE INDEX uq_run_events_node_seq
  ON workflow.run_events (node_id, client_seq);
```

> This index is what makes `ON CONFLICT (node_id, client_seq) DO NOTHING` legal in the events insert. A table-level `UNIQUE` constraint also works but the explicit index name is self-documenting. Copy the `CREATE UNIQUE INDEX` form.

**Supporting index** (copy pattern from 001, lines 96–98):
```sql
CREATE INDEX idx_workflow_run_events_node
  ON workflow.run_events (node_id, received_at DESC);
```

**Migration runner picks this up automatically** — `server/src/workflow/schema.ts`'s `discoverMigrations()` reads `^(\d+)_.*\.sql$` in `server/db/workflow/` non-recursively. No code change needed to the runner.

---

### `server/src/workflow/remoteNodeHub.ts` (route factory + auth utility, request-response)

**Primary analog:** `server/src/workflow/api.ts` (factory, Zod, `withErrorMapping`, `toHttpError`, `command()` helper)
**Secondary analog:** `server/src/auth.ts` (bearer validation pattern)
**Boundary constraint:** `server/tests/workflow-boundary.test.ts` enforces an import allowlist — `../auth.ts` is NOT permitted inside `server/src/workflow/`. The node bearer validator must be defined IN this file (or a sibling `workflow/nodeAuth.ts`), not imported from `auth.ts`.

#### Imports pattern
Copy import style from `server/src/workflow/api.ts` lines 1–15:
```typescript
import { Hono } from "npm:hono@4.9.2";
import type { Context } from "npm:hono@4.9.2";
import { z } from "npm:zod@4.1.13";
import { sql } from "../db.ts";
// NO import from "../auth.ts" — boundary rule enforced by workflow-boundary.test.ts
```

`node:crypto` for timing-safe comparison needs no `deno.json` entry — it is Deno's Node compat shim:
```typescript
import { timingSafeEqual } from "node:crypto";
```

#### Node bearer validation pattern
Mirror `server/src/auth.ts` (entire file, ~15 lines) but for the node credential. The key difference: do NOT throw when the env var is absent — return 401 instead (the bearer is optional at boot):

```typescript
// Analog: server/src/auth.ts requireApiKey() — but fails OPEN on missing env,
// not closed. A missing NODE_BEARER env var means "no node configured",
// not "server misconfigured".
export function validateNodeBearer(req: Request): Response | null {
  const auth = req.headers.get("Authorization");
  // No env var = no node registered = any bearer is invalid
  if (!auth) return new Response("Unauthorized", { status: 401 });
  // Actual hash comparison happens in the handler after DB lookup —
  // this function only checks structural presence.
  return null;
}
```

> The full per-request auth (hash lookup + `timingSafeEqual`) lives inside each route handler or a shared helper called from handlers, NOT in this top-level function. The top-level check is structural only (header present?).

#### Token hashing pattern
Copy `checksumOf()` from `server/src/workflow/schema.ts` lines 72–80:
```typescript
// From schema.ts checksumOf() — same pattern, no new dep
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value).slice().buffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Token generation at registration time
const rawToken = crypto.randomUUID();   // 128-bit entropy, Deno built-in
const tokenHash = await sha256Hex(rawToken);
// Store tokenHash; return rawToken to caller ONCE ONLY in the 201 response.
```

**Timing-safe comparison** (use `node:crypto` shim — no deno.json entry needed):
```typescript
import { timingSafeEqual } from "node:crypto";

function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
```

#### Factory export pattern
Copy from `server/src/workflow/api.ts` lines 155–160:
```typescript
// EXACT name convention: createXxxRoutes() returns Hono
export function createRemoteNodeHubRoutes(): Hono {
  const api = new Hono();
  // ... routes ...
  return api;
}
```

#### Zod request validation pattern
Copy `createPacketSchema` / `command()` shape from `server/src/workflow/api.ts` lines 47–100:
```typescript
const registerNodeSchema = z.object({
  hostname: z.string().optional(),
  platform: z.string().optional(),
});

const eventBatchSchema = z.object({
  events: z.array(z.object({
    client_seq: z.number().int().nonneg(),
    event_type: z.string().min(1),
    payload: z.record(z.unknown()).optional(),
  })).min(1).max(500),  // bounded — DoS mitigation
});
```

#### `withErrorMapping` + `readJson` pattern
Copy verbatim from `server/src/workflow/api.ts` lines 112–145. These are the shared error wrapper and body parser — use them unchanged for hub routes:
```typescript
// Copy from api.ts — withErrorMapping wraps every handler
function withErrorMapping(
  handler: (c: Context) => Promise<Response>,
): (c: Context) => Promise<Response> {
  return async (c: Context) => {
    try {
      return await handler(c);
    } catch (err) {
      const mapped = toHttpError(err);
      return c.json(mapped.body, mapped.status);
    }
  };
}
```

> `toHttpError` from `api.ts` already handles SQLSTATE 23503 (FK violation → 404) and 22P02 (malformed UUID → 400). The events endpoint's FK on `node_id` to `execution_nodes` naturally maps to 404 via this branch — no new error type needed.

#### Route pattern — POST /nodes/register
```typescript
api.post(
  "/register",
  withErrorMapping(async (c: Context) => {
    // 1. Structural bearer check
    const structural = validateNodeBearer(c.req.raw);
    if (structural) return structural;

    // 2. Parse + validate body
    const raw = await readJson(c.req.raw);
    const body = registerNodeSchema.safeParse(raw);
    if (!body.success) {
      return c.json({ error: "BadRequest", issues: body.error.issues }, 400);
    }

    // 3. Hash presented bearer
    const auth = c.req.raw.headers.get("Authorization")!;
    const rawBearer = auth.slice("Bearer ".length);
    const hash = await sha256Hex(rawBearer);

    // 4. Upsert — ON CONFLICT on bearer_token_hash (unique constraint in 003)
    const [node] = await sql<{ node_id: string }[]>`
      INSERT INTO workflow.execution_nodes
        (bearer_token_hash, hostname, platform)
      VALUES
        (${hash}, ${body.data.hostname ?? null}, ${body.data.platform ?? null})
      ON CONFLICT (bearer_token_hash) DO UPDATE
        SET last_seen_at = now(), status = 'active'
      RETURNING node_id
    `;
    return c.json({ node_id: node.node_id }, 201);
  }),
);
```

#### Route pattern — POST /nodes/:node_id/events (cross-node injection check is mandatory)
```typescript
api.post(
  "/:node_id/events",
  withErrorMapping(async (c: Context) => {
    const structural = validateNodeBearer(c.req.raw);
    if (structural) return structural;

    // Path param: validate UUID shape
    const pathNodeId = c.req.param("node_id");
    const parsed = z.string().uuid().safeParse(pathNodeId);
    if (!parsed.success) {
      return c.json({ error: "BadRequest", message: "node_id must be a uuid" }, 400);
    }

    const auth = c.req.raw.headers.get("Authorization")!;
    const rawBearer = auth.slice("Bearer ".length);
    const hash = await sha256Hex(rawBearer);

    // CROSS-NODE INJECTION CHECK — bearer must own the node_id in the path.
    // A node knowing another node's UUID must not be able to write events for it.
    const [owner] = await sql<{ node_id: string }[]>`
      SELECT node_id FROM workflow.execution_nodes
      WHERE node_id = ${parsed.data} AND bearer_token_hash = ${hash}
    `;
    if (!owner) return c.json({ error: "Unauthorized" }, 401);

    const raw = await readJson(c.req.raw);
    const body = eventBatchSchema.safeParse(raw);
    if (!body.success) {
      return c.json({ error: "BadRequest", issues: body.error.issues }, 400);
    }

    // Bulk insert — ON CONFLICT DO NOTHING for idempotent replay
    await sql.begin(async (tx) => {
      for (const ev of body.data.events) {
        await tx`
          INSERT INTO workflow.run_events
            (node_id, client_seq, event_type, payload)
          VALUES
            (${owner.node_id}, ${ev.client_seq}, ${ev.event_type},
             ${ev.payload ?? null})
          ON CONFLICT (node_id, client_seq) DO NOTHING
        `;
      }
    });

    // Ack: SELECT all submitted seqs (covers both inserted and pre-existing)
    const seqs = body.data.events.map((e) => e.client_seq);
    const acked = await sql<{ event_id: string; client_seq: number }[]>`
      SELECT event_id, client_seq
      FROM workflow.run_events
      WHERE node_id = ${owner.node_id} AND client_seq = ANY(${seqs})
    `;
    const ackedMap = new Map(acked.map((r) => [r.client_seq, r.event_id]));
    const acknowledged = body.data.events.map((e) => ({
      client_seq: e.client_seq,
      event_id: ackedMap.get(e.client_seq) ?? null,
    }));

    return c.json({ acknowledged }, 200);
  }),
);
```

#### Composition root mount pattern
Copy from `server/index.ts` lines 1208–1233. New routes go **inside** the `if (workflowBootstrap.enabled)` block (line 74), as a separate `app.use` + `app.route` pair:
```typescript
// server/index.ts — inside `if (workflowBootstrap.enabled)` block
// Analog: lines 1208–1233 for /api/workflow/*

import { createRemoteNodeHubRoutes, validateNodeBearer } from "./src/workflow/remoteNodeHub.ts";

// Node bearer middleware — structural header check only.
// Full auth (hash lookup) is per-route inside remoteNodeHub.ts.
app.use("/workflow/nodes/*", async (c, next) => {
  const denied = validateNodeBearer(c.req.raw);
  if (denied) return denied;
  await next();
});
app.route("/workflow/nodes", createRemoteNodeHubRoutes());
```

> The path prefix is `/workflow/nodes/*` (NOT `/api/workflow/nodes/*`) — node-to-hub traffic is machine-to-machine and does not share the MCP operator surface at `/api/workflow`.

---

### `server/tests/workflow-remote-node-hub.test.ts` (integration test, request-response)

**Primary analog:** `server/tests/workflow-migrations.test.ts` (schema isolation, test flags, `withScratchSchema`)
**Secondary analog:** `server/tests/workflow-agent-key-e2e.test.ts` (auth assertion structure, discrimination controls)
**Startup validation analog:** `server/tests/startup-validation.test.ts` (injectable `EnvReader`, no real env reads)

#### Test flag constant
Copy from `server/tests/workflow-migrations.test.ts` line 3 — required for all DB-touching tests:
```typescript
const T = { sanitizeResources: false, sanitizeOps: false };
```

#### Schema isolation pattern — `withScratchSchema`
Copy verbatim from `server/tests/workflow-migrations.test.ts` lines ~50–63. Use a unique prefix to avoid collisions with the production `workflow` schema and other test files:
```typescript
async function withScratchSchema(
  name: string,
  fn: (opts: { schemaName: string; ledgerTable: string }) => Promise<void>,
): Promise<void> {
  const ledgerTable = `${name}.schema_migrations`;
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
  try {
    await fn({ schemaName: name, ledgerTable });
  } finally {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
  }
}
// Usage: withScratchSchema("test_hub_001", async (opts) => { ... })
// Names must start with "test_hub_" to avoid colliding with production schema.
```

> **Do NOT drop `workflow` schema** in any hub test. `workflow-mvp-e2e.test.ts` does this deliberately as a process-boundary test; any other file doing it would race with the rest of the suite.

#### In-process HTTP test pattern
For route-level tests that do not need a spawned server, call `createRemoteNodeHubRoutes()` in-process and drive it with `app.fetch`. Analogous to `api.ts` unit-style tests:
```typescript
import { createRemoteNodeHubRoutes } from "../src/workflow/remoteNodeHub.ts";

const app = new Hono();
app.route("/workflow/nodes", createRemoteNodeHubRoutes());

const res = await app.fetch(
  new Request("http://localhost/workflow/nodes/register", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ hostname: "z2", platform: "linux" }),
  }),
);
```

#### Auth assertion structure
Copy the assertion + discrimination-control pattern from `server/tests/workflow-agent-key-e2e.test.ts`. Every auth test must have:
1. **Negative case** — wrong/missing bearer → 401
2. **Positive case** — valid bearer → expected success
3. **Discrimination control** — proves the 401 is auth firing, not the route being broken

```typescript
// Pattern from workflow-agent-key-e2e.test.ts
// 1. No bearer → 401
{
  const res = await app.fetch(new Request("http://localhost/workflow/nodes/register", {
    method: "POST", body: JSON.stringify({}),
  }));
  assertEquals(res.status, 401);
}
// 2. Wrong bearer → 401
{
  const res = await app.fetch(new Request("http://localhost/workflow/nodes/register", {
    method: "POST",
    headers: { "Authorization": "Bearer wrong-token" },
    body: JSON.stringify({}),
  }));
  assertEquals(res.status, 401);
}
// 3. Valid bearer → 201 (discrimination control)
{
  const res = await app.fetch(/* valid request */);
  assertEquals(res.status, 201);
}
```

#### Required test cases (map to requirements)

| Req | Test name | Pattern source |
|-----|-----------|---------------|
| NODE-01a | `register: valid bearer returns 201 with node_id` | in-process Hono fetch |
| NODE-01b | `register: second call with same bearer returns existing node_id (upsert)` | in-process Hono fetch |
| NODE-01c | `register: MEMORY_API_KEY bearer is refused (credentials are isolated)` | auth assertion pattern |
| NODE-02a | `events: POST inserts rows attributed to node` | in-process + DB query |
| NODE-02b | `events: duplicate (node_id, client_seq) returns 200, no duplicate row` | ON CONFLICT test |
| NODE-02c | `events: ack response covers every submitted client_seq` | ack completeness |
| NODE-03a | `events: missing bearer returns 401` | auth assertion pattern |
| NODE-03b | `events: valid bearer but wrong node_id in path returns 401` | cross-node injection |
| NODE-03c | `boot: FEATURE_WORKFLOW=true with no node bearer env var does not prevent startup` | startup-validation.test.ts `EnvReader` injection pattern |
| NODE-03d | `platform: MEMORY_API_KEY on /mcp still works while node bearer is configured` | workflow-agent-key-e2e.test.ts process-boundary pattern |
| SAFE-02 | `isolation: test does not touch workflow.work_packets or seeded thoughts` | `withScratchSchema` + schema prefix |

#### Boot coupling test — injectable EnvReader pattern
Copy from `server/tests/startup-validation.test.ts` lines 1–25 — inject `readEnv` instead of reading `Deno.env.get`:
```typescript
// From startup-validation.test.ts — injectable readEnv, no real process env
import { findMissingRequiredEnv } from "../src/startupValidation.ts";

Deno.test("boot: node bearer absent does not appear in missing required env", () => {
  const missing = findMissingRequiredEnv((name) => {
    if (name === "MEMORY_API_KEY") return "present";
    if (name === "OPENROUTER_API_KEY") return "present";
    // NODE_BEARER deliberately absent — must not appear in missing
    return undefined;
  });
  assertEquals(missing, [], "node bearer must not be a required env var");
});
```

---

## Shared Patterns

### Migration ledger + checksum runner
**Source:** `server/src/workflow/schema.ts` — `runWorkflowMigrations()` (line ~230)
**Apply to:** Both new SQL files are picked up automatically. No code change to runner.
**Key rules:**
- File pattern `^(\d+)_.*\.sql$` in `server/db/workflow/` — three-digit prefix, non-recursive
- Each migration runs in its own `sql.begin` with advisory lock `840_084`
- Ledger insert is INSIDE the same transaction as the DDL
- Drift check runs BEFORE any pending migration — a checksum mismatch on an applied migration aborts the whole run
- `checksumOf()` uses `crypto.subtle.digest("SHA-256", bytes.slice().buffer)` — line endings affect the checksum (`.gitattributes` normalises on checkout; see CLAUDE.md)

### `crypto.subtle` SHA-256 (no new dependency)
**Source:** `server/src/workflow/schema.ts` — `checksumOf()` lines 72–80
**Apply to:** `remoteNodeHub.ts` token hashing
**Pattern:** `crypto.subtle.digest("SHA-256", new TextEncoder().encode(value).slice().buffer)` — the `.slice()` copies into a plain `ArrayBuffer` because Deno types `Uint8Array` as `Uint8Array<ArrayBufferLike>` and `crypto.subtle.digest` does not accept a `SharedArrayBuffer`.

### Hono `withErrorMapping` + `toHttpError`
**Source:** `server/src/workflow/api.ts` lines 112–153
**Apply to:** All route handlers in `remoteNodeHub.ts`
**Key:** The FK violation branch (SQLSTATE 23503) already maps to 404 — a missing `node_id` FK in the events insert correctly surfaces as "node not found" without any new error type.

### `sql` tagged template client (no `sql.unsafe` for user data)
**Source:** `server/src/db.ts` — imported as `import { sql } from "../db.ts"` from within `src/workflow/`
**Apply to:** All DML in `remoteNodeHub.ts`
**Rule:** Use the `sql` tag for all parameterised queries. `sql.unsafe` is only for DDL with validated identifiers (see `assertSafeIdentifiers` in `schema.ts`). Never pass user-supplied data through `sql.unsafe`.

### `workflow.` schema qualification (every DDL and DML statement)
**Source:** `server/db/workflow/001_workflow_schema.sql` header comment (lines 13–22) + `server/src/workflow/schema.ts` docblock
**Apply to:** Both migration files and all DML in `remoteNodeHub.ts`
**Reason:** Four sites in `server/index.ts` (L941, L997) and `server/src/entityWorker.ts` (L115, L125) set `search_path` session-wide on pooled connections. Unqualified objects land in the wrong schema non-deterministically.

---

## Anti-Patterns: Must NOT Be Copied

These patterns exist in the codebase but must NOT be replicated in Phase 2 files:

| Anti-pattern | Where it exists | Why not to copy | What to do instead |
|---|---|---|---|
| **Fail-open on missing env var** | `server/src/auth.ts` `requireApiKey` throws when `MEMORY_API_KEY` is absent (fail-closed — correct for a required credential). The anti-pattern would be treating a missing `NODE_BEARER` env var the same way. | Node bearer is OPTIONAL — no node may be configured. Throwing or calling `Deno.exit` on absent `NODE_BEARER` would prevent boot with `FEATURE_WORKFLOW=true` and no node. | Return 401 when the env var is absent. Never throw or exit from the node bearer check. |
| **Bearer in `findMissingRequiredEnv`** | `server/src/startupValidation.ts` `findMissingRequiredEnv` lists `MEMORY_API_KEY` and `OPENROUTER_API_KEY` as required. | Adding a `NODE_BEARER` (or any node credential name) here makes the server refuse to boot without it — breaking every `FEATURE_WORKFLOW=true` deployment that has no node. | Validate in the endpoint handler only. `AWCP_AGENT_API_KEY` is the precedent: optional, checked at request time, never in `findMissingRequiredEnv`. |
| **Raw bearer value in logs** | `server/index.ts` `emitRequestLog` uses `extractSafeBodyFields` to avoid logging raw body content. The `Authorization` header is never logged. | A raw bearer in any log file is a credential leak. | Never log `c.req.raw.headers.get("Authorization")` or `rawBearer`. Log `node_id` and `client_seq` counts only. |
| **Plain `===` for bearer comparison** | `server/src/auth.ts` lines 9–11 compares `auth !== \`Bearer ${key}\`` with plain string inequality — a pre-existing timing oracle. | Copying this pattern to the node bearer introduces a timing oracle on a new credential surface. The existing `requireApiKey` predates this concern; new code must not repeat it. | Use `timingSafeEqual` from `node:crypto` after hashing both sides to fixed-length hex. |
| **Unqualified SQL identifiers** | Nowhere in the workflow module (the existing files are all qualified). The risk is in new code that follows the memory-domain pattern of bare table names. | The memory domain can use bare names because it owns `public`. The workflow module cannot — `search_path` is polluted on pooled connections. | Every table reference in 003, 004, and `remoteNodeHub.ts` must use `workflow.table_name`. |
| **`--parallel` in test commands** | Not currently used — but it is a documented pitfall (RESEARCH.md §5). | `workflow-mvp-e2e.test.ts` drops the shared `workflow` schema. Running files concurrently races the teardown against hub tests. | Always run `deno test` without `--parallel`. The sequential default is the safety guarantee. |
| **Shared schema test cleanup** | `workflow-mvp-e2e.test.ts` drops and recreates the `workflow` schema as a process-boundary test. | Any hub test dropping `workflow` races with the e2e test and corrupts other suites. | Hub tests use `withScratchSchema("test_hub_NNN", ...)` with an isolated schema that does not touch `workflow.*` production tables. |
| **`IF NOT EXISTS` in post-001 migrations** | `001_workflow_schema.sql` uses `IF NOT EXISTS` throughout (it predates the ledger). | Adding `IF NOT EXISTS` to 003/004 makes DDL re-runnable in a way that bypasses drift detection — a changed column definition would silently no-op instead of failing loudly. | Write DDL without `IF NOT EXISTS`. The ledger is the idempotency mechanism. Re-applying a migration SHOULD fail loudly. |

---

## No Analog Found

None — all four files have exact or role-match analogs in the live codebase.

---

## Metadata

**Analog search scope:** `server/src/workflow/`, `server/db/workflow/`, `server/tests/`, `server/src/auth.ts`, `server/src/startupValidation.ts`, `server/index.ts` lines 1–45, 70–95, 1200–1260
**Files read:** 14 source files + 3 RESEARCH/REQUIREMENTS/ROADMAP documents
**Pattern extraction date:** 2026-08-05

**File:line reference index:**

| Pattern | File | Lines |
|---------|------|-------|
| Migration header comment style | `server/db/workflow/002_decision_run_packet_integrity.sql` | 1–40 |
| Migration no-`IF NOT EXISTS` rule | `server/db/workflow/002_decision_run_packet_integrity.sql` | 41–50 |
| Table + CHECK + index DDL style | `server/db/workflow/001_workflow_schema.sql` | 27–70 |
| `checksumOf` / `crypto.subtle` SHA-256 | `server/src/workflow/schema.ts` | 72–80 |
| `runWorkflowMigrations` auto-discovery | `server/src/workflow/schema.ts` | 228–235 |
| `applyMigrations` advisory lock + per-tx | `server/src/workflow/schema.ts` | 155–225 |
| `bootstrapWorkflow` / `workflowFeatureEnabled` | `server/src/workflow/bootstrap.ts` | entire file |
| `createWorkflowApi()` factory + `command()` | `server/src/workflow/api.ts` | 155–390 |
| `withErrorMapping` + `readJson` | `server/src/workflow/api.ts` | 112–153 |
| `toHttpError` + FK violation branch | `server/src/workflow/api.ts` | 65–112 |
| Zod schema declarations | `server/src/workflow/api.ts` | 47–65 |
| `requireApiKey` bearer pattern | `server/src/auth.ts` | entire file |
| `requiresOperator` policy pattern | `server/src/workflow/policy.ts` | entire file |
| Workflow middleware mount in composition root | `server/index.ts` | 1208–1233 |
| `workflowBootstrap.enabled` guard | `server/index.ts` | 73–95 |
| `findMissingRequiredEnv` (must NOT add to) | `server/src/startupValidation.ts` | `findMissingRequiredEnv()` |
| Optional credential precedent (`AWCP_AGENT_API_KEY`) | `server/src/startupValidation.ts` | `agentKeyCollidesWithOperatorKey()` |
| `withScratchSchema` isolation helper | `server/tests/workflow-migrations.test.ts` | ~50–63 |
| `const T` test flag | `server/tests/workflow-migrations.test.ts` | line 3 |
| Auth + discrimination-control assertion structure | `server/tests/workflow-agent-key-e2e.test.ts` | entire file |
| Injectable `EnvReader` boot test pattern | `server/tests/startup-validation.test.ts` | lines 1–55 |
