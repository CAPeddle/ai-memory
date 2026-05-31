# ExecPlan — ST-039: Embedding Resilience

> Status: ⬜ Not Ready
> Story: ST-039
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

The `capture_thought` tool in `server/index.ts` generates embeddings fire-and-forget:

```typescript
getEmbedding(content).then((emb) =>
  sql`UPDATE thoughts SET embedding = ... WHERE id = ${insertResult.id}`
).catch((err) => console.error(`[capture_thought] embedding update failed for ${insertResult.id}:`, err));
```

When this fails (OpenRouter rate limit, network timeout, API outage), the thought is stored without an embedding and **there is no recovery mechanism**. The vector search lane will never surface it.

Additionally, there is no record of which embedding model was used — if OpenAI releases `text-embedding-3-large` or we switch models, there's no way to identify which thoughts need re-embedding.

This story adds:
1. A `needs_embedding` boolean column (default `true`) that marks thoughts awaiting embeddings.
2. An `embedding_model` text column recording which model produced the embedding.
3. A retry mechanism: on capture, embedding is attempted; on failure, the thought remains with `needs_embedding = true`.
4. A backfill sweep (periodic or manual) that re-attempts embedding for all `needs_embedding = true` rows.

**Key files:**
- `server/index.ts` — `capture_thought` handler, `getEmbedding()` function
- `server/db/schema.sql` — current schema (no `needs_embedding` or `embedding_model` column)
- `docker/postgres-age/` — Docker init scripts directory

**Architecture decision:** This story uses a **standalone idempotent DDL script** (`server/db/002_needs_embedding.sql`), NOT the migration framework from ST-042. This allows the critical data-loss fix to ship independently of infrastructure work.

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- After capturing a thought, if embedding succeeds: `needs_embedding = false` and `embedding_model = 'text-embedding-3-small'` in the DB row.
- After capturing a thought, if embedding fails (simulated): `needs_embedding = true`, `embedding IS NULL`, `embedding_model IS NULL`.
- After running the backfill function manually, previously-failed thoughts get embedded and `needs_embedding` flips to `false`.
- Existing thoughts (inserted before this change) have `needs_embedding = false` if they already have an embedding, or `needs_embedding = true` if embedding is NULL.
- All existing tests continue to pass.

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

Status: ⬜ Not ready — requires /plan

---

## §2c. Plan Review Notes

(Empty — populated by /continue when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Thoughts with failed embeddings are recoverable via backfill (QP-038 AC-2) | `needs_embedding` column + backfill function in `server/index.ts` or separate module | Task 4.1, 4.2, 4.3 | Test: simulate failure → backfill → embedding populated |
| Embedding model version is recorded per thought (QP-038 AC-17) | `embedding_model` column populated on successful embed | Task 4.1, 4.2 | Test: after capture, SELECT embedding_model returns 'text-embedding-3-small' |

---

## §3. Preconditions

- Docker Compose dev + test stacks running
- `.env` with valid `OPENROUTER_API_KEY`
- No prior migration framework needed (standalone DDL)

**DDL template** (to be created as `server/db/002_needs_embedding.sql`):
```sql
-- Standalone idempotent DDL — safe to run multiple times
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS needs_embedding boolean NOT NULL DEFAULT true;
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS embedding_model text;

-- Backfill existing rows: those with embeddings don't need re-embedding
UPDATE public.thoughts SET needs_embedding = false WHERE embedding IS NOT NULL AND needs_embedding = true;

-- Index for backfill query performance
CREATE INDEX IF NOT EXISTS idx_thoughts_needs_embedding ON public.thoughts(needs_embedding) WHERE needs_embedding = true;
```

---

## §4. Task Definitions

### Task 4.1: Create DDL script and apply to databases

**Objective:** Add `needs_embedding` and `embedding_model` columns to the thoughts table.

**Input:** Current schema in `server/db/schema.sql` — no such columns exist.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/db/002_needs_embedding.sql` with the DDL from §3 above.

2. Add a `COPY` line to `docker/postgres-age/Dockerfile` (or the init script mechanism) so that new databases get this DDL on first init. Check how existing DDL files (`schema.sql`, `graph.sql`, `search.sql`) are loaded — likely via `/docker-entrypoint-initdb.d/`. Place `002_needs_embedding.sql` there with appropriate ordering (after `schema.sql`).

3. Apply to the running dev database:
   ```powershell
   docker compose exec db psql -U postgres -d memory -f /docker-entrypoint-initdb.d/002_needs_embedding.sql
   ```

4. Apply to the test database:
   ```powershell
   docker compose --profile test exec db-test psql -U postgres -d memory_test -f /docker-entrypoint-initdb.d/002_needs_embedding.sql
   ```

**Expected output:** Both databases have the new columns. Existing rows with embeddings have `needs_embedding = false`.

**Requirement mapping:** §2d rows 1 and 2

**Verification:**
```powershell
docker compose exec db psql -U postgres -d memory -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'thoughts' AND column_name IN ('needs_embedding', 'embedding_model');"
```
Expected: Two rows showing `needs_embedding` (boolean, default true) and `embedding_model` (text).

```powershell
docker compose exec db psql -U postgres -d memory -c "SELECT count(*) AS missing FROM thoughts WHERE embedding IS NOT NULL AND needs_embedding = true;"
```
Expected: `0` (backfill UPDATE already ran).

**Failure handling:** If columns already exist (idempotent DDL), the script succeeds silently. If the Docker init directory doesn't match expected path, check `docker-compose.yml` volumes for the db service.

---

### Task 4.2: Update `capture_thought` to track embedding status

**Objective:** On successful embedding, set `needs_embedding = false` and record the model. On failure, leave `needs_embedding = true`.

**Input:** `server/index.ts` — current fire-and-forget pattern.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Locate the `capture_thought` handler in `server/index.ts` (around line 230). Find the fire-and-forget embedding block:
   ```typescript
   getEmbedding(content).then((emb) =>
     sql`UPDATE thoughts SET embedding = ${sql.unsafe(`'[${emb.join(",")}]'`)}::vector WHERE id = ${insertResult.id}`
   ).catch((err) => console.error(`[capture_thought] embedding update failed for ${insertResult.id}:`, err));
   ```

2. Replace with:
   ```typescript
   getEmbedding(content).then(async (emb) => {
     await sql`
       UPDATE thoughts
       SET embedding = ${sql.unsafe(`'[${emb.join(",")}]'`)}::vector,
           needs_embedding = false,
           embedding_model = 'text-embedding-3-small'
       WHERE id = ${insertResult.id}
     `;
   }).catch((err) => {
     console.error(`[capture_thought] embedding failed for ${insertResult.id} (will retry via backfill):`, err);
     // needs_embedding remains true (column default) — backfill will retry
   });
   ```

3. The INSERT statement for `capture_thought` doesn't need changes — the default `needs_embedding = true` is correct (embedding hasn't been attempted yet at INSERT time).

**Expected output:** Successful embeds set `needs_embedding = false` + `embedding_model`; failures leave the row recoverable.

**Requirement mapping:** §2d rows 1 and 2

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/embedding-resilience.test.ts
```
(Test written in Task 4.4)

**Failure handling:** If the UPDATE fails (e.g. row was deleted between INSERT and UPDATE), the catch block logs it. This is acceptable — the row no longer exists, so no data is lost.

---

### Task 4.3: Add embedding backfill function

**Objective:** Provide a mechanism to retry embeddings for all thoughts where `needs_embedding = true`.

**Input:** The `getEmbedding()` function in `server/index.ts`.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/src/embeddingBackfill.ts`:
   ```typescript
   import { sql } from "./db.ts";

   const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
   const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
   const BATCH_SIZE = 20;
   const RETRY_DELAY_MS = 1000;

   async function getEmbedding(text: string): Promise<number[]> {
     const r = await fetch(`${OPENROUTER_BASE}/embeddings`, {
       method: "POST",
       headers: {
         Authorization: `Bearer ${OPENROUTER_API_KEY}`,
         "Content-Type": "application/json",
       },
       body: JSON.stringify({
         model: "openai/text-embedding-3-small",
         input: text,
         dimensions: 512,
       }),
     });
     if (!r.ok) {
       const msg = await r.text().catch(() => "");
       throw new Error(`OpenRouter embeddings failed: ${r.status} ${msg}`);
     }
     const d = await r.json();
     return d.data[0].embedding;
   }

   export async function backfillEmbeddings(): Promise<{ processed: number; failed: number }> {
     let processed = 0;
     let failed = 0;

     while (true) {
       const rows = await sql`
         SELECT id, content FROM thoughts
         WHERE needs_embedding = true AND active = true
         ORDER BY created_at ASC
         LIMIT ${BATCH_SIZE}
       `;

       if (!rows.length) break;

       for (const row of rows) {
         try {
           const emb = await getEmbedding(row.content as string);
           await sql`
             UPDATE thoughts
             SET embedding = ${sql.unsafe(`'[${emb.join(",")}]'`)}::vector,
                 needs_embedding = false,
                 embedding_model = 'text-embedding-3-small'
             WHERE id = ${row.id}
           `;
           processed++;
         } catch (err) {
           console.error(`[backfill] failed for ${row.id}:`, (err as Error).message);
           failed++;
           // Don't mark as permanently failed — next backfill run will retry
         }
         // Rate-limit: small delay between items
         await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
       }
     }

     return { processed, failed };
   }
   ```

2. Register a `backfill_embeddings` MCP tool in `server/index.ts` (after the existing tool registrations):
   ```typescript
   import { backfillEmbeddings } from "./src/embeddingBackfill.ts";

   server.registerTool(
     "backfill_embeddings",
     {
       title: "Backfill Embeddings",
       description: "Retry embedding generation for all thoughts that failed initial embedding. Returns count of processed and failed items.",
       annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
       inputSchema: {},
     },
     async () => {
       const result = await backfillEmbeddings();
       return {
         content: [{ type: "text" as const, text: JSON.stringify(result) }],
       };
     }
   );
   ```

**Design decision:** The backfill is exposed as an MCP tool (not just a cron/interval) so agents and operators can trigger it on-demand. A periodic sweep (e.g. every 5 minutes) can be added later but is not in scope for this story.

**Expected output:** Calling `backfill_embeddings` processes all `needs_embedding = true` rows with retries and returns a count.

**Requirement mapping:** §2d row 1

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/embedding-resilience.test.ts
```

**Failure handling:** If OpenRouter is unreachable during backfill, individual items fail but the sweep continues. The function returns the count of failures.

---

### Task 4.4: Write tests

**Objective:** Test the embedding resilience flow end-to-end.

**Input:** Existing test patterns in `server/tests/_helpers/mcpClient.ts`.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/embedding-resilience.test.ts`:
   ```typescript
   import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
   import { callTool, getDbConnection } from "./_helpers/mcpClient.ts";

   Deno.test("capture_thought records embedding_model on success", async () => {
     const result = await callTool("capture_thought", {
       content: `Embedding model test ${Date.now()}`,
       memory_type: "shard",
     });
     assertEquals(result.isError, undefined);

     // Extract ID from response
     const match = result.content[0].text.match(/id: ([a-f0-9-]+)/);
     assertExists(match, "Should return thought ID");
     const id = match![1];

     // Wait briefly for fire-and-forget embedding
     await new Promise((r) => setTimeout(r, 3000));

     const db = getDbConnection();
     const [row] = await db`
       SELECT needs_embedding, embedding_model, embedding IS NOT NULL as has_embedding
       FROM thoughts WHERE id = ${id}
     `;
     assertEquals(row.needs_embedding, false);
     assertEquals(row.embedding_model, "text-embedding-3-small");
     assertEquals(row.has_embedding, true);
     await db.end();
   });

   Deno.test("backfill_embeddings processes pending thoughts", async () => {
     const result = await callTool("backfill_embeddings", {});
     assertEquals(result.isError, undefined);
     // Result is JSON with processed/failed counts
     const data = JSON.parse(result.content[0].text);
     assertEquals(typeof data.processed, "number");
     assertEquals(typeof data.failed, "number");
   });
   ```

2. If `getDbConnection` doesn't exist in the helpers, create a minimal version that connects to the test DB using the `DATABASE_URL` env var (or hard-code `postgres://postgres:postgres@db-test:5432/memory_test`).

**Expected output:** Tests validate that successful embedding sets model+flag, and backfill tool is callable.

**Requirement mapping:** §2d rows 1 and 2 (verification evidence)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/embedding-resilience.test.ts
```
Expected: 2 tests pass.

**Failure handling:** The "records embedding_model" test has a 3-second wait for the async embedding. If the test environment is slow (cold OpenRouter), increase to 5 seconds. If OpenRouter is unreachable from the test container, the test will fail — this is expected and documents the dependency.

---

### Task 4.5: Full test suite + cross-model review

**Objective:** Ensure no regressions and perform the mandatory cross-model review.

**Steps:**

1. Run full test suite:
   ```powershell
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
   ```

2. **Cross-model review checklist:**
   - Does the DDL correctly handle the `DEFAULT true` + backfill `UPDATE` ordering? (Must set default first, then update existing.)
   - Is there a race condition between the INSERT (needs_embedding=true) and the fire-and-forget UPDATE (needs_embedding=false)? (No — same transaction path, UPDATE is strictly after INSERT.)
   - Could the backfill and capture handler conflict? (No — backfill only selects `needs_embedding = true`; by the time backfill runs, a successful capture has already set it false.)
   - Is `embedding_model` hardcoded? (Yes — acceptable for single-model deployments. When a model switch happens, update the constant and run backfill for remaining rows.)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```
Expected: All tests pass.

---

## §5. State Recovery Protocol

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | — |
| **Last successful command** | — |
| **Expected outputs produced** | — |
| **Next task** | Task 4.1 — Create DDL script and apply |
| **Known blockers** | None |
| **Last updated** | — |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| — | — | — | — | — |

### Avoidance

(Append dated entries here.)

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Standalone DDL + needs_embedding flag + backfill tool | git HEAD before first commit | 🟢 Active |

### Approach Failure Log
(Empty)

---

## §6. Execution Log

(Populated during execution)

---

## §6b. Surprises & Discoveries

*(populated during execution)*

---

## §6c. Decision Log

*(populated during execution)*

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

*(populated on completion)*

---

## Revision Notes

- 2026-05-31: Initial ExecPlan created from QP-038 §4.5–§4.7.
