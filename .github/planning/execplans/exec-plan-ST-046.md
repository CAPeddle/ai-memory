# ExecPlan — ST-046: Golden-Set Regression Tests

> Status: ⬜ Not Ready
> Story: ST-046
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md

---

## §1. Background & Context

The hybrid search pipeline (BM25 + vector + RRF + MMR) in `server/src/searchQuality.ts` and `server/index.ts` has tunable parameters (RRF k=60, MMR λ=0.7, project boost 1.2). If someone changes these parameters, there's currently no automated check that search quality hasn't degraded.

This story adds a golden-set regression test that:
- Defines expected search results for known queries against the seeded test corpus.
- Asserts that expected results appear in the top-N for each query.
- Fails if a parameter change causes a known-good result to drop out.

**Key files:**
- `server/tests/fixtures/search-quality-corpus.sql` — seeded test corpus
- `server/src/searchQuality.ts` — RRF fusion + MMR reranking
- `server/index.ts` — search_thoughts handler

**Prerequisite knowledge:** The test corpus is loaded by the `seed` Docker Compose service into `db-test`. Tests in `mcp-test` run against this corpus.

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- A golden-set test file exists with at least 3 query/expected-result pairs.
- Changing RRF k from 60 to 10 causes at least one golden-set assertion to fail.
- With default parameters, all golden-set assertions pass.
- All existing tests pass.

---

## §2b. Definition of Ready

- [x] All tasks have step-by-step instructions
- [x] Architecture decisions documented
- [x] Input/output specified
- [x] Error handling noted
- [x] No judgment calls
- [x] Templates provided
- [x] Requirements mapped
- [x] Verification steps
- [x] Observable criteria

Status: ⬜ Not ready — requires /plan

---

## §2c. Plan Review Notes

(Empty)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Search quality golden-set test catches regressions (QP-038 AC-7) | `server/tests/search-golden-set.test.ts` | Task 4.1, 4.2 | Test: modify k → test fails; restore → passes |

---

## §3. Preconditions

- Docker Compose test stack running (`--profile test`)
- Seeded corpus loaded in `db-test`
- Embeddings must be present in the corpus for vector lane to function (check corpus SQL)

---

## §4. Task Definitions

### Task 4.1: Analyse corpus and define golden-set pairs

**Objective:** Identify 3+ query/expected-result pairs from the seeded corpus.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Read `server/tests/fixtures/search-quality-corpus.sql` to understand what content is seeded.

2. Identify at least 3 queries where:
   - The expected result is strongly relevant (would appear in top-5 with both BM25 and vector lanes).
   - The queries cover different types: exact keyword, semantic meaning, project-scoped.

3. Document the golden-set in a JSON structure:
   ```typescript
   const GOLDEN_SET = [
     {
       query: "<query from corpus analysis>",
       context: undefined, // or "project:xxx"
       mustIncludeIds: ["<uuid-from-corpus>"],
       description: "Why this pair tests quality",
     },
     // ... at least 3 entries
   ];
   ```

4. If the corpus doesn't have pre-set UUIDs (uses `gen_random_uuid()`), the test should match by content substring instead of ID:
   ```typescript
   mustIncludeContent: ["substring that must appear in a top-5 result"],
   ```

**Expected output:** A documented golden-set with rationale for each pair.

**Requirement mapping:** §2d row 1

**Verification:** Executor confirms each golden-set query returns its expected result via manual MCP call.

---

### Task 4.2: Write golden-set test

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/search-golden-set.test.ts`:
   ```typescript
   import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
   import { callTool } from "./_helpers/mcpClient.ts";

   interface GoldenEntry {
     query: string;
     context?: string;
     mustIncludeContent: string[];
     description: string;
   }

   // Golden set: queries that MUST return specific results in top-5
   // Derived from analysis of search-quality-corpus.sql
   const GOLDEN_SET: GoldenEntry[] = [
     // Executor fills these based on Task 4.1 corpus analysis
   ];

   for (const entry of GOLDEN_SET) {
     Deno.test(`golden-set: ${entry.description}`, async () => {
       const result = await callTool("search_thoughts", {
         query: entry.query,
         context: entry.context,
         limit: 5,
       });
       assertEquals(result.isError, undefined, "Search should not error");

       const responseText = result.content[0].text;

       for (const expected of entry.mustIncludeContent) {
         assertEquals(
           responseText.includes(expected),
           true,
           `Expected "${expected}" in top-5 results for query "${entry.query}" but got:\n${responseText.slice(0, 500)}`,
         );
       }
     });
   }

   Deno.test("golden-set: search returns results for corpus queries", async () => {
     // Smoke test: at least one query from the corpus returns results
     const result = await callTool("search_thoughts", {
       query: "memory architecture",
       limit: 5,
     });
     assertEquals(result.isError, undefined);
     assertEquals(
       !result.content[0].text.includes("No thoughts found"),
       true,
       "Should find results in the seeded corpus",
     );
   });
   ```

2. The executor must fill in `GOLDEN_SET` entries based on Task 4.1's corpus analysis.

**Expected output:** Test file that fails when search quality degrades.

**Requirement mapping:** §2d row 1

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/search-golden-set.test.ts
```
Expected: All golden-set tests pass with current parameters.

---

### Task 4.3: Verify regression detection

**Objective:** Confirm the golden-set catches parameter changes.

**Steps:**

1. Temporarily change RRF k from 60 to 10 in `server/index.ts` (the `1 / (60 + rank)` formula).
2. Run the golden-set test — at least one should fail.
3. Revert the change.
4. Run again — all should pass.

**Verification:**
```powershell
# With k=10 (should fail at least one)
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/search-golden-set.test.ts
# Expect: at least 1 failure

# Revert, run again (should pass)
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/search-golden-set.test.ts
# Expect: all pass
```

---

### Task 4.4: Full test suite + cross-model review

```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```

**Cross-model review:**
- Are the golden-set assertions robust to corpus ordering? (Yes — we check content presence, not exact rank.)
- Could embedding drift break golden-set tests? (Only if the embedding model changes — document this as a maintenance note.)
- Is the corpus large enough for meaningful golden-set testing? (Check during Task 4.1 — if < 20 thoughts, the golden-set may be trivial.)

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Next task** | Task 4.1 |
| **Known blockers** | None |

---

## §5c. Approach Ledger

| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Content-substring assertions against seeded corpus | git HEAD | 🟢 Active |

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

- 2026-05-31: Initial ExecPlan from QP-038 §4.11.
