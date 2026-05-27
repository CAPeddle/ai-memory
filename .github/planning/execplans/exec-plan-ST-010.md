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

Two current runtime constraints matter for this plan:
- `server/index.ts` only exposes **active** thoughts through MCP read tools (`search`, `fetch`, `search_thoughts`, `list_thoughts`).
- `server/src/consolidationWorker.ts` deactivates the source shard after a successful promotion.

Therefore the board wording "both queryable" is implemented here as: the promoted wiki must be queryable through MCP, while the archived source shard must remain auditable through direct SQL and `consolidation_log` evidence. This matches the shipped runtime semantics instead of assuming inactive thoughts still appear in MCP search results.

Also note that only the vector-lane corpus is hermetic. The entity-extraction worker and consolidation LLM path both call OpenRouter at runtime, so CI needs a real `OPENROUTER_API_KEY` repository secret rather than a dummy value.

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

(Populated at completion.)

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

- **AC1 (BM25):** After running `docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/e2e.test.ts`, the "BM25 lane" test passes — `capture_thought` then `search_thoughts` returns the captured thought ranked by BM25 score.
- **AC2 (Vector):** The "vector lane" test passes — a thought with a pre-seeded embedding (from the fixture) is returned in `search_thoughts` results via the vector lane.
- **AC3 (Consolidation→Wiki):** With a real `OPENROUTER_API_KEY` available, the "consolidation promotion" test passes — `consolidate` writes a `consolidation_log` row with `operation = 'promote'` and a non-null `wiki_id`, the promoted wiki is queryable through MCP, and the original shard is deactivated (`active = false`) and auditable through SQL.
- **AC4 (Entity→Graph):** With a real `OPENROUTER_API_KEY` available, the "entity extraction" test passes — `capture_thought` triggers entity extraction, `graph_search` returns connected entities, and `graph_traverse` returns expected raw graph nodes.
- **AC5 (Context scoping):** The "context scoping" tests pass — project and profile filtering work correctly with both strict and non-strict modes.
- **AC6 (Recall events):** The "recall events" test passes — after `search_thoughts`, a `recall_events` row is created for each returned result.
- **AC7 (CI pipeline):** After pushing to main or opening a PR, the GitHub Actions workflow injects `OPENROUTER_API_KEY` from a GitHub repository secret, runs `docker compose --profile test up -d`, and executes all tests successfully.
- **AC8 (Old files deleted):** After completion, only `e2e.test.ts`, `parseContext.test.ts`, `consolidation-scoring.test.ts`, `_helpers/mcpClient.ts`, and `fixtures/` remain in `server/tests/`.

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

(Empty — populated by /continue when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| AC1: capture→search via BM25 (QP-010) | `server/tests/e2e.test.ts` contains a test that captures, waits for `search_vector`, searches, asserts result | Task 4.2 | Test passes in mcp-test |
| AC2: capture→search via vector (pre-seeded) (QP-010) | `server/tests/e2e.test.ts` uses a fixed query/ID pair from `server/tests/fixtures/search-quality-queries.json` against a pre-seeded embedded row | Task 4.1 (fixture + pair selection), Task 4.2 | Test passes in mcp-test |
| AC3: consolidation promote path + wiki queryability (QP-010, aligned to current runtime semantics) | `server/tests/e2e.test.ts` test calling `consolidate`, asserting `consolidation_log.operation = 'promote'`, non-null `wiki_id`, MCP queryability of the wiki, and SQL evidence that the source shard is inactive | Task 4.2 | Test passes in mcp-test |
| AC4: entity extraction → graph (QP-010) | `server/tests/e2e.test.ts` test calling `capture_thought` → waiting → `graph_search` and `graph_traverse` | Task 4.2 | Test passes in mcp-test |
| AC5: context scoping (project/profile, strict) (QP-010) | `server/tests/e2e.test.ts` tests for strict/non-strict filtering | Task 4.2 | Test passes in mcp-test |
| AC6: recall event tracking (QP-010) | `server/tests/e2e.test.ts` test checking `recall_events` table after search | Task 4.2 | Test passes in mcp-test |
| AC7: CI pipeline (QP-010) | `.github/workflows/ci.yml` triggers on push/PR, runs compose test profile | Task 4.3 | Workflow file exists with correct structure |
| AC8: old E2E files deleted (QP-010) | 8 named files removed from `server/tests/` | Task 4.4 | `ls server/tests/*.test.ts` shows only 3 files |
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
// --- Test group: Entity extraction → graph ---
// --- Test group: Context scoping ---
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

### Task 4.1: Verify existing fixture has pre-seeded embeddings for vector lane

**Objective:** Confirm that the existing `search-quality-corpus.sql` already contains non-null 512-dim embeddings for the corpus rows, ensuring CI-hermetic vector search tests without needing a live OpenRouter call.

**Input:** `server/tests/fixtures/search-quality-corpus.sql`, `server/tests/fixtures/search-quality-queries.json`

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Open `server/tests/fixtures/search-quality-corpus.sql` and verify that the `INSERT INTO public.thoughts` statements include `embedding` column values as `'[...]'::vector(512)` or similar non-null vector literals.
2. Record the exact query/ID pair to use in Task 4.2 Group 2 from `server/tests/fixtures/search-quality-queries.json`: `query = "typescript narrow union"`, `expected_id = "00000000-0000-4000-8000-000000000009"`. This keeps the vector-lane test deterministic and tied to a checked-in fixture pair.
3. If the fixture lacks embeddings (unlikely given the subagent research showing "29 thoughts with 512-dim embeddings"), create a supplemental fixture (`server/tests/fixtures/e2e-vector-seed.sql`) that INSERTs a single row with a hand-crafted 512-dim embedding and distinctive content. Add a volume mount in `docker-compose.yml` under the `seed` service to load this file after the main corpus.

**Expected output:** Confirmation (in the execution log) that `search-quality-corpus.sql` contains vector literals and that Task 4.2 Group 2 will use `"typescript narrow union"` → `00000000-0000-4000-8000-000000000009`. No file changes required if the existing fixture already has embeddings (which it does based on research).

**Requirement mapping:** Satisfies "Pre-seeded embeddings for vector tests" row in §2d.

**Verification:**
```powershell
docker compose --profile test exec mcp-test sh -c "grep -c '::vector' /app/tests/fixtures/search-quality-corpus.sql"
```
Expected result: A count ≥ 1, confirming vector literals exist in the fixture.

**Failure handling:** If no embeddings exist, proceed with the supplemental fixture approach described in step 3. Document the choice in §6c Decision Log.

---

### Task 4.2: Create unified E2E test file

**Objective:** Create `server/tests/e2e.test.ts` containing all E2E test cases covering AC1–AC6 while retaining the existing MMR and recall-quality assertions that are currently split across separate files.

**Input:** 
- Existing test patterns from the 8 files being replaced (as documented in §1)
- Shared helper: `server/tests/_helpers/mcpClient.ts` (`mcpCall`, `extractText`, `sleep`)
- Direct DB access: `import { sql } from "../src/db.ts"`
- Vector-lane query/ID pair from Task 4.1

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/e2e.test.ts` with the structure from §3 boilerplate. Import `sql`, `mcpCall`, `extractText`, `sleep`.

2. **Group 1 — BM25 lane (AC1):**
   Write a test named `"e2e: capture_thought → search_thoughts returns via BM25 lane"`:
   - Generate a unique content string using `crypto.randomUUID()` as a distinctive keyword (to avoid corpus collision).
   - Call `mcpCall("capture_thought", { content: "...<uuid-keyword>...", context: "project:e2e-test" })`.
   - Extract the thought ID from the response text (pattern: `/id:\s*([0-9a-f-]{36})/i`).
   - Poll with retry (up to 5s, 500ms interval): `SELECT id FROM thoughts WHERE id = '<id>' AND search_vector IS NOT NULL` — this confirms the generated `tsvector` column is populated.
   - Call `mcpCall("search_thoughts", { query: "<uuid-keyword>", context: "project:e2e-test" })`.
   - Assert the captured thought ID appears in the results.
   - Cleanup: `DELETE FROM recall_events WHERE thought_id = '<id>'::uuid`, then `DELETE FROM thoughts WHERE id = '<id>'::uuid`.

3. **Group 2 — Vector lane (AC2):**
   Write a test named `"e2e: search_thoughts returns pre-seeded thought via vector lane"`:
   - Use the fixed fixture pair from Task 4.1: `query = "typescript narrow union"`, `expected_id = "00000000-0000-4000-8000-000000000009"`.
   - Call `mcpCall("search_thoughts", { query: "typescript narrow union", limit: 5 })`.
   - Assert the expected ID appears in results.
   - No cleanup needed — uses seed corpus data.

4. **Group 3 — Consolidation→Wiki (AC3):**
   Write a test named `"e2e: consolidate promotes shard → wiki and archives the source shard"`:
   - Use a deterministic UUID (e.g. `"00000000-0010-4000-a001-000000000001"`).
   - Insert a shard directly via SQL with a distinctive, stable phrase and `project = 'e2e-consolidation'`.
   - Insert 3 recall events with the required columns (`thought_id`, `query`, `rrf_score`, `rank`, `project`) and 3 distinct project values so the candidate comfortably clears the promotion threshold:
     ```sql
     INSERT INTO public.thoughts
       (id, content, memory_type, source, project, confidence, content_fingerprint, active)
     VALUES
       ('<id>'::uuid, 'Autovacuum threshold guidance for billing queue', 'shard', 'user-taught', 'e2e-consolidation', 0.8, 'e2e-fp-autovacuum-billing', true);

     INSERT INTO public.recall_events (thought_id, query, rrf_score, rank, project)
     VALUES
       ('<id>'::uuid, 'autovacuum billing', 0.90, 1, 'e2e-billing'),
       ('<id>'::uuid, 'queue vacuum tuning', 0.80, 1, 'e2e-ops'),
       ('<id>'::uuid, 'billing postgres maintenance', 0.70, 1, 'e2e-finance');
     ```
   - Verify that the insert trigger auto-queued the shard: `SELECT status FROM consolidation_queue WHERE thought_id = '<id>'::uuid` should return `pending`. Do **not** insert a queue row manually; the schema already does that via trigger.
   - Call `mcpCall("consolidate", { dry_run: false })`.
   - Poll (up to 15s): `SELECT wiki_id::text FROM consolidation_log WHERE thought_id = '<id>'::uuid AND operation = 'promote' ORDER BY created_at DESC LIMIT 1` — assert a row exists and `wiki_id` is non-null.
   - Verify the original shard has `active = false`: `SELECT active FROM thoughts WHERE id = '<id>'::uuid`.
   - Call `mcpCall("search_thoughts", { query: "autovacuum billing guidance", context: "project:e2e-consolidation", limit: 10 })` and assert the returned IDs include `wiki_id` and do **not** include the original shard ID. This is the MCP-visible interpretation of "promoted wiki is queryable; source shard is archived".
   - Cleanup using the same order as `server/tests/consolidation-worker.test.ts`: delete `consolidation_log` rows referencing the shard/wiki IDs, delete the promoted wiki row, then delete the source shard row.

5. **Group 4 — Entity extraction→Graph (AC4):**
   Write a test named `"e2e: capture_thought → entity extraction populates graph_search and graph_traverse"`:
   - Capture a thought with clear entity content: `"Alice debugged a NullReferenceError in the ETL pipeline for project Neptune"`.
   - Extract thought ID from response.
   - Poll with retry (up to 20s, 1s interval) for entity extraction to complete: `SELECT COUNT(*) FROM entity_mentions WHERE thought_id = '<id>'::uuid` (expect > 0 once the entity worker processes it).
   - Call `mcpCall("graph_search", { start_node: "Alice", max_hops: 2 })`.
  - Assert the response contains at least one expected connected entity (`NullReferenceError`, `Neptune`, or `ETL`).
   - Call `mcpCall("graph_traverse", { cypher: "MATCH (n:Person) RETURN n LIMIT 5" })` and assert the raw graph output includes `Alice`.
   - Cleanup: `DELETE FROM entity_mentions WHERE thought_id = '<id>'::uuid`, then delete the thought row. Do not attempt AGE graph-node cleanup in this test; the authoritative verification run in Task 4.5 recreates the ephemeral test DB from scratch.

   **Note on entity worker:** The `mcp-test` container has `CONSOLIDATION_WORKER_DISABLED=true` but the entity worker still runs. If the entity worker is also disabled in test, the test should call the entity extraction directly. Check the `mcp-test` environment in `docker-compose.yml` — if `ENTITY_WORKER_DISABLED` is set, this test must be adapted (see Failure handling).

6. **Group 5 — Context scoping (AC5):**
   Write two tests:
   - `"e2e: strict:true returns only in-project rows"` — replicate the logic from `search-strict-flag.test.ts` using the seed corpus (project:zoom, strict:true → no non-zoom results).
   - `"e2e: non-strict with project boost shows cross-project results"` — replicate from `search-project-boost.test.ts` (project:zoom without strict → cross-project rows still appear).

7. **Group 6 — Recall events (AC6):**
   Write a test named `"e2e: search_thoughts logs recall_events for each returned result"`:
   - Perform a `search_thoughts` call with a known query that returns ≥1 result from corpus.
   - Poll (up to 5s) for `recall_events` rows matching the query and timestamp > test start.
   - Assert the count of recall_events equals the number of returned result IDs.
   - Cleanup: Delete the recall_events created by this test (by timestamp filter).

8. **Group 7 — MMR diversification retained:**
  Write two tests migrated from `server/tests/search-mmr.test.ts`:
  - `"e2e: MMR diversifies near-duplicate zoom hits out of top-3"` — query `"zoom meeting recording rotation"`, assert at most 2 of IDs `...0001`, `...0002`, `...0003` appear in the top 3.
  - `"e2e: MMR keeps null-embedding row returnable"` — query `"null pointer constructor"`, assert the result text still contains a null-pointer-topic hit.

9. **Group 8 — Recall quality threshold retained:**
  Write a test migrated from `server/tests/search-recall-quality.test.ts`:
  - Load `server/tests/fixtures/search-quality-queries.json`.
  - For each query/expected_id pair, call `search_thoughts` with `limit: 10`.
  - Assert at least 8 of 10 expected IDs appear in the top-10 results.

10. Add a top-of-file corpus isolation guard (same pattern as existing tests):
   ```typescript
   // Remove non-corpus thoughts created by other test files in the same run
   await sql`DELETE FROM thoughts WHERE id::text NOT LIKE '00000000-0000-4000-8000-%' AND id::text NOT LIKE '00000000-0010-4000-%'`;
   ```
   This prevents interference from prior test file runs in the same container session.

**Expected output:** `server/tests/e2e.test.ts` created with 8 test groups: BM25, vector, consolidation, entity→graph, context scoping, recall events, MMR diversification, and recall-quality threshold.

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
- If vector lane test returns no results: verify the seed corpus SQL was loaded into db-test (check `docker compose --profile test logs seed`).

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

**Expected output:** Only 3 `.test.ts` files remain; full test suite passes with MMR and recall-quality assertions now living inside `e2e.test.ts`.

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

**Failure handling:** If any test was accidentally deleted that shouldn't have been (e.g. if a unit test was in one of the 8 files), restore it from git and keep it as a separate file. Add it to the "kept separate" list.

---

### Task 4.5: Commit and verify full suite

**Objective:** Create a single commit with all changes, then run full verification.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Stage all changes:
   ```powershell
   git add server/tests/e2e.test.ts .github/workflows/ci.yml
   git add -u  # stages the deleted files
   ```

2. Commit with Conventional Commits format:
   ```
   test(e2e): consolidate E2E tests + add CI workflow

   Replaces 8 individual E2E test files with a single server/tests/e2e.test.ts
   covering all ST-010 acceptance criteria:
   - BM25 capture→search
   - Vector lane (pre-seeded embeddings)
  - Consolidation shard→wiki promotion (with real OPENROUTER_API_KEY)
   - Entity extraction→graph traversal
   - Context scoping (strict/non-strict)
   - Recall event logging
  - MMR diversification retained
  - Recall-quality threshold retained

  Adds .github/workflows/ci.yml (GitHub Actions) to run the test suite
  on push to main and PRs via docker compose --profile test, injecting
  OPENROUTER_API_KEY from a repository secret.

   Story: ST-010
   Task: §4.5
   ```

3. Run full test suite one final time:
   ```powershell
   docker compose --profile test down; docker compose --profile test up -d; Start-Sleep 15
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
   ```

**Expected output:** Clean commit; full test suite green.

**Requirement mapping:** Confirms all AC1–AC8 in a single clean run.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```
Expected result: All tests pass. Output shows test cases for BM25, vector, consolidation, entity extraction, context scoping, recall events, MMR diversification, and recall-quality threshold.

```powershell
git log --oneline -1
```
Expected result: Shows the commit message starting with `test(e2e):`.

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
| **Last completed task** | — |
| **Last successful command** | — |
| **Expected outputs produced** | — |
| **Next task** | Task 4.1 — Verify existing fixture has pre-seeded embeddings |
| **Known blockers** | None |
| **Last updated** | — |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| — | — | — | — | — |

### Avoidance

(Append dated entries here. Do not delete prior guidance.)

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Consolidate 8 E2E files → single e2e.test.ts with all AC coverage | Before Task 4.2 file creation | 🟢 Active |
| 2 | Do not delete legacy files until equivalent MMR and recall-quality assertions exist inside e2e.test.ts | Before Task 4.4 delete step | ⬜ Reserve |

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

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

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
