# Entity↔Thought Provenance Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a relational `entity_mentions` table linking each thought to the entities extracted from its content, populated by the existing entity worker as a side-effect of extraction.

**Architecture:** One new table in the public schema, colocated with existing entity-extraction schema in [server/db/graph.sql](../../../server/db/graph.sql). The entity worker's `writeToGraph` function is extended to receive `thought_id` and perform a single delete-then-insert of mentions per thought, alongside its existing AGE `MERGE` writes. No new MCP tools and no read-path code — this story is data-plane only. See [docs/design/specs/2026-05-22-entity-thought-provenance.md](../specs/2026-05-22-entity-thought-provenance.md) for the design rationale.

**Tech Stack:** PostgreSQL 15 (existing), Deno 2 / TypeScript (existing), `postgres@3.4.4` npm driver (existing), Apache AGE (existing — unchanged by this plan). Tests run inside the `mcp` container against the running `db` container.

**Note on commit messages:** This plan executes via the superpowers flow without a formal project story ID — no `Story: ST-NNN` / `Task: §N.N` trailers in commits. If formal tracking is wanted, create the story via `/plan-new` first and add trailers manually during execution.

---

## File Structure

**Created:**
- [server/tests/entity-mentions.test.ts](../../../server/tests/entity-mentions.test.ts) — integration tests for the back-link (capture path, re-extraction, CHECK constraint, FK cascade).

**Modified:**
- [server/db/graph.sql](../../../server/db/graph.sql) — add `CREATE TABLE entity_mentions` + index after the existing trigger section.
- [server/src/entityWorker.ts](../../../server/src/entityWorker.ts) — `writeToGraph` signature gains `thoughtId: string`; one new SQL `DELETE` and one batched `INSERT` are appended after the existing AGE writes. Caller in `processQueue` passes `thought_id`.

**Untouched (intentional):**
- [server/db/schema.sql](../../../server/db/schema.sql), [server/db/search.sql](../../../server/db/search.sql) — no changes; `entity_mentions` is entity-extraction-related and belongs in `graph.sql`.
- [server/index.ts](../../../server/index.ts) — no new MCP tools (per spec §2 out-of-scope).
- [server/tests/entity-worker.test.ts](../../../server/tests/entity-worker.test.ts) — existing tests stay green; new behaviour is exercised in a new test file to keep DB-level tests separate from MCP-level tests.

---

## Task 1: Add `entity_mentions` schema to `graph.sql`

**Files:**
- Modify: [server/db/graph.sql](../../../server/db/graph.sql) (append a new section after line 85, before the `OPENROUTER ENTITY EXTRACTION CALL SHAPE` comment on line 87)

This task adds the table only. No tests yet — the schema must exist before the failing test in Task 2 can be written.

- [ ] **Step 1: Open `server/db/graph.sql` and find the insertion point**

The new section goes after the queue trigger definition (current line 85 ends with `EXECUTE FUNCTION public.queue_entity_extraction();`) and before the `-- ============================================================` divider on line 87 that opens the reference-comment block.

- [ ] **Step 2: Insert the new section**

Add the following block immediately after `EXECUTE FUNCTION public.queue_entity_extraction();` (after line 85, before the next `-- ===` divider):

```sql

-- ============================================================
-- 5. ENTITY MENTIONS (back-link from AGE entities to source thoughts)
--    Added 2026-05-22 per docs/design/specs/2026-05-22-entity-thought-provenance.md
--    Why: AGE nodes carry only (label, name) and do not reference the
--    thoughts that mentioned them. This table is the relational back-link
--    that powers provenance queries and graph-expanded search.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.entity_mentions (
  thought_id   uuid        NOT NULL REFERENCES public.thoughts(id) ON DELETE CASCADE,
  entity_label text        NOT NULL CHECK (entity_label IN ('Person', 'Function', 'Error', 'Topic', 'Project')),
  entity_name  text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thought_id, entity_label, entity_name)
);

CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity
  ON public.entity_mentions(entity_label, entity_name);
```

- [ ] **Step 3: Apply the new schema to the running dev database**

The Dockerfile only runs `graph.sql` on a fresh DB init. For an existing dev DB, re-run the file via psql — every statement uses `IF NOT EXISTS`, so re-running is safe:

Run (PowerShell):

```powershell
docker compose exec -T db psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/03-graph.sql
```

If the file isn't mounted at that path on a running container (it's only there on init), copy and apply instead:

```powershell
docker compose cp server/db/graph.sql db:/tmp/graph.sql
docker compose exec db psql -U postgres -d postgres -f /tmp/graph.sql
```

Expected output: a series of `NOTICE: relation "..." already exists, skipping` lines for the pre-existing objects, plus `CREATE TABLE` and `CREATE INDEX` for the new ones.

- [ ] **Step 4: Verify the table exists**

Run:

```powershell
docker compose exec db psql -U postgres -d postgres -c "\d public.entity_mentions"
```

Expected: a table description showing 4 columns (`thought_id`, `entity_label`, `entity_name`, `created_at`), the composite PK, the CHECK constraint, the FK to `thoughts`, and the `idx_entity_mentions_entity` index.

- [ ] **Step 5: Commit**

```powershell
git add server/db/graph.sql
git commit -m "feat(schema): add entity_mentions back-link table

Per docs/design/specs/2026-05-22-entity-thought-provenance.md.
Foundational data-plane change; worker writes follow in subsequent commits."
```

---

## Task 2: Bootstrap test file with first failing test

**Files:**
- Create: [server/tests/entity-mentions.test.ts](../../../server/tests/entity-mentions.test.ts)

This task creates the test file with the test helpers and the happy-path test. The test will fail because the worker doesn't write mentions yet.

- [ ] **Step 1: Create the test file with helpers and the first test**

Create `server/tests/entity-mentions.test.ts` with this content:

```typescript
/**
 * Integration tests for entity_mentions back-link table.
 * Spec: docs/design/specs/2026-05-22-entity-thought-provenance.md
 *
 * Prerequisites:
 *   docker compose up -d
 *   docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts
 */

import { sql } from "../src/db.ts";

const MCP_BASE = Deno.env.get("MCP_BASE_URL") ?? "http://localhost:3000";
const API_KEY = Deno.env.get("MEMORY_API_KEY") ?? "test-key";

async function mcpCall(tool: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${MCP_BASE}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`MCP call failed: ${res.status} ${await res.text()}`);

  const contentType = res.headers.get("content-type") ?? "";
  let body: string;
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) throw new Error(`No data line in SSE response: ${text.slice(0, 200)}`);
    body = dataLine.slice(5).trim();
  } else {
    body = await res.text();
  }
  return body;
}

async function captureThought(content: string, context?: string): Promise<string> {
  const body = await mcpCall("capture_thought", { content, ...(context ? { context } : {}) });
  // Response shape (server/index.ts:272-277): { ..., result: { content: [{ type: 'text', text: 'Captured as shard ... (id: <uuid>)' }] } }
  const match = body.match(/id:\s*([0-9a-f-]{36})/i);
  if (!match) throw new Error(`Could not extract thought id from response: ${body.slice(0, 300)}`);
  return match[1];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForExtraction(thoughtId: string, maxSec = 40): Promise<void> {
  for (let i = 0; i < maxSec; i++) {
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM entity_extraction_queue WHERE thought_id = ${thoughtId}
    `;
    if (!row) {
      // Queue row not visible yet — trigger hasn't fired or worker hasn't claimed it
    } else if (row.status === "done") {
      return;
    } else if (row.status === "failed") {
      throw new Error(`Entity extraction failed for thought ${thoughtId}`);
    }
    await sleep(1_000);
  }
  throw new Error(`Entity extraction did not complete within ${maxSec}s for thought ${thoughtId}`);
}

Deno.test("entity_mentions: capture writes mentions for extracted entities", async () => {
  const thoughtId = await captureThought(
    "Alice uses TypeScript for the Zoom project and it was caused by a NullReferenceError",
    "project:test-entity-mentions",
  );

  await waitForExtraction(thoughtId);

  const rows = await sql<{ entity_label: string; entity_name: string }[]>`
    SELECT entity_label, entity_name
    FROM entity_mentions
    WHERE thought_id = ${thoughtId}
  `;

  if (rows.length === 0) {
    throw new Error(
      `Expected entity_mentions rows for thought ${thoughtId}, got none. ` +
      `Worker may not be writing mentions yet.`
    );
  }

  // At least one of the prompted entities should be present (LLM output varies)
  const names = rows.map((r) => r.entity_name);
  const expectedAny = ["Alice", "TypeScript", "Zoom", "NullReferenceError"];
  const found = expectedAny.some((e) => names.some((n) => n.includes(e)));
  if (!found) {
    throw new Error(
      `Expected at least one of ${expectedAny.join(", ")} in mentions. Got: ${names.join(", ")}`
    );
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts
```

Expected: FAIL on the first test with `Expected entity_mentions rows for thought <uuid>, got none.` after ~20–30s (the wait for extraction completes, but no rows are written by the worker yet).

If the test fails earlier with `relation "entity_mentions" does not exist`, Task 1 was not applied to the running DB — re-run Task 1 step 3.

- [ ] **Step 3: Commit the failing test**

```powershell
git add server/tests/entity-mentions.test.ts
git commit -m "test(entity-mentions): add failing test for back-link write path

TDD red commit — worker change in following commit makes this pass."
```

---

## Task 3: Thread `thought_id` through `writeToGraph`

**Files:**
- Modify: [server/src/entityWorker.ts](../../../server/src/entityWorker.ts)

This task changes the function signature without yet adding the mentions logic. The test from Task 2 should still fail after this task — but with a different (no longer compilation-blocked) failure mode.

- [ ] **Step 1: Change the signature of `writeToGraph`**

In `server/src/entityWorker.ts`, find the function definition at line 96:

```typescript
async function writeToGraph(extraction: ExtractionResult): Promise<void> {
```

Change it to:

```typescript
async function writeToGraph(extraction: ExtractionResult, thoughtId: string): Promise<void> {
```

- [ ] **Step 2: Update the caller in `processQueue`**

Find the caller at line 159:

```typescript
      // Write to graph (may produce zero writes if LLM found nothing)
      await writeToGraph(extraction);
```

Change to:

```typescript
      // Write to graph (may produce zero writes if LLM found nothing)
      await writeToGraph(extraction, thought_id);
```

The `thought_id` variable is already in scope from the `for (const { thought_id } of rows)` loop opened at line 139.

- [ ] **Step 3: Verify TypeScript compiles**

Run:

```powershell
docker compose exec mcp deno check src/entityWorker.ts
```

Expected: no errors. If errors mention an unused parameter, ignore — the parameter will be used in Task 4.

- [ ] **Step 4: Restart the worker so the new code is loaded**

Source is bind-mounted but Deno doesn't hot-reload. Restart the `mcp` container:

```powershell
docker compose restart mcp
```

Wait ~10s for the worker to start. Confirm with:

```powershell
docker compose logs --tail=20 mcp
```

Expected: a line containing `[entityWorker] started (poll every 10s, batch 10)`.

- [ ] **Step 5: Run the test from Task 2 again**

Run:

```powershell
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts
```

Expected: still FAIL with `Expected entity_mentions rows ... got none.` — the signature change alone doesn't make the test pass.

- [ ] **Step 6: Commit**

```powershell
git add server/src/entityWorker.ts
git commit -m "refactor(entity-worker): thread thoughtId into writeToGraph

Prepares for the mentions write in the next commit. Signature change only;
test from previous commit still fails (intentional intermediate state)."
```

---

## Task 4: Implement mentions `DELETE` + batched `INSERT`

**Files:**
- Modify: [server/src/entityWorker.ts](../../../server/src/entityWorker.ts) (inside `writeToGraph`, after the existing AGE edge MERGE loop)

This task adds the actual mentions writes. After this task, the test from Task 2 passes.

- [ ] **Step 1: Append the mentions block to `writeToGraph`**

In `server/src/entityWorker.ts`, find the end of `writeToGraph` (current end is line 118, the closing `}` after the edges loop). Insert the mentions block immediately before the closing `}`. After your edit, the function tail should look like this:

```typescript
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

  // Entity mentions back-link (spec §4.4: delete-then-insert on every extraction
  // so the link reflects current content, not a union across re-extractions).
  await sql`DELETE FROM entity_mentions WHERE thought_id = ${thoughtId}`;
  if (extraction.nodes.length > 0) {
    const labels = extraction.nodes.map((n) => n.label);
    const names = extraction.nodes.map((n) => n.name);
    await sql`
      INSERT INTO entity_mentions (thought_id, entity_label, entity_name)
      SELECT ${thoughtId}, label, name
      FROM unnest(${labels}::text[], ${names}::text[]) AS t(label, name)
      ON CONFLICT (thought_id, entity_label, entity_name) DO NOTHING
    `;
  }
}
```

The `DELETE` runs unconditionally (covers the re-extraction-to-empty-set case). The `INSERT` only runs when the LLM extracted nodes, to avoid feeding an empty array to `unnest`.

- [ ] **Step 2: Restart the `mcp` container so the new code is loaded**

```powershell
docker compose restart mcp
```

Wait ~10s and confirm via `docker compose logs --tail=20 mcp`.

- [ ] **Step 3: Run the test from Task 2 — expect it to pass**

```powershell
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts
```

Expected: PASS for `entity_mentions: capture writes mentions for extracted entities` after ~20–30s.

If the test still fails, check `docker compose logs --tail=50 mcp` for worker errors (look for `[entityWorker]` lines).

- [ ] **Step 4: Commit**

```powershell
git add server/src/entityWorker.ts
git commit -m "feat(entity-worker): write entity_mentions back-link on extraction

Delete-then-insert per spec §4.4 so mentions reflect current content
after re-extraction. INSERT uses ON CONFLICT DO NOTHING for defence-in-depth
even though DELETE precedes it (a no-op insert is harmless if both run
under concurrent re-extraction)."
```

---

## Task 5: Re-extraction regression test

**Files:**
- Modify: [server/tests/entity-mentions.test.ts](../../../server/tests/entity-mentions.test.ts) (append one test)

This task adds a regression test for the delete-then-insert behaviour. It should pass immediately because Task 4 already implements the behaviour — this test is a guard, not a TDD driver.

- [ ] **Step 1: Append the re-extraction test**

At the end of `server/tests/entity-mentions.test.ts`, append:

```typescript
Deno.test("entity_mentions: re-extraction removes stale and inserts new", async () => {
  const thoughtId = await captureThought(
    "Alice uses TypeScript on the Apollo project",
    "project:test-entity-mentions",
  );
  await waitForExtraction(thoughtId);

  const before = await sql<{ entity_name: string }[]>`
    SELECT entity_name FROM entity_mentions WHERE thought_id = ${thoughtId}
  `;
  const beforeNames = before.map((r) => r.entity_name);
  if (!beforeNames.some((n) => n.includes("Alice"))) {
    throw new Error(`Expected initial mentions to include Alice. Got: ${beforeNames.join(", ")}`);
  }

  // Force re-extraction: change both content and content_fingerprint so the
  // trigger's source_fingerprint guard re-queues the thought.
  const newFingerprint = `forced-${crypto.randomUUID()}`;
  await sql`
    UPDATE thoughts
    SET content = 'Quincy debugs the InvoiceService bug',
        content_fingerprint = ${newFingerprint}
    WHERE id = ${thoughtId}
  `;

  await waitForExtraction(thoughtId);

  const after = await sql<{ entity_name: string }[]>`
    SELECT entity_name FROM entity_mentions WHERE thought_id = ${thoughtId}
  `;
  const afterNames = after.map((r) => r.entity_name);

  if (afterNames.some((n) => n.includes("Alice") || n.includes("Apollo"))) {
    throw new Error(
      `Expected stale entities (Alice/Apollo) removed after re-extraction. Got: ${afterNames.join(", ")}`
    );
  }
  if (!afterNames.some((n) => n.includes("Quincy") || n.includes("InvoiceService"))) {
    throw new Error(
      `Expected new entities (Quincy/InvoiceService) after re-extraction. Got: ${afterNames.join(", ")}`
    );
  }
});
```

**Why the `newFingerprint` trick:** the `trg_queue_entity_extraction` trigger ([server/db/graph.sql:60-78](../../../server/db/graph.sql#L60-L78)) only re-enqueues a thought when `content_fingerprint` changes. An UPDATE that touches only `content` would slip past the guard. Forcing a distinct fingerprint is the cleanest way to drive a re-extraction from a test.

- [ ] **Step 2: Run the test — expect both tests to pass**

```powershell
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts
```

Expected: 2 passed, 0 failed. The re-extraction test takes ~45–60s (two `waitForExtraction` cycles).

- [ ] **Step 3: Commit**

```powershell
git add server/tests/entity-mentions.test.ts
git commit -m "test(entity-mentions): regression test for re-extraction freshness

Verifies that delete-then-insert (spec §4.4) removes entities the previous
extraction wrote and replaces them with the current extraction's set."
```

---

## Task 6: Schema-level guards (CHECK constraint + FK cascade)

**Files:**
- Modify: [server/tests/entity-mentions.test.ts](../../../server/tests/entity-mentions.test.ts) (append two tests)

This task adds two schema-level regression tests. Both should pass immediately because Postgres enforces the constraints — these guards lock in the schema's defensive properties.

- [ ] **Step 1: Append the CHECK-constraint test**

At the end of `server/tests/entity-mentions.test.ts`, append:

```typescript
Deno.test("entity_mentions: CHECK constraint rejects unknown label", async () => {
  // The FK on thought_id fires before the CHECK on entity_label, so we need a
  // valid thought_id to actually exercise the CHECK constraint.
  const thoughtId = await captureThought(
    "Anchor thought for the CHECK constraint test",
    "project:test-entity-mentions",
  );
  await waitForExtraction(thoughtId);

  let threw = false;
  try {
    await sql`
      INSERT INTO entity_mentions (thought_id, entity_label, entity_name)
      VALUES (${thoughtId}, 'Animal', 'Cat')
    `;
  } catch (err) {
    threw = true;
    const msg = (err as Error).message.toLowerCase();
    if (!msg.includes("check") && !msg.includes("constraint")) {
      throw new Error(`Expected CHECK-constraint error, got: ${(err as Error).message}`);
    }
  }
  if (!threw) {
    throw new Error("Expected INSERT with label 'Animal' to be rejected, but it succeeded.");
  }
});
```

- [ ] **Step 2: Append the FK-cascade test**

Immediately after, append:

```typescript
Deno.test("entity_mentions: FK cascade removes mentions when thought is deleted", async () => {
  const thoughtId = await captureThought(
    "Bob maintains the PaymentService component",
    "project:test-entity-mentions",
  );
  await waitForExtraction(thoughtId);

  const [{ c: before }] = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c FROM entity_mentions WHERE thought_id = ${thoughtId}
  `;
  if (before === 0) {
    throw new Error("Setup precondition failed: no mentions written before delete.");
  }

  await sql`DELETE FROM thoughts WHERE id = ${thoughtId}`;

  const [{ c: after }] = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c FROM entity_mentions WHERE thought_id = ${thoughtId}
  `;
  if (after !== 0) {
    throw new Error(`Expected mentions to cascade-delete, got ${after} surviving rows.`);
  }
});
```

- [ ] **Step 3: Run the full test file — expect 4 tests pass**

```powershell
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts
```

Expected: 4 passed, 0 failed. Total runtime ~90–120s due to LLM-extraction waits.

- [ ] **Step 4: Commit**

```powershell
git add server/tests/entity-mentions.test.ts
git commit -m "test(entity-mentions): schema-level guards for CHECK and FK cascade

CHECK constraint rejects labels outside the worker's allow-list
(defence-in-depth per spec §4.1).
FK ON DELETE CASCADE removes mentions when the parent thought is deleted."
```

---

## Task 7: Final verification — full server test suite

This task confirms the new test file plays nicely with the existing suite and that nothing else regressed.

- [ ] **Step 1: Run all server tests**

```powershell
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/
```

Expected: all existing tests pass (entity-worker, parseContext, search-* tests) plus the 4 new entity-mentions tests. No failures.

- [ ] **Step 2: Inspect worker logs for the new INSERT — sanity check**

```powershell
docker compose logs --tail=100 mcp | Select-String "entityWorker"
```

Expected: `[entityWorker] processed <uuid>: N nodes, M edges` lines as before. No new error patterns.

- [ ] **Step 3: Spot-check the table in psql**

```powershell
docker compose exec db psql -U postgres -d postgres -c "SELECT thought_id, entity_label, entity_name FROM entity_mentions ORDER BY created_at DESC LIMIT 10"
```

Expected: rows from the tests above (plus any earlier extractions). Verify `entity_label` values are all from the allow-list.

- [ ] **Step 4: No additional commit needed**

Task 7 is verification only. No code changes; no commit.

---

## Plan Self-Review

**Spec coverage check (every requirement in the spec maps to a task):**

| Spec section | Implemented by |
|---|---|
| §2 In scope — new `entity_mentions` table | Task 1 |
| §2 In scope — modify `writeToGraph` | Tasks 3, 4 |
| §2 In scope — schema migration | Task 1 |
| §2 In scope — idempotency on re-extraction | Task 4 (delete-then-insert), Task 5 (test) |
| §2 In scope — cascade on thought delete | Task 1 (`ON DELETE CASCADE` in DDL), Task 6 (test) |
| §2 In scope — tests covering write path + idempotency | Tasks 2, 5, 6 |
| §2 Out of scope — no new MCP tools | Honoured (no changes to `index.ts`) |
| §2 Out of scope — no bounding strategy | Honoured (ST-034 handles that) |
| §2 Out of scope — no backfill | Honoured (forward-only worker) |
| §2 Out of scope — no extra mention metadata | Honoured (table has only the 4 columns from the spec) |
| §3 Direction (composed tools) | Recorded in spec; no code in this plan |
| §4.1 Schema (CHECK, FK, PK, index) | Task 1 |
| §4.2 Worker change (thread thoughtId, batched INSERT) | Tasks 3, 4 |
| §4.3 No transaction wrapping | Honoured (`DELETE` + `INSERT` are separate statements; no `sql.begin(...)`) |
| §4.4 Delete-then-insert | Task 4 |
| §7 Testing — happy path | Task 2 |
| §7 Testing — re-extraction | Task 5 |
| §7 Testing — CHECK rejects unknown label | Task 6 |
| §7 Testing — FK cascade | Task 6 |

No gaps.

**Placeholder scan:** no "TBD" / "TODO" / "implement later" / "similar to" / "appropriate error handling" / "edge cases" in any task. Every code step has complete code; every command has expected output.

**Type / name consistency check:**
- `writeToGraph(extraction, thoughtId)` — same signature in Task 3 step 1, Task 3 step 2 call site, Task 4 step 1.
- `thought_id` (snake_case) is the DB column and the destructured loop variable in `entityWorker.ts`; `thoughtId` (camelCase) is the TypeScript parameter name. Both used consistently per their context.
- `entity_mentions` (snake_case) — same table name across all tasks.
- `(thought_id, entity_label, entity_name)` — same composite key across Tasks 1, 4, 5, 6.
- `waitForExtraction`, `captureThought`, `mcpCall` — defined once in Task 2, reused in Tasks 5 and 6 without redefinition.
