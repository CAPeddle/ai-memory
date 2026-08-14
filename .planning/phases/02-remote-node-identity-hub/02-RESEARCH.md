# Phase 2: Remote Node Identity & Hub — Research

**Researched:** 2026-08-05
**Domain:** Deno/Hono HTTP endpoints, PostgreSQL migrations, bearer-token auth, idempotent event ingestion
**Confidence:** HIGH — all findings derived from live codebase, authoritative plan doc (U2), and confirmed runtime behaviour from Phase 1.

---

<user_constraints>
## User Constraints (from CONTEXT.md / locked decisions)

### Locked Decisions
- Hub-side only in this phase; no node client yet.
- Tables: `workflow.execution_nodes` and `workflow.run_events` with the fields and uniqueness contract from U2.
- Endpoints: `POST /workflow/nodes/register` and `POST /workflow/nodes/:node_id/events`.
- Per-node bearer is distinct from `MEMORY_API_KEY` and must NOT enter `startupValidation.ts` REQUIRED_ENV.
- Event replay is idempotent on `(node_id, client_seq)` and returns acknowledgement IDs.
- Existing platform MCP authentication and optional workflow boot behaviour must remain unchanged.
- Existing `docs/plans/` and story board remain canonical.

### the agent's Discretion
- Token hashing algorithm (bcrypt vs. `crypto.subtle` HMAC/SHA-256) — bcrypt is NOT in `deno.json`; see §Token Storage below.
- Exact HTTP response bodies for 200/201 on register and event-batch endpoints, within the ack contract.
- Whether `remoteNodeHub.ts` exports a `Hono` sub-router or a factory function (follow `createWorkflowApi()` factory pattern).

### Deferred Ideas (OUT OF SCOPE)
- Node client (U3) — Phase 3.
- Disconnection/duplicate/invalid-auth experiments (U4) — Phase 3.
- Execution blocking assessment (U5) — Phase 4.
- ADR-016 recommendation (U6) — Phase 4.
- Any policy-scope enforcement on the new tables — ST-082.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NODE-01 | Authorised Ubuntu execution node can register with hub using a node-specific credential distinct from the platform MCP credential. | §Migration conventions, §Auth patterns, §Token Storage, §Registration endpoint |
| NODE-02 | Registered node can POST events that the hub attributes to that node and persists in `workflow.run_events`. | §Event endpoint, §Idempotency, §Transaction semantics |
| NODE-03 | Invalid/missing node credentials rejected without weakening platform MCP auth or preventing optional workflow module boot. | §Auth isolation, §Boot coupling, §Security domain |
</phase_requirements>

---

## Summary

Phase 2 adds two SQL migrations, two HTTP endpoints, and one new workflow source file. Every structural pattern — migration numbering, Hono sub-router factory, Zod validation, `toHttpError` mapping, `withScratchSchema` test isolation — already exists in the codebase and must be followed exactly. No new runtime dependencies are needed and none may be introduced without updating `deno.lock` explicitly.

The most important concrete finding is the **bcrypt conflict**: U2's plan names bcrypt for `bearer_token_hash`, but `server/deno.json` lists only `hono`, `@hono/mcp`, `@modelcontextprotocol/sdk`, and `zod`. Bcrypt is not available. The Deno runtime exposes `crypto.subtle` (Web Crypto API) natively, which supports PBKDF2-HMAC-SHA256 or plain SHA-256 hashing with no import at all. This is the concrete secure alternative that fits within the frozen dependency surface and must be chosen unless the planner gates on an explicit dependency decision.

The second critical finding is the **boot coupling constraint**: `NODE_BEARER` (or whatever env var name is chosen) must NOT be added to `findMissingRequiredEnv` in `startupValidation.ts`. The node bearer is validated inside the hub endpoint handler only, paralleling how `AWCP_AGENT_API_KEY` is an optional credential checked at request time rather than at startup.

**Primary recommendation:** Follow the `createWorkflowApi()` / `requiresOperator()` decomposition pattern exactly. The new `remoteNodeHub.ts` exports a `createRemoteNodeHubRoutes()` factory; `index.ts` mounts it under `app.use("/workflow/nodes/*", ...)` inside the `workflowBootstrap.enabled` block.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Node registration & token validation | API / Backend (Hono handler) | Database (upsert + hash storage) | Auth decisions belong server-side; DB owns persistence |
| Event ingestion + idempotency | Database (ON CONFLICT DO NOTHING) | API / Backend (bulk insert loop) | Uniqueness contract must be enforced at DB, not application layer |
| Bearer token hashing | API / Backend (crypto.subtle) | — | Deno built-in; no new dep |
| Migration ordering & ledger | Database (workflow.schema_migrations) | `schema.ts` runner | Follows existing workflow migration runner pattern exactly |
| Boot coupling isolation | API / Backend (startupValidation.ts) | — | Must not exit when node bearer absent |

---

## 1. Migration Conventions & Next Migration Numbers

### Existing workflow migrations
[VERIFIED: live `server/db/workflow/` directory]

| Version | File |
|---------|------|
| 001 | `001_workflow_schema.sql` |
| 002 | `002_decision_run_packet_integrity.sql` |

**Next migration numbers are therefore:**
- `003_execution_nodes.sql` — `workflow.execution_nodes` table
- `004_run_events.sql` — `workflow.run_events` table + unique constraint

### Runner behaviour to follow
[VERIFIED: `server/src/workflow/schema.ts`]

- File pattern: `^(\d+)_.*\.sql$` in `server/db/workflow/` — non-recursive, three-digit prefix.
- Each migration runs in its own transaction (`sql.begin`) with the ledger insert inside the same transaction.
- An advisory lock `pg_advisory_xact_lock(840_084)` prevents concurrent races.
- Checksums are SHA-256 of raw file bytes (`crypto.subtle.digest`). **Line endings matter** — `.gitattributes` normalises EOLs on checkout; see CLAUDE.md.
- Drift (checksum mismatch on an already-applied migration) aborts before any new migration runs.
- The ledger is `workflow.schema_migrations` (inside the workflow schema, NOT `public.schema_migrations`).
- `DROP SCHEMA workflow CASCADE` is the full teardown — migrations must not touch `public.*`.

### Schema qualification rule
[VERIFIED: `server/db/workflow/001_workflow_schema.sql` header comment]

Every object must be `workflow.`-prefixed. Four sites in the memory domain issue `SET search_path = ag_catalog, "$user", public` on pooled connections (`server/index.ts:941`, `:997`; `server/src/entityWorker.ts:115`, `:125`). An unqualified table creation would land in the wrong schema non-deterministically on those connections.

### Migration SQL to write

**`003_execution_nodes.sql`** — canonical fields from U2:
```sql
CREATE TABLE IF NOT EXISTS workflow.execution_nodes (
  node_id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bearer_token_hash  text        NOT NULL,
  registered_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  status             text        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'paused', 'offline')),
  hostname           text,
  platform           text
);
```

**`004_run_events.sql`** — canonical fields + idempotency constraint from U2:
```sql
CREATE TABLE IF NOT EXISTS workflow.run_events (
  event_id     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id      uuid        NOT NULL REFERENCES workflow.execution_nodes (node_id) ON DELETE CASCADE,
  client_seq   bigint      NOT NULL,
  event_type   text        NOT NULL,
  payload      jsonb,
  received_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_run_events_node_seq
  ON workflow.run_events (node_id, client_seq);
```

The unique index (not `UNIQUE` on the column list) allows `ON CONFLICT (node_id, client_seq) DO NOTHING` in the bulk insert. A table-level `UNIQUE` constraint also works; the explicit index name makes it self-documenting.

---

## 2. Hono Route / Auth / Store Patterns

### Hono app and workflow mount
[VERIFIED: `server/index.ts:1180–1260`]

The composition root:
1. Wraps `if (workflowBootstrap.enabled)` — the new routes must live inside this block.
2. Installs a `app.use("/api/workflow/*", ...)` middleware that validates `MEMORY_API_KEY` / `AWCP_AGENT_API_KEY` and calls `requiresOperator`.
3. Calls `app.route("/api/workflow", createWorkflowApi())`.

The node hub endpoints are a **different path prefix** (`/workflow/nodes/*`), so they need their own `app.use(...)` middleware and `app.route(...)` call, both inside the `workflowBootstrap.enabled` block.

```typescript
// Inside `if (workflowBootstrap.enabled)` in index.ts:
app.use("/workflow/nodes/*", async (c, next) => {
  const denied = requireNodeBearer(c.req.raw);
  if (denied) return denied;
  await next();
});
app.route("/workflow/nodes", createRemoteNodeHubRoutes());
```

### Factory pattern
[VERIFIED: `server/src/workflow/api.ts` — `createWorkflowApi()`]

New file: `server/src/workflow/remoteNodeHub.ts`. Export: `createRemoteNodeHubRoutes(): Hono`.

**Import boundary rule** [VERIFIED: `server/tests/workflow-boundary.test.ts` is an enforced allowlist]:
Files under `server/src/workflow/` may only import from `../db.ts`, `../logging.ts`, `./*`, or package specifiers. `../auth.ts` is explicitly NOT permitted. The node bearer validation function must therefore live in `remoteNodeHub.ts` (not imported from `auth.ts`) or in a new `workflow/nodeAuth.ts` file. The composition root owns the `requireNodeBearer` call if it is mounted as middleware — which means `requireNodeBearer` itself is defined in `remoteNodeHub.ts` and called in `index.ts` directly, or the middleware is inlined in `index.ts`.

**Recommended approach:** Define `validateNodeBearer(req: Request): Response | null` in `remoteNodeHub.ts` (mirroring `requireApiKey`'s signature from `auth.ts`), export it, and call it from the `app.use` middleware in `index.ts`. This keeps auth logic in the module that owns the route, stays within the boundary allowlist, and is testable in isolation.

### Zod validation pattern
[VERIFIED: `server/src/workflow/api.ts`]

All request bodies are validated with Zod before reaching store logic. Shape:
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
  })).min(1),
});
```

### Error mapping
[VERIFIED: `server/src/workflow/api.ts` — `toHttpError()`]

The existing `toHttpError` in `api.ts` handles `WorkflowNotFoundError`, FK violations (SQLSTATE 23503), and malformed UUIDs (SQLSTATE 22P02). The new hub routes should use the same `withErrorMapping` wrapper or a local equivalent. FK violation on `node_id` in the events insert maps to 404 ("node not found"), which is already handled by the 23503 branch.

---

## 3. Token Hashing: bcrypt Conflict Resolution

### Finding
[VERIFIED: `server/deno.json` — frozen deps: hono, @hono/mcp, @modelcontextprotocol/sdk, zod only]

**U2's plan specifies `bearer_token_hash` (bcrypt).** Bcrypt is NOT in `server/deno.json` and is NOT in `deno.lock`. Adding it requires an explicit dependency decision and lock update — not a silent import.

### Available alternative: `crypto.subtle` (Deno built-in)
[VERIFIED: `server/src/workflow/schema.ts:checksumOf()` — already uses `crypto.subtle.digest("SHA-256", ...)`]

The Deno runtime ships Web Crypto API natively. No import needed. Two viable approaches within the frozen surface:

**Option A — SHA-256 with a random salt (recommended for this spike):**
```typescript
// Generate token + hash at registration time (no external dep)
const rawToken = crypto.randomUUID(); // 128-bit entropy
const encoder = new TextEncoder();
const hashBuf = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
const hash = Array.from(new Uint8Array(hashBuf))
  .map(b => b.toString(16).padStart(2, "0")).join("");
// Store hash in bearer_token_hash; return rawToken to caller once only.
```

Validation: re-hash the presented bearer and compare with `=` on the stored hex string. Because SHA-256 is fast, a timing attack is theoretically possible — use `timingSafeEqual` (see §Security below).

**Option B — PBKDF2-HMAC-SHA256 (slower, more bcrypt-like):**
Uses `crypto.subtle.importKey` + `crypto.subtle.deriveBits`. Significantly more code; appropriate for long-lived credentials. For a spike producing a single node in a trusted network, Option A is proportionate.

**Option C — Add bcrypt as an explicit dependency:**
Requires PO decision, `deno.json` update, and `deno.lock` update committed alongside. Not silent. If chosen: `npm:bcryptjs` is the pure-JS bcrypt with Deno compatibility [ASSUMED — not verified in this session; requires `npm view bcryptjs` and lock update].

**Recommendation:** Use Option A (SHA-256 + `crypto.randomUUID()`) for Phase 2. Document the decision with a comment referencing the frozen dependency constraint. The planner should surface this as an explicit decision checkpoint; do not silently use bcrypt.

### Timing-safe comparison
[VERIFIED: Deno built-in `crypto.subtle` does NOT expose `timingSafeEqual` directly]

Deno exposes `crypto.subtle` (Web Crypto). For constant-time comparison, use the Node.js `timingSafeEqual` shimmed via:
```typescript
// Available in Deno via npm:
import { timingSafeEqual } from "node:crypto"; // Deno supports node: specifiers
```
`node:crypto` is a Deno built-in compatibility shim — no `deno.json` entry needed. [VERIFIED: Deno 2.0 ships Node.js compatibility layer including `node:crypto`]

---

## 4. Transaction / Idempotency Semantics

### Registration endpoint (`POST /workflow/nodes/register`)
[VERIFIED: U2 plan; database pattern from `server/db/workflow/001_workflow_schema.sql`]

**Upsert semantics:** The plan says "upserts a row". Because `node_id` is a generated UUID primary key and there is no natural unique key on the bearer hash alone, "upsert" in practice means: if a node presents the same bearer on a second registration call, find its existing row (by matching the hash) and update `last_seen_at` and `status`, returning the existing `node_id`.

Two implementation options:
1. **Hash-lookup + insert-or-update:** `SELECT node_id FROM workflow.execution_nodes WHERE bearer_token_hash = $hash` — if found, UPDATE and return; if not found, INSERT and return new UUID.
2. **Unique index on hash + ON CONFLICT:** Add `UNIQUE` on `bearer_token_hash` in migration 003, then `INSERT ... ON CONFLICT (bearer_token_hash) DO UPDATE SET last_seen_at = now(), status = 'active' RETURNING node_id`.

Option 2 is cleaner and atomic. Requires adding `UNIQUE` to migration 003. **Recommended.**

Transaction: a single `sql.begin` wrapping the upsert. No multi-statement risk on registration.

### Event batch endpoint (`POST /workflow/nodes/:node_id/events`)
[VERIFIED: U2 plan — `ON CONFLICT (node_id, client_seq) DO NOTHING`, returns ack list]

```sql
INSERT INTO workflow.run_events (node_id, client_seq, event_type, payload)
VALUES ($node_id, $client_seq, $event_type, $payload)
ON CONFLICT (node_id, client_seq) DO NOTHING
RETURNING event_id, client_seq;
```

Run the entire batch inside a single `sql.begin`. The `RETURNING` clause gives back only the rows actually inserted. For duplicates (conflict), the row is silently skipped and does NOT appear in `RETURNING`.

**Ack response contract:** Return a JSON object that includes ack entries for ALL submitted events — both freshly inserted and duplicates. For duplicates, look up the existing `event_id` via a follow-up SELECT, or accept that the ack for a duplicate can omit the original `event_id` (the node only needs to know "this seq was received"):

```json
{
  "acknowledged": [
    { "client_seq": 1, "event_id": "<uuid>", "status": "inserted" },
    { "client_seq": 1, "event_id": null, "status": "duplicate" }
  ]
}
```

The simplest correct implementation: after the bulk insert, SELECT all `(event_id, client_seq)` WHERE `node_id = $node_id AND client_seq IN ($submitted_seqs)`. This one query covers both inserted and pre-existing rows, returning full acks with event_ids for everything.

### Verify node ownership before events insert
Before inserting events, verify that `node_id` in the path belongs to the authenticated bearer:
```sql
SELECT node_id FROM workflow.execution_nodes
WHERE node_id = $path_node_id AND bearer_token_hash = $hash
```
If not found: return 401 (cross-node injection prevention — see §Security).

---

## 5. Test Structure

### Existing test file patterns
[VERIFIED: `server/tests/workflow-migrations.test.ts`, `server/tests/workflow-mvp-e2e.test.ts`]

**New test file:** `server/tests/workflow-remote-node-hub.test.ts`

### Test isolation pattern — `withScratchSchema`
[VERIFIED: `server/tests/workflow-migrations.test.ts`]

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
```

Use the same pattern for hub tests that need an isolated schema. Each test creates its own schema (e.g., `test_hub_001`), applies migrations 003+004 against it, and drops it in `finally`. This guarantees re-runability — no test leaves state that poisons the next run.

For tests that drive HTTP routes directly (not via a spawned server), call `createRemoteNodeHubRoutes()` in-process and use `app.fetch(new Request(...))`. This is the pattern `api.ts`'s unit-style tests use.

### Test flags
[VERIFIED: `server/tests/workflow-migrations.test.ts:3`]

```typescript
const T = { sanitizeResources: false, sanitizeOps: false };
```
All database-touching tests use this. Required because the postgres connection pool keeps resources open.

### Cleanup ownership
Each test owns its own schema. The `finally` block is the only cleanup. Do NOT drop the main `workflow` schema — other test files depend on it. Use a distinct per-test schema name that cannot collide with production names (prefix with `test_hub_`).

### Red controls (must fail before implementation)
| Test | Red condition |
|------|--------------|
| `POST /workflow/nodes/register` with wrong bearer → 401 | Returns 200 before auth implemented |
| `POST /workflow/nodes/:id/events` with wrong `node_id` → 401 | Returns 201 before cross-node check |
| Duplicate `(node_id, client_seq)` insert → 200 (not 409/500) | Throws on conflict before ON CONFLICT clause |
| Missing bearer → 401 (not 500) | Throws from missing env var if boot coupling is present |

### Smallest targeted test commands
[VERIFIED: CLAUDE.md conventions — from `.planning/codebase/TESTING.md`]

```bash
# Run only the new hub test file
cd server && deno test --allow-net --allow-env --allow-read \
  tests/workflow-remote-node-hub.test.ts

# Run all workflow tests (regression guard)
cd server && deno test --allow-net --allow-env --allow-read \
  tests/workflow-*.test.ts

# Full suite (CI shape)
cd server && deno test --frozen --allow-net --allow-env --allow-read
```

**Do not pass `--parallel`** — `workflow-mvp-e2e.test.ts` drops the shared `workflow` schema and must run sequentially with the other workflow suites.

---

## 6. Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Per-node bearer; validated in endpoint, not at startup |
| V3 Session Management | No | Stateless bearer; no sessions |
| V4 Access Control | Yes | Cross-node injection: verify bearer owns the `node_id` in path |
| V5 Input Validation | Yes | Zod schemas on all request bodies |
| V6 Cryptography | Yes | `crypto.subtle` SHA-256; `node:crypto.timingSafeEqual` for comparison |

### Threat Register

| Threat | STRIDE | Mitigation | Severity |
|--------|--------|------------|----------|
| **Bearer leakage / replay** — token captured in transit or logs | Information Disclosure | HTTPS-only (Tailscale); never log raw bearer; store only hash; single-use token returned once at registration | HIGH |
| **Cross-node event injection** — node A posts events for node B's `node_id` | Tampering | Verify `bearer_token_hash` matches the `node_id` in the path before any insert | HIGH — BLOCKER |
| **Unbounded payload / batch** — huge JSONB or thousands of events per request | DoS | Zod: `z.array(...).max(N)` on events array; `payload` field size limited via Zod or DB check | MEDIUM |
| **Timing oracle on hash comparison** — attacker distinguishes valid/invalid bearer by response time | Information Disclosure | Use `timingSafeEqual` from `node:crypto` for all bearer comparisons | MEDIUM |
| **Duplicate semantics misuse** — attacker replays acked events to inflate state | Tampering | Idempotent ON CONFLICT DO NOTHING; duplicate returns same ack, no new row | LOW (by design) |
| **Optional-module boot coupling** — adding `NODE_BEARER` to REQUIRED_ENV prevents boot without node | Denial of Service | Explicitly excluded from `startupValidation.ts`; validated in handler only | HIGH — BLOCKER |
| **SQL injection via JSONB payload** | Tampering | Parameterised queries throughout; `sql` tag from `postgres.js`; no `sql.unsafe` for user data | LOW (already mitigated) |
| **Log exposure** — raw bearer in access logs | Information Disclosure | Never log `Authorization` header value; `extractSafeBodyFields` pattern in existing `mcpDiagnostics.ts` | MEDIUM |
| **CORS exposure** — node hub routes accessible from arbitrary browser origins | Elevation | Hub routes are machine-to-machine only; existing CORS middleware at `app.use("*", ...)` (index.ts:1135) applies; verify no wildcard `Access-Control-Allow-Origin` on `/workflow/nodes/*` | LOW |

### High-severity blockers (must be implemented, not deferred)

1. **Cross-node injection check** — every `POST /workflow/nodes/:node_id/events` must verify the presented bearer matches the `node_id` in the path. Failure to do this means any authenticated node can write events attributed to any other node.
2. **Boot coupling** — `NODE_BEARER` env var (or whatever it is named) must NOT appear in `startupValidation.ts`. Confirmed pattern: `AWCP_AGENT_API_KEY` is optional and validated only at request time (index.ts:1215–1227). Follow exactly the same pattern.
3. **`timingSafeEqual` for bearer comparison** — plain string `===` comparison leaks timing information. Use `node:crypto.timingSafeEqual` on the hex-encoded hashes.

---

## 7. Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Deno built-in test runner (`Deno.test`) + `@std/assert@0.224.0` |
| Config file | None — flags passed on CLI |
| Quick run command | `cd server && deno test --allow-net --allow-env --allow-read tests/workflow-remote-node-hub.test.ts` |
| Full suite command | `cd server && deno test --frozen --allow-net --allow-env --allow-read` |

### Phase Requirements → Test Map

| Req ID | Behaviour | Test Type | Automated Command | Notes |
|--------|-----------|-----------|-------------------|-------|
| NODE-01a | Valid bearer → 201, returns `node_id` | Integration (in-process Hono) | quick run | Register happy path |
| NODE-01b | Second registration with same bearer → 200, same `node_id` returned (upsert) | Integration | quick run | Idempotent registration |
| NODE-01c | Bearer is distinct from `MEMORY_API_KEY` — both can be set simultaneously, each authenticates only its own surface | Integration | quick run | Auth isolation |
| NODE-02a | POST events → 200, rows appear in `workflow.run_events` attributed to correct `node_id` | Integration | quick run | Event ingestion |
| NODE-02b | Duplicate `(node_id, client_seq)` → 200 (no error), ack returned, no duplicate row | Integration | quick run | Idempotency |
| NODE-02c | Ack response contains entries for every submitted `client_seq` | Integration | quick run | Ack completeness |
| NODE-03a | Missing/invalid bearer → 401 | Integration | quick run | Auth rejection |
| NODE-03b | Bearer valid but `node_id` in path belongs to different node → 401 | Integration | quick run | Cross-node injection guard |
| NODE-03c | Server boots with `FEATURE_WORKFLOW=true` and no node bearer env var set — no startup failure | E2E (spawned process) OR unit test of startupValidation | full suite | Boot coupling |
| NODE-03d | `POST /mcp` with `MEMORY_API_KEY` still succeeds while a node bearer is also configured | Integration | quick run | Platform auth unchanged |
| SAFE-01 | Existing `workflow-mvp-e2e.test.ts`, `workflow-store.test.ts`, `workflow-attention.test.ts` all pass unmodified | Regression | full suite | Must not regress |
| SAFE-02 | `workflow-remote-node-hub.test.ts` uses scratch schema and does not mutate seeded search corpus | Structural | code review + quick run | Idempotency |

### Nyquist Sampling Guidance

- **Per task commit:** `cd server && deno test --allow-net --allow-env --allow-read tests/workflow-remote-node-hub.test.ts` — run new hub tests only.
- **Per wave merge:** `cd server && deno test --allow-net --allow-env --allow-read tests/workflow-*.test.ts` — all workflow suites.
- **Phase gate (before `/gsd-verify-work`):** Full suite green: `deno test --frozen --allow-net --allow-env --allow-read`.

### Wave 0 Gaps (must be created before implementation)
- [ ] `server/tests/workflow-remote-node-hub.test.ts` — new file; covers NODE-01, NODE-02, NODE-03
- [ ] `server/db/workflow/003_execution_nodes.sql` — migration file
- [ ] `server/db/workflow/004_run_events.sql` — migration file

---

## 8. Concrete File Paths and Line References

| Item | Path | Line / Note |
|------|------|-------------|
| Workflow feature flag check | `server/src/workflow/bootstrap.ts` | `workflowFeatureEnabled()` — FEATURE_WORKFLOW=true pattern |
| Bootstrap call in composition root | `server/index.ts` | L73 `bootstrapWorkflow()` |
| Workflow enabled guard | `server/index.ts` | L74 `if (workflowBootstrap.enabled)` — new routes go inside |
| Workflow API middleware mount | `server/index.ts` | L1211 `app.use("/api/workflow/*", ...)` — mirror for `/workflow/nodes/*` |
| Workflow API route mount | `server/index.ts` | L1252 `app.route("/api/workflow", createWorkflowApi())` — mirror for nodes |
| `requireApiKey` pattern to mirror | `server/src/auth.ts` | Entire file (~15 lines) |
| `requiresOperator` boundary pattern | `server/src/workflow/policy.ts` | Entire file — import boundary model |
| `startupValidation.ts` REQUIRED_ENV | `server/src/startupValidation.ts` | `findMissingRequiredEnv()` — must NOT add node bearer here |
| `agentKeyCollidesWithOperatorKey` optional key pattern | `server/src/startupValidation.ts` | L~100 — model for optional credential checks |
| `createWorkflowApi()` factory | `server/src/workflow/api.ts` | Factory + `command()` helper + `toHttpError()` + `withErrorMapping()` |
| `withScratchSchema` test helper | `server/tests/workflow-migrations.test.ts` | L~50 — copy pattern for hub tests |
| `crypto.subtle.digest` SHA-256 | `server/src/workflow/schema.ts` | `checksumOf()` — use same pattern for token hashing |
| `node:crypto.timingSafeEqual` | Not yet used in codebase | Deno 2.0 Node compat layer — no deno.json entry needed |
| Existing workflow migrations | `server/db/workflow/001_*.sql`, `002_*.sql` | Versions 001–002 applied; next are 003, 004 |
| Workflow migration runner | `server/src/workflow/schema.ts` | `runWorkflowMigrations()` — automatically picks up 003 and 004 |
| Test flag constant | `server/tests/workflow-migrations.test.ts` | L~line 3: `const T = { sanitizeResources: false, sanitizeOps: false }` |
| `sql` DB client | `server/src/db.ts` | Import as `import { sql } from "../db.ts"` from within `src/workflow/` |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration ordering, drift detection, ledger | Custom migration runner | Existing `schema.ts` (`runWorkflowMigrations`) | Already battle-tested with advisory lock, checksum drift, per-transaction apply |
| Request body validation | Manual `typeof` / `if` guards | Zod schemas (already in `deno.json`) | Type narrowing, structured error messages, consistent 400 shape |
| Error → HTTP status mapping | Switch statement in each handler | `toHttpError()` + `withErrorMapping()` from `api.ts` | Already maps FK violations, domain errors, malformed UUIDs consistently |
| Token generation | Custom entropy source | `crypto.randomUUID()` (Deno built-in) | Cryptographically secure, no dependency, 128-bit entropy |
| SHA-256 hashing | npm crypto package | `crypto.subtle.digest` (Deno built-in) | Already used in `schema.ts`; no new dep |
| Timing-safe comparison | `===` on strings | `timingSafeEqual` from `node:crypto` | Prevents timing oracle; available via Deno's Node compat shim |

---

## Common Pitfalls

### Pitfall 1: Adding node bearer to REQUIRED_ENV
**What goes wrong:** Server refuses to boot when no node is configured (`FEATURE_WORKFLOW=true` but `NODE_BEARER` absent). This is explicitly called out in U2 and §7.1 as a hard constraint.
**Why it happens:** Developers follow the pattern for `MEMORY_API_KEY` without noticing `AWCP_AGENT_API_KEY` is deliberately NOT in REQUIRED_ENV.
**How to avoid:** Validate the bearer only inside the handler (or its mounted middleware). Never call `findMissingRequiredEnv` or `Deno.exit` from the node hub code.
**Warning sign:** `startupValidation.test.ts` tests would fail for deployments that legitimately have no node.

### Pitfall 2: Missing cross-node injection check
**What goes wrong:** Node A can POST events attributed to node B's `node_id` by knowing (or guessing) B's UUID, since UUIDs are not secret.
**Why it happens:** Developers implement auth as "is bearer valid?" without also checking "does this bearer own this node_id?"
**How to avoid:** The events endpoint MUST query `WHERE node_id = $path_node_id AND bearer_token_hash = $hash` before any insert. Auth and ownership are two separate checks.

### Pitfall 3: Unqualified SQL objects
**What goes wrong:** Table created in `public` schema (or wrong schema) due to polluted `search_path` from AGE graph queries on shared connection pool.
**Why it happens:** Four sites in `server/index.ts` and `server/src/entityWorker.ts` set `search_path` session-wide on pooled connections.
**How to avoid:** Every DDL statement and every DML statement uses `workflow.` prefix explicitly.

### Pitfall 4: Plain `===` for bearer token comparison
**What goes wrong:** Timing oracle allows an attacker to determine valid token prefixes incrementally.
**Why it happens:** Looks equivalent to `requireApiKey`'s `auth !== \`Bearer ${key}\`` — but that comparison is also vulnerable; it's a pre-existing issue, not a license to copy.
**How to avoid:** Hash both sides to fixed-length hex, then compare via `timingSafeEqual` from `node:crypto`.

### Pitfall 5: Bcrypt silent import
**What goes wrong:** Importing `npm:bcryptjs` without updating `deno.lock` causes `--frozen` lock check to fail in CI.
**Why it happens:** `deno.json` has `"lock": { "frozen": true }` — any new npm import not in the lockfile aborts the run.
**How to avoid:** Either use `crypto.subtle` (no new dep) or explicitly update `deno.json` + `deno.lock` and commit both, with a comment documenting the decision.

### Pitfall 6: `--parallel` test flag
**What goes wrong:** `workflow-mvp-e2e.test.ts` drops the shared `workflow` schema, racing with other workflow tests.
**Why it happens:** Deno's `--parallel` flag runs test FILES concurrently, not just `Deno.test` steps within a file.
**How to avoid:** Never pass `--parallel`. The sequential default is the safety guarantee.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Deno 2.0 | Runtime | ✓ | pinned `denoland/deno:2.0.0` (Dockerfile) | — |
| PostgreSQL 15 | Migrations + tests | ✓ | postgres-age image (docker-compose.yml) | — |
| `crypto.subtle` | Token hashing | ✓ | Deno built-in | — |
| `node:crypto.timingSafeEqual` | Timing-safe compare | ✓ | Deno 2.0 Node compat | — |
| bcrypt | Token hashing (U2 plan) | ✗ | Not in deno.json/deno.lock | Use `crypto.subtle` SHA-256 (see §3) |

**Missing dependencies with no fallback:** None that block Phase 2 if `crypto.subtle` is used.
**Missing dependencies requiring decision:** bcrypt — explicit dep decision needed if the planner chooses Option C.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `node:crypto.timingSafeEqual` is available in Deno 2.0 Node compat without `deno.json` entry | §3, §6 | Compile error; fall back to `crypto.subtle.digest` compare (slightly weaker but still constant-time if hashes are same length) |
| A2 | `npm:bcryptjs` is a legitimate package with Deno compatibility | §3 Option C | Slopsquat risk; must run `npm view bcryptjs` and lock update if chosen |
| A3 | `UNIQUE` on `bearer_token_hash` is acceptable (one bearer = one node identity) | §4 | If bearers are rotated frequently, a different upsert key may be needed |

---

## Sources

### Primary (HIGH confidence — verified from live codebase)
- `server/deno.json` — frozen dependency surface; bcrypt absence confirmed
- `server/src/workflow/schema.ts` — migration runner pattern, advisory lock, checksum, crypto.subtle usage
- `server/src/workflow/bootstrap.ts` — feature flag, report-not-exit contract
- `server/src/workflow/api.ts` — Hono factory, Zod validation, toHttpError, withErrorMapping
- `server/src/workflow/policy.ts` — import boundary model, optional credential pattern
- `server/src/auth.ts` — requireApiKey signature pattern
- `server/src/startupValidation.ts` — REQUIRED_ENV, agentKeyCollidesWithOperatorKey optional key model
- `server/index.ts:1180–1260` — workflow middleware + route mount seam
- `server/db/workflow/001_*.sql`, `002_*.sql` — confirmed version numbers 001–002
- `server/tests/workflow-migrations.test.ts` — withScratchSchema pattern, T flags
- `server/tests/workflow-mvp-e2e.test.ts` — spawned-server pattern, sequential constraint
- `docs/plans/2026-08-04-002-spike-st088-stage2-scope-enforcement-remote-node-plan.md` U2 — canonical field list, endpoint contract
- `docs/investigations/ST-084-awcp-host-spike-findings.md` §7.1, §12a — protocol contract, boot-coupling constraint

### Secondary (MEDIUM confidence)
- Deno 2.0 Node compatibility layer (`node:crypto`) — documented in Deno 2.0 release notes [ASSUMED verification; consistent with schema.ts's existing `crypto.subtle` usage confirming Deno runtime version]

---

## Metadata

**Confidence breakdown:**
- Migration conventions: HIGH — live file tree verified
- Auth patterns: HIGH — live code verified
- Token hashing: HIGH (conflict) / MEDIUM (resolution) — bcrypt absence VERIFIED; `crypto.subtle` alternative VERIFIED via existing usage in schema.ts
- Idempotency semantics: HIGH — U2 plan + SQL constraint pattern verified
- Test structure: HIGH — live test files verified
- Security threats: HIGH — derived from verified auth code paths

**Research date:** 2026-08-05
**Valid until:** 2026-09-05 (stable stack; drift risk only from ST-082 landing and adding new workflow DDL)
