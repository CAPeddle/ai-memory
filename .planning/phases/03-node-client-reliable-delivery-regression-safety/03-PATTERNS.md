# Phase 3: Node Client, Reliable Delivery & Regression Safety - Pattern Map

**Mapped:** 2026-08-15
**Files analyzed:** 5 (1 production, 3 test files — new or extended, 1 config edit)
**Analogs found:** 4 / 5 (client `.mjs` itself has no in-repo analog — first Node artifact in a Deno-only tree)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `server/scripts/awcp-node-client.mjs` | utility / CLI producer (Node ESM, not Deno) | event-driven + file-I/O (spool) + request-response (flush) | `server/scripts/awcp.ts` | role-match only — same "local event producer talking to an HTTP API" role, but wrong language/runtime; see caveats below |
| `server/tests/awcp-node-client.test.ts` (new, in-process spool logic — EVENT-02/03/04, D-14, D-13 stdout/stderr capture) | test (unit, in-process) | file-I/O, transform | `server/tests/workflow-remote-node-hub.test.ts` | role-match — in-process `Deno.test`, but that file drives `app.fetch()` against a route factory, not a `.mjs` import; use it for assertion/scoping style, not for the import mechanic |
| `server/tests/workflow-node-client-hub-e2e.test.ts` (new, EVENT-01 real-HTTP duplicate-delivery proof) | test (integration, real process) | request-response, event-driven | `server/tests/workflow-node-hub-e2e.test.ts` | exact — same `startServerProcess` real-HTTP-boundary pattern, same node-hub surface |
| `server/tests/workflow-remote-node-hub.test.ts` (existing — reference only, not modified) | test (unit, in-process) | CRUD (reads scoped by `node_id`/`bearer_token_hash`) | — (is itself the D-02 scoping analog) | exact — this file IS the pattern D-02 requires new assertions to imitate |
| `docker-compose.yml` (`mcp` service `environment:` block) | config | — | same file, `AWCP_NODE_ENROLMENT_SECRET` line (D-01 explicitly says "mirroring the pattern already used" here) | exact |

## Pattern Assignments

### `server/scripts/awcp-node-client.mjs` (utility, event-driven/file-I/O/request-response)

**Analog:** `server/scripts/awcp.ts` (role-match only — read for doc-comment and credential-handling conventions; **do not** copy its Deno-specific syntax, its `Deno.Command` subprocess pattern, or its `#!/usr/bin/env -S deno run` shebang, none of which apply to Node/`.mjs`).

**Doc-comment / provenance convention** (`server/scripts/awcp.ts` lines 1-15):
```typescript
#!/usr/bin/env -S deno run --allow-net --allow-env --allow-sys=hostname --allow-run=git
/**
 * ST-086 — `awcp`, the local event producer.
 *
 * Reports a real development session into Workflow Operations **through the HTTP
 * API**, never by connecting to Postgres. That is the point of the tool, not an
 * implementation detail...
 */
```
Carry the convention (a top-of-file doc comment naming the story, stating the tool's one job, and being explicit about what it does NOT do) — not the syntax. The new file's shebang must be `#!/usr/bin/env node` (or omitted, since D-16/D-07 call for a plain `node` invocation on z2, not a chmod+exec convention), and the credential section should mirror this style:

**Credential-handling doc convention** (`server/scripts/awcp.ts` lines 27-38):
```typescript
/**
 * **Credential.** This CLI prefers `AWCP_AGENT_API_KEY` when it is set, falling
 * back to `MEMORY_API_KEY` otherwise. ...
 * exporting the narrower agent key for this CLI, when one has been
 * issued, is the safer default: a leaked or logged agent key cannot resolve
 * decisions, attach evidence, author criteria, or complete packets, unlike a leaked
 * operator key.
 */
```
Apply the same discipline to `AWCP_NODE_BEARER` / `AWCP_NODE_ENROLMENT_SECRET`: state which env var is read, for how long it lives (D-12: enrolment secret for exactly one invocation, never persisted), and what a leak of each would cost.

**Base URL / env-var-with-default convention** (`server/scripts/awcp.ts` line 46-47):
```typescript
const BASE_URL = (Deno.env.get("AWCP_BASE_URL") ?? "http://127.0.0.1:3000")
  .replace(/\/$/, "");
```
Node equivalent for the client: `const HUB_URL = (process.env.AWCP_HUB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "")`.

**No in-repo Node.js analog exists.** This is the first Node artifact in a directory (and arguably the repo, outside test fixtures) that is otherwise 100% Deno TypeScript. Do not force server-side TypeScript idioms (path aliases, `deno.json` import maps, `Deno.serve`) onto this file. The RESEARCH.md Architecture Patterns section (Patterns 1-5, already read and locked into CONTEXT.md/RESEARCH.md) is the closer source for this file's actual code shape — PATTERNS.md defers to it rather than duplicating it here.

---

### `server/tests/awcp-node-client.test.ts` (new — unit, in-process, EVENT-02/03/04 + D-13 + D-14)

**Analog:** `server/tests/workflow-remote-node-hub.test.ts` — **for structure and assertion discipline only.** That file drives an in-process Hono `app.fetch()`, not a `.mjs` import; the new file's core mechanic (`import { ... } from "../scripts/awcp-node-client.mjs"` under Deno's `node:` compatibility layer) has no analog in this repo and must follow D-09/Pattern 2/Pattern 3 from RESEARCH.md instead.

**Deno.test shape and `T` shared-options spread convention** (`server/tests/workflow-remote-node-hub.test.ts` lines 136, 301-303, 327-330):
```typescript
Deno.test({
  ...T,
  name: "NODE-02b: replaying an identical (node_id, client_seq) adds no row and still acknowledges",
  fn: async () => {
    // ...
  },
});
```
Reuse this `{...T, name, fn}` object shape for the new file's tests (defining a local `T` with `sanitizeResources`/`sanitizeOps` flags as needed for `/tmp` file I/O).

**Scoped assertion discipline (D-02's own mandate)** (`server/tests/workflow-remote-node-hub.test.ts` lines 348-351):
```typescript
const rows = await sql<{ n: string }[]>`
  SELECT count(*) AS n FROM workflow.run_events WHERE node_id = ${node_id}
`;
assertEquals(Number(rows[0].n), 1, "the replay inserted a second row");
```
Every query this row-count pattern inspired must carry the same `WHERE node_id = ...` (or `bearer_token_hash`) scope — **this constraint applies to the new EVENT-01 hub-interaction test below, not to the in-process spool tests**, which have no database at all and are naturally exempt.

**Ack-shape comparison discipline (the exact bug class D-14/Pattern 5 warn about)** (`server/tests/workflow-remote-node-hub.test.ts` lines 353-364):
```typescript
// No Number() coercion, deliberately. The acknowledgement is the ONLY thing a
// node's spool compares against, and a client doing `sent === acked` never
// matches a string. Coercing here would make this assertion pass whether the hub
// answered 7 or "7" — i.e. it would not test the property the delivery contract
// depends on. Assert the wire type as strictly as the client must consume it.
for (const body of [firstBody, secondBody]) {
  assertEquals(
    body.acknowledged.map((a: { client_seq: number }) => a.client_seq),
    [7],
    "both responses must acknowledge client_seq 7 as a NUMBER",
  );
}
```
The new client's own spool-clearing logic (and any test of it) must compare against `acknowledged[].client_seq` as a `Number`, matching this exact wire-type discipline — this is the client-side half of the bug class `store.ts:840-857` already had to fix once server-side.

---

### `server/tests/workflow-node-client-hub-e2e.test.ts` (new — integration, real HTTP, EVENT-01 duplicate-delivery proof)

**Analog:** `server/tests/workflow-node-hub-e2e.test.ts` — **exact match.** Same `startServerProcess` pattern, same node-hub surface (`/workflow/nodes/register`, `/workflow/nodes/:node_id/events`), same cleanup discipline.

**Env config for the spawned server process** (`server/tests/workflow-node-hub-e2e.test.ts` lines 61-70):
```typescript
const NODE_HUB_ENV: Record<string, string> = {
  DATABASE_URL,
  MEMORY_API_KEY: OPERATOR_KEY,
  AWCP_NODE_ENROLMENT_SECRET: ENROLMENT_SECRET,
  FEATURE_WORKFLOW: "true",
  FEATURE_ENTITY_WORKER: "false",
  FEATURE_CONSOLIDATION_WORKER: "false",
  FEATURE_EMBEDDING_BACKFILL: "false",
  MODEL_PROVIDER_ENABLED: "false",
};
```
Copy this env block verbatim into the new file (same rationale: isolate the spawned process from the entity/consolidation/embedding workers so the test is deterministic and fast).

**Bearer minting + hashing helpers** (`server/tests/workflow-node-hub-e2e.test.ts` lines 72-86):
```typescript
function mintBearer(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input).slice().buffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```
Reuse verbatim — the new test needs its own bearer, mints and cleans it up the same way.

**Real-HTTP register + double-post-events pattern** (`server/tests/workflow-node-hub-e2e.test.ts` lines 88-157, condensed) — combine this file's `startServerProcess` + `fetch` mechanics with `workflow-remote-node-hub.test.ts`'s NODE-02b assertion shape (posting the identical `(node_id, client_seq)` event twice and asserting one row + identical `acknowledged[].event_id` both times) — this is exactly what RESEARCH.md's Code Examples section already sketches; PATTERNS.md is not duplicating that sketch, only citing the two source files it was assembled from.

**Cleanup-in-`finally` convention** (`server/tests/workflow-node-hub-e2e.test.ts` lines 168-176):
```typescript
} finally {
  await server.stop();
  // The child process wrote this row against the shared database; clean it up here
  // rather than leaving it for the next run to trip over.
  await sql`
    DELETE FROM workflow.execution_nodes WHERE bearer_token_hash = ${await sha256Hex(bearer)}
  `;
}
```
Reuse verbatim — required so the new test does not leave a dangling `execution_nodes` row in the dev/test database.

---

### `docker-compose.yml` — `mcp` service `environment:` block (config, D-01)

**Analog:** the same file, the existing `AWCP_NODE_ENROLMENT_SECRET` line — D-01 states explicitly this new line should mirror it.

**Existing enumeration-with-comment style** (`docker-compose.yml` lines 27-45):
```yaml
    environment:
      DATABASE_URL: postgresql://ai_memory:${DB_PASSWORD}@db:5432/ai_memory
      MEMORY_API_KEY: ${MEMORY_API_KEY}
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
      # Optional agent credential for /api/workflow (ST-086). This block enumerates
      # variables explicitly, so a value present in .env does NOT reach the container
      # unless it is named here — without this line the operator/agent split would
      # silently not apply on the Docker path and every agent-key request would 401.
      # `:-` defaults it to empty when unset, which the server treats as "no agent
      # key configured" (both the middleware and the collision guard test it for
      # truthiness), so leaving it out of .env keeps today's single-key behaviour.
      AWCP_AGENT_API_KEY: ${AWCP_AGENT_API_KEY:-}
      # Operator secret a remote execution node presents on its FIRST registration
      # (ST-088). Same explicit-enumeration reason as the line above — and the failure
      # mode here is quieter: unset means enrolment is CLOSED, so a hub missing this
      # answers 401 to every registration, which is indistinguishable from a wrong
      # bearer. `:-` keeps it optional, because a deployment running no nodes is
      # ordinary and must still boot. Generate with `openssl rand -hex 32`.
      AWCP_NODE_ENROLMENT_SECRET: ${AWCP_NODE_ENROLMENT_SECRET:-}
```
D-01's required change: add a **new line** `FEATURE_WORKFLOW: "true"` inside this same block (hardcoded `"true"`, not `${FEATURE_WORKFLOW:-...}`, since D-01 wants it always-on for the base `mcp` service — confirm against the final CONTEXT.md wording before hardcoding vs. defaulting). Follow the same comment convention: state the story, state what breaks if the line is omitted (404 instead of the routes mounting), and state the failure's diagnostic signature (404 vs 401) exactly as the two existing comments do.

## Shared Patterns

### Real-process test boundary (`startServerProcess`)
**Source:** `server/tests/_helpers/serverProcess.ts`
**Apply to:** `workflow-node-client-hub-e2e.test.ts` (the new EVENT-01 test). Not applicable to the in-process spool-logic test file, which has no server component.
Rationale for why this exists (from the file's own doc comment, lines 1-9): route-function tests and source scans cannot prove whether the composition root actually mounts a path or applies migrations at boot — only a real process boundary can. The same reasoning applies to proving hub-side duplicate suppression (EVENT-01): an in-process spool test proves the client's own logic, never the hub's `ON CONFLICT DO NOTHING` + read-back-ack behavior.

### D-02 scoping discipline for `execution_nodes`/`run_events` reads
**Source:** `server/tests/workflow-remote-node-hub.test.ts` (every query in the file, e.g. lines 315-317, 348-350)
**Apply to:** any new SQL assertion this phase adds over those two tables — in `workflow-node-client-hub-e2e.test.ts` and nowhere else (the in-process `.mjs` tests have no database access at all). Every such query must carry `WHERE node_id = ...` or `WHERE bearer_token_hash = ...`; an unscoped `count(*)` is nondeterministic the moment a live node (or another test's leftover row) shares the same table.

### Ack-shape wire-type discipline (`client_seq` as Number, never string-compared)
**Source:** `server/tests/workflow-remote-node-hub.test.ts` lines 353-364 and `server/tests/workflow-node-hub-e2e.test.ts` line 156; underlying server fix at `server/src/workflow/store.ts:840-857`
**Apply to:** the client's own ack-processing code in `awcp-node-client.mjs` (must read `acknowledged[].client_seq` as a JS `number`, matching what `JSON.parse` already produces from the hub's JSON body — no additional coercion needed client-side, but no naive `===` against a value read from elsewhere either) and to any test asserting spool-clearing behavior.

### `.env`/compose enumeration-allowlist gotcha
**Source:** `docker-compose.yml` `mcp` service `environment:` block (see above); documented independently in RESEARCH.md Pitfall 1
**Apply to:** the `docker-compose.yml` edit only. Not a pattern any test file needs to replicate — it's a one-line config fact: Compose does not pass `.env` values through wholesale, only variables named in the service's `environment:` block reach the container.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `server/scripts/awcp-node-client.mjs` (as a whole — the file's core logic: spool append/read/evict, `client_seq` counter file, batch-then-flush, ack-gated removal, entry-point guard) | utility | file-I/O + event-driven + request-response | No Node.js file exists anywhere in this repo outside test-fixture scope. `server/scripts/awcp.ts` is the closest *role* match (local event producer talking to the same kind of HTTP API) but is Deno TypeScript with fundamentally different runtime primitives (`Deno.Command`, `Deno.env`, import-map resolution) that do not transfer. The planner should treat RESEARCH.md's Architecture Patterns section (Patterns 1-5, already vetted against `node:fs`/`node:path`/`node:os`/`node:crypto`/`node:url` and cited to Node's own docs/GitHub issues) as the primary source for this file's shape, not a codebase analog — this absence is expected and stated plainly per the phase's own orientation note. |

## Metadata

**Analog search scope:** `server/scripts/`, `server/tests/`, `server/tests/_helpers/`, `server/src/workflow/`, `docker-compose.yml`, `docker-compose.workflow.yml`
**Files scanned:** `awcp.ts`, `workflow-remote-node-hub.test.ts`, `workflow-node-hub-e2e.test.ts`, `workflow-mvp-e2e.test.ts` (grepped only, per CONTEXT.md D-03), `_helpers/serverProcess.ts`, `remoteNodeHub.ts`, `store.ts`, `docker-compose.yml`
**Pattern extraction date:** 2026-08-15
