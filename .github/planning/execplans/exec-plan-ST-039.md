# ExecPlan — ST-039: Embedding Resilience

> Status: ✅ Ready for /continue
> Story: ST-039
> Created: 2026-06-03
> Approved: 2026-06-03 (PO accepted both §2c deviations)
> Parent: `.github/planning/query-packets/QP-039-embedding-resilience.md` (committed Phase 1 packet)
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

**What you gain after this change:** captured thoughts whose embedding API call fails are no longer silently lost. Today a transient OpenRouter failure leaves a row with `embedding = NULL` **forever**; it never appears in the vector lane of `search` / `search_thoughts`, there is no operator signal, and there is no recovery path. After ST-039, every row that should have an embedding but doesn't is durably marked and reconciled by a background **backfill sweep**, and every successfully embedded row records which model produced it.

**Current state (assume the reader knows nothing):**

The cloud MCP server is a Deno 2.0 / TypeScript app in `server/`. Thoughts are stored in PostgreSQL 15 (`public.thoughts`, defined in [server/db/schema.sql](../../../server/db/schema.sql#L13-L47)). On capture, the `capture_thought` MCP tool ([server/index.ts](../../../server/index.ts#L272-L284)) inserts the row, then computes the embedding **fire-and-forget**:

```ts
// server/index.ts (current — lines ~281-284)
getEmbedding(content).then((emb) =>
  sql`UPDATE thoughts SET embedding = ${sql.unsafe(`'[${emb.join(",")}]'`)}::vector WHERE id = ${insertResult.id}`
).catch((err) => console.error(`[capture_thought] embedding update failed for ${insertResult.id}:`, err));
```

The `.catch` only logs to stderr. On any transient failure (network blip, 5xx, rate limit) the row is committed with `embedding = NULL` and is **never retried**. The vector lane filters `WHERE active = true AND embedding IS NOT NULL` ([server/index.ts:75-76](../../../server/index.ts#L75-L76) and the `search_thoughts` vector CTE), so the row is invisible to semantic search.

`getEmbedding` ([server/index.ts:29-48](../../../server/index.ts#L29-L48)) calls OpenRouter `openai/text-embedding-3-small` with `dimensions: 512`. It is consumed in three places in `index.ts`: the `search` vector lane (line 70), the `search_thoughts` vector lane (line 150), and the capture flow (line 282). The model id string `"openai/text-embedding-3-small"` is currently a literal inside `getEmbedding`.

The `thoughts` table has **no** column to mark a row as needing an embedding, no record of which model embedded it, and no failure bookkeeping.

**How the database schema is applied (critical for this story):**

There is **no migration runner** (ST-042 is not built). Fresh databases are initialised by the Postgres image: [docker/postgres-age/Dockerfile](../../../docker/postgres-age/Dockerfile#L19-L25) `COPY`s SQL into `/docker-entrypoint-initdb.d/`, which Postgres runs **once on an empty data directory**, in lexicographic order:

- `01-extensions.sql` (vector, age)
- `02-schema.sql` (= `server/db/schema.sql` — creates `thoughts`)
- `03-graph.sql` (= `server/db/graph.sql`)

Two databases exist ([docker-compose.yml](../../../docker-compose.yml)):
- **`db`** (dev) — persistent `db_data` volume. Init scripts ran once at first creation and will **not** re-run. New DDL must be applied **manually** via `psql`.
- **`db-test`** (test profile) — `tmpfs`, wiped on every `up`. Init scripts re-run on every `--profile test up`. The `seed` service then loads `server/tests/fixtures/search-quality-corpus.sql` **after** init.

Because the DDL `COPY` happens at **image build time**, adding an init script requires rebuilding the image (`docker compose build`). The `mcp`/`mcp-test` containers have a `./server:/app` bind mount so **TypeScript** changes are live without rebuild, but the **`db` image is not bind-mounted** — SQL init changes need a rebuild.

Database connection identity (used in every psql command): user `ai_memory`, database `ai_memory` (from `docker-compose.yml` `POSTGRES_USER`/`POSTGRES_DB`).

**Terms used in this plan:**
- **Backfill sweep** — a reconciliation pass that selects rows lacking an embedding and attempts to compute one. It is a *poll*, not a reaction to a DB event (there is no DB event for an OpenRouter API-call failure).
- **Sweep-as-retry** — exactly one embedding attempt per row per sweep. The poll cadence (default 60 s) **is** the retry interval. There is no nested in-call backoff.
- **`needs_embedding`** — boolean flag; `true` means "this row should have an embedding but doesn't yet."

This ExecPlan is self-contained: a novice with only this file and the working tree can execute it end-to-end.

---

## §1b. Outcomes & Conclusions

*(Populated during/after execution. Required for completion visibility.)*

- completion status: COMPLETE — all 7 DoD items satisfied
- key findings/achievements: Introduced `needs_embedding`/`embedding_model`/`embedding_attempts`/`embedding_error` columns; standalone idempotent DDL `002_needs_embedding.sql` wired into Docker init; shared `embeddings.ts` module extracted; `embeddingBackfill.ts` implements polling sweep-as-retry with MAX_ATTEMPTS=5 cap; capture success path records model + clears flag; `EMBEDDING_BACKFILL_DISABLED` isolation guard on `mcp-test`; cross-model review (GPT-5.2) found and confirmed fix for a concurrency overwrite defect in the backfill UPDATE predicates
- requirements met vs unmet: all met — AC-2 recovery, AC-2 failure/cap, AC-17 model recorded, idempotent DDL, full suite green (43 passed 0 failed), cross-model PASS
- architectural impact: `public.thoughts` now has four new columns; backfill worker starts alongside entity/consolidation workers at boot; `EMBEDDING_MODEL` is now a single source-of-truth constant in `src/embeddings.ts`; backfill UPDATE guards prevent concurrent-write overwrite
- supporting evidence: full suite `ok | 43 passed | 0 failed`; idempotency re-run exits 0 with NOTICE skips; cross-model PASS recorded in §6c
- downstream changes: ST-042 migration runner should be taught about `002_needs_embedding.sql`; kill-switch `FEATURE_EMBEDDING_BACKFILL` could be folded into a future `Config` module (ST-043)

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

1. **AC-2 (recovery):** After inserting a row with `needs_embedding = true` and `embedding IS NULL` and running `runBackfillSweep({ embed })` with a succeeding stub, `SELECT embedding IS NOT NULL, needs_embedding FROM thoughts WHERE id = $1` returns `(true, false)`.
2. **AC-2 (failure path, still recoverable):** After one sweep where the embed stub throws, the row has `embedding_attempts = 1`, a non-null `embedding_error`, `needs_embedding = true`, and `embedding IS NULL` (i.e. still selectable by a future sweep).
3. **AC-2 (cap):** A row already at `embedding_attempts = 5` is **not** processed by a sweep (its `embedding_attempts` stays `5`, embedding stays `NULL`), proving the attempts cap stops the sweep.
4. **AC-17 (model recorded):** After a successful backfill, `SELECT embedding_model FROM thoughts WHERE id = $1` returns `openai/text-embedding-3-small`.
5. **Idempotent DDL:** Running `server/db/002_needs_embedding.sql` twice against a database produces no error and no duplicate columns/index (`\d public.thoughts` shows each new column exactly once).
6. **Full suite green:** `docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/` passes with 0 failures (no regression to the existing suite).
7. **Cross-model review pass:** A different model reviews the shipped code/tests against §2 and §2d and finds no acceptance-criteria violation (recorded in §6c).

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
- [x] Final task includes a cross-model review step

Status: ✅ Ready — PO approved 2026-06-03 (both §2c deviations accepted).

---

## §2c. Plan Review Notes

**Deliberate deviation from QP-039 (LE-raised, for PO confirmation):**

QP-039's sweep query is `WHERE needs_embedding = true AND embedding_attempts < 5`. This ExecPlan **adds `AND embedding IS NULL`** to that query. Reason: the `seed` service loads the test corpus **after** the init DDL runs, and the corpus INSERTs do not set `needs_embedding`, so all 28 corpus rows end up `needs_embedding = true` **with** a populated embedding. A sweep without the `embedding IS NULL` guard would re-embed corpus rows; in tests a stub embed would overwrite the seeded vectors and make the e2e vector-lane assertions order-dependent and flaky. The guard is also semantically correct — the sweep exists to fill *missing* embeddings, never to overwrite good ones — and is defensive belt-and-suspenders alongside the `needs_embedding` flag. The partial index predicate is left as `WHERE needs_embedding = true` (Postgres filters the residual `embedding IS NULL` from the heap; data volume is tiny). **PO: confirm this strengthening is acceptable.**

**Second test-isolation measure:** `EMBEDDING_BACKFILL_DISABLED=true` is added to the `mcp-test` service env (mirroring `CONSOLIDATION_WORKER_DISABLED`). Without it, the server process running inside `mcp-test` would run its own auto-sweep against the shared `db-test` and, using the **real** OpenRouter embed, could fill the failure-path test rows before the test's stub runs — breaking the AC-2 failure/cap tests.

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| AC-2 — failed embeddings recoverable via backfill (QP-039) | `runBackfillSweep` in `server/src/embeddingBackfill.ts` + `needs_embedding`/`embedding_attempts`/`embedding_error` columns | 4.1, 4.4 | `embedding-backfill.test.ts` "AC-2 recovery" + "AC-2 failure" assertions pass (Task 4.4 verification) |
| AC-2 — attempts cap stops the sweep (QP-039 PO decision) | `MAX_ATTEMPTS = 5` gate in sweep query | 4.1, 4.4 | `embedding-backfill.test.ts` "AC-2 cap" asserts pre-capped row untouched |
| AC-17 — embedding model recorded per thought (QP-039) | `embedding_model` column set to `openai/text-embedding-3-small` on success (backfill + capture) | 4.1, 4.2, 4.4, 4.5 | `embedding-backfill.test.ts` "AC-17" asserts `embedding_model`; capture path sets same literal (code + `deno check`) |
| Idempotent standalone DDL, not migration runner (QP-039 PO decision) | `server/db/002_needs_embedding.sql` using `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` | 4.1 | Applied twice with no error; `\d public.thoughts` shows columns once (Task 4.1 verification) |
| Capture success path sets flag + model (QP-039 behavioural design) | `server/index.ts` capture `.then` UPDATE sets `needs_embedding=false, embedding_model, embedding_error=NULL` | 4.5 | `deno check`; code inspection; full-suite green (no capture regression) |
| Kill-switch without ST-043 framework (QP-039 PO decision) | `FEATURE_EMBEDDING_BACKFILL !== 'false'` + `EMBEDDING_BACKFILL_DISABLED` guards in `startEmbeddingBackfill()` | 4.4, 4.5 | Guard log-line assertion; `docker-compose.yml` `mcp-test` env includes `EMBEDDING_BACKFILL_DISABLED` |
| Fresh DBs auto-apply the DDL (QP-039 application path) | Dockerfile init `COPY ... /docker-entrypoint-initdb.d/04-needs-embedding.sql` | 4.1 | After rebuild + `--profile test up`, `db-test` has the columns (Task 4.1 verification) |
| Cross-model review gate (plan prompt) | §6c Decision Log entry recording reviewer + verdict | 4.6 | Reviewer output pasted into §6c; board moved to Review only on PASS |

No orphan requirements: every QP-039 scoped item maps to a task and a verification.

---

## §3. Preconditions

- Docker Desktop running; repo at `c:\projects\ai-memory`.
- `.env` populated with `MEMORY_API_KEY`, `DB_PASSWORD`, `OPENROUTER_API_KEY` (see `.env.example`).
- Dev stack may be up; the test stack is (re)built in Task 4.1.
- No host Deno/psql required — all Deno runs in `mcp-test`, all psql runs in `db` / `db-test` containers.
- Git working tree clean before starting (QP-039 already committed at HEAD `2655840`).

**Boilerplate** — the DDL file, `embeddings.ts`, `embeddingBackfill.ts`, and the test file are each provided in full in Tasks 4.1 / 4.2 / 4.4 / 4.3 respectively.

**Commit discipline:** every task that changes files ends with a Conventional Commit carrying:
```
Story: ST-039
Task: §<n>
```
Update §5b Recovery Ledger after each commit. (These `Task:` trailers are the in-execution commits issued by `/continue`, distinct from the Phase-2 `Story:`-only finalisation commit made by `/plan`.)

---

## §4. Task Definitions

### Task 4.1: Add the standalone idempotent schema delta and wire it into fresh-DB init

**Objective:** Add `needs_embedding`, `embedding_model`, `embedding_attempts`, `embedding_error` to `public.thoughts` via an idempotent DDL file, apply it to dev + test DBs, and make fresh DBs apply it automatically.

**Input:** `server/db/schema.sql` (stays unchanged), `docker/postgres-age/Dockerfile`.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/db/002_needs_embedding.sql` with exactly this content:

   ```sql
   -- ST-039: Embedding resilience — standalone idempotent schema delta.
   -- NOT applied by a migration runner (ST-042 not built). Applied via the Docker
   -- init entrypoint on fresh DBs and manually (psql) on the persistent dev DB.
   -- Safe to re-run: every statement is guarded.

   ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS needs_embedding    boolean NOT NULL DEFAULT true;
   ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS embedding_model    text;
   ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS embedding_attempts integer NOT NULL DEFAULT 0;
   ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS embedding_error    text;

   -- Reconcile existing data (idempotent): rows that already have an embedding are done.
   UPDATE public.thoughts SET needs_embedding = false
     WHERE embedding IS NOT NULL AND needs_embedding = true;

   -- Rows with a NULL embedding from PAST silent failures keep needs_embedding = true,
   -- so the first backfill sweep recovers already-lost data.

   -- Partial index for the sweep query (selects only rows still needing an embedding).
   CREATE INDEX IF NOT EXISTS idx_thoughts_needs_embedding
     ON public.thoughts (needs_embedding) WHERE needs_embedding = true;
   ```

2. Wire fresh-DB init: edit `docker/postgres-age/Dockerfile`. After the `COPY server/db/graph.sql ... 03-graph.sql` line (line 25), add:

   ```dockerfile
   COPY server/db/002_needs_embedding.sql           /docker-entrypoint-initdb.d/04-needs-embedding.sql
   ```
   Also extend the comment block above the COPY lines (lines 19-22) to add a line: `# 04 — ST-039 embedding-resilience columns (needs_embedding, embedding_model, ...)`.

3. Rebuild the Postgres image and recreate the **test** DB so init re-runs on fresh tmpfs:
   ```powershell
   docker compose --profile test build db-test
   docker compose --profile test up -d db-test seed mcp-test
   ```

4. Apply the DDL to the **dev** DB manually (persistent volume — init will not re-run). The dev DB must be up:
   ```powershell
   docker compose up -d db
   docker compose cp server/db/002_needs_embedding.sql db:/tmp/002_needs_embedding.sql
   docker compose exec db psql -U ai_memory -d ai_memory -f /tmp/002_needs_embedding.sql
   ```

**Expected output:** `server/db/002_needs_embedding.sql` created; Dockerfile has the new COPY; both `db` and `db-test` `public.thoughts` have the four new columns and the partial index.

**Requirement mapping:** Idempotent standalone DDL; AC-2 columns; AC-17 column; fresh-DB auto-apply (see §2d).

**Verification:**
```powershell
# Columns present on the test DB (built from the image init):
docker compose --profile test exec -T db-test psql -U ai_memory -d ai_memory -c "\d public.thoughts" | Select-String "needs_embedding|embedding_model|embedding_attempts|embedding_error"
# Idempotency — re-run produces no error:
docker compose --profile test exec db-test psql -U ai_memory -d ai_memory -f /docker-entrypoint-initdb.d/04-needs-embedding.sql
# Each new column appears exactly once (no duplicates):
docker compose --profile test exec -T db-test psql -U ai_memory -d ai_memory -tAc "SELECT column_name FROM information_schema.columns WHERE table_name='thoughts' AND column_name IN ('needs_embedding','embedding_model','embedding_attempts','embedding_error') ORDER BY 1"
```
Expected result: the four columns appear in `\d`; the re-run prints `ALTER TABLE` / `CREATE INDEX` notices with no error; the last query lists the four names once each.

**Failure handling:** If `db-test` does not show the columns, the image was not rebuilt — re-run step 3 with `docker compose --profile test build --no-cache db-test`. If the manual dev apply errors on a missing `thoughts` table, the dev DB was never initialised; run `docker compose up -d db`, wait for healthy, then retry.

**Commit:** `feat(db): add embedding-resilience columns (ST-039)` with `Story: ST-039` / `Task: §4.1`.

---

### Task 4.2: Extract the shared embedding client into `server/src/embeddings.ts`

**Objective:** Move `getEmbedding` and a single source-of-truth `EMBEDDING_MODEL` constant out of `index.ts` into a side-effect-free module so the backfill worker can import them without triggering `index.ts`'s top-level server boot / circular import.

**Input:** `server/index.ts` (lines 20-21 OPENROUTER constants, 29-48 `getEmbedding`).

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. Create `server/src/embeddings.ts`:
   ```ts
   // Shared OpenRouter embedding client. Side-effect-free so workers and the
   // server can both import it (index.ts has top-level Deno.serve + worker starts;
   // importing FROM index.ts would boot the server and create a circular import).

   const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
   const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

   /** The exact model id sent to OpenRouter. Recorded per-thought as embedding_model (AC-17). */
   export const EMBEDDING_MODEL = "openai/text-embedding-3-small";

   /** 512-dim embedding via text-embedding-3-small truncation. Throws on non-2xx. */
   export async function getEmbedding(text: string): Promise<number[]> {
     const r = await fetch(`${OPENROUTER_BASE}/embeddings`, {
       method: "POST",
       headers: {
         Authorization: `Bearer ${OPENROUTER_API_KEY}`,
         "Content-Type": "application/json",
       },
       body: JSON.stringify({
         model: EMBEDDING_MODEL,
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
   ```

2. Edit `server/index.ts`:
   - Add an import next to the other `./src/*` imports (after line 11):
     ```ts
     import { getEmbedding, EMBEDDING_MODEL } from "./src/embeddings.ts";
     ```
   - Delete the now-duplicated local declarations: `OPENROUTER_API_KEY` (line 20), `OPENROUTER_BASE` (line 21), and the entire local `async function getEmbedding(...)` block (lines 29-48). Keep or remove the `// Embedding via OpenRouter ...` comment header — either is fine; do not leave an empty stub.
   - The three `getEmbedding(...)` call sites (search line 70, search_thoughts line 150, capture line 282) now resolve to the import — no call-site edits in this task.

**Expected output:** `server/src/embeddings.ts` created; `index.ts` imports `getEmbedding`/`EMBEDDING_MODEL` and no longer declares them locally.

**Requirement mapping:** Enables the injectable embed seam and single-source model id for AC-17 (see §2d).

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno check index.ts src/embeddings.ts
# No stale references to the removed locals remain in index.ts:
docker compose --profile test exec mcp-test sh -c "grep -n 'OPENROUTER_BASE' index.ts || echo 'clean: no OPENROUTER_BASE in index.ts'"
# Existing suite still green (pure refactor, no behavioural change):
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```
Expected result: `deno check` passes; `index.ts` has no `OPENROUTER_BASE`; full suite passes unchanged.

**Failure handling:** If `deno check` reports an unused `getEmbedding` import, a call site was missed — re-grep `getEmbedding(` in `index.ts`; all three must remain. If the suite shows new failures, the request shape (`model`, `input`, `dimensions: 512`) in `embeddings.ts` must be byte-identical to the original.

**Commit:** `refactor(server): extract shared embeddings module (ST-039)` with `Story: ST-039` / `Task: §4.2`.

---

### Task 4.3: RED — write the failing backfill characterization tests

**Objective:** Write `server/tests/embedding-backfill.test.ts` covering the four §2 behaviours. It must **fail** now because `server/src/embeddingBackfill.ts` does not yet exist (red step precedes green).

**Input:** `server/src/db.ts` (`sql`); test-harness conventions from `server/tests/capture-size-limit.test.ts` (direct `sql` access, `sanitizeResources/Ops: false`, per-test cleanup).

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. Create `server/tests/embedding-backfill.test.ts`:
   ```ts
   import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
   import { sql } from "../src/db.ts";
   import { runBackfillSweep } from "../src/embeddingBackfill.ts";

   // Deterministic 512-dim stub vector (matches the vector(512) column width).
   const STUB_VECTOR = Array.from({ length: 512 }, () => 0.01);
   const succeedEmbed = (_text: string) => Promise.resolve(STUB_VECTOR);
   const failEmbed = (_text: string) => Promise.reject(new Error("stub embed failure"));

   async function insertNeedyRow(opts: { attempts?: number } = {}): Promise<string> {
     const id = crypto.randomUUID();
     await sql`
       INSERT INTO thoughts (id, content, content_fingerprint, source, memory_type, embedding_attempts)
       VALUES (${id}, ${"ST-039 test row " + id}, ${id}, 'user-taught', 'shard', ${opts.attempts ?? 0})
     `;
     return id; // needs_embedding defaults true, embedding NULL by default
   }

   async function readRow(id: string) {
     const [row] = await sql<{
       has_emb: boolean; needs_embedding: boolean; embedding_model: string | null;
       embedding_attempts: number; embedding_error: string | null;
     }[]>`
       SELECT (embedding IS NOT NULL) AS has_emb, needs_embedding, embedding_model,
              embedding_attempts, embedding_error
       FROM thoughts WHERE id = ${id}
     `;
     return row;
   }

   const cleanup = (id: string) => sql`DELETE FROM thoughts WHERE id = ${id}`;

   Deno.test({
     name: "AC-2 recovery: NULL-embedding row is populated after a successful sweep",
     sanitizeResources: false,
     sanitizeOps: false,
     fn: async () => {
       const id = await insertNeedyRow();
       try {
         await runBackfillSweep({ embed: succeedEmbed });
         const row = await readRow(id);
         assertEquals(row.has_emb, true, "embedding should be populated");
         assertEquals(row.needs_embedding, false, "needs_embedding should be cleared");
         assertEquals(row.embedding_error, null, "embedding_error should be cleared on success");
       } finally {
         await cleanup(id);
       }
     },
   });

   Deno.test({
     name: "AC-2 failure: a failing embed increments attempts and stays recoverable",
     sanitizeResources: false,
     sanitizeOps: false,
     fn: async () => {
       const id = await insertNeedyRow();
       try {
         await runBackfillSweep({ embed: failEmbed });
         const row = await readRow(id);
         assertEquals(row.embedding_attempts, 1, "one failed attempt recorded");
         assertEquals(row.has_emb, false, "embedding still NULL");
         assertEquals(row.needs_embedding, true, "row remains selectable for a future sweep");
         assertEquals(row.embedding_error, "stub embed failure", "error message recorded");
       } finally {
         await cleanup(id);
       }
     },
   });

   Deno.test({
     name: "AC-2 cap: a row at MAX_ATTEMPTS is skipped by the sweep",
     sanitizeResources: false,
     sanitizeOps: false,
     fn: async () => {
       const id = await insertNeedyRow({ attempts: 5 });
       try {
         await runBackfillSweep({ embed: failEmbed });
         const row = await readRow(id);
         assertEquals(row.embedding_attempts, 5, "capped row not processed (would be 6 if selected)");
         assertEquals(row.has_emb, false, "embedding still NULL");
       } finally {
         await cleanup(id);
       }
     },
   });

   Deno.test({
     name: "AC-17: successful backfill records embedding_model",
     sanitizeResources: false,
     sanitizeOps: false,
     fn: async () => {
       const id = await insertNeedyRow();
       try {
         await runBackfillSweep({ embed: succeedEmbed });
         const row = await readRow(id);
         assertEquals(row.embedding_model, "openai/text-embedding-3-small");
       } finally {
         await cleanup(id);
       }
     },
   });
   ```

**Expected output:** the test file exists and **fails to run** (module-not-found for `../src/embeddingBackfill.ts`).

**Requirement mapping:** AC-2 recovery/failure/cap, AC-17 (see §2d) — these tests are the verification evidence for Task 4.4.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/embedding-backfill.test.ts
```
Expected result: the run **fails** with a module-resolution error referencing `src/embeddingBackfill.ts`. A red result here is success for this task.

**Failure handling:** If the test errors for an unrelated reason (e.g. unknown column `embedding_attempts`), confirm Task 4.1 applied the columns to `db-test` (`\d public.thoughts`). The only acceptable failure is "module not found: embeddingBackfill.ts".

**Commit:** `test(embeddings): add failing backfill resilience tests (ST-039)` with `Story: ST-039` / `Task: §4.3`.

---

### Task 4.4: GREEN — implement the backfill sweep module

**Objective:** Implement `server/src/embeddingBackfill.ts` so the Task 4.3 tests pass.

**Input:** `server/src/db.ts` (`sql`), `server/src/embeddings.ts` (`getEmbedding`, `EMBEDDING_MODEL`), the failing tests from Task 4.3.

**Working directory:** `c:\projects\ai-memory\server\`

**Steps:**

1. Create `server/src/embeddingBackfill.ts`:
   ```ts
   import { sql } from "./db.ts";
   import { EMBEDDING_MODEL, getEmbedding } from "./embeddings.ts";

   const MAX_ATTEMPTS = 5;                // mirrors entityWorker MAX_ATTEMPTS
   const BATCH_SIZE = 50;                 // rows reconciled per sweep
   const POLL_INTERVAL_MS = Number(Deno.env.get("EMBEDDING_BACKFILL_INTERVAL_MS") ?? "60000");

   export interface BackfillDeps {
     /** Injectable embed fn so tests can stub success/failure. Defaults to the real client. */
     embed?: (text: string) => Promise<number[]>;
   }

   export interface SweepResult {
     processed: number;
     succeeded: number;
     failed: number;
   }

   /**
    * One reconciliation pass: fill embeddings for rows that should have one but don't.
    * Sweep-as-retry — exactly one embed attempt per selected row per sweep.
    *
    * The `embedding IS NULL` guard is deliberate (see ExecPlan §2c): the sweep fills
    * only MISSING embeddings and never overwrites a good one — important because the
    * seeded test corpus has needs_embedding = true on rows that already have embeddings.
    */
   export async function runBackfillSweep({ embed = getEmbedding }: BackfillDeps = {}): Promise<SweepResult> {
     const rows = await sql<{ id: string; content: string }[]>`
       SELECT id, content
       FROM thoughts
       WHERE needs_embedding = true
         AND embedding IS NULL
         AND embedding_attempts < ${MAX_ATTEMPTS}
       ORDER BY created_at
       LIMIT ${BATCH_SIZE}
     `;

     let succeeded = 0;
     let failed = 0;

     for (const row of rows) {
       try {
         const emb = await embed(row.content);
         await sql`
           UPDATE thoughts
           SET embedding        = ${sql.unsafe(`'[${emb.join(",")}]'`)}::vector,
               needs_embedding  = false,
               embedding_model  = ${EMBEDDING_MODEL},
               embedding_error  = NULL
           WHERE id = ${row.id}
         `;
         succeeded++;
       } catch (err) {
         const msg = (err as Error)?.message ?? String(err);
         await sql`
           UPDATE thoughts
           SET embedding_attempts = embedding_attempts + 1,
               embedding_error    = ${msg}
           WHERE id = ${row.id}
         `;
         failed++;
       }
     }

     return { processed: rows.length, succeeded, failed };
   }

   /**
    * Start the background backfill worker: run once on boot (miss-recovery), then poll.
    * Disabled by EMBEDDING_BACKFILL_DISABLED=true (test isolation, mirrors
    * CONSOLIDATION_WORKER_DISABLED) or FEATURE_EMBEDDING_BACKFILL=false (kill-switch).
    */
   export function startEmbeddingBackfill(): void {
     if (Deno.env.get("EMBEDDING_BACKFILL_DISABLED") === "true") {
       console.log("[embeddingBackfill] auto-start disabled (EMBEDDING_BACKFILL_DISABLED=true)");
       return;
     }
     if (Deno.env.get("FEATURE_EMBEDDING_BACKFILL") === "false") {
       console.log("[embeddingBackfill] disabled via FEATURE_EMBEDDING_BACKFILL=false");
       return;
     }
     console.log(`[embeddingBackfill] started (poll every ${POLL_INTERVAL_MS}ms, batch ${BATCH_SIZE})`);
     setInterval(() => {
       runBackfillSweep().catch((err) => console.error("[embeddingBackfill] sweep failed:", err));
     }, POLL_INTERVAL_MS);
     runBackfillSweep().catch((err) => console.error("[embeddingBackfill] initial sweep failed:", err));
   }
   ```

**Expected output:** `server/src/embeddingBackfill.ts` created; Task 4.3 tests now pass.

**Requirement mapping:** AC-2 recovery/failure/cap, AC-17, kill-switch guards (see §2d).

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno check src/embeddingBackfill.ts
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/embedding-backfill.test.ts
```
Expected result: `deno check` passes; all four backfill tests pass.

**Failure handling:** If the cap test fails with `embedding_attempts = 6`, the `embedding_attempts < MAX_ATTEMPTS` predicate is missing/wrong. If the recovery test fails with a vector-dimension error, the stub vector must be length 512 (it is) and the `sql.unsafe('[...]')::vector` interpolation must match the capture pattern. If a sweep picks up unrelated corpus rows, confirm the `AND embedding IS NULL` guard is present.

**Commit:** `feat(embeddings): implement backfill sweep worker (ST-039)` with `Story: ST-039` / `Task: §4.4`.

---

### Task 4.5: Integrate — capture success path, startup wiring, and test-isolation env

**Objective:** Make capture record the model + clear the flag on success, start the backfill worker at boot, and stop the server-side auto-sweep from interfering with tests.

**Input:** `server/index.ts` (capture flow ~line 281; worker starts ~line 539-545), `docker-compose.yml` (`mcp-test` service env ~line 86-92).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Edit `server/index.ts` capture flow. Replace the fire-and-forget block (currently lines ~281-284) with:
   ```ts
   // Fire-and-forget embedding update. On success, record the model and clear the
   // needs_embedding flag; on failure, log only — the backfill sweep owns retries
   // and the embedding_attempts counter (this inline attempt is best-effort).
   getEmbedding(content).then((emb) =>
     sql`
       UPDATE thoughts
       SET embedding       = ${sql.unsafe(`'[${emb.join(",")}]'`)}::vector,
           needs_embedding = false,
           embedding_model = ${EMBEDDING_MODEL},
           embedding_error = NULL
       WHERE id = ${insertResult.id}
     `
   ).catch((err) => console.error(`[capture_thought] embedding update failed for ${insertResult.id}:`, err));
   ```
   (`EMBEDDING_MODEL` is already imported from Task 4.2. Note: the `.catch` deliberately does **not** touch `embedding_attempts` — the inline attempt is best-effort and the sweep owns the counter.)

2. Edit `server/index.ts` worker startup. Add the import alongside the other worker imports (near line 9-10):
   ```ts
   import { startEmbeddingBackfill } from "./src/embeddingBackfill.ts";
   ```
   And after the `startConsolidationWorker(...)` block (~line 543-545), add:
   ```ts
   // Start embedding backfill worker (recovers rows whose embedding call failed)
   startEmbeddingBackfill();
   ```

3. Edit `docker-compose.yml` — add to the `mcp-test` service `environment:` block (next to `CONSOLIDATION_WORKER_DISABLED: "true"`, ~line 92):
   ```yaml
       # Disable the embedding backfill auto-sweep so the server process does not
       # race explicit runBackfillSweep() calls in tests against the shared db-test.
       EMBEDDING_BACKFILL_DISABLED: "true"
   ```

4. Recreate `mcp-test` so it picks up the new env var (compose env is read at container create, not via the bind mount):
   ```powershell
   docker compose --profile test up -d mcp-test
   ```

**Expected output:** capture sets model + flag on success; backfill worker starts at boot in dev; `mcp-test` has the auto-sweep disabled.

**Requirement mapping:** Capture success path sets flag + model; AC-17 on capture path; kill-switch/test-isolation env (see §2d).

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno check index.ts
# Confirm the compose env is set on the running test container:
docker compose --profile test exec mcp-test sh -c 'echo $EMBEDDING_BACKFILL_DISABLED'
# Full suite green (capture path unbroken, backfill tests still pass):
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```
Expected result: `deno check` passes; the env echo prints `true`; the full suite passes with 0 failures.

**Failure handling:** If a capture test regresses, confirm the UPDATE still casts `::vector` and that `needs_embedding=false` is set only in the success `.then` (never in `.catch`). If the env echo is empty, the container was not recreated — re-run step 4.

**Commit:** `feat(capture): record embedding model and wire backfill worker (ST-039)` with `Story: ST-039` / `Task: §4.5`.

---

### Task 4.6: Cross-model review, full verification, and closeout

**Objective:** Prove all §2 acceptance criteria, obtain a cross-model critical review, and move the story to Review.

**Input:** all artifacts from Tasks 4.1-4.5; §2 ACs; §2d matrix.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Run the full suite and capture the pass/fail line:
   ```powershell
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
   ```
2. Re-prove idempotency (DoD §2.5):
   ```powershell
   docker compose --profile test exec db-test psql -U ai_memory -d ai_memory -f /docker-entrypoint-initdb.d/04-needs-embedding.sql
   ```
3. **Cross-model review (mandatory gate).** Request a critical review from a **different model** than the one that executed Tasks 4.1-4.5. Give the reviewer this ExecPlan's §2 ACs and §2d matrix, plus the shipped `server/db/002_needs_embedding.sql`, `server/src/embeddings.ts`, `server/src/embeddingBackfill.ts`, the `index.ts` capture diff, and `server/tests/embedding-backfill.test.ts`. The reviewer must check:
   - Do the tests validate the stated contract (not just pass)? Specifically: does the cap test actually prove non-selection (attempts stays 5), and does the failure test prove recoverability (needs_embedding still true)?
   - Are there behavioural paths the tests miss? (e.g. a row with `needs_embedding=true` AND an existing embedding is correctly **not** overwritten by the `embedding IS NULL` guard; the `.catch` inline path does not touch `embedding_attempts`.)
   - Does runtime semantics match the design (sweep-as-retry, single attempt per sweep, model literal matches the id actually sent to OpenRouter)?
   Record reviewer identity and verdict in §6c. If a defect is found, fix it and re-run steps 1-3 before proceeding.
4. Update §1b Outcomes & Conclusions with completion status, requirements met, evidence (paste the suite pass line and the idempotency notice), and architectural impact.
5. Move ST-039 from **In Progress → Review** on `.github/planning/story-board.md` (executor closeout move; the Backlog → Refined move was done by `/plan` at Ready time).
6. Present results to the PO with artifact links.

**Expected output:** full suite green; idempotency reproved; cross-model PASS recorded; board at Review.

**Requirement mapping:** DoD §2.6 (full suite), §2.5 (idempotency), §2.7 (cross-model review), cross-model gate (see §2d).

**Verification:**
```powershell
# Evidence the suite passed (look for "0 failed"):
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```
Expected result: output ends with `... passed; 0 failed`; §6c contains a dated cross-model PASS entry; the board shows ST-039 under Review.

**Failure handling:** If the cross-model review finds an AC violation, do **not** move the board — fix, re-verify, and re-review. If the suite shows failures unrelated to ST-039, capture them in §6b and consult the PO before moving to Review.

**Commit:** `chore(board): move ST-039 to review (ST-039)` with `Story: ST-039` / `Task: §4.6`. (Code/test commits were made per-task; this commit carries the board move and §1b/§6c updates.)

---

## §5. State Recovery Protocol

If a session is interrupted, read §5b to determine where to resume. The Recovery Ledger has a current resume snapshot (update in place) and an append-only progress history.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.6 — cross-model review, full verification, closeout |
| **Last successful command** | `deno test --allow-net --allow-env --allow-read tests/` → 43 passed 0 failed |
| **Expected outputs produced** | all artifacts shipped; board moved to Review |
| **Next task** | — (story complete) |
| **Known blockers** | None |
| **Last updated** | 2026-06-03 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-06-03T00:00Z | Task 4.1 | ✅ Done | `server/db/002_needs_embedding.sql` + Dockerfile; idempotent on both DBs; commit `432a991` | Task 4.2 |
| 2026-06-03T00:00Z | Task 4.2 | ✅ Done | `server/src/embeddings.ts` extracted; `deno check` clean; 39 passed 0 failed; commit `9760407` | Task 4.3 |
| 2026-06-03T00:00Z | Task 4.3 | ✅ Done | `tests/embedding-backfill.test.ts` created; RED (module not found); commit `d002a05` | Task 4.4 |
| 2026-06-03T00:00Z | Task 4.4 | ✅ Done | `server/src/embeddingBackfill.ts` created; 4 backfill tests GREEN; commit `8dc9f2a` | Task 4.5 |
| 2026-06-03T00:00Z | Task 4.5 | ✅ Done | capture path records model; `startEmbeddingBackfill` wired; `EMBEDDING_BACKFILL_DISABLED=true` on mcp-test; 43 passed 0 failed; commit `2570f8c` | Task 4.6 |
| 2026-06-03T00:00Z | Task 4.6 | ✅ Done | Cross-model review PASS (GPT-5.2, after fix for concurrent-write overwrite); 43 passed 0 failed; idempotency re-proved; board moved to Review; commits `474778a`, `35759c0` | — |

### Avoidance

- The `db` image is **not** bind-mounted — SQL init changes require `docker compose build`. Only the `mcp`/`mcp-test` `./server:/app` mount is live.
- The dev `db` has a persistent volume; init scripts do **not** re-run. Apply DDL manually (Task 4.1 step 4).
- Keep `EMBEDDING_BACKFILL_DISABLED=true` on `mcp-test`; without it the server's real-OpenRouter auto-sweep races the stubbed tests.

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Standalone idempotent DDL + polling sweep-as-retry + shared embeddings module | pre-Task-4.1 HEAD (`2655840`) | 🟢 Active |
| 2 | (Reserve) If shared-module extraction proves too invasive, inline a private embed default in embeddingBackfill.ts (duplicates the fetch — last resort) | — | ⬜ Reserve |

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

- Observation: (LE, planning) The seed corpus sets no `needs_embedding`, so post-seed corpus rows are `needs_embedding=true` with embeddings present.
  Evidence: `server/tests/fixtures/search-quality-corpus.sql` INSERT column list omits `needs_embedding`; the `seed` service runs after the init DDL.
  Impact: Drove the `AND embedding IS NULL` sweep guard and `EMBEDDING_BACKFILL_DISABLED` on `mcp-test` (see §2c). Without both, e2e vector-lane tests would be flaky.

---

## §6c. Decision Log

- Decision: Extract `getEmbedding` + `EMBEDDING_MODEL` into `server/src/embeddings.ts` rather than exporting from `index.ts`.
  Rationale: `index.ts` has top-level side effects (`ensureRequiredEnv`, `Deno.serve`, worker starts) and would form a circular import with `embeddingBackfill.ts`. A side-effect-free module is the only clean shared seam and gives AC-17 a single source-of-truth model id.
  Date: 2026-06-03
- Decision: Add `AND embedding IS NULL` to the sweep query (deviation from QP-039's literal query).
  Rationale: Correctness + test-isolation (see §2c). Surfaced to PO during /plan review.
  Date: 2026-06-03
- Decision: PO approved both §2c deviations (`AND embedding IS NULL` sweep guard; `EMBEDDING_BACKFILL_DISABLED` on `mcp-test`).
  Rationale: Accepted as correctness + test-isolation measures during /plan Phase 2 review.
  Date: 2026-06-03
- Decision: Cross-model review verdict — PASS after one defect fix.
  Rationale: GPT-5.2 (first pass, 2026-06-03) returned FAIL: the success UPDATE used only `WHERE id = $1`, allowing it to overwrite a concurrently-written good embedding (and the failure UPDATE had the same gap for incrementing attempts). Fix applied: added `AND embedding IS NULL AND needs_embedding = true` to the success UPDATE and `AND needs_embedding = true` to the failure UPDATE. Two regression tests added to prove the guards. GPT-5.2 (re-review, 2026-06-03) returned PASS: defect resolved, no new issues, minor note that succeeded/failed counters still tick on 0-row updates (non-blocking metrics nuance, not data-correctness). Verdict recorded: PASS.
  Date: 2026-06-03.

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all §2 acceptance criteria).
2. Update board: move ST-039 to Review.
3. Present results to PO with artifact links.
4. Log any Tier 1 compound detections (e.g. a future story to fold the kill-switch into ST-043's `Config`, or to teach ST-042's migration runner about `002_needs_embedding.sql`).

---

## §7b. Outcomes & Retrospective

(Retrospective depth only — primary outcomes live in §1b.)

Achieved: _pending_
Remains: _pending_
Lesson: _pending_

---

## Revision Notes

- 2026-05-31 — Initial stub auto-generated from QP-038 §4.5–§4.7 (pre-scoping).
- 2026-06-03 — Rewritten in Phase 2 from the committed, collaboratively-scoped QP-039. Replaced the stub's `backfill_embeddings` MCP tool with an exported `runBackfillSweep` + polling worker; added `embedding_attempts`/`embedding_error` columns and the attempts cap; corrected the model literal to `openai/text-embedding-3-small`; corrected psql creds to `ai_memory`/`ai_memory`; added shared `embeddings.ts` extraction; added two deviations from the packet's literal sweep query for correctness/test-isolation (§2c), both flagged for PO review.
