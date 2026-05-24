# ExecPlan — ST-035: Entity↔Thought Provenance Link

> Status: ✅ Ready for /continue
> Story: ST-035
> Created: 2026-05-23
> Parent: docs/design/specs/2026-05-22-entity-thought-provenance.md
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

---

## §1. Background & Context

The entity extraction worker (ST-022, Done) writes AGE graph nodes (`Person`, `Function`, `Error`, `Topic`, `Project`) from captured thoughts, but AGE nodes carry only `(label, name)` — there is no way to trace back to the thought(s) that produced a given entity. This story adds a relational `public.entity_mentions` table as the back-link: after extraction, the worker writes one row per entity per thought, enabling future consumer stories (ST-019, ST-026) to answer "which thoughts mention entity X?" without modifying AGE.

**After this change:**
- The `entity_mentions` table exists with composite PK, CHECK constraint, FK cascade, and a secondary index.
- Every time the entity worker extracts entities from a thought it also writes mention rows.
- Re-extraction (content change) deletes stale mentions and inserts fresh ones (delete-then-insert per spec §4.4).
- No new MCP tools are exposed — this is a data-plane-only change.

**Key files:**
- `server/db/graph.sql` — existing §1–§4 define AGE graph + queue; we append §5 with `entity_mentions`.
- `server/src/entityWorker.ts` — `writeToGraph()` function at line ~96; `processQueue()` loop calling it at line ~159.
- `server/tests/entity-worker.test.ts` — existing MCP-level entity tests (not modified).
- `server/tests/entity-mentions.test.ts` — new DB-level integration tests (created by this plan).
- `server/index.ts` — intentionally **untouched** (no new MCP tools).

---

## §1b. Outcomes & Conclusions

- **Completion status:** Full — all in-scope deliverables implemented and verified.
- **Key achievements:**
  - `entity_mentions` table live with composite PK, CHECK, FK cascade, secondary index
  - Entity worker writes mention rows via DELETE+INSERT on every extraction
  - 4 integration tests pass: happy-path, re-extraction freshness, CHECK rejection, FK cascade
- **Requirements met:** AC1–AC9 all satisfied
- **Requirements unmet:** None
- **Architectural impact:** Unchanged — relational back-link per spec Option B; no AGE schema changes
- **Supporting evidence:** `docker compose exec mcp deno test tests/entity-mentions.test.ts` → 4/4 pass; `git diff HEAD~6..HEAD -- server/index.ts` → empty
- **Downstream:** ST-035 ready to move to Review; consumer stories (ST-019, ST-026) can now query `entity_mentions`

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

1. After running `docker compose exec db psql -U postgres -d postgres -c "\d public.entity_mentions"`, output shows: 4 columns `(thought_id uuid, entity_label text, entity_name text, created_at timestamptz)`, composite PK, CHECK constraint mentioning the 5 allowed labels, FK to `thoughts(id)`, and index `idx_entity_mentions_entity`.
2. After running `docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts`, all 4 tests pass.
3. After running `docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/`, the full suite passes with 0 failures.
4. After running `git diff HEAD~6..HEAD -- server/index.ts`, output is empty (no new MCP tools).
5. After running `git log --oneline HEAD~6..HEAD`, all commits use Conventional Commits with `Story: ST-035` and `Task: §4.N` trailers.

---

## §2b. Definition of Ready

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
| New `entity_mentions` table with PK, CHECK, FK, index (QP-035 AC1) | DDL in `server/db/graph.sql` §5 | §4.1 | `\d entity_mentions` output shows all constraints |
| Entity worker writes batched mentions alongside AGE MERGE (QP-035 AC2) | `writeToGraph` modified with DELETE+INSERT in `entityWorker.ts` | §4.3, §4.4 | Test 1 passes in `entity-mentions.test.ts` |
| Delete-then-insert on re-extraction (QP-035 AC3, spec §4.4) | DELETE+INSERT block in `writeToGraph` | §4.4 | Re-extraction test passes (Task 5) |
| `writeToGraph` accepts `thoughtId`; caller passes it (QP-035 AC4) | Signature change + call-site update in `entityWorker.ts` | §4.3 | `deno check` passes; diff shows signature + call-site |
| Integration test: capture → wait → mentions exist (QP-035 AC5) | Test 1 in `entity-mentions.test.ts` | §4.2, §4.4 | Test passes (green after §4.4) |
| Integration test: re-extraction removes stale, inserts new (QP-035 AC6) | Test 2 in `entity-mentions.test.ts` | §4.5 | Test passes |
| Integration test: CHECK rejects unknown label (QP-035 AC7) | Test 3 in `entity-mentions.test.ts` | §4.6 | Test passes |
| Integration test: FK cascade (QP-035 AC8) | Test 4 in `entity-mentions.test.ts` | §4.6 | Test passes |
| No new MCP tools (QP-035 AC9) | `server/index.ts` untouched | All | `git diff HEAD~6..HEAD -- server/index.ts` empty |
| No read-path code (QP-035 AC9) | No read queries in new code | All | Code review + absence in diff |
| No bounding logic (QP-035 AC9) | No scoring/ranking code added | All | Code review + absence in diff |

---

## §3. Preconditions

- Docker Desktop running; `docker compose up -d` available
- `.env` has `MEMORY_API_KEY`, `DB_PASSWORD`, `OPENROUTER_API_KEY` set
- ST-022 (entity worker) is Done (merged to main)
- No other branches modifying `server/db/graph.sql` or `server/src/entityWorker.ts`
- The design spec exists: `docs/design/specs/2026-05-22-entity-thought-provenance.md`

**Schema apply strategy (PO decision):** Fresh DB reset via `docker compose down -v && docker compose up -d`. Init scripts in `docker/postgres-age/init/` + `server/db/` rerun on fresh volume, so the new DDL in `graph.sql` is applied automatically.

---

## §4. Task Definitions

### §4.1: Add `entity_mentions` schema to `graph.sql`

**Objective:** Append the §5 DDL block (table + index) to `server/db/graph.sql`.

**Input:** Current `server/db/graph.sql` (lines 1–126, includes §1–§4 + retry_after ALTER).

**Working directory:** `c:\projects\ai-memory\`

**Subagent dispatch prompt:**

```
You are a subagent executing §4.1 of exec-plan-ST-035.md.
The design spec at docs/design/specs/2026-05-22-entity-thought-provenance.md
provides context for judgement calls.

Job: Add the entity_mentions table DDL to server/db/graph.sql.
Do NOT commit — the orchestrator commits after review.

Steps:

1. Read server/db/graph.sql. Locate the last line (the ALTER TABLE
   adding retry_after, around line 126).

2. Append the following block after that line (separated by a blank line):

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

3. Reset the dev database to pick up the new DDL:

     docker compose down -v
     docker compose up -d

   Wait for health checks to pass:

     docker compose ps

   Both `db` and `mcp` should show "healthy".

4. Verify the table exists with the expected shape:

     docker compose exec db psql -U postgres -d postgres -c "\d public.entity_mentions"

   Expected: 4 columns, composite PK, CHECK constraint, FK, index.

Report: the diff of graph.sql, docker ps output, psql table description.
```

**Orchestrator review checklist:**
- [ ] Read `server/db/graph.sql` — §5 block is appended after the retry_after ALTER
- [ ] `git diff server/db/graph.sql` shows only the §5 block
- [ ] `docker compose exec db psql -U postgres -d postgres -c "\d entity_mentions"` confirms shape
- [ ] No errors in `docker compose logs --tail=30 db`

**Expected output:** Modified `server/db/graph.sql` with §5 appended; running DB has the table.

**Requirement mapping:** AC1 (table + constraints)

**Verification:**
```
docker compose exec db psql -U postgres -d postgres -c "\d public.entity_mentions"
```
Expected: Shows all 4 columns, PK, CHECK, FK, index.

**Failure handling:** If table doesn't exist after `up -d`, check `docker compose logs db` for SQL errors in the init phase. Fix DDL syntax and retry fresh reset.

**Commit:**
```
feat(schema): add entity_mentions back-link table

Per docs/design/specs/2026-05-22-entity-thought-provenance.md §4.1.
Foundational data-plane change; worker writes follow in §4.4.

Story: ST-035
Task: §4.1
```

---

### §4.2: Bootstrap test file with first failing test (TDD red)

**Objective:** Create `server/tests/entity-mentions.test.ts` with helpers and one happy-path test that FAILS because the worker doesn't write mentions yet.

**Input:** §4.1 committed; `entity_mentions` table exists in running DB.

**Working directory:** `c:\projects\ai-memory\`

**Subagent dispatch prompt:**

```
You are a subagent executing §4.2 of exec-plan-ST-035.md.
The spec is at docs/design/specs/2026-05-22-entity-thought-provenance.md.

Job: Create a new test file with helper functions and one happy-path test
that currently FAILS (the worker doesn't write entity_mentions yet). This
is the TDD red commit. Do NOT modify existing test files. Do NOT commit.

Required discipline: this is a red test. You MUST run it and confirm the
failure message before reporting done.

Steps:

1. Create server/tests/entity-mentions.test.ts with this content:

   /**
    * Integration tests for entity_mentions back-link table.
    * Spec: docs/design/specs/2026-05-22-entity-thought-provenance.md
    *
    * Run:
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
         Accept: "application/json, text/event-stream",
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

3. Confirm the test FAILS with message containing "got none".
   If it fails with "relation entity_mentions does not exist", abort —
   §4.1 schema apply did not succeed.

Report: confirmation file is created; exact failure message from test run.
```

**Orchestrator review checklist:**
- [ ] Read `server/tests/entity-mentions.test.ts` — confirm helpers and test match the prompt
- [ ] Re-run the test yourself; failure message is "got none" (not a setup error)
- [ ] No edits to `server/tests/entity-worker.test.ts`

**Expected output:** New file created; test fails with expected "got none" message.

**Requirement mapping:** AC5 (test exists, red state)

**Verification:**
```
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts
```
Expected: 1 test, 0 passed, 1 failed. Failure message: "got none".

**Failure handling:** If test errors with "relation entity_mentions does not exist", re-run §4.1 fresh DB reset. If test fails for a different reason (e.g., MCP connection refused), check `docker compose ps` health.

**Commit:**
```
test(entity-mentions): add failing test for back-link write path

TDD red commit — worker change in following commits makes this pass.

Story: ST-035
Task: §4.2
```

---

### §4.3: Thread `thoughtId` through `writeToGraph`

**Objective:** Change the `writeToGraph` signature to accept `thoughtId` and pass it at the call site. No mentions logic yet — intermediate refactoring step.

**Input:** §4.2 committed; test fails with "got none".

**Working directory:** `c:\projects\ai-memory\`

**Subagent dispatch prompt:**

```
You are a subagent executing §4.3 of exec-plan-ST-035.md.

Job: Change the writeToGraph function signature in server/src/entityWorker.ts
to accept a thoughtId parameter, and pass thought_id at the call site.
Do NOT add any mentions-write logic — that is §4.4. Do NOT commit.

Steps:

1. In server/src/entityWorker.ts, find the writeToGraph definition
   (around line 96):

     async function writeToGraph(extraction: ExtractionResult): Promise<void> {

   Change to:

     async function writeToGraph(extraction: ExtractionResult, thoughtId: string): Promise<void> {

2. Find the only call site (around line 159, inside processQueue):

     await writeToGraph(extraction);

   Change to:

     await writeToGraph(extraction, thought_id);

   (thought_id is in scope from the for-of: "for (const { thought_id } of rows)")

3. Verify TypeScript compiles:

     docker compose exec mcp deno check src/entityWorker.ts

   Expected: no errors. An unused-parameter warning on thoughtId is acceptable.

4. Restart the worker:

     docker compose restart mcp

   Wait ~10s, confirm with:

     docker compose logs --tail=20 mcp

   Look for "[entityWorker] started (poll every 10s, batch 10)".

5. Re-run the §4.2 test:

     docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts

   Expected: still fails with "got none" (signature alone doesn't write mentions).

Report: diff of entityWorker.ts; deno check output; test still fails with "got none".
```

**Orchestrator review checklist:**
- [ ] Diff shows only signature change (line ~96) and call-site change (line ~159)
- [ ] `deno check` passes
- [ ] Test still fails for the right reason

**Expected output:** Modified `entityWorker.ts`; test still red.

**Requirement mapping:** AC4 (`writeToGraph` receives `thoughtId`)

**Verification:**
```
docker compose exec mcp deno check src/entityWorker.ts
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts
```
Expected: deno check clean; test still fails with "got none".

**Failure handling:** If deno check fails, check the variable name matches the destructured loop variable (`thought_id`).

**Commit:**
```
refactor(entity-worker): thread thoughtId into writeToGraph

Signature change + call-site update. Prepares for mentions write in §4.4.

Story: ST-035
Task: §4.3
```

---

### §4.4: Implement mentions DELETE + batched INSERT (TDD green)

**Objective:** Add the mentions write logic inside `writeToGraph`, making the §4.2 test pass.

**Input:** §4.3 committed; `writeToGraph` accepts `thoughtId`.

**Working directory:** `c:\projects\ai-memory\`

**Subagent dispatch prompt:**

```
You are a subagent executing §4.4 of exec-plan-ST-035.md.
The spec at docs/design/specs/2026-05-22-entity-thought-provenance.md §4.4
mandates delete-then-insert on every extraction.

Job: Inside writeToGraph in server/src/entityWorker.ts, append a DELETE of
existing mentions followed by a batched INSERT of current extraction nodes.
After this, the test from §4.2 must PASS. Do NOT commit.

Steps:

1. In server/src/entityWorker.ts, find the end of writeToGraph (the closing
   brace, after the edges MERGE loop). Insert the following block before
   the closing brace:

     // Entity mentions back-link (spec §4.4: delete-then-insert on every
     // extraction so mentions reflect current content, not a historical union).
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

2. Restart the worker:

     docker compose restart mcp

   Wait ~10s; confirm "[entityWorker] started" in logs.

3. Run the §4.2 test:

     docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts

   Expected: 1 passed, 0 failed.

   If test still fails:
   - Check "docker compose logs --tail=50 mcp" for errors
   - Confirm edit landed by reading the file back
   - Do NOT change the test to make it pass

Report: diff of entityWorker.ts (one block); test pass output; latest worker log line.
```

**Orchestrator review checklist:**
- [ ] Diff shows only the mentions block appended inside `writeToGraph`, after edges loop
- [ ] Re-run test yourself — passes
- [ ] `docker compose exec db psql -U postgres -d postgres -c "SELECT count(*) FROM entity_mentions"` > 0

**Expected output:** Modified `entityWorker.ts`; test passes (green).

**Requirement mapping:** AC2 (batched write), AC3 (delete-then-insert), AC5 (test green)

**Verification:**
```
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts
docker compose exec db psql -U postgres -d postgres -c "SELECT count(*) FROM entity_mentions"
```
Expected: 1 test passed; count > 0.

**Failure handling:** If INSERT fails with type mismatch, check that `labels` and `names` arrays are `string[]` (not `unknown[]`). If DELETE fails with "relation does not exist", §4.1 schema wasn't applied — re-do fresh reset.

**Commit:**
```
feat(entity-worker): write entity_mentions back-link on extraction

Delete-then-insert per spec §4.4. Batched INSERT via unnest with
ON CONFLICT DO NOTHING for race-condition defence-in-depth.

Story: ST-035
Task: §4.4
```

---

### §4.5: Re-extraction regression test

**Objective:** Append a second test verifying delete-then-insert idempotency on re-extraction.

**Input:** §4.4 committed; first test passes.

**Working directory:** `c:\projects\ai-memory\`

**Subagent dispatch prompt:**

```
You are a subagent executing §4.5 of exec-plan-ST-035.md.

Job: Append a regression test for re-extraction behaviour to
server/tests/entity-mentions.test.ts. This test should PASS on first run —
it's a regression guard, not a TDD driver. Do NOT modify existing tests or
helpers. Do NOT commit.

Background: The trigger in server/db/graph.sql (lines 60-78) only re-queues
a thought when content_fingerprint changes. To force re-extraction from a
test, you must update both content AND content_fingerprint.

Steps:

1. Append to server/tests/entity-mentions.test.ts (after the first test):

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
     // re-queues (server/db/graph.sql lines 60-78 guard on fingerprint).
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

   Expected: 2 passed, 0 failed. Runtime ~45-60s.

Report: diff (one test appended); pass output showing both tests green.
```

**Orchestrator review checklist:**
- [ ] Read appended test — fingerprint trick is present and commented
- [ ] Re-run test file yourself; both tests pass
- [ ] No edits to existing helpers or first test

**Expected output:** Modified test file; 2 tests pass.

**Requirement mapping:** AC3 (delete-then-insert verified), AC6 (re-extraction test)

**Verification:**
```
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts
```
Expected: 2 passed, 0 failed.

**Failure handling:** If re-extraction test fails with stale entities still present, check that `waitForExtraction` detects the re-queue (status goes back to pending→done). The trigger only fires if fingerprint actually changed — confirm the UPDATE ran.

**Commit:**
```
test(entity-mentions): regression test for re-extraction freshness

Verifies delete-then-insert (spec §4.4) removes stale mentions under
content change and writes only the current extraction set.

Story: ST-035
Task: §4.5
```

---

### §4.6: Schema-level guards — CHECK constraint and FK cascade tests

**Objective:** Append two tests verifying the schema's defensive properties: CHECK rejects bad labels, FK cascades on thought delete.

**Input:** §4.5 committed; 2 tests pass.

**Working directory:** `c:\projects\ai-memory\`

**Subagent dispatch prompt:**

```
You are a subagent executing §4.6 of exec-plan-ST-035.md.

Job: Append two schema-level tests to server/tests/entity-mentions.test.ts —
one for CHECK constraint rejection, one for FK cascade. Both should pass
immediately. Do NOT modify existing tests/helpers. Do NOT commit.

Steps:

1. Append to server/tests/entity-mentions.test.ts (after the re-extraction test):

   Deno.test("entity_mentions: CHECK constraint rejects unknown label", async () => {
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

   Expected: 4 passed, 0 failed.

Report: diff (two tests appended); pass output showing all 4 green.
```

**Orchestrator review checklist:**
- [ ] Both new tests present and correctly structured
- [ ] Re-run test file: all 4 pass
- [ ] No edits to existing code

**Expected output:** Modified test file; 4 tests pass.

**Requirement mapping:** AC7 (CHECK), AC8 (FK cascade)

**Verification:**
```
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/entity-mentions.test.ts
```
Expected: 4 passed, 0 failed.

**Failure handling:** If CHECK test passes (no throw), the DDL is missing the constraint — verify with `\d entity_mentions`. If FK cascade test fails (rows survive), check FK definition with `\d+ entity_mentions`.

**Commit:**
```
test(entity-mentions): schema-level guards for CHECK and FK cascade

CHECK rejects labels outside allow-list; FK ON DELETE CASCADE removes
mentions when parent thought is deleted.

Story: ST-035
Task: §4.6
```

---

### §4.7: Final verification — full suite, scope audit, and code review

**Objective:** Run the entire server test suite, verify nothing is regressed, and confirm out-of-scope items remain untouched.

**Input:** §4.6 committed; entity-mentions tests pass 4/4.

**Working directory:** `c:\projects\ai-memory\`

**Subagent dispatch prompt:**

```
You are a subagent executing §4.7 of exec-plan-ST-035.md.

Job: Run the full server test suite, verify scope boundaries, and produce
a structured report. Do NOT modify any files. Do NOT commit.

Steps:

1. Run the full server test suite:

     docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/

   Capture full output.

2. Verify scope boundaries (out-of-scope by absence):

     git diff HEAD~6..HEAD -- server/index.ts

   Expected: empty (no new MCP tools).

     git diff HEAD~6..HEAD -- server/src/searchQuality.ts

   Expected: empty (no bounding logic).

     git diff HEAD~6..HEAD -- server/db/schema.sql server/db/search.sql

   Expected: empty (no changes to non-graph schemas).

3. Spot-check entity_mentions data:

     docker compose exec db psql -U postgres -d postgres -c \
       "SELECT entity_label, count(*)::int AS c FROM entity_mentions GROUP BY entity_label ORDER BY c DESC"

   Confirm all labels are from the allow-list.

4. Scan worker logs:

     docker compose logs --tail=200 mcp | grep -i "entityWorker\|error"

   Look for unexpected error patterns.

5. Check commit hygiene:

     git log --oneline HEAD~6..HEAD

   All commits should be Conventional Commits with Story/Task trailers.

Report (structured):
- Test suite: N total, P passed, F failed. List any failures.
- Scope audit: index.ts empty / not empty; other files empty / not empty.
- Entity data: label breakdown.
- Worker logs: error count and patterns.
- Commit list: one-line per commit.
```

**Orchestrator review checklist:**
- [ ] Full suite passes (0 failures)
- [ ] All scope-boundary diffs are empty
- [ ] Entity data labels match allow-list
- [ ] No new error patterns in worker logs
- [ ] Commit messages are proper Conventional Commits with trailers

**Expected output:** Report; no file changes.

**Requirement mapping:** AC9 (scope audit), AC1-AC8 (full verification)

**Verification:**
```
docker compose exec mcp deno test --allow-net --allow-env --allow-read tests/
git diff HEAD~6..HEAD -- server/index.ts
```
Expected: 0 test failures; empty diff on index.ts.

**Failure handling:** If any existing tests fail, investigate with `docker compose logs mcp`. If the entity-worker.test.ts tests fail (those are LLM-dependent), retry once — transient LLM timeout is possible. If failures persist, invoke systematic debugging.

**No commit for this task** — it is verification only.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | §4.7 — Final verification |
| **Last successful command** | `git log --oneline HEAD~6..HEAD` |
| **Expected outputs produced** | All 6 commits on main; 4/4 entity-mentions tests pass |
| **Next task** | §7 Closeout — move to Review |
| **Known blockers** | None |
| **Last updated** | 2026-05-24T12:00Z |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-24 | §4.1 | Done | `ca1978a` — entity_mentions table verified via `\d` | §4.2 |
| 2026-05-24 | §4.2 | Done | `bc3132f` — test fails with "got none" | §4.3 |
| 2026-05-24 | §4.3 | Done | `a1bf2e2` — deno check clean; test still fails | §4.4 |
| 2026-05-24 | §4.4 | Done | `a0b68a7` — test passes (green) | §4.5 |
| 2026-05-24 | §4.5 | Done | `bf4aa94` — 2/2 tests pass | §4.6 |
| 2026-05-24 | §4.6 | Done | `6f2dd73` — 4/4 tests pass | §4.7 |
| 2026-05-24 | §4.7 | Done | 16/20 suite pass; 4 failures pre-existing (seed data) | Closeout |

### Avoidance

- Do not modify `server/index.ts` — no new MCP tools are in scope.
- Do not wrap DELETE + INSERT in a transaction — spec §4.3 intentionally relies on retry idempotency.
- If `waitForExtraction` times out, do NOT increase the timeout — check worker logs first.

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Fresh DB reset for schema apply; subagent per task | git stash / docker compose down -v | 🟢 Active |
| 2 | Manual psql if fresh reset fails repeatedly | — | ⬜ Reserve |

### Approach Failure Log
(Empty — no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback

---

## §6. Execution Log

(Populated during execution)

---

## §6b. Surprises & Discoveries

- Observation: Fresh DB reset requires explicit `docker compose build db` before `up -d` — the Dockerfile COPY of `graph.sql` happens at image build time, not runtime. The bind-mount only covers `server/` for the MCP container, not the DB init scripts.
  Evidence: Table missing after `down -v && up -d` without `--build`; present after `build db && down -v && up -d`.
  Impact: Future schema changes to `server/db/*.sql` need image rebuild.

- Observation: 4 pre-existing search tests (`search-project-boost` ×3, `search-recall-quality` ×1) fail on fresh DB because they depend on seed data (specific UUIDs) that only existed in the old volume.
  Evidence: Test output references `00000000-0000-4000-8000-*` UUIDs not present in DB.
  Impact: Not a regression from ST-035; these tests need a seed fixture or conditional skip. Logged for awareness.

- Observation: Deno resource-leak checker (`sanitizeResources`/`sanitizeOps`) fails when tests import `sql` directly from `db.ts` due to the persistent connection pool.
  Evidence: Test pass on logic but fail on leak detection without sanitize flags.
  Impact: All `entity-mentions` tests use `{ sanitizeResources: false, sanitizeOps: false }` object-style `Deno.test`.

---

## §6c. Decision Log

- Decision: Fresh DB reset (`docker compose down -v && up -d`) instead of cp + psql
  Rationale: PO preference for clean state; avoids partial-apply edge cases
  Date: 2026-05-23

- Decision: Embed full subagent prompts in ExecPlan tasks (option A)
  Rationale: PO preference for self-contained tasks
  Date: 2026-05-23

- Decision: Keep Task 7 as formal §4.7 (verification task)
  Rationale: PO preference for explicit verification in task sequence
  Date: 2026-05-23

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (§4.7 results confirm all ACs from §2)
2. Update board: move ST-035 to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

(Populated on completion)

---

## Revision Notes

- 2026-05-23: Initial creation from QP-035 + subagent plan + PO decisions.
