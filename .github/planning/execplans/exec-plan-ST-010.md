# ExecPlan — ST-010: Integration Testing for Cloud MCP (Deno + Docker Compose)

> Status: ✅ Ready for /continue
> Story: ST-010
> Created: 2026-05-27
> Approved: 2026-05-27
> Parent: `.github/planning/query-packets/QP-010-integration-testing.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

The ai-memory cloud MCP server (`server/`) currently has 10 test files exercising various MCP tools over HTTP, but:

1. **No CI pipeline exists.** Tests only run manually via `docker compose --profile test exec mcp-test deno test`.
2. **Eight E2E test files overlap** in infrastructure concerns (each re-implements or imports the same MCP client helper, manages its own setup/teardown).
3. **Several ST-010 acceptance criteria** (full BM25 capture→search, vector retrieval with pre-seeded embeddings, consolidation→wiki queryability, entity extraction→graph traversal, and recall event logging) lack dedicated, authoritative E2E coverage — some are tested indirectly, others not at all.

This story consolidates the 8 existing E2E test files into a single authoritative `server/tests/e2e.test.ts`, adds missing AC coverage, preserves the existing MMR and recall-quality search assertions while merging files, keeps vector-lane tests hermetic via pre-seeded embeddings in SQL fixtures, and creates a GitHub Actions CI workflow.

Consolidation must not silently drop already-shipped integration coverage from ST-005 and ST-035. The unified suite therefore also needs to retain the current assertions for project-boost ordering, NULL-project visibility, `entity_mentions` lifecycle behaviour, and `graph_search` input validation before the legacy files are deleted.

Two current runtime constraints matter for this plan:
- `server/index.ts` only exposes **active** thoughts through MCP read tools (`search`, `fetch`, `search_thoughts`, `list_thoughts`).
- `server/src/consolidationWorker.ts` deactivates the source shard after a successful promotion.

Therefore the board wording "both queryable" is implemented here as: the promoted wiki must be queryable through MCP, while the archived source shard must remain auditable through direct SQL and `consolidation_log` evidence. This matches the shipped runtime semantics instead of assuming inactive thoughts still appear in MCP search results.

Also note that only the vector-lane corpus is hermetic. The entity-extraction worker and consolidation LLM path both call OpenRouter at runtime, so CI needs a real `OPENROUTER_API_KEY` repository secret rather than a dummy value.

One search-readiness distinction is important for this plan:
- `search_vector` is a PostgreSQL generated `tsvector` column derived from `content`; BM25 readiness is synchronous with the `INSERT` and does not require a later worker or polling loop.
- `embedding` is populated later by the current `capture_thought` implementation via a fire-and-forget OpenRouter call; vector-lane readiness is therefore eventually consistent unless the test uses pre-seeded fixture embeddings.

**Key files:**
- MCP server: `server/index.ts`
- DB schema: `server/db/schema.sql`
- Docker Compose: `docker-compose.yml` (lines 44–98 define the test profile)
- Existing test helper: `server/tests/_helpers/mcpClient.ts`
- Search corpus: `server/tests/fixtures/search-quality-corpus.sql`
- Consolidation corpus: `server/tests/fixtures/consolidation-corpus.sql`
- Unit tests (kept separate): `server/tests/parseContext.test.ts`, `server/tests/consolidation-scoring.test.ts`

**Term definitions:**
- **BM25 lane:** Text-based search using PostgreSQL `tsvector`/`ts_rank_cd` ranking.
- **Vector lane:** Semantic search using `pgvector` cosine similarity on 512-dim embeddings.
- **RRF:** Reciprocal Rank Fusion — combines BM25 and vector rank lists into a single score.
- **MMR:** Maximal Marginal Relevance — post-RRF re-ranking that penalises near-duplicate results.
- **MCP tool call:** HTTP POST to `/mcp` with JSON-RPC body `{method: "tools/call", params: {name, arguments}}`.
- **Seed corpus:** `search-quality-corpus.sql` loaded by the `seed` Docker service into `db-test` at container startup.
- **mcp-test:** Docker service running the MCP Deno server against the ephemeral `db-test` (tmpfs, port 3001).

---

## §1b. Outcomes & Conclusions

**Delivered:** Unified `server/tests/e2e.test.ts` (16 tests, 8 groups) covering all ACs (BM25 capture→search, vector lane with pre-seeded embeddings, consolidation→wiki promotion, entity extraction→graph traversal, context scoping + project boost, recall events, MMR diversification, recall-quality threshold). GitHub Actions CI workflow (`.github/workflows/ci.yml`) exercises Docker Compose test profile with OpenRouter secret injection. 8 legacy overlapping test files deleted; 3 focused files retained. Full suite passes (27/27) on fresh ephemeral stack.

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

- **AC1 (BM25):** After running `docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/e2e.test.ts`, the "BM25 lane" test passes — `capture_thought` then `search_thoughts` returns the captured thought ranked by BM25 score.
- **AC2 (Vector):** The "vector lane" test passes — it first proves via direct SQL that the chosen expected row is *not* in the BM25 candidate set for the query, then shows that `search_thoughts` still returns that row from the pre-seeded fixture.
- **AC3 (Consolidation→Wiki):** With a real `OPENROUTER_API_KEY` available, the "consolidation promotion" test passes — `consolidate` writes a `consolidation_log` row with `operation = 'promote'` and a non-null `wiki_id`, the promoted wiki is queryable through MCP, and the original shard is deactivated (`active = false`) and auditable through SQL.
- **AC4 (Entity→Graph):** With a real `OPENROUTER_API_KEY` available, the "entity extraction" test passes — `capture_thought` triggers entity extraction, `graph_search` returns connected entities, and `graph_traverse` returns expected raw graph nodes.
- **AC5 (Context scoping):** The "context scoping" tests pass — strict filtering, non-strict cross-project visibility, NULL-project visibility, and in-project boost ordering all behave as currently shipped.
- **AC6 (Recall events):** The "recall events" test passes — after `search_thoughts`, a `recall_events` row is created for each returned result.
- **AC7 (CI pipeline):** After pushing to main or opening a PR, the GitHub Actions workflow injects `OPENROUTER_API_KEY` from a GitHub repository secret, runs `docker compose --profile test up -d`, and executes all tests successfully.
- **AC8 (Old files deleted):** After completion, only `e2e.test.ts`, `parseContext.test.ts`, `consolidation-scoring.test.ts`, `_helpers/mcpClient.ts`, and `fixtures/` remain in `server/tests/`.
- **Coverage parity:** Before any legacy test file is deleted, the unified suite still covers the shipped `entity_mentions` lifecycle checks, `graph_search` invalid-filter rejection, and project-boost ordering/null-project assertions that currently live in split files.

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

- 2026-05-27: Task 4.1 execution blocked at the verification step. The required command `docker compose --profile test exec mcp-test sh -c "grep -c '::vector' /app/tests/fixtures/search-quality-corpus.sql"` could not reach a Docker daemon from the execution shell.
- Evidence gathered during execution:
  - `search-quality-corpus.sql` was read successfully and contains multiple `::vector` literals.
  - `search-quality-queries.json` was read successfully and still contains `"typescript narrow union" -> "00000000-0000-4000-8000-000000000009"`.
  - Re-running the Task 4.1 verification command twice failed with `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`.
  - Host checks from the execution shell showed both `\\.\pipe\docker_engine` and `\\.\pipe\dockerDesktopLinuxEngine` absent, and `com.docker.service` was stopped; starting it failed due permission error (`Cannot open 'com.docker.service' service on computer '.'`).
- This blocker is not covered by the ExecPlan's recovery/failure-handling steps, so execution is stopped and returned for plan-review.
- **Resolution (2026-05-27):** Confirmed environmental — no plan defect. Docker Desktop was stopped between sessions. Added §4.0 preflight step requiring daemon verification before any task execution. Block cleared.

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| AC1: capture→search via BM25 (QP-010) | `server/tests/e2e.test.ts` contains a test that captures and searches immediately via BM25; it does not wait for async embedding population because `search_vector` is generated synchronously | Task 4.2 | Test passes in mcp-test |
| AC2: capture→search via vector (pre-seeded) (QP-010) | `server/tests/e2e.test.ts` uses the BM25-negative fixture pair `"zoom recording auto archive"` → `00000000-0000-4000-8000-000000000004`, proves with direct SQL that the target row is absent from BM25-only candidates, then asserts `search_thoughts` still returns it | Task 4.1 (fixture + pair selection), Task 4.2 | Test passes in mcp-test |
| AC3: consolidation promote path + wiki queryability (QP-010, aligned to current runtime semantics) | `server/tests/e2e.test.ts` test calling `consolidate`, asserting `consolidation_log.operation = 'promote'`, non-null `wiki_id`, MCP queryability of the wiki, and SQL evidence that the source shard is inactive | Task 4.2 | Test passes in mcp-test |
| AC4: entity extraction → graph (QP-010) | `server/tests/e2e.test.ts` test calling `capture_thought` → waiting for `entity_extraction_queue.status = 'done'` → `graph_search` and `graph_traverse`, while also asserting `entity_mentions` rows were written | Task 4.2 | Test passes in mcp-test |
| AC5: context scoping (project/profile, strict) (QP-010) | `server/tests/e2e.test.ts` tests strict filtering, cross-project visibility, NULL-project visibility, and in-project boost ordering | Task 4.2 | Test passes in mcp-test |
| AC6: recall event tracking (QP-010) | `server/tests/e2e.test.ts` test checking `recall_events` table after search | Task 4.2 | Test passes in mcp-test |
| AC7: CI pipeline (QP-010) | `.github/workflows/ci.yml` triggers on push/PR, runs compose test profile | Task 4.3 | Workflow file exists with correct structure |
| AC8: old E2E files deleted (QP-010) | 8 named files removed from `server/tests/` | Task 4.4 | `ls server/tests/*.test.ts` shows only 3 files |
| Existing entity_mentions lifecycle retained (current repo behaviour) | `server/tests/e2e.test.ts` includes re-extraction replacing stale mentions and FK cascade deleting mentions when the source thought is deleted | Task 4.2 | Tests pass in mcp-test |
| Existing entity_mentions schema guard retained (current repo behaviour) | `server/tests/e2e.test.ts` asserts `entity_mentions.entity_label` rejects an invalid value via the CHECK constraint | Task 4.2 | Test passes in mcp-test |
| Existing graph_search input validation retained (current repo behaviour) | `server/tests/e2e.test.ts` asserts invalid `relationship_filter` input is rejected | Task 4.2 | Test passes in mcp-test |
| Existing project-boost ranking coverage retained (current repo behaviour) | `server/tests/e2e.test.ts` includes the NULL-project visibility and in-project-outranks-cross-project assertions migrated from `search-project-boost.test.ts` | Task 4.2 | Tests pass in mcp-test |
| Existing MMR diversification coverage retained (current repo behaviour) | `server/tests/e2e.test.ts` contains the near-duplicate top-3 and null-embedding returnability assertions migrated from `search-mmr.test.ts` | Task 4.2 | Test passes in mcp-test |
| Existing recall-quality threshold retained (current repo behaviour) | `server/tests/e2e.test.ts` loads `server/tests/fixtures/search-quality-queries.json` and asserts ≥8/10 expected IDs in top-10 | Task 4.2 | Test passes in mcp-test |
| Pre-seeded embeddings for vector tests (QP-010 §CI considerations) | `search-quality-corpus.sql` already contains 512-dim embeddings | Task 4.1 | grep for vector in fixture confirms non-null embeddings |
| Unit tests kept separate (QP-010) | `parseContext.test.ts` + `consolidation-scoring.test.ts` unchanged | Task 4.4 | files still present after cleanup |

---

## §3. Preconditions

### Tools required

- Docker + Docker Compose (already available on the host)
- Git (for commits)
- No host Deno required — all test commands run inside the `mcp-test` container

### Environment variables

`.env` at repo root must contain:
- `MEMORY_API_KEY` — any non-empty string (e.g. `test-key`)
- `DB_PASSWORD` — postgres password
- `OPENROUTER_API_KEY` — a real key is required for entity-extraction and consolidation-promotion tests; a dummy value is insufficient for ST-010

### CI prerequisites

- GitHub repository secret `OPENROUTER_API_KEY` must be configured before the workflow is enabled.
- The CI workflow writes this secret into a temporary `.env` file at runtime; the secret must never be committed.

### Prior stories that must be Done

- ST-005 (search quality — Done)
- ST-008 (consolidation worker — Done)
- ST-022 (entity extraction — Done)
- ST-035 (entity mentions — Done)
- ST-036 (dev/test DB separation — Done)

### Boilerplate: E2E test file structure

```typescript
// server/tests/e2e.test.ts
/**
 * End-to-end integration tests for the ai-memory MCP server.
 * Story: ST-010
 *
 * Run:
 *   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/e2e.test.ts
 */

import { sql } from "../src/db.ts";
import { mcpCall, extractText, sleep } from "./_helpers/mcpClient.ts";

// --- Test group: BM25 lane ---
// --- Test group: Vector lane ---
// --- Test group: Consolidation → wiki ---
// --- Test group: Entity extraction → graph + entity_mentions ---
// --- Test group: Context scoping + project boost ---
// --- Test group: Recall events ---
// --- Test group: MMR diversification ---
// --- Test group: Recall quality threshold ---
```

### Boilerplate: CI workflow structure

```yaml
# .github/workflows/ci.yml
name: CI — Integration Tests
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Require OPENROUTER_API_KEY secret
        run: |
          if [ -z "${{ secrets.OPENROUTER_API_KEY }}" ]; then
            echo "Missing repository secret OPENROUTER_API_KEY"
            exit 1
          fi
      - name: Create .env for CI
        run: |
          echo "MEMORY_API_KEY=ci-test-key" >> .env
          echo "DB_PASSWORD=ci-test-password" >> .env
          echo "OPENROUTER_API_KEY=${{ secrets.OPENROUTER_API_KEY }}" >> .env
      - name: Start test stack
        run: docker compose --profile test up -d --build --wait
      - name: Run integration tests
        run: docker compose --profile test exec -T mcp-test deno test --allow-net --allow-env --allow-read tests/
      - name: Print logs on failure
        if: failure()
        run: docker compose --profile test logs
      - name: Tear down
        if: always()
        run: docker compose --profile test down -v
```

---

## §4. Task Definitions

### Task 4.0: Preflight — verify Docker daemon is running

**Objective:** Confirm that Docker Desktop is running and the test profile containers can be reached before attempting any task that requires container access.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Run `docker info` and confirm exit code 0.
2. If it fails: start Docker Desktop (`Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`), then poll `docker info` every 10 s (max 2 min) until it succeeds.
3. Once Docker responds, run `docker compose --profile test up -d`.
4. Poll `curl http://localhost:3001/health` every 5 s (max 90 s) until it returns `ok`.
5. Run `docker compose --profile test ps` and confirm the stack state is correct: `db-test` and `mcp-test` are `healthy`, and the one-shot `seed` service has completed successfully as `Exited (0)`.

**Verification:**
```powershell
docker compose --profile test ps
curl http://localhost:3001/health
```
Expected: `db-test` and `mcp-test` show `healthy`; `seed` shows `Exited (0)`; `/health` returns `ok`.

**Failure handling:**
- If Docker cannot start after 2 minutes, stop execution and report the environmental blocker in §2c. Do not attempt subsequent tasks.
- If `seed` exits non-zero, inspect `docker compose --profile test logs seed` and stop. Do not continue with an unseeded test database.

---

### Task 4.1: Verify existing fixture has pre-seeded embeddings for vector lane

**Objective:** Confirm that the existing `search-quality-corpus.sql` already contains non-null 512-dim embeddings for the corpus rows, ensuring CI-hermetic vector search tests without needing a live OpenRouter call.

**Input:** `server/tests/fixtures/search-quality-corpus.sql`, `server/tests/fixtures/search-quality-queries.json`

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Open `server/tests/fixtures/search-quality-corpus.sql` and verify that the `INSERT INTO public.thoughts` statements include `embedding` column values as `'[...]'::vector(512)` or similar non-null vector literals.
2. Record the fixed BM25-negative query/ID pair for Task 4.2 Group 2 from `server/tests/fixtures/search-quality-queries.json`: `query = "zoom recording auto archive"`, `expected_id = "00000000-0000-4000-8000-000000000004"`.
3. Prove that this pair isolates vector retrieval by running a BM25-only SQL probe against `db-test`: the expected row must be absent from `search_vector @@ plainto_tsquery('english', query)` results for that query.

**Expected output:** Confirmation (in the execution log) that `search-quality-corpus.sql` contains vector literals and that Task 4.2 Group 2 will use `"zoom recording auto archive"` → `00000000-0000-4000-8000-000000000004`, with a direct SQL proof that the expected row is absent from BM25-only candidates.

**Requirement mapping:** Satisfies "Pre-seeded embeddings for vector tests" row in §2d.

**Verification:**
```powershell
docker compose --profile test exec -T mcp-test sh -c "grep -c '::vector' /app/tests/fixtures/search-quality-corpus.sql"
docker compose --profile test exec -T db-test psql -U ai_memory -d ai_memory -tAc "SELECT id FROM thoughts, plainto_tsquery('english', 'zoom recording auto archive') AS q WHERE search_vector @@ q AND id = '00000000-0000-4000-8000-000000000004'::uuid"
```
Expected result: The first command returns a count ≥ 1, confirming vector literals exist; the second command returns no rows, confirming the chosen expected row is not a BM25-only match.

**Failure handling:**
- If no embeddings exist, stop and return plan-review. This story depends on the checked-in seeded vectors; do not invent a new vector fixture ad hoc.
- If the BM25-only probe returns the expected row, stop and return plan-review. The checked-in pair no longer proves vector-lane behaviour.

---

### Task 4.2: Create unified E2E test file

**Objective:** Create `server/tests/e2e.test.ts` containing all E2E test cases covering AC1–AC6 while retaining the existing MMR, recall-quality, project-boost, `entity_mentions`, and `graph_search` validation assertions that are currently split across separate files.

**Input:** 
- Existing test patterns from the 8 files being replaced (as documented in §1)
- Shared helper: `server/tests/_helpers/mcpClient.ts` (`mcpCall`, `extractText`, `sleep`)
- Direct DB access: `import { sql } from "../src/db.ts"`
- Vector-lane query/ID pair from Task 4.1

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/e2e.test.ts` with the structure from §3 boilerplate. Import `sql`, `mcpCall`, `extractText`, and `sleep`. At the top of the file, declare these constants:
  - `VECTOR_QUERY = "zoom recording auto archive"`
  - `VECTOR_EXPECTED_ID = "00000000-0000-4000-8000-000000000004"`

2. Add local helpers reused by multiple tests:
  - `parseIds(text: string): string[]` extracting all `ID: <uuid>` lines.
  - `waitForEntityExtraction(thoughtId: string, maxSec = 40)` polling `entity_extraction_queue.status` once per second until it becomes `done` or `failed`; fail immediately on `failed` or if `done` is not reached within 40 s.
  - `cleanupNonCorpusState()` that first deletes non-corpus `consolidation_log` rows, then deletes non-corpus thoughts. Call it once at top-of-file before defining tests:
    ```typescript
    await sql`
     DELETE FROM consolidation_log
     WHERE thought_id::text NOT LIKE '00000000-0000-4000-8000-%'
       OR (wiki_id IS NOT NULL AND wiki_id::text NOT LIKE '00000000-0000-4000-8000-%')
    `;
    await sql`DELETE FROM thoughts WHERE id::text NOT LIKE '00000000-0000-4000-8000-%'`;
    ```
    This avoids FK failures from old `consolidation_log` rows and prevents interference from prior test runs in the same container session.

3. **Group 1 — BM25 lane (AC1):**
  Write a test named `"e2e: capture_thought → search_thoughts returns via BM25 lane"`:
  - Generate a unique keyword using `crypto.randomUUID()`.
  - Call `mcpCall("capture_thought", { content: "...<uuid-keyword>...", context: "project:e2e-test" })`.
  - Extract the thought ID from the response text using `/id:\s*([0-9a-f-]{36})/i`.
  - Do **not** add a wait loop for `search_vector`. BM25 readiness is synchronous because `search_vector` is a generated column.
  - Call `mcpCall("search_thoughts", { query: "<uuid-keyword>", context: "project:e2e-test", limit: 5 })` immediately after capture.
  - Assert the returned results contain the captured thought ID/content.
  - Cleanup: `DELETE FROM thoughts WHERE id = '<id>'::uuid`. This cascades queue rows, `entity_mentions`, and recall rows.

4. **Group 2 — Vector lane (AC2):**
  Write a test named `"e2e: search_thoughts returns pre-seeded thought via vector lane"`:
  - Use `VECTOR_QUERY` and `VECTOR_EXPECTED_ID` from step 1.
  - Before any MCP call, run a direct SQL BM25 probe:
    ```sql
    SELECT id
    FROM thoughts, plainto_tsquery('english', $query) AS q
    WHERE search_vector @@ q
     AND id = $expected_id::uuid;
    ```
    Assert that this returns zero rows. If it returns the expected row, the test no longer isolates the vector lane and must fail.
  - Call `mcpCall("search_thoughts", { query: VECTOR_QUERY, limit: 10 })`.
  - Assert `VECTOR_EXPECTED_ID` appears in the returned IDs.
  - No cleanup needed; this uses seed corpus data only.

5. **Group 3 — Consolidation→Wiki (AC3):**
  Write a test named `"e2e: consolidate promotes shard → wiki and archives the source shard"`:
  - Use a deterministic UUID such as `"00000000-0010-4000-a001-000000000001"`.
  - Insert a shard directly via SQL with a distinctive phrase and `project = 'e2e-consolidation'`.
  - Insert 3 recall events with the required columns (`thought_id`, `query`, `rrf_score`, `rank`, `project`) and 3 distinct project values so the candidate comfortably clears the promotion threshold.
  - Verify that the insert trigger auto-queued the shard: `SELECT status FROM consolidation_queue WHERE thought_id = '<id>'::uuid` should return `pending`. Do **not** insert a queue row manually.
  - Call `mcpCall("consolidate", { dry_run: false })`.
  - Poll (up to 15 s) for `SELECT wiki_id::text FROM consolidation_log WHERE thought_id = '<id>'::uuid AND operation = 'promote' ORDER BY created_at DESC LIMIT 1`; assert a row exists and `wiki_id` is non-null.
  - Verify the original shard has `active = false`.
  - Call `mcpCall("search_thoughts", { query: "autovacuum billing guidance", context: "project:e2e-consolidation", limit: 10 })` and assert the returned IDs include `wiki_id` and do **not** include the original shard ID.
  - Cleanup using the same order as `server/tests/consolidation-worker.test.ts`: delete `consolidation_log` rows referencing the shard/wiki IDs, delete the promoted wiki row, then delete the source shard row.

6. **Group 4 — Entity extraction → graph + `entity_mentions` retention (AC4 + coverage parity):**
  Add these tests, all using unique entity names with a UUID suffix so lingering AGE nodes cannot collide across reruns:
  - `"e2e: capture_thought → entity extraction populates graph_search, graph_traverse, and entity_mentions"`
    - Capture content like `"<PersonName> debugged a NullReferenceError in the ETL pipeline for project <ProjectName>"`, where `PersonName` and `ProjectName` each include a short UUID suffix.
    - Extract the thought ID.
    - Call `waitForEntityExtraction(thoughtId, 40)`.
    - Assert `entity_mentions` contains rows for that `thought_id` and includes at least one expected entity name.
    - Call `mcpCall("graph_search", { start_node: PersonName, max_hops: 2 })` and assert the response contains at least one connected entity (`NullReferenceError`, `ETL`, or `ProjectName`).
    - Call `mcpCall("graph_traverse", { cypher: "MATCH (n:Person) WHERE n.name = '<PersonName>' RETURN n LIMIT 1" })` and assert the raw output includes `PersonName`.
    - Cleanup: delete the thought row only; rely on cascading cleanup for relational tables. Do not attempt AGE graph-node deletion.
  - `"e2e: graph_search rejects invalid relationship_filter"`
    - Call `mcpCall("graph_search", { start_node: "Alice", relationship_filter: "INVALID_REL", max_hops: 1 })`.
    - Assert the returned text contains `Invalid relationship_filter` and the allowed relationship list.
  - `"e2e: entity_mentions re-extraction removes stale rows and inserts new ones"`
    - Capture a thought with unique entity names.
    - Wait for extraction, then update both `content` and `content_fingerprint` directly in `thoughts` so the trigger re-queues extraction.
    - Wait for extraction again.
    - Assert old entity names are gone from `entity_mentions` and new entity names are present.
    - Cleanup: delete the thought row.
  - `"e2e: entity_mentions CHECK constraint rejects unknown label"`
    - Capture an anchor thought, wait for extraction, then attempt `INSERT INTO entity_mentions (..., 'Animal', 'Cat')`.
    - Assert the insert throws and the message mentions `check` or `constraint`.
    - Cleanup: delete the thought row.
  - `"e2e: entity_mentions cascade-deletes when the thought is removed"`
    - Capture a thought, wait for extraction, verify `entity_mentions` count > 0, delete the thought row, then assert the count drops to 0.

  **Current runtime note:** `docker-compose.yml` disables only the consolidation worker in `mcp-test`. The entity worker remains enabled, so the tests should poll `entity_extraction_queue` rather than invoking worker internals directly.

7. **Group 5 — Context scoping + project boost (AC5 + coverage parity):**
  Write four tests migrated from `search-strict-flag.test.ts` and `search-project-boost.test.ts`:
  - `"e2e: strict:true returns only in-project rows"` — use `context: "project:zoom,strict:true"` and assert no non-zoom project labels appear.
  - `"e2e: non-strict with project boost shows cross-project results"` — use `context: "project:zoom"` and assert at least one `bcf-managers` result still appears.
  - `"e2e: NULL-project rows remain visible in project-scoped non-strict search"` — query `"typescript narrow union types"` with `context: "project:zoom"`, assert ID `00000000-0000-4000-8000-000000000009` appears, and assert its rendered header has no `/ <project>` suffix.
  - `"e2e: in-project rows outrank cross-project rows for the same query"` — query `"zoom meeting"` with `context: "project:zoom"`, then assert the first zoom-project result appears before the first `bcf-managers` result.

8. **Group 6 — Recall events (AC6):**
  Write a test named `"e2e: search_thoughts logs recall_events for each returned result"`:
  - Perform a `search_thoughts` call with a known corpus query that returns at least one result.
  - Poll (up to 5 s) for `recall_events` rows matching the query and timestamp > test start.
  - Assert the count of `recall_events` rows equals the number of returned result IDs.
  - Cleanup: delete the recall rows created by this test via timestamp filter.

9. **Group 7 — MMR diversification retained:**
  Write two tests migrated from `server/tests/search-mmr.test.ts`:
  - `"e2e: MMR diversifies near-duplicate zoom hits out of top-3"` — query `"zoom meeting recording rotation"`, assert at most 2 of IDs `...0001`, `...0002`, `...0003` appear in the top 3.
  - `"e2e: MMR keeps null-embedding row returnable"` — query `"null pointer constructor"`, assert the result text still contains a null-pointer-topic hit.

10. **Group 8 — Recall quality threshold retained:**
   Write a test migrated from `server/tests/search-recall-quality.test.ts`:
   - Load `server/tests/fixtures/search-quality-queries.json`.
   - For each query/expected_id pair, call `search_thoughts` with `limit: 10`.
   - Assert at least 8 of 10 expected IDs appear in the top-10 results.

**Expected output:** `server/tests/e2e.test.ts` created with 8 test groups covering BM25, vector, consolidation, entity→graph, context scoping, recall events, MMR diversification, and recall-quality threshold, while also retaining the current project-boost, `entity_mentions`, and `graph_search` validation assertions inside those groups.

**Requirement mapping:** Satisfies AC1, AC2, AC3, AC4, AC5, AC6, MMR-retention, and recall-quality-retention rows in §2d.

**Verification:**
```powershell
docker compose --profile test down; docker compose --profile test up -d; Start-Sleep 15
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/e2e.test.ts
```
Expected result: All tests pass (0 failures). If any tests fail, diagnose and fix before proceeding — do not move to the next task with broken tests.

**Failure handling:**
- If entity extraction or consolidation times out on LLM work: verify that the local `.env` / GitHub Actions secret supplies a real `OPENROUTER_API_KEY`. Do **not** weaken the assertion to accommodate a dummy key; fail fast and fix the environment.
- If `graph_search` errors: verify the call shape matches the current MCP contract (`start_node`, optional `relationship_filter`, optional `max_hops`) rather than older parameter names.
- If the vector-lane test returns the expected row in the BM25 probe, stop and return plan-review. That means the chosen pair no longer isolates vector retrieval.
- If graph assertions become flaky across reruns, keep the unique UUID-suffixed entity names. Do not switch back to shared names like `Alice`.
- If the top-of-file cleanup hits FK errors, confirm the `consolidation_log` delete runs before the `thoughts` delete; do not simplify it back to a single `DELETE FROM thoughts`.

**Task-close commit:** After the file is green, stage and commit the Task 4.2 work per Session Resilience:
```powershell
git add server/tests/e2e.test.ts
git commit -m "test(e2e): add unified ST-010 integration suite" -m "Story: ST-010" -m "Task: §4.2"
```

---

### Task 4.3: Create GitHub Actions CI workflow

**Objective:** Create `.github/workflows/ci.yml` that runs the integration test suite on every push to main and PRs.

**Input:** §3 boilerplate CI workflow structure.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create the directory `.github/workflows/` if it doesn't exist.

2. Create `.github/workflows/ci.yml` with the following content (refined from §3 boilerplate):

```yaml
name: CI — Integration Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - name: Require OPENROUTER_API_KEY secret
        run: |
          if [ -z "${{ secrets.OPENROUTER_API_KEY }}" ]; then
            echo "Missing repository secret OPENROUTER_API_KEY"
            exit 1
          fi

      - name: Create .env for CI
        run: |
          cat <<EOF > .env
          MEMORY_API_KEY=ci-test-key
          DB_PASSWORD=ci-test-password
          OPENROUTER_API_KEY=${{ secrets.OPENROUTER_API_KEY }}
          EOF

      - name: Start test infrastructure
        run: docker compose --profile test up -d --build --wait

      - name: Wait for mcp-test healthy
        run: |
          for i in $(seq 1 30); do
            if curl -sf http://localhost:3001/health; then
              echo "mcp-test is healthy"
              exit 0
            fi
            echo "Waiting for mcp-test... ($i/30)"
            sleep 2
          done
          echo "mcp-test did not become healthy"
          docker compose --profile test logs
          exit 1

      - name: Run integration tests
        run: docker compose --profile test exec -T mcp-test deno test --allow-net --allow-env --allow-read tests/

      - name: Print logs on failure
        if: failure()
        run: docker compose --profile test logs --tail=100

      - name: Tear down
        if: always()
        run: docker compose --profile test down -v
```

3. Validate the YAML syntax is correct (no tab characters, proper indentation).

**Expected output:** `.github/workflows/ci.yml` created.

**Requirement mapping:** Satisfies AC7 row in §2d.

**Verification:**
```powershell
Test-Path ".github/workflows/ci.yml"
Select-String -Path ".github/workflows/ci.yml" -Pattern "OPENROUTER_API_KEY=\$\{\{ secrets.OPENROUTER_API_KEY \}\}"
Select-String -Path ".github/workflows/ci.yml" -Pattern "docker compose --profile test exec -T mcp-test deno test --allow-net --allow-env --allow-read tests/"
```
Expected result: File exists and contains both the required secret injection and the required test command. (Full CI verification happens on first push; local verification is structural only.)

**Failure handling:** If the secret-reference line is missing, fix the workflow before proceeding. Do not substitute a dummy key; entity extraction and consolidation tests depend on the live runtime integration.

**Task-close commit:**
```powershell
git add .github/workflows/ci.yml
git commit -m "chore(ci): add ST-010 integration workflow" -m "Story: ST-010" -m "Task: §4.3"
```

---

### Task 4.4: Delete old E2E test files

**Objective:** Remove the 8 E2E test files that have been consolidated into `e2e.test.ts`.

**Input:** List of files to delete:
- `server/tests/entity-worker.test.ts`
- `server/tests/entity-mentions.test.ts`
- `server/tests/consolidation-worker.test.ts`
- `server/tests/search-project-boost.test.ts`
- `server/tests/search-mmr.test.ts`
- `server/tests/search-recall-events.test.ts`
- `server/tests/search-recall-quality.test.ts`
- `server/tests/search-strict-flag.test.ts`

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Delete each of the 8 files listed above using `git rm`:
   ```powershell
   git rm server/tests/entity-worker.test.ts server/tests/entity-mentions.test.ts server/tests/consolidation-worker.test.ts server/tests/search-project-boost.test.ts server/tests/search-mmr.test.ts server/tests/search-recall-events.test.ts server/tests/search-recall-quality.test.ts server/tests/search-strict-flag.test.ts
   ```

2. Verify only 3 test files remain:
   ```powershell
   Get-ChildItem server/tests/*.test.ts
   ```
   Expected output: `e2e.test.ts`, `parseContext.test.ts`, `consolidation-scoring.test.ts`.

3. Run the full test suite to confirm nothing is broken by the deletion:
   ```powershell
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
   ```

**Expected output:** Only 3 `.test.ts` files remain; full test suite passes with the retained project-boost, `entity_mentions`, graph-validation, MMR, and recall-quality assertions now living inside `e2e.test.ts`.

**Requirement mapping:** Satisfies AC8 row in §2d. Also confirms "Unit tests kept separate" requirement.

**Verification:**
```powershell
(Get-ChildItem server/tests/*.test.ts).Name | Sort-Object
```
Expected result: `consolidation-scoring.test.ts`, `e2e.test.ts`, `parseContext.test.ts` — exactly 3 files.

```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```
Expected result: All tests pass (0 failures).

**Failure handling:**
- If any retained behaviour from `entity-mentions.test.ts`, `entity-worker.test.ts`, or `search-project-boost.test.ts` is not yet present in `e2e.test.ts`, do **not** delete the source file yet. Finish the migration first.
- If any test was accidentally deleted that shouldn't have been, restore it from git and keep it as a separate file. Add it to the "kept separate" list.

**Task-close commit:**
```powershell
git add -u server/tests
git commit -m "test(e2e): remove superseded split integration tests" -m "Story: ST-010" -m "Task: §4.4"
```

---

### Task 4.5: Verify full suite after per-task commits

**Objective:** Run a fresh-stack full verification after the task-specific commits from Tasks 4.2, 4.3, and 4.4. Do **not** squash or replace those per-task commits here.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Confirm Tasks 4.2, 4.3, and 4.4 were already committed individually per `.github/instructions/session-resilience.instructions.md`. Do **not** amend or squash them into a single catch-all commit.

2. Run the full test suite one final time from a fresh stack:
   ```powershell
   docker compose --profile test down; docker compose --profile test up -d; Start-Sleep 15
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
   ```

3. Inspect recent history and confirm the task commits are present:
  ```powershell
  git log --oneline -3
  ```

4. If Task 4.5 itself updates planning artifacts (for example §5b Recovery Ledger or §6 execution notes), commit those edits separately rather than amending prior task commits:
  ```powershell
  git add .github/planning/execplans/exec-plan-ST-010.md
  git commit -m "chore(execplan): record ST-010 full-suite verification" -m "Story: ST-010" -m "Task: §4.5"
  ```

**Expected output:** Full test suite green from a fresh stack, with recent history showing separate Task 4.2/4.3/4.4 commits rather than a single squashed catch-all commit.

**Requirement mapping:** Confirms all AC1–AC8 and the coverage-parity checks in a single clean run.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```
Expected result: All tests pass. Output shows test cases for BM25, vector, consolidation, entity extraction, context scoping, recall events, MMR diversification, and recall-quality threshold.

```powershell
git log --oneline -3
```
Expected result: Shows separate recent commits for Tasks 4.2, 4.3, and 4.4 rather than a single squashed verification commit.

**Failure handling:** If tests fail after the fresh compose restart, the issue is likely test ordering or state leakage. Add explicit cleanup at the top of each test group (DELETE statements for test-created rows). Do NOT proceed to Task 4.6 with failing tests.

---

### Task 4.6: Cross-model review

**Objective:** Request a cross-model review of the shipped implementation before moving to Review.

**Steps:**

1. Request a cross-model critical review. The reviewer reads:
   - This ExecPlan's §2 acceptance criteria
   - The shipped `server/tests/e2e.test.ts`
   - The `.github/workflows/ci.yml`
   - The deleted file list

2. The reviewer checks:
   - Do the E2E tests actually validate the stated ACs (not just pass trivially)?
   - Are there behavioural paths or edge cases the tests miss?
   - Does the CI workflow correctly exercise the test infrastructure?
   - Is the corpus isolation guard sufficient to prevent inter-test interference?

3. Address any defects found by the review before moving forward.

4. After review passes, update the board:
  - Move ST-010 from In Progress → Review in `.github/planning/story-board.md`
   - Update §1b Outcomes & Conclusions in this ExecPlan

5. Commit the board move:
   ```
   chore(board): move ST-010 to Review

   Story: ST-010
   Task: §4.6
   ```

**Verification:** `git status` clean; board shows ST-010 in Review column.

**Failure handling:** If the cross-model review finds contract defects, fix them in a new commit before the board move. Document findings in §6b Surprises & Discoveries.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.5 — Full suite verification |
| **Last successful command** | `docker compose --profile test exec mcp-test deno test tests/` → 27/27 pass (fresh stack) |
| **Expected outputs produced** | `e2e.test.ts` (16 tests), `ci.yml`, 8 files deleted, 3 test files remain, all 27 tests green |
| **Next task** | Task 4.6 — Cross-model review gate |
| **Known blockers** | None |
| **Last updated** | 2026-05-28 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-27T00:00:00Z | Task 4.0 | 🔴 Blocked (env) | Docker Desktop process running but WSL2 Linux engine unresponsive; `docker info`, `docker ps`, `docker version` all hang; `wsl -l --running` also hangs. Named pipes `\\.\pipe\dockerDesktopLinuxEngine` and `\\.\pipe\docker_engine` exist but do not respond. Force-killed all docker/wsl processes and relaunched Docker Desktop; daemon still did not become ready after ~4 min polling. Laptop restart required. | After restart: re-run Task 4.0 from step 1 || 2026-05-27T23:45:00Z | Task 4.0 | ✅ Done | `db-test: healthy`, `mcp-test: healthy`, `seed: Exited (0)`, `curl http://localhost:3001/health` → `ok` (stack remained up through Docker Desktop restart) | Task 4.1 |
| 2026-05-27T23:46:00Z | Task 4.1 | ✅ Done | `grep -c '::vector'` = 28 in search-quality-corpus.sql; BM25-negative probe for `"zoom recording auto archive"` → `...004` returned zero rows | Task 4.2 |
| 2026-05-28T00:10:00Z | Task 4.2 | ✅ Done | `server/tests/e2e.test.ts` created, 16/16 pass on fresh stack (1m18s). Commit `0e8155d` | Task 4.3 |
| 2026-05-28T00:12:00Z | Task 4.3 | ✅ Done | `.github/workflows/ci.yml` created with secret injection + compose test profile. Commit `40ca1df` | Task 4.4 |
| 2026-05-28T00:15:00Z | Task 4.4 | ✅ Done | 8 legacy files deleted. 27/27 tests pass on fresh stack. Commit `27327f7` | Task 4.5 |
| 2026-05-28T00:16:00Z | Task 4.5 | ✅ Done | Per-task commits confirmed in history; full fresh-stack verification 27/27 green | Task 4.6 |
### Avoidance

- **2026-05-27:** Docker CLI hangs indefinitely (exit code never returned) when the WSL2 Linux engine is stuck — force-killing via `taskkill /F /IM wsl.exe /T` and `taskkill /F /IM docker.exe /T` and relaunching Docker Desktop did NOT recover the daemon in this session. A full laptop restart was required. After restart, allow Docker Desktop to fully initialize before running any docker command (wait for the Docker Desktop tray icon to show "Engine running").

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Consolidate 8 E2E files → single e2e.test.ts with all AC coverage | Before Task 4.2 file creation | 🟢 Active |
| 2 | Do not delete legacy files until equivalent MMR, recall-quality, project-boost, `entity_mentions`, and graph-validation assertions exist inside `e2e.test.ts` | Before Task 4.4 delete step | ⬜ Reserve |

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

### S1: Consolidation worker bulk-drains corpus shards (CRITICAL)

**Evidence:** After `mcpCall("consolidate", { dry_run: false })` in the e2e test, 17 of 29 seeded corpus rows were set `active = false`. `consolidation_log` entries confirm corpus thought_ids were processed.

**Root cause:** The seed SQL `INSERT INTO thoughts` triggers `consolidation_queue` rows for every shard (including corpus). The `consolidate` MCP tool calls `drainPendingOnce(false, 50)` which claims ANY pending row — not just the test shard. On the first test run immediately after boot this races the queue and usually only gets the test shard, but on subsequent runs (or if the queue populates before the test runs) it deactivates corpus rows.

**Impact:** Tests 11 (NULL-project), 12 (boost), and 16 (recall-quality) fail because deactivated corpus rows no longer appear in MCP search.

**Fix needed:** The consolidation test must either:
1. Pass `limit: 1` to ensure only one row is drained, OR
2. Delete all corpus rows from `consolidation_queue` before inserting the test shard (so the test shard is the only pending row), OR
3. Add a `thought_id` parameter to the consolidate tool for targeted processing.

Option 2 is simplest and doesn't require server code changes.

### S2: Corpus has 29 rows (not 15) with 8 zoom + 8 bcf-managers

**Evidence:** `SELECT count(*) FROM thoughts WHERE id::text LIKE '00000000-0000-4000-8000-%'` → 29; 28 have embeddings.

**Impact:** Tests that hardcode zoom IDs `...001-004` and bcf IDs `...005-006` have incomplete ID sets. Fixed by updating to full sets.

### S3: Row ...009 (NULL project, TypeScript content) doesn't surface in top-20 for "typescript narrow union types"

**Evidence:** With 28 embedded rows, vector similarity to unrelated content pushes ...009 below rank 20 even though it's BM25 rank 1 for that query.

**Impact:** NULL-project visibility test needs alternate approach (fetch by ID proves non-filtering; or use exact content query).

### S4: BM25-only rows tie with vector-only corpus rows at RRF ~0.0164

**Evidence:** BM25 rank 1 → RRF 1/61 = 0.0164. Corpus rows with embeddings get similar RRF from vector lane alone. Limit of 20 may not surface BM25-only hits.

**Impact:** BM25 test needs limit:30 to reliably surface newly captured thoughts.

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

(Use this section for retrospective depth only. The primary at-a-glance outcomes summary belongs in §1b.)

---

## Revision Notes

- 2026-05-27: Initial ExecPlan authored from QP-010.
- 2026-05-27: PO approved. Status flipped to Ready.
- 2026-05-27: Patched after critical review. Fixed schema/tool mismatches (`search_vector`, `graph_search` args), removed duplicate manual queue insert, restored coverage parity for MMR and recall-quality, and switched CI to require a real `OPENROUTER_API_KEY` repository secret for entity/consolidation tests.
- 2026-05-27: Patched after ExecPlan review. Fixed the Docker preflight status check, changed AC2 to use a BM25-negative vector proof, restored retained coverage for `entity_mentions` and project boost, and aligned Task 4.5 with per-task commit rules.
