# ExecPlan — ST-045: Worker Idempotency

> Status: ⬜ Not Ready
> Story: ST-045
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md

---

## §1. Background & Context

The entity extraction worker currently tracks processing state via the `entity_extraction_queue` table (status: pending/processing/done/failed). However, if the worker crashes mid-processing (after LLM call, before marking "done"), the thought's queue row is left in "processing" state. On restart, these rows are never re-picked (the worker only selects `status = 'pending'`).

Additionally, there's no column on `thoughts` itself indicating whether entity extraction has completed — meaning there's no efficient way to identify thoughts that were never processed (e.g. those inserted before the entity worker existed, or those whose queue rows were lost).

This story adds:
1. An `entity_extracted` boolean column on `thoughts` (default `false`).
2. Worker sets `entity_extracted = true` after successful processing.
3. Worker only picks thoughts where `entity_extracted = false` (in addition to queue state).
4. This makes re-processing idempotent and crash-safe.

**Depends on:** ST-042 (Migration Framework) — the new column is added via a numbered migration.

**Key files:**
- `server/src/entityWorker.ts` — worker logic
- `server/db/migrations/` — migration directory (from ST-042)

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- After successful entity extraction, `thoughts.entity_extracted = true` for that row.
- Re-processing a thought with `entity_extracted = true` is a no-op.
- Thoughts inserted before this change have `entity_extracted = false` (eligible for processing).
- After a worker crash and restart, previously-stuck rows are re-processed.
- All existing tests pass.

---

## §2b. Definition of Ready

- [x] All tasks have step-by-step instructions
- [x] Architecture and design decisions documented
- [x] Input and expected output specified
- [x] Error handling strategy noted
- [x] No judgment calls required
- [x] Script templates provided
- [x] Requirements mapped in §2d
- [x] Verification steps included
- [x] Observable behaviour criteria

Status: ⬜ Not ready — requires /plan

---

## §2c. Plan Review Notes

(Empty)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Entity worker uses entity_extracted flag for safe replay (QP-038 AC-10 extended, AC-11) | Migration + worker logic update | Task 4.1, 4.2 | Test: crash simulation → restart → row re-processed |

---

## §3. Preconditions

- ST-042 (Migration Framework) must be complete — migrations infrastructure available.
- Docker Compose test stack running.

---

## §4. Task Definitions

### Task 4.1: Create migration for entity_extracted column

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/db/migrations/004_entity_extracted.sql`:
   ```sql
   -- Migration 004: Add entity_extracted flag to thoughts
   -- Enables idempotent entity extraction: worker only processes thoughts
   -- where entity_extracted = false, and sets it true on success.

   ALTER TABLE public.thoughts
     ADD COLUMN IF NOT EXISTS entity_extracted BOOLEAN NOT NULL DEFAULT false;

   -- Backfill: mark thoughts that already have entity_mentions as extracted
   UPDATE public.thoughts t
   SET entity_extracted = true
   WHERE EXISTS (
     SELECT 1 FROM entity_mentions em WHERE em.thought_id = t.id
   ) AND t.entity_extracted = false;

   -- Index for worker query performance
   CREATE INDEX IF NOT EXISTS idx_thoughts_entity_extracted
     ON public.thoughts(entity_extracted) WHERE entity_extracted = false;
   ```

2. On next server restart, the migration framework (ST-042) will apply this automatically.

**Verification:**
```powershell
docker compose --profile test restart mcp-test
docker compose --profile test exec db-test psql -U postgres -d memory_test -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'thoughts' AND column_name = 'entity_extracted';"
```
Expected: One row with `entity_extracted`.

---

### Task 4.2: Update entity worker to use idempotency flag

**Input:** `server/src/entityWorker.ts` — `processQueue()` function.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. In `processQueue()`, modify the batch claim query to also check `entity_extracted`:
   ```typescript
   const rows = await sql`
     UPDATE entity_extraction_queue
     SET status = 'processing', started_at = now(), attempt_count = attempt_count + 1
     WHERE thought_id IN (
       SELECT eq.thought_id FROM entity_extraction_queue eq
       JOIN thoughts t ON t.id = eq.thought_id
       WHERE eq.status = 'pending'
         AND (eq.retry_after IS NULL OR eq.retry_after <= now())
         AND t.entity_extracted = false
       ORDER BY eq.queued_at ASC
       LIMIT ${BATCH_SIZE}
       FOR UPDATE OF eq SKIP LOCKED
     )
     RETURNING thought_id
   `;
   ```

2. After successful processing (after `writeToGraph` and before marking queue "done"), set the flag:
   ```typescript
   // Mark as done in queue AND on the thought itself
   await sql`
     UPDATE entity_extraction_queue
     SET status = 'done', processed_at = now(), last_error = NULL
     WHERE thought_id = ${thought_id}
   `;
   await sql`
     UPDATE thoughts SET entity_extracted = true WHERE id = ${thought_id}
   `;
   ```

3. Add a recovery mechanism at worker startup: reset "processing" rows back to "pending" (these were interrupted by a crash):
   ```typescript
   // At the start of startEntityWorker (or in safePoll's first iteration):
   async function recoverStuckRows(): Promise<void> {
     const result = await sql`
       UPDATE entity_extraction_queue
       SET status = 'pending', started_at = NULL
       WHERE status = 'processing'
     `;
     if (result.count > 0) {
       console.log(`[entityWorker] recovered ${result.count} stuck rows from 'processing' state`);
     }
   }
   ```
   Call `recoverStuckRows()` once at the start of the first `safePoll` call (or in `startEntityWorker`).

**Expected output:** Worker is idempotent — crash → restart → stuck rows recovered and re-processed.

**Requirement mapping:** §2d row 1

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/entity-worker-idempotency.test.ts
```

---

### Task 4.3: Write test

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/entity-worker-idempotency.test.ts`:
   ```typescript
   import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
   import { callTool, getDbConnection } from "./_helpers/mcpClient.ts";

   Deno.test("entity_extracted is set to true after successful extraction", async () => {
     const result = await callTool("capture_thought", {
       content: `Idempotency test ${Date.now()} — TypeScript uses structural typing`,
       memory_type: "shard",
     });
     const match = result.content[0].text.match(/id: ([a-f0-9-]+)/);
     const id = match![1];

     // Wait for entity worker to process
     await new Promise((r) => setTimeout(r, 15000));

     const db = getDbConnection();
     const [row] = await db`SELECT entity_extracted FROM thoughts WHERE id = ${id}`;
     assertEquals(row.entity_extracted, true, "entity_extracted should be true after processing");
     await db.end();
   });
   ```

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/entity-worker-idempotency.test.ts
```

---

### Task 4.4: Full test suite + cross-model review

```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```

**Cross-model review:**
- Does the JOIN in the batch claim query cause lock contention? (Minimal — `FOR UPDATE OF eq SKIP LOCKED` only locks queue rows.)
- Could `entity_extracted = true` be set before `writeToGraph` fails? (No — we set it after writeToGraph succeeds.)
- What happens to thoughts with no extractable entities? (Still marked `entity_extracted = true` — extraction ran, found nothing.)

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Next task** | Task 4.1 |
| **Known blockers** | ST-042 must be complete |

---

## §5c. Approach Ledger

| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | entity_extracted column + recovery on startup | git HEAD | 🟢 Active |

---

## §6. Execution Log

---

## §6b. Surprises & Discoveries

---

## §6c. Decision Log

---

## §7. Compound Step / Closeout

1. Run full verification
2. Update board
3. Present results

---

## §7b. Outcomes & Retrospective

*(populated on completion)*

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.13b.
