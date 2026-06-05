# ExecPlan — ST-055: MMR null-embedding BM25 recall preservation

> Status: ✅ Ready
> Story: ST-055
> Created: 2026-06-05
> Parent query packet: `.github/planning/query-packets/QP-055-mmr-null-embedding-bm25-recall.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

ST-055 fixes a production recall-correctness defect in `search_thoughts`. A freshly captured thought can be lexically searchable immediately because `thoughts.search_vector` is a generated PostgreSQL `tsvector`, but its embedding is produced asynchronously after capture. During that window, the thought can have `embedding = NULL`.

The current hybrid search path in `server/index.ts` does this:

1. Runs a BM25 lane using `plainto_tsquery` over `search_vector`.
2. Runs a vector lane when a query embedding is available.
3. Fuses both lanes with Reciprocal Rank Fusion (RRF) into a score per thought id.
4. Fetches candidate rows and passes `{ id, score, embedding }` into `mmrRerank` in `server/src/searchQuality.ts`.

`mmrRerank` currently splits candidates into embedded (`withEmb`) and null-embedding (`noEmb`) groups. It fills the requested top `k` from embedded candidates first, appends null-embedding candidates after that, then slices to `k`. On any non-trivial corpus with at least `k` embedded candidates, a strong BM25-only candidate can be omitted from final results solely because its embedding has not landed yet. ST-046 exposed this after adding four seeded `build_failure` rows: the e2e test `capture_thought → search_thoughts returns via BM25 lane` failed because the captured BM25-only row did not appear in the final results.

Definitions:

- **BM25 lane:** PostgreSQL full-text ranking via `ts_rank_cd(search_vector, q)`. It catches exact/lexical matches, including newly captured text.
- **Vector lane:** semantic nearest-neighbor ranking via pgvector distance. It requires `embedding IS NOT NULL`.
- **RRF score:** fused relevance score. Higher is better. It is the `score` field passed to `mmrRerank`.
- **MMR:** Maximal Marginal Relevance. It balances relevance (`lambda * score`) against redundancy (`(1 - lambda) * max similarity to selected rows`). This code uses `lambda = 0.7` by default.
- **Null-embedding candidate:** a candidate whose `embedding` is `null`. It can be lexically relevant but cannot be compared for semantic redundancy.

Binding design decision from QP-055: null-embedding candidates participate in the same MMR selection loop as embedded candidates. When either side of a candidate/selected pair lacks an embedding, the pair similarity is `0`. Therefore a null-embedding candidate's MMR score is `lambda * score`. This intentionally gives fresh lexical hits a slight bias: a null row is never redundancy-penalized and may beat an embedded row of equal fused score if the embedded row is redundant with an already-selected result.

Key files:

- `server/src/searchQuality.ts` — contains `cosineSim`, `mmrRerank`, `logRecall`, and `parseVector`; this story changes `mmrRerank` only.
- `server/tests/search-quality.test.ts` — new deterministic pure-function test file for `mmrRerank`.
- `server/tests/e2e.test.ts` — existing integration coverage for `capture_thought → search_thoughts returns via BM25 lane` and `MMR keeps null-embedding row returnable`.

Out of scope:

- Extracting `rrfFuse` for ST-046.
- Adding ST-046's golden-set test file.
- Changing RRF `k`, MMR `lambda`, project boost, BM25 SQL, vector SQL, or embedding generation timing.
- Waiting synchronously for embeddings after capture.
- Raising e2e test limits as the primary fix.

---

## §1b. Outcomes & Conclusions

Status: implementation and verification through Task 4.3 complete; cross-model review remains before moving ST-055 to Review.

Delivered behavior: `mmrRerank` now selects from embedded and null-embedding candidates in one loop. Null embeddings participate with similarity-to-selected `0`, keeping fresh BM25-only hits returnable while preserving diversity among embedded rows.

Verification so far:

- `docker compose --profile test exec mcp-test deno test --allow-env --allow-read tests/search-quality.test.ts` first produced the expected RED state in Task 4.1: high-scoring null candidate and equal-score bias tests failed; three other tests passed.
- `docker compose --profile test exec mcp-test deno check src/searchQuality.ts tests/search-quality.test.ts` passed after Task 4.2.
- `docker compose --profile test exec mcp-test deno test --allow-env --allow-read tests/search-quality.test.ts` passed after Task 4.2: 5 passed, 0 failed.
- `docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/e2e.test.ts` passed after restarting `mcp-test`: 16 passed, 0 failed. The named tests `e2e: capture_thought → search_thoughts returns via BM25 lane` and `e2e: MMR keeps null-embedding row returnable` both passed.
- `docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/` passed: 53 passed, 0 failed.

Downstream note: ST-046 remains blocked until ST-055 is accepted as Done by the PO; do not move or unblock ST-046 during ST-055 closeout.

---

## §2. Definition of Done

- After running the new pure test file in `mcp-test`, a deterministic test proves a high-scoring null-embedding candidate remains in the final top-k when its score merits inclusion.
- After running the new pure test file in `mcp-test`, a deterministic test proves all-null candidates are returned in descending score order.
- After running the new pure test file in `mcp-test`, a deterministic test documents the intentional equal-score bias: a null-embedding candidate may beat an embedded candidate when the embedded candidate is redundancy-penalized and their fused scores are equal.
- After running the new pure test file in `mcp-test`, embedded candidates still show MMR diversity behavior; the implementation has not collapsed to plain score sorting.
- After running the new pure test file in `mcp-test`, degenerate inputs are pinned: empty input returns `[]`, and `k` greater than candidate count returns all available candidates by score/MMR order.
- After running `tests/e2e.test.ts` in `mcp-test`, both `capture_thought → search_thoughts returns via BM25 lane` and `MMR keeps null-embedding row returnable` pass against the ST-046 expanded seeded corpus.
- After running the full server test suite in `mcp-test`, all tests pass, or any unrelated pre-existing failure is documented with evidence in §6b.
- A cross-model critical review passes before ST-055 moves to Review.

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

Status: ✅ Ready — PO approved 2026-06-05

---

## §2c. Plan Review Notes

(Empty — populated by /continue when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Null-embedding candidates participate in one MMR loop with similarity-to-selected = `0` (QP-055 PO Decisions) | `server/src/searchQuality.ts` `mmrRerank` uses one `remaining = [...candidates]` loop and only calls `cosineSim` when both embeddings exist | 4.2 | `deno test --allow-env --allow-read tests/search-quality.test.ts`; `deno check src/searchQuality.ts tests/search-quality.test.ts` |
| High-scoring BM25-only/null candidate remains in final top-k (QP-055 AC) | Test named `mmrRerank keeps a high-scoring null-embedding candidate in top-k` | 4.1, 4.2 | Test fails before Task 4.2 and passes after Task 4.2 |
| All-null degenerate case remains pure score order (QP-055 AC) | Test named `mmrRerank returns all-null candidates by score order` | 4.1, 4.2 | Test passes after Task 4.2 |
| Equal-score null-row bias is pinned (QP-055 AC) | Test named `mmrRerank documents null-embedding equal-score bias` | 4.1, 4.2 | Test passes after Task 4.2 |
| Embedded candidates still receive diversity ranking (QP-055 AC) | Test named `mmrRerank still swaps a redundant embedded row for a diverse embedded row` | 4.1, 4.2 | Test passes after Task 4.2 |
| Degenerate inputs remain stable (plan-review nit, optional but cheap) | Test named `mmrRerank handles empty input and k larger than candidate count` | 4.1, 4.2 | Test passes after Task 4.2 |
| ST-046 e2e blocker is gone (QP-055 AC) | Existing `server/tests/e2e.test.ts` test `capture_thought → search_thoughts returns via BM25 lane` passes | 4.3 | `deno test --allow-net --allow-env --allow-read tests/e2e.test.ts` |
| Existing null-embedding e2e coverage still passes (QP-055 AC) | Existing `server/tests/e2e.test.ts` test `MMR keeps null-embedding row returnable` passes | 4.3 | `deno test --allow-net --allow-env --allow-read tests/e2e.test.ts` |
| Full suite green or unrelated failures documented (QP-055 AC) | Full `server/tests/` suite result recorded in §6b/§1b | 4.3 | `deno test --allow-net --allow-env --allow-read tests/` |
| Cross-model critical review before Review (plan.prompt.md) | Review notes recorded in §6c and story remains out of Review until pass | 4.4 | Cross-model review response recorded; board update only after pass |

---

## §3. Preconditions

- Working directory for all commands: `c:\projects\ai-memory\`.
- Docker Compose test profile is available. If it is not running, start it with:
  ```powershell
  docker compose --profile test up -d
  ```
- Tests run inside `mcp-test`, not on the host. Do not assume host Deno is installed.
- The ST-046 expanded corpus is already committed in `server/tests/fixtures/search-quality-corpus.sql`. If `db-test` was not reseeded after that commit, restart the test profile before e2e verification:
  ```powershell
  docker compose --profile test down
  docker compose --profile test up -d
  ```
- `mcp-test` needs its normal test environment, including `DATABASE_URL`, `MEMORY_API_KEY`, and `OPENROUTER_API_KEY`, supplied by `docker-compose.yml` / `.env`.
- `opencode.json` may be present as an unrelated untracked local file. Do not stage it unless the PO explicitly asks.

### Test file template

Create `server/tests/search-quality.test.ts` in Task 4.1 with this content:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mmrRerank } from "../src/searchQuality.ts";

const axisA = [1, 0, 0];
const axisB = [0, 1, 0];

Deno.test("mmrRerank keeps a high-scoring null-embedding candidate in top-k", () => {
  const result = mmrRerank([
    { id: "embedded-anchor", score: 1.0, embedding: axisA },
    { id: "embedded-redundant", score: 0.99, embedding: axisA },
    { id: "embedded-diverse", score: 0.98, embedding: axisB },
    { id: "fresh-bm25-null", score: 0.97, embedding: null },
  ], 3, 0.7).map((r) => r.id);

  assertEquals(result, ["embedded-anchor", "embedded-diverse", "fresh-bm25-null"]);
});

Deno.test("mmrRerank returns all-null candidates by score order", () => {
  const result = mmrRerank([
    { id: "first", score: 0.9, embedding: null },
    { id: "third", score: 0.7, embedding: null },
    { id: "second", score: 0.8, embedding: null },
  ], 3, 0.7).map((r) => r.id);

  assertEquals(result, ["first", "second", "third"]);
});

Deno.test("mmrRerank documents null-embedding equal-score bias", () => {
  const result = mmrRerank([
    { id: "anchor", score: 1.0, embedding: axisA },
    { id: "redundant-equal", score: 0.8, embedding: axisA },
    { id: "null-equal", score: 0.8, embedding: null },
  ], 2, 0.7).map((r) => r.id);

  assertEquals(result, ["anchor", "null-equal"]);
});

Deno.test("mmrRerank still swaps a redundant embedded row for a diverse embedded row", () => {
  // This low-lambda test isolates the diversity penalty. The production-lambda
  // path is already covered by the high-scoring null-embedding test above,
  // where the diverse embedded row beats the redundant embedded row at λ=0.7.
  const result = mmrRerank([
    { id: "anchor", score: 1.0, embedding: axisA },
    { id: "redundant", score: 0.9, embedding: axisA },
    { id: "diverse", score: 0.5, embedding: axisB },
  ], 2, 0.4).map((r) => r.id);

  assertEquals(result, ["anchor", "diverse"]);
});

Deno.test("mmrRerank handles empty input and k larger than candidate count", () => {
  assertEquals(mmrRerank([], 3, 0.7), []);

  const result = mmrRerank([
    { id: "first", score: 0.9, embedding: null },
    { id: "second", score: 0.8, embedding: null },
  ], 10, 0.7).map((r) => r.id);

  assertEquals(result, ["first", "second"]);
});
```

### `mmrRerank` implementation template

In Task 4.2, replace only `mmrRerank` in `server/src/searchQuality.ts` with this unified-loop implementation shape:

```typescript
export function mmrRerank(candidates: MmrCandidate[], k: number, lambda = 0.7): { id: string; score: number }[] {
  const selected: MmrCandidate[] = [];
  const remaining = [...candidates];

  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0, bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      let maxSim = 0;
      if (c.embedding !== null) {
        for (const s of selected) {
          if (s.embedding === null) continue;
          const sim = cosineSim(c.embedding, s.embedding);
          if (sim > maxSim) maxSim = sim;
        }
      }
      const mmr = lambda * c.score - (1 - lambda) * maxSim;
      if (mmr > bestScore) { bestScore = mmr; bestIdx = i; }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected.map((c) => ({ id: c.id, score: c.score }));
}
```

Do not change `cosineSim`, `logRecall`, `parseVector`, RRF scoring, SQL queries, or response formatting in this story.

---

## §4. Task Definitions

### Task 4.1: Add RED pure MMR tests for null-embedding candidates

**Objective:** Add deterministic pure-function tests that capture the desired null-embedding MMR semantics before implementation.

**Input:** Current `server/src/searchQuality.ts` where `mmrRerank` appends null-embedding candidates after embedded selections.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/search-quality.test.ts` exactly from the §3 Test file template.
2. Run the new test file:
   ```powershell
   docker compose --profile test exec mcp-test deno test --allow-env --allow-read tests/search-quality.test.ts
   ```
3. Confirm this is the expected RED state:
   - `mmrRerank keeps a high-scoring null-embedding candidate in top-k` fails because the current implementation returns `embedded-redundant` instead of `fresh-bm25-null` in the third slot.
   - `mmrRerank documents null-embedding equal-score bias` fails because the current implementation returns `redundant-equal` instead of `null-equal`.
  - The all-null, embedded-diversity, and degenerate-input tests may pass already; that is acceptable.

**Expected output:** New file `server/tests/search-quality.test.ts` with five tests. At least the high-scoring null and equal-score bias tests fail on current code.

**Requirement mapping:** §2d rows for high-scoring null candidate, all-null order, equal-score bias, embedded diversity, and degenerate inputs.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-env --allow-read tests/search-quality.test.ts
```
Expected result: command exits non-zero with failures matching the expected RED state above.

**Failure handling:** If all tests pass before implementation, stop and record the unexpected result in §6b; do not continue to Task 4.2 until the tests actually prove the current bug or the plan is revised. If the command fails because `mcp-test` is not running, start the test profile with `docker compose --profile test up -d` and rerun once.

---

### Task 4.2: Implement unified-loop MMR handling for null embeddings

**Objective:** Replace the two-phase embedded/null MMR selection with one selection loop where null-embedding candidates participate with similarity-to-selected equal to `0`.

**Input:** RED tests from Task 4.1.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Edit `server/src/searchQuality.ts`.
2. Replace only the body of `mmrRerank` with the §3 implementation template.
3. Update the comment above `mmrRerank` to describe the new semantics. Use this wording:
   ```typescript
   // Candidates must already be sorted by post-boost RRF score descending.
   // Null embeddings participate in MMR with similarity-to-selected = 0.
   // This keeps fresh BM25-only hits returnable while preserving diversity among embedded rows.
   // λ = 0.7 (relevance weight); (1 - λ) = 0.3 (diversity penalty weight).
   ```
4. Do not edit `server/index.ts` in this task unless `deno check` reveals a type error caused by the changed return shape. The intended return shape remains `{ id, score }[]`.

**Expected output:** `server/src/searchQuality.ts` uses a single `remaining = [...candidates]` loop; no `withEmb` / `noEmb` split remains inside `mmrRerank`.

**Requirement mapping:** §2d rows for unified-loop implementation, high-scoring null candidate, all-null order, equal-score bias, and embedded diversity.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno check src/searchQuality.ts tests/search-quality.test.ts
docker compose --profile test exec mcp-test deno test --allow-env --allow-read tests/search-quality.test.ts
```
Expected result: both commands pass. The five tests in `tests/search-quality.test.ts` are green.

**Failure handling:** If `deno check` fails, fix only type errors in `server/src/searchQuality.ts` or `server/tests/search-quality.test.ts`. If the pure tests still fail, do not alter test expectations without plan-review; inspect whether the unified-loop logic exactly matches §3.

---

### Task 4.3: Prove the e2e blocker is gone and run the full suite

**Objective:** Confirm the production path now returns fresh BM25-only captures and preserves existing null-embedding e2e coverage.

**Input:** Green Task 4.2 pure tests.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Restart `mcp-test` so the running server loads the edited `searchQuality.ts`:
   ```powershell
   docker compose --profile test restart mcp-test
   ```
2. Run the e2e suite:
   ```powershell
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/e2e.test.ts
   ```
3. In the output, confirm both of these named tests pass:
   - `e2e: capture_thought → search_thoughts returns via BM25 lane`
   - `e2e: MMR keeps null-embedding row returnable`
4. Run the full server test suite:
   ```powershell
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
   ```
5. If the full suite passes, record the pass count in §5b and §1b. If the full suite has an unrelated pre-existing failure, rerun the failing file once, record both outputs in §6b, and stop for plan-review unless the failure is clearly unrelated and the PO approves proceeding.

**Expected output:** `tests/e2e.test.ts` passes; full `tests/` suite passes.

**Requirement mapping:** §2d rows for ST-046 e2e blocker, existing null-embedding e2e coverage, and full suite.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/e2e.test.ts
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```
Expected result: both commands pass. The e2e output includes the two named tests above as `ok`.

**Failure handling:** If `capture_thought → search_thoughts returns via BM25 lane` still fails, stop and route to plan-review; do not increase the e2e limit or make capture wait for embeddings. If `MMR keeps null-embedding row returnable` fails, stop and route to plan-review because the fix violated explicit scope. If OpenRouter/network-related tests fail, record the exact failure and rerun once before deciding whether it is unrelated.

---

### Task 4.4: Cross-model review and closeout

**Objective:** Validate that the implementation and tests satisfy the ST-055 contract before moving the story to Review.

**Input:** Green Task 4.1-4.3 implementation and verification.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Populate §1b Outcomes & Conclusions with:
   - completion status;
   - key behavior delivered;
   - requirements met/unmet;
   - verification commands and pass/fail evidence;
   - downstream change: ST-046 can be unblocked only after PO accepts ST-055 Done.
2. Request a cross-model critical review by a different model than the executor. Provide it:
   - this ExecPlan §2 and §2d;
   - diff for `server/src/searchQuality.ts` and `server/tests/search-quality.test.ts`;
   - `tests/e2e.test.ts` and full-suite outputs.
3. The reviewer must check:
  - tests prove the unified-loop null-embedding contract, not just any top-k behavior;
   - null-row equal-score bias is intentional and pinned;
  - embedded diversity behavior still exists, including a note that the low-lambda test isolates the penalty while the production-lambda test also selects the diverse embedded row over a redundant one;
  - degenerate empty and k-overshoot inputs are covered;
   - e2e evidence covers the original ST-046 blocker;
   - no out-of-scope changes were made to RRF, SQL, capture embedding timing, or e2e limits.
4. If review passes, record the review result in §6c.
5. If this ExecPlan is being approved during `/plan`, move ST-055 from Backlog to Refined. During `/continue` execution, move ST-055 from Refined to In Progress at start and from In Progress to Review only after implementation, verification, and cross-model review pass. Do not move a Backlog item directly to Review.
6. Do not move ST-046 yet; ST-046 remains blocked by ST-055 until PO accepts ST-055 as Done.

**Expected output:** §1b is populated; §6c contains cross-model review notes; board lifecycle matches the active phase: Backlog → Refined at `/plan` approval, Refined → In Progress at `/continue` start, and In Progress → Review only after closeout. ST-046 still remains in Backlog blocked by ST-055.

**Requirement mapping:** §2d cross-model review row and closeout governance.

**Verification:**
```powershell
git diff -- .github/planning/story-board.md .github/planning/execplans/exec-plan-ST-055.md
```
Expected result: diff shows §1b/§6c updates and, during `/continue`, ST-055 moved from In Progress to Review only after review pass. ST-046 is not moved or unblocked in this task.

**Failure handling:** If cross-model review finds a contract defect, fix the defect if it is within this ExecPlan's scope and rerun targeted verification; otherwise stop and route to plan-review. Do not move ST-055 from In Progress to Review unless the cross-model review passes or the PO explicitly waives it.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.3 — Prove the e2e blocker is gone and run the full suite |
| **Last successful command** | `docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/` |
| **Expected outputs produced** | Restarted `mcp-test`; `tests/e2e.test.ts` passed with 16/16 tests green including the two named ST-055 checks; full `tests/` suite passed with 53 passed, 0 failed. |
| **Next task** | Task 4.4 — Cross-model review and closeout |
| **Known blockers** | None |
| **Last updated** | 2026-06-05T14:25:47.9319942+02:00 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-06-05T14:21:10.4091848+02:00 | Task 4.1 | Completed — expected RED | Added `server/tests/search-quality.test.ts`; targeted test command exited non-zero with exactly two expected failures: `mmrRerank keeps a high-scoring null-embedding candidate in top-k` returned `embedded-redundant` instead of `fresh-bm25-null`, and `mmrRerank documents null-embedding equal-score bias` returned `redundant-equal` instead of `null-equal`; 3 tests passed. | Task 4.2 — replace `mmrRerank` with unified loop. |
| 2026-06-05T14:21:58.9774984+02:00 | Task 4.2 | Completed | Replaced `mmrRerank` with one selection loop over all candidates and updated the required comment. `deno check src/searchQuality.ts tests/search-quality.test.ts` passed; `deno test --allow-env --allow-read tests/search-quality.test.ts` passed with 5/5 tests green. | Task 4.3 — restart `mcp-test`, run e2e, then full suite. |
| 2026-06-05T14:25:47.9319942+02:00 | Task 4.3 | Completed | Restarted `mcp-test`; `deno test --allow-net --allow-env --allow-read tests/e2e.test.ts` passed with 16/16 tests green, including `capture_thought → search_thoughts returns via BM25 lane` and `MMR keeps null-embedding row returnable`; full `deno test --allow-net --allow-env --allow-read tests/` passed with 53 passed, 0 failed. | Task 4.4 — cross-model review and closeout. |

### Avoidance

- 2026-06-05: Do not fix this by raising `e2e.test.ts` limits or waiting synchronously for embeddings after capture. The defect is that null-embedding BM25 candidates are ranked after embedded candidates regardless of fused score.
- 2026-06-05: Do not move ST-046 back to Refined during ST-055 execution. ST-046 remains parked in Backlog until ST-055 is Done and its blocker is cleared.
- 2026-06-05: Run Deno commands inside `mcp-test`; host Deno is not a project prerequisite.

---

## §5c. Approach Ledger

### Approach Registry

| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Unified MMR selection loop over all candidates; null-embedding pairs have similarity `0` | git HEAD before Task 4.1 | 🟢 Active |
| 2 | Reserve only after plan-review: caller-side post-MMR displacement of embedded rows by higher-scoring null rows | git HEAD before Task 4.1 | ⬜ Reserve |

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

- Decision: Null-embedding candidates participate in one MMR loop with pairwise similarity treated as `0` whenever either row lacks an embedding.
  Rationale: This is the PO-approved QP-055 design. It keeps fresh BM25-only captures findable, preserves diversity among embedded candidates, and makes all-null input pure score order.
  Date: 2026-06-05
- Decision: Null candidates may beat equal-score embedded candidates when the embedded candidate is redundancy-penalized.
  Rationale: The PO accepted this as an intentional recency/lexical-recall bias for freshly captured thoughts.
  Date: 2026-06-05

---

## §7. Compound Step / Closeout

At story completion:

1. Run full verification from Task 4.3.
2. Complete the cross-model review in Task 4.4.
3. Update board through the normal lifecycle: Backlog → Refined during `/plan` approval, Refined → In Progress when `/continue` starts, and In Progress → Review only after cross-model review passes.
4. Present results to PO with links to `server/src/searchQuality.ts`, `server/tests/search-quality.test.ts`, this ExecPlan, and the verification outputs.
5. Do not clear ST-046's `Blocked by: ST-055` in this story. That happens only after PO accepts ST-055 as Done.
6. Log any Tier 1 compound detections.

---

## §7b. Outcomes & Retrospective

Achieved: *(populated on completion)*

Remains: *(populated on completion)*

Lesson: *(populated on completion)*

---

## Revision Notes

- 2026-06-05: Initial ExecPlan from QP-055. Encodes PO-approved unified MMR loop with null-embedding similarity `0`, explicit RED/GREEN test sequence, e2e verification for the ST-046 blocker, and cross-model review gate.