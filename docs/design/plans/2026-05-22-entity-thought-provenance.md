# Entity↔Thought Provenance Link — Implementation Plan

**Goal:** Add a relational `entity_mentions` table linking each thought to the entities extracted from its content, populated by the existing entity worker as a side-effect of extraction.

**Architecture:** One new table in the public schema, colocated with existing entity-extraction schema in [server/db/graph.sql](../../../server/db/graph.sql). The entity worker's `writeToGraph` function is extended to receive `thought_id` and perform a single delete-then-insert of mentions per thought, alongside its existing AGE `MERGE` writes. No new MCP tools and no read-path code — this story is data-plane only. See [docs/design/specs/2026-05-22-entity-thought-provenance.md](../specs/2026-05-22-entity-thought-provenance.md) for the design rationale.

**Tech Stack:** PostgreSQL 15, Deno 2 / TypeScript, `postgres@3.4.4`, Apache AGE. Tests run inside the `mcp` container against the running `db` container.

---

## Execution model — subagent-driven with orchestrator oversight

This plan is **not** a checklist for a single agent to execute inline. The agent that picks up this plan is the **orchestrator**: it dispatches a fresh subagent per task, reviews the subagent's output, applies the named skills at the appropriate decision points, and commits only when satisfied that the task meets its scope.

**Why this shape:** subagent isolation keeps each task self-contained, prevents context bloat in the orchestrator, and forces the orchestrator to do the quality-control work (reviewing diffs, running verification, deciding when work is done) rather than narrating through Edit calls themselves. It also makes skill invocation natural — the orchestrator invokes process skills (TDD, verification, debugging, code-review) at the boundaries where they add value, not as instructions inside a flat task list.

### Orchestrator responsibilities, in order

1. **Read the spec** ([docs/design/specs/2026-05-22-entity-thought-provenance.md](../specs/2026-05-22-entity-thought-provenance.md)) before starting any task — every dispatch decision and review judgement traces back to it.
2. **Invoke `superpowers:subagent-driven-development`** at session start to load the orchestration pattern.
3. **For each task, in order:**
   - Confirm the task's prerequisites are met.
   - Dispatch a fresh subagent (`subagent_type: general-purpose`) with the prompt block provided. **Do not paraphrase the prompt** — it is self-contained on purpose; the subagent has no other context.
   - When the subagent returns, work through the **Orchestrator review checklist** — read the diff yourself, run any confirming command yourself. Do not accept the subagent's summary as evidence; verify.
   - Invoke `superpowers:verification-before-completion` before marking a task done if it involves test execution or runtime behaviour.
   - Commit using the supplied Conventional Commits message (no `Story:` / `Task:` trailers — no formal story ID exists for this work yet; the user is aware).
4. **If anything goes sideways**, invoke `superpowers:systematic-debugging` rather than re-dispatching the same subagent with vague guidance. Diagnose, then re-dispatch with a sharper prompt.
5. **After Task 7**, invoke `superpowers:requesting-code-review` against the full branch diff to surface anything the per-task reviews missed.

### Subagent prompt construction principles

Each subagent prompt below:
- Names the **spec path** so the subagent can read the design rationale if it needs to make a judgement call.
- Includes **complete code/commands** — no "see plan above" references, no placeholders.
- Lists **required skills** the subagent must invoke (e.g. `superpowers:test-driven-development` for test-writing tasks).
- Forbids the subagent from committing. Commits are the orchestrator's call, after review.

---

## File Structure

**Created:**
- `server/tests/entity-mentions.test.ts` — integration tests for the back-link (capture path, re-extraction, CHECK constraint, FK cascade).

**Modified:**
- `server/db/graph.sql` — `CREATE TABLE entity_mentions` + index appended after the existing trigger section.
- `server/src/entityWorker.ts` — `writeToGraph` signature gains `thoughtId: string`; one new SQL `DELETE` and one batched `INSERT` are appended after the existing AGE writes. Caller in `processQueue` passes `thought_id`.

**Untouched (intentional):**
- `server/db/schema.sql`, `server/db/search.sql` — no changes; `entity_mentions` is entity-extraction-related and belongs in `graph.sql`.
- `server/index.ts` — no new MCP tools (per spec §2 out-of-scope).
- `server/tests/entity-worker.test.ts` — existing tests stay green; new behaviour is exercised in a new test file to keep DB-level tests separate from MCP-level tests.

---

## Task 1: Add `entity_mentions` schema to `graph.sql`

**Files:** modify `server/db/graph.sql`.

**Prerequisites the orchestrator confirms before dispatch:**
- `docker compose ps` shows `db` and `mcp` containers running and healthy.
- `git diff server/db/graph.sql` is empty (file unmodified from HEAD).

**Subagent dispatch** (`subagent_type: general-purpose`):

```
You are a subagent executing Task 1 of the implementation plan at
docs/design/plans/2026-05-22-entity-thought-provenance.md. The design spec
is at docs/design/specs/2026-05-22-entity-thought-provenance.md — read it
if you need context for any judgement.

Job: add the entity_mentions table to server/db/graph.sql, apply the change
to the running dev database, and verify the table exists with the expected
shape. Do NOT commit — the orchestrator commits after review.

Required skill: invoke superpowers:verification-before-completion before
reporting done. Run the verify command and quote its output.

Steps:

1. Read server/db/graph.sql. Locate the line
   "EXECUTE FUNCTION public.queue_entity_extraction();" (around line 85)
   and the next "-- ===…" divider that opens the OpenRouter reference
   comment.

2. Insert this block between those two anchors (preserving the existing
   blank line above the divider):

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

3. Apply graph.sql to the running dev DB. The Dockerfile only runs it on
   fresh init; for the existing container, copy + apply:

     docker compose cp server/db/graph.sql db:/tmp/graph.sql
     docker compose exec db psql -U postgres -d postgres -f /tmp/graph.sql

   Every existing statement is idempotent (IF NOT EXISTS / CREATE OR REPLACE
   / DROP TRIGGER IF EXISTS), so re-running is safe.

4. Verify the table exists with the expected shape:

     docker compose exec db psql -U postgres -d postgres -c "\d public.entity_mentions"

   Expected: 4 columns (thought_id, entity_label, entity_name, created_at),
   composite PK, CHECK constraint, FK to thoughts(id), and the
   idx_entity_mentions_entity index.

Report back:
- The diff of your graph.sql edit (one block addition only).
- The psql output from step 3 (look for CREATE TABLE / CREATE INDEX lines).
- The psql output from step 4 (the table description).
```

**Orchestrator review checklist:**
- [ ] Read `server/db/graph.sql` and confirm the new §5 block is exactly where it should be (between the queue trigger and the OpenRouter comment).
- [ ] Run `git diff server/db/graph.sql` yourself — only the §5 block changed.
- [ ] Run `docker compose exec db psql -U postgres -d postgres -c "\d entity_mentions"` yourself; confirm shape.
- [ ] No errors in the apply step (warnings about "already exists" on pre-existing objects are expected and fine).

**Orchestrator commit (after review passes):**

```powershell
git add server/db/graph.sql
git commit -m "feat(schema): add entity_mentions back-link table

Per docs/design/specs/2026-05-22-entity-thought-provenance.md.
Foundational data-plane change; worker writes follow."
```

---

## Task 2: Bootstrap test file with first failing test

**Files:** create `server/tests/entity-mentions.test.ts`.

**Prerequisites the orchestrator confirms before dispatch:**
- Task 1 committed (run `git log -1 --oneline` — should be the schema commit).
- `entity_mentions` table is reachable: `docker compose exec db psql -U postgres -d postgres -c "SELECT 1 FROM entity_mentions LIMIT 1"` returns without error (empty result set is fine).

**Subagent dispatch** (`subagent_type: general-purpose`):

```
You are a subagent executing Task 2 of docs/design/plans/2026-05-22-entity-thought-provenance.md.
The spec is at docs/design/specs/2026-05-22-entity-thought-provenance.md.

Job: create a new test file with helper functions and one happy-path test
that currently FAILS (the worker doesn't write entity_mentions yet — that
arrives in Task 4). This is the TDD red commit.

Required skills:
- superpowers:test-driven-development (you are writing a failing test
  before the implementation that will make it pass — invoke this skill to
  reinforce the discipline).
- superpowers:verification-before-completion (run the test and quote its
  failure output before reporting done; do not assume the test runs).

Steps:

1. Create server/tests/entity-mentions.test.ts with the following content
   (do NOT modify the existing server/tests/entity-worker.test.ts):

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
     if (contentType.includes("text/event-stream")) {
       const text = await res.text();
       const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
       if (!dataLine) throw new Error(`No data line in SSE response: ${text.slice(0, 200)}`);
       return dataLine.slice(5).trim();
     }
     return await res.text();
   }

   async function captureThought(content: string, context?: string): Promise<string> {
     const body = await mcpCall("capture_thought", { content, ...(context ? { context } : {}) });
     // capture_thought returns text like "Captured as shard ... (id: <uuid>)" (server/index.ts:272-277)
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
       if (row?.status === "done") return;
       if (row?.status === "failed") throw new Error(`Entity extraction failed for thought ${thoughtId}`);
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

     const names = rows.map((r) => r.entity_name);
     const expectedAny = ["Alice", "TypeScript", "Zoom", "NullReferenceError"];
     const found = expectedAny.some((e) => names.some((n) => n.includes(e)));
     if (!found) {
       throw new Error(
         `Expected at least one of ${expectedAny.join(", ")} in mentions. Got: ${names.join(", ")}`
       );
     }
   });

2. Run the test:

     docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts

3. Confirm the test FAILS with the message
   "Expected entity_mentions rows for thought <uuid>, got none."
   This is the expected red-state — the worker doesn't write mentions yet.

Report back:
- Confirmation the file is created at the right path.
- Quote the exact failure message from step 3 (so the orchestrator can
  verify it failed for the right reason, not a setup error).

If the test fails earlier with "relation entity_mentions does not exist",
Task 1's apply step didn't take — abort and ask the orchestrator to re-run
Task 1.
```

**Orchestrator review checklist:**
- [ ] Read `server/tests/entity-mentions.test.ts` — confirm helpers and test are exactly as in the prompt (no unauthorised drift).
- [ ] Invoke `superpowers:verification-before-completion` and re-run the test yourself; confirm the failure message matches "got none" (not a different error).
- [ ] No edits to `server/tests/entity-worker.test.ts`.

**Orchestrator commit (after review passes):**

```powershell
git add server/tests/entity-mentions.test.ts
git commit -m "test(entity-mentions): add failing test for back-link write path

TDD red commit — worker change in following commits makes this pass."
```

---

## Task 3: Thread `thoughtId` through `writeToGraph`

**Files:** modify `server/src/entityWorker.ts`.

**Prerequisites the orchestrator confirms before dispatch:**
- Task 2 committed; test fails with "got none".

**Subagent dispatch** (`subagent_type: general-purpose`):

```
You are a subagent executing Task 3 of docs/design/plans/2026-05-22-entity-thought-provenance.md.

Job: change the writeToGraph function signature in server/src/entityWorker.ts
to accept a thoughtId parameter, and pass thought_id at the existing call
site. Do NOT add any mentions-write logic yet — that is Task 4. The test
from Task 2 should still fail (intentional intermediate state).

Required skill: superpowers:verification-before-completion (run the
deno check command and quote its output before reporting done).

Steps:

1. In server/src/entityWorker.ts, find the writeToGraph definition (around
   line 96):

     async function writeToGraph(extraction: ExtractionResult): Promise<void> {

   Change it to:

     async function writeToGraph(extraction: ExtractionResult, thoughtId: string): Promise<void> {

2. Find the only caller at around line 159, inside the processQueue loop:

     // Write to graph (may produce zero writes if LLM found nothing)
     await writeToGraph(extraction);

   Change to:

     // Write to graph (may produce zero writes if LLM found nothing)
     await writeToGraph(extraction, thought_id);

   The variable thought_id is in scope from the for-of loop at around
   line 139 ("for (const { thought_id } of rows)").

3. Verify TypeScript compiles:

     docker compose exec mcp deno check src/entityWorker.ts

   Expected: no errors. (An "unused parameter" warning on thoughtId is
   acceptable — it gets used in Task 4.)

4. Restart the worker so the new code is active:

     docker compose restart mcp

   Wait ~10s, then confirm with:

     docker compose logs --tail=20 mcp

   Look for "[entityWorker] started (poll every 10s, batch 10)".

5. Re-run the Task 2 test:

     docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts

   Expected: still fails with "got none" (signature change alone is not
   sufficient — Task 4 adds the actual write).

Report back:
- The diff of your entityWorker.ts edit.
- The deno check output.
- Confirmation the test still fails with the same "got none" message.
```

**Orchestrator review checklist:**
- [ ] Read the diff of `server/src/entityWorker.ts` — confirm signature change and call-site change, nothing else.
- [ ] Run `docker compose exec mcp deno check src/entityWorker.ts` yourself.
- [ ] Run the test yourself and confirm the failure mode hasn't changed.

**Orchestrator commit (after review passes):**

```powershell
git add server/src/entityWorker.ts
git commit -m "refactor(entity-worker): thread thoughtId into writeToGraph

Prepares for the mentions write in the next commit. Signature change only;
the failing test from the previous commit is still failing (intentional)."
```

---

## Task 4: Implement mentions `DELETE` + batched `INSERT`

**Files:** modify `server/src/entityWorker.ts`.

**Prerequisites the orchestrator confirms before dispatch:**
- Task 3 committed; test from Task 2 still fails for the right reason.

**Subagent dispatch** (`subagent_type: general-purpose`):

```
You are a subagent executing Task 4 of docs/design/plans/2026-05-22-entity-thought-provenance.md.
The spec at docs/design/specs/2026-05-22-entity-thought-provenance.md §4.4
mandates delete-then-insert on every extraction so mentions reflect current
content, not a union across re-extractions.

Job: inside writeToGraph in server/src/entityWorker.ts, append a DELETE
of any existing mentions for the thoughtId followed by a single batched
INSERT of the current extraction's nodes. After this task, the test from
Task 2 must PASS.

Required skills:
- superpowers:test-driven-development (you are writing the minimal
  implementation to turn red → green).
- superpowers:verification-before-completion (run the test and quote its
  pass output before reporting done; do not assume the worker restart
  picked up your code).

Steps:

1. In server/src/entityWorker.ts, find the end of writeToGraph (the
   closing brace of the function, currently around line 118, after the
   edges MERGE loop). Insert the following block before the closing
   brace, immediately after the existing edges loop:

     // Entity mentions back-link (spec §4.4: delete-then-insert on every
     // extraction so the link reflects current content, not a union across
     // re-extractions).
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

   Notes:
   - The DELETE runs unconditionally (covers re-extraction-to-empty-set).
   - The INSERT-guard on extraction.nodes.length avoids feeding an empty
     array to unnest, which fails on Postgres.
   - ON CONFLICT DO NOTHING is defence-in-depth — the composite PK makes
     duplicate inserts harmless if any concurrent re-extraction races.
   - No transaction wraps the DELETE + INSERT or the AGE writes; spec §4.3
     intentionally relies on retry idempotency rather than transactions.

2. Restart the worker:

     docker compose restart mcp

   Wait ~10s; confirm via "docker compose logs --tail=20 mcp" that
   "[entityWorker] started" appears.

3. Run the Task 2 test:

     docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts

   Expected: 1 passed, 0 failed. Runtime ~20–30s.

   If the test still fails:
   - Check "docker compose logs --tail=50 mcp" for "[entityWorker] processed"
     lines and any errors.
   - Confirm your edit landed (read the file back).
   - Do NOT change the test to make it pass.

Report back:
- The diff of your entityWorker.ts edit (one block addition).
- Quote the test pass output.
- Quote the latest "[entityWorker] processed" log line.
```

**Orchestrator review checklist:**
- [ ] Read the diff — confirm only the mentions block was appended, no other changes.
- [ ] Confirm the block is inside `writeToGraph`, after the edges loop, before the closing brace.
- [ ] Invoke `superpowers:verification-before-completion`; re-run the test yourself and confirm pass.
- [ ] Inspect `entity_mentions` directly: `docker compose exec db psql -U postgres -d postgres -c "SELECT count(*) FROM entity_mentions"` — should be > 0.

**Orchestrator commit (after review passes):**

```powershell
git add server/src/entityWorker.ts
git commit -m "feat(entity-worker): write entity_mentions back-link on extraction

Delete-then-insert per spec §4.4 so mentions reflect current content
after re-extraction. INSERT uses ON CONFLICT DO NOTHING for defence-in-depth
under concurrent re-extraction races."
```

---

## Task 5: Re-extraction regression test

**Files:** modify `server/tests/entity-mentions.test.ts` (append one test).

**Prerequisites the orchestrator confirms before dispatch:**
- Task 4 committed; first test passes.

**Subagent dispatch** (`subagent_type: general-purpose`):

```
You are a subagent executing Task 5 of docs/design/plans/2026-05-22-entity-thought-provenance.md.

Job: append a regression test for the delete-then-insert behaviour at
spec §4.4. This test should pass on first run because Task 4 already
implements the behaviour — it is a regression guard, not a TDD driver.

Required skill: superpowers:verification-before-completion.

Background on the trigger: server/db/graph.sql lines 60–78 define a
trigger that only re-enqueues a thought when its content_fingerprint
changes. Updating just content is silently filtered. To drive a
re-extraction from a test, you must change both content and
content_fingerprint.

Steps:

1. Append to server/tests/entity-mentions.test.ts (do not touch existing
   helpers or the first test):

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

     // Force re-extraction: change content AND fingerprint so the trigger
     // guard re-queues the thought (server/db/graph.sql:60-78).
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
         `Expected stale entities removed after re-extraction. Got: ${afterNames.join(", ")}`
       );
     }
     if (!afterNames.some((n) => n.includes("Quincy") || n.includes("InvoiceService"))) {
       throw new Error(
         `Expected new entities after re-extraction. Got: ${afterNames.join(", ")}`
       );
     }
   });

2. Run the full test file:

     docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts

   Expected: 2 passed, 0 failed. Runtime ~45–60s (two LLM-extraction waits).

Report back:
- The diff (one test appended).
- Quote the pass output (both tests).
```

**Orchestrator review checklist:**
- [ ] Read the appended test — confirm the fingerprint trick is present and explained in the comment (so a future reader understands why a plain content UPDATE isn't sufficient).
- [ ] Re-run the test file yourself; both tests pass.
- [ ] Confirm no edits to existing helpers or the first test.

**Orchestrator commit (after review passes):**

```powershell
git add server/tests/entity-mentions.test.ts
git commit -m "test(entity-mentions): regression test for re-extraction freshness

Verifies that delete-then-insert (spec §4.4) removes entities the previous
extraction wrote and replaces them with the current set."
```

---

## Task 6: Schema-level guards — CHECK constraint and FK cascade

**Files:** modify `server/tests/entity-mentions.test.ts` (append two tests).

**Prerequisites the orchestrator confirms before dispatch:**
- Task 5 committed; both tests pass.

**Subagent dispatch** (`subagent_type: general-purpose`):

```
You are a subagent executing Task 6 of docs/design/plans/2026-05-22-entity-thought-provenance.md.

Job: append two schema-level regression tests — one for the CHECK
constraint on entity_label, one for the FK ON DELETE CASCADE. Both
should pass immediately (Postgres enforces them) — these are guards that
lock in the schema's defensive properties.

Required skill: superpowers:verification-before-completion.

Steps:

1. Append to server/tests/entity-mentions.test.ts (in order, after the
   re-extraction test):

   Deno.test("entity_mentions: CHECK constraint rejects unknown label", async () => {
     // The FK on thought_id fires before the CHECK on entity_label,
     // so we need a valid thought_id to actually exercise the CHECK.
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

2. Run the full test file:

     docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts

   Expected: 4 passed, 0 failed. Runtime ~90–120s.

Report back:
- The diff (two tests appended).
- Quote the pass output.
```

**Orchestrator review checklist:**
- [ ] Read both new tests — confirm the comment explaining the FK-before-CHECK ordering is present in the CHECK test.
- [ ] Re-run the test file yourself; all 4 tests pass.

**Orchestrator commit (after review passes):**

```powershell
git add server/tests/entity-mentions.test.ts
git commit -m "test(entity-mentions): schema-level guards for CHECK and FK cascade

CHECK constraint rejects labels outside the worker's allow-list
(defence-in-depth per spec §4.1).
FK ON DELETE CASCADE removes mentions when the parent thought is deleted."
```

---

## Task 7: Final verification — full server test suite and code review

**Files:** none (verification + code review only).

**Prerequisites the orchestrator confirms before dispatch:**
- Tasks 1–6 committed; entity-mentions test file passes 4/4.

**Subagent dispatch** (`subagent_type: general-purpose`):

```
You are a subagent executing Task 7 of docs/design/plans/2026-05-22-entity-thought-provenance.md.

Job: run the full server test suite and produce a structured report on
what passed/failed and whether anything looks regressed.

Required skill: superpowers:verification-before-completion.

Steps:

1. Run the full server suite:

     docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/

   Capture the full output.

2. Spot-check entity_mentions in psql:

     docker compose exec db psql -U postgres -d postgres -c \
       "SELECT entity_label, count(*)::int AS c FROM entity_mentions GROUP BY entity_label ORDER BY c DESC"

   Confirm:
   - All labels in the result are from the allow-list (Person, Function,
     Error, Topic, Project) — no surprises.
   - Counts are non-zero (at least the test runs produced rows).

3. Scan worker logs for new error patterns:

     docker compose logs --tail=200 mcp | grep -i "entityWorker\|error"

   Look for any "[entityWorker]" lines indicating failure or unexpected
   behaviour during the test runs.

Report back, in this exact structure:

  Test suite results:
  - <N> tests total, <P> passed, <F> failed
  - Failures (if any): list each with the test name and failure summary

  Schema spot-check:
  - <label-count breakdown from step 2>
  - Allow-list adherence: <yes/no>

  Worker log scan:
  - Error count: <N>
  - Notable patterns: <summary or "none">

Do NOT modify any files. Do NOT commit.
```

**Orchestrator final actions (after subagent returns):**

1. Read the subagent's report. If any test failed or any worker error pattern looks like a regression, **stop**: invoke `superpowers:systematic-debugging` to diagnose, then loop back to the relevant task.

2. If everything is green:
   - Invoke `superpowers:requesting-code-review` against the full branch diff:
     ```powershell
     git log --oneline HEAD~6..HEAD
     git diff HEAD~6..HEAD
     ```
     Treat the code-review output as a quality gate — address any substantive findings via additional commits (each one a fresh subagent dispatch, briefed with the review feedback).
   - When code review yields no blocking findings, mark the plan complete.

3. No additional commit is created for Task 7 itself — it is verification only.

---

## Cross-cutting acceptance criteria

The orchestrator confirms before declaring the plan done:

- **Spec coverage:** every in-scope item from spec §2 has a commit on the branch. Every out-of-scope item is untouched (no new MCP tools, no backfill code, no extra mention columns, no bounding logic).
- **Test pass rate:** `docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/` returns 0 failures.
- **No worker regressions:** `[entityWorker]` log lines show normal "processed N nodes, M edges" patterns; no new error spikes.
- **Commit hygiene:** each commit is Conventional Commits; messages explain the *why* (per the project's "always include the why" feedback), not just the *what*; no commit bundles unrelated changes.
- **Code review:** `superpowers:requesting-code-review` ran cleanly or all findings were addressed in follow-up commits.

## Plan self-review (orchestrator-facing)

**Spec coverage map:**

| Spec section | Task |
|---|---|
| §2 In scope — new `entity_mentions` table | Task 1 |
| §2 In scope — modify `writeToGraph` | Tasks 3, 4 |
| §2 In scope — schema migration applied to dev DB | Task 1 (apply step) |
| §2 In scope — idempotency on re-extraction | Task 4 (delete-then-insert), Task 5 (test) |
| §2 In scope — cascade on thought delete | Task 1 (DDL), Task 6 (test) |
| §2 In scope — tests for write path + idempotency | Tasks 2, 5, 6 |
| §2 Out of scope — no new MCP tools | Enforced (no edits to `server/index.ts`) |
| §2 Out of scope — no bounding strategy | Enforced (ST-034 owns that) |
| §2 Out of scope — no backfill | Enforced (forward-only worker) |
| §2 Out of scope — no extra mention metadata | Enforced (table has only the 4 spec columns) |
| §3 Direction (composed tools) | Recorded in spec; no code |
| §4.1 Schema (CHECK, FK, PK, index) | Task 1 |
| §4.2 Worker change (thread thoughtId, batched INSERT) | Tasks 3, 4 |
| §4.3 No transaction wrapping | Honoured |
| §4.4 Delete-then-insert | Task 4 |
| §7 Testing (happy, re-extraction, CHECK, cascade) | Tasks 2, 5, 6 |

No gaps.

**Placeholder scan:** no "TBD" / "TODO" / "similar to" / "appropriate" / "as needed" in any subagent prompt. Every prompt is self-contained, with complete code and exact commands.

**Type / name consistency:**
- `writeToGraph(extraction, thoughtId)` — same signature in Task 3 and Task 4.
- `thought_id` (DB column / loop variable) vs `thoughtId` (TS parameter) — context-appropriate snake_case at the DB boundary, camelCase in TS.
- `entity_mentions` table, columns `(thought_id, entity_label, entity_name, created_at)`, index `idx_entity_mentions_entity` — same across all tasks.
- Helpers `captureThought`, `waitForExtraction`, `mcpCall`, `sleep` — defined once in Task 2, reused unchanged in Tasks 5 and 6.
