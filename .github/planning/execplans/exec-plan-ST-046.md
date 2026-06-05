# ExecPlan — ST-046: Search-Quality Eval Harness (golden-set + recall@k baseline; gate for ST-054)

> Status: ✅ Ready for /continue (approved 2026-06-04)
> Story: ST-046
> Created: 2026-05-31
> Rewritten: 2026-06-04 (widened to serve as the ST-054 retrieval-robustness gate)
> Parent query packet: `.github/planning/query-packets/QP-046-search-quality-eval-harness.md`
> Related: ST-054 plan `docs/plans/2026-06-04-001-feat-retrieval-robustness-plan.md`; QP-054 `.github/planning/query-packets/QP-054-retrieval-robustness.md`

---

## §1. Background & Context

ST-046 builds a **reusable search-quality eval harness** against the seeded `db-test` corpus. It is the **measurement apparatus** that ST-054 (retrieval robustness) will later drive to green — not the retrieval fix itself. Per QP-046 ("Option A"), ST-046 ships **green on current `main`** and stands alone; ST-054 then flips this harness's baselines to improved thresholds (story-level red→green TDD).

The harness does three jobs:

1. **Catch RRF/MMR parameter drift** (the original AC-7 reason the story existed): if someone retunes RRF `k=60`, MMR `λ=0.7`, or project-boost `×1.2`, a golden-set assertion must notice.
2. **Establish a recall@k baseline** on incident-style queries (the `build 65008 PRI-5751 pipeline failure` class) in **two forms** — with identifiers and without — so the identifier-dilution gap (ST-054 D2) is *measurable*.
3. **Pin the current false-empty behaviour** of the vector-only `search` tool (ST-054 D1) as a characterization, so ST-054's fix is self-proving.

**Determinism strategy (binding — see QP-046 KD-1/KD-2).** The corpus uses **synthetic orthonormal topic embeddings** (every row of a topic shares one axis vector via `topicVector(idx, 0)`), while `search` / `search_thoughts` embed the query **live** via OpenRouter in the HTTP path (no DI seam). A real query embedding vs a synthetic axis yields ~random cosine, so the **vector lane is non-deterministic** for precise recall@k. Therefore every recall@k baseline is pinned to the **deterministic BM25 lexical lane** (structural `plainto_tsquery` SQL probes) or to a deterministic floor that MMR ordering guarantees. The single exception is the `search` D1 characterization (KD-2), which is the only assertion that touches the live embedding path — and its *outcome* is robust because the synthetic corpus never clears the `0.5` cosine floor against a real query embedding.

**Stemming gotcha (must respect when authoring corpus content).** The `english` text-search config stems `failure → failur` but `failed → fail` — *different* lexemes. The no-identifier query and the stored incident content must therefore share the literal stem: use the word **`failure`** in both, not `failed`.

**Key files:**
- `server/tests/fixtures/build-search-quality-corpus.ts` — corpus generator (edited here)
- `server/tests/fixtures/search-quality-corpus.sql` — generated seed (regenerated here)
- `server/tests/fixtures/search-quality-queries.json` — generated golden-set query pairs (consumed by the golden-set test and by `e2e.test.ts`)
- `server/tests/_helpers/mcpClient.ts` — `mcpCall` / `extractText` (existing)
- `server/src/db.ts` — exports the `sql` postgres template tag used for structural BM25 probes
- `server/db/search.sql`, `server/db/schema.sql` — hybrid-search SQL; `search_vector` is a `GENERATED ALWAYS … STORED` tsvector, so seeded rows auto-index for BM25 with no manual step
- `server/index.ts` — `search` (vector-only, `≥0.5` floor) and `search_thoughts` (BM25+vector RRF k=60 + MMR λ=0.7) handlers

**Prerequisite knowledge:** The corpus is loaded by the `seed` Compose service into `db-test` at stack start. `db-test` is tmpfs (wiped on container removal). After regenerating the `.sql`, a `down`/`up` of the `test` profile re-seeds it. Tests run inside `mcp-test`.

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- The corpus generator gains a `build_failure` topic axis with ≥4 identifier-free incident memories (carrying the lexemes `build` / `pipeline` / `failure`, no ticket/build numbers); `search-quality-corpus.sql` is regenerated and committed; the existing rows are byte-unchanged (additive only); the null-embedding row stays pinned to `…1d`.
- A reusable recall@k helper exists at `server/tests/_helpers/recall.ts` (`searchThoughtIds`, `recallAtK`, `parseIds`) and is consumable by ST-054.
- `server/tests/search-golden-set.test.ts` exists and, on current `main`, passes with default parameters. It contains:
  - **RRF/MMR golden-set regression** — for each BM25-deterministic pair in `search-quality-queries.json`, the expected id appears in the top-N.
  - **Structural incident baselines** — a `plainto_tsquery` probe returns the full build-failure set (≥4 rows) for the no-identifier form and **0 rows** for the identifier form (the D2 dilution mechanism).
  - **Tool-level recall@k** — `search_thoughts` recall@k for the no-identifier form meets the deterministic floor.
  - **`search` D1 characterization** — the incident memory is *not* surfaced by `search` today.
  - A single named **`BASELINE`** constants block plus a **`normalizeForBm25`** identity hook encoding the TDD seam ST-054 flips.
- Temporarily changing RRF `k` from 60 to 10 in `server/index.ts` makes at least one golden-set assertion fail; reverting restores green (verification step, not a standing assertion).
- The full `mcp-test` suite (including `e2e.test.ts`) passes after the corpus is regenerated and re-seeded.

---

## §2b. Definition of Ready

- [x] All tasks have step-by-step instructions
- [x] Architecture decisions documented (determinism, TDD seam, corpus shape)
- [x] Input/output specified (exact ids, queries, BASELINE values)
- [x] Error handling noted (reseed flow, e2e regression risk)
- [x] No open judgment calls beyond the documented empirical golden-pair selection in Task 4.4
- [x] Templates provided (generator edit, helper, test file)
- [x] Requirements mapped (§2d)
- [x] Verification steps on every task
- [x] Observable acceptance criteria

Status: ✅ Ready for /continue — PO approved the rewrite and the three determinism design calls (id-form gate = structural BM25 probe; no-id tool recall floor 0.25 + structural ≥4-rows probe; k-flip as a Task 4.4 verification step) on 2026-06-04.

---

## §2c. Plan Review Notes

- Scope and resolution authority: QP-046 "Resolution Adopted (Option A)". ST-046 owns the harness + baselines pinned to today; ST-054 owns the target thresholds and flips the seam. Dependency unchanged (ST-054 `blocked_by` ST-046).
- Why the identifier-form gate is a **structural BM25 probe**, not a tool-level recall assertion: the tool path mixes in the non-deterministic vector lane, which could surface a build-failure row by noise (~k/N chance). The raw `plainto_tsquery` probe is lane-isolated and deterministic, so it is the honest, flake-free gate for the D2 mechanism.
- Why the k-flip is a **verification step**, not a standing inequality: catching a *caller-side* parameter edit in `index.ts` requires the integration path, whose precise ranking depends on the noisy vector lane. QP-046 Acceptance #2 frames this as "temporarily change → expect ≥1 failure," matching the original AC-7 intent.

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| RRF/MMR golden-set catches parameter drift (QP-046 Acceptance #1/#2; orig. AC-7) | `search-golden-set.test.ts` golden-set block; `search-quality-queries.json` | 4.3, 4.4 | Default params green; k 60→10 → ≥1 failure; revert → green |
| Seeded identifier-free incident corpus (QP-046 Scope #1) | `build-search-quality-corpus.ts`; regenerated `search-quality-corpus.sql` | 4.1 | `.sql` contains 4 build_failure INSERTs, ids `…1e`–`…21`, no identifiers; existing rows unchanged |
| Reusable recall@k helper (QP-046 Scope #2) | `server/tests/_helpers/recall.ts` | 4.2 | Imported by the test; `recallAtK` unit-checked inline |
| Incident relevance / query set, both forms (QP-046 Scope #3) | `BASELINE` block in `search-golden-set.test.ts` | 4.3 | `NO_ID_QUERY`, `ID_QUERY`, `INCIDENT_RELEVANT_IDS` present |
| Baselines pinned to today, TDD seam (QP-046 Scope #4; KD-1/KD-3) | `BASELINE` + `normalizeForBm25` in test | 4.3 | no-id probe ≥4 & recall floor green; id probe = 0; `search` char green |
| `search` D1 false-empty characterization (QP-046 Scope #4; KD-2) | `search` assertion in test | 4.3 | `search(NO_ID_QUERY)` surfaces no incident id |
| Regenerated corpus does not break e2e (QP-046 Acceptance #5; KD-5) | regenerated `.sql`; re-seeded `db-test` | 4.1, 4.5 | full `tests/` suite green |

---

## §3. Preconditions

- Docker Compose **test** stack available (`docker compose --profile test up -d`); `db-test` seeded; `mcp-test` reachable on `:3001` internally.
- `mcp-test` has `OPENROUTER_API_KEY` set (the one `search` characterization makes a live embedding call, as `e2e.test.ts` already does).
- Working tree clean at start (QP-046 already committed as `a1d1c67`).
- Generator runs **in the container** so the bind-mounted `.sql` updates on the host: `docker compose --profile test exec mcp-test deno run --allow-write tests/fixtures/build-search-quality-corpus.ts`.

---

## §4. Task Definitions

### Task 4.1: Extend the corpus generator with an identifier-free `build_failure` topic

**Objective:** Add a new topic axis and ≥4 identifier-free incident memories to the generator, regenerate the seed `.sql`, and re-seed `db-test` — additively, leaving every existing row byte-identical and the null-embedding row pinned to `…1d`.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Edit `server/tests/fixtures/build-search-quality-corpus.ts`:

   a. Add the topic axis to `TOPICS`:
   ```typescript
   const TOPICS: Record<string, number> = {
     zoom_meeting:     0,
     bcf_manager:      1,
     typescript_lang:  2,
     postgres_admin:   3,
     null_pointer:     4,
     build_failure:    5,
   };
   ```

   b. Locate the existing line that captures the null-embedding row (immediately after the `ADDL_TOPICS` padding loop):
   ```typescript
   // Mark exactly one row (the last null_pointer row) as null-embedding for the MMR-skip test.
   const NULL_EMBEDDING_ID = ROWS[ROWS.length - 1].id;
   ```
   **Immediately after that line**, append the build-failure rows so they are added *after* `NULL_EMBEDDING_ID` is captured (this keeps the null-embedding row pinned to `…1d` and leaves all existing rows unchanged):
   ```typescript
   // ── topic: build_failure (project: NULL) — ST-046 incident corpus ──
   // Identifier-free: carry the lexemes build / pipeline / FAILURE (literal stem, not "failed")
   // but contain NO ticket/build identifiers. Identifiers (65008, PRI-5751) appear ONLY in the
   // query — this reproduces the D2 dilution gap: the no-identifier query matches lexically; the
   // identifier form ANDs the unmatched id tokens to zero rows under plainto_tsquery.
   const BUILD_FAILURE_ROWS: Row[] = [
     { id: "00000000-0000-4000-8000-00000000001e", content: "Build pipeline failure traced to a flaky integration test", project: null, topic: "build_failure" },
     { id: "00000000-0000-4000-8000-00000000001f", content: "Recurring build pipeline failure after the dependency bump", project: null, topic: "build_failure" },
     { id: "00000000-0000-4000-8000-000000000020", content: "Build pipeline failure root cause was a stale module cache", project: null, topic: "build_failure" },
     { id: "00000000-0000-4000-8000-000000000021", content: "Investigating the build pipeline failure on the release branch", project: null, topic: "build_failure" },
   ];
   ROWS.push(...BUILD_FAILURE_ROWS);
   ```

   > **Do not** change `QUERY_PAIRS` — the incident queries are intentionally kept *out* of the generated `.json` (which drives `e2e.test.ts` via the live-embedding path). The incident relevance set lives inline in the test (Task 4.3). Do **not** alter the shared-vector scheme (`topicVector(TOPICS[r.topic], 0)`); changing it would perturb existing rows' embeddings and break the e2e vector-lane test.

2. Regenerate the seed artifacts inside the container (writes through the bind mount to the host files):
   ```powershell
   docker compose --profile test exec mcp-test deno run --allow-write tests/fixtures/build-search-quality-corpus.ts
   ```
   Expected console line: `Wrote 33 thoughts and 10 query pairs.` (29 existing + 4 new).

3. Re-seed `db-test` with the regenerated corpus (tmpfs is wiped on container removal, so `down`/`up` re-runs `seed`):
   ```powershell
   docker compose --profile test down
   docker compose --profile test up -d
   ```
   Wait for the `seed` service to finish (it exits 0 after `psql -f corpus.sql`).

**Expected output:** `git diff` shows **only** 4 new `INSERT` blocks in `search-quality-corpus.sql` (ids `…1e`–`…21`, embeddings on axis 5, no identifiers) and the generator edits. `search-quality-queries.json` is unchanged.

**Requirement mapping:** §2d rows 2 and 7

**Verification:**
```powershell
# 4 build_failure rows present, none carrying identifiers:
docker compose --profile test exec mcp-test deno eval "const s = await Deno.readTextFile('tests/fixtures/search-quality-corpus.sql'); const n = (s.match(/0000000000(1e|1f|20|21)'/g) ?? []).length; console.log('build rows:', n, 'has identifier:', /65008|PRI-5751/.test(s));"
# Expect: build rows: 4 has identifier: false

# Existing corpus rows + queries.json unchanged:
git diff --stat server/tests/fixtures/
# Expect: only search-quality-corpus.sql and build-search-quality-corpus.ts changed (queries.json byte-identical → not listed)
```

---

### Task 4.2: Add the reusable recall@k helper

**Objective:** Provide a network-free, reusable helper that runs a query through `search_thoughts`, parses the returned thought ids, and computes recall@k — consumable by both this story and ST-054.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/_helpers/recall.ts`:
   ```typescript
   // Reusable recall@k helper for the search-quality eval harness (ST-046; reused by ST-054).
   import { extractText, mcpCall } from "./mcpClient.ts";

   const ID_RE = /ID:\s*([0-9a-f-]{36})/gi;

   /** Extract thought ids (in result order) from a search_thoughts text response. */
   export function parseIds(text: string): string[] {
     return [...text.matchAll(ID_RE)].map((m) => m[1]);
   }

   /** Run search_thoughts and return the returned thought ids in rank order. */
   export async function searchThoughtIds(
     query: string,
     limit: number,
     context?: string,
   ): Promise<string[]> {
     const args: Record<string, unknown> = { query, limit };
     if (context) args.context = context;
     const result = await mcpCall("search_thoughts", args);
     return parseIds(extractText(result));
   }

   /** recall@k = |relevant ∩ top-k| / |relevant|. Empty relevant set ⇒ 0. */
   export function recallAtK(
     returnedIds: string[],
     relevantIds: string[],
     k: number,
   ): number {
     if (relevantIds.length === 0) return 0;
     const topK = new Set(returnedIds.slice(0, k));
     const hit = relevantIds.filter((id) => topK.has(id)).length;
     return hit / relevantIds.length;
   }
   ```

**Expected output:** A helper module with no network dependency in `recallAtK`/`parseIds`; `searchThoughtIds` is the only async (HTTP) entry point.

**Requirement mapping:** §2d row 3

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno check tests/_helpers/recall.ts
# Expect: no type errors
```

---

### Task 4.3: Write the golden-set + incident-baseline test (with the TDD seam)

**Objective:** Create `server/tests/search-golden-set.test.ts` containing the RRF/MMR golden-set regression, the structural incident baselines, the tool-level recall@k floor, the `search` D1 characterization, and the named `BASELINE` / `normalizeForBm25` seam.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/search-golden-set.test.ts`:
   ```typescript
   import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
   import { extractText, mcpCall } from "./_helpers/mcpClient.ts";
   import { parseIds, recallAtK, searchThoughtIds } from "./_helpers/recall.ts";
   import { sql } from "../src/db.ts";

   // ──────────────────────────────────────────────────────────────────────────
   // TDD seam (QP-046 KD-3). ST-054 flips ONLY the items below — not the test bodies.
   //   • normalizeForBm25: identity today; ST-054 replaces the body with its
   //     identifier-normalization import so the identifier-form probe starts matching.
   //   • BASELINE: today's pinned values; ST-054 flips idFormBm25Rows 0→(≥ noIdFormBm25Rows)
   //     and searchSurfacesIncident false→true.
   // ──────────────────────────────────────────────────────────────────────────
   const normalizeForBm25 = (q: string): string => q; // ST-054: swap for the real normalizer.

   const RECALL_K = 10;
   const NO_ID_QUERY = "build pipeline failure";
   const ID_QUERY = "build 65008 PRI-5751 pipeline failure";
   const INCIDENT_RELEVANT_IDS = [
     "00000000-0000-4000-8000-00000000001e",
     "00000000-0000-4000-8000-00000000001f",
     "00000000-0000-4000-8000-000000000020",
     "00000000-0000-4000-8000-000000000021",
   ];

   const BASELINE = {
     // Structural BM25 lane (deterministic, lane-isolated via plainto_tsquery):
     noIdFormBm25Rows: 4, // all build_failure memories match the lexical query
     idFormBm25Rows: 0,   // D2 gap: unmatched identifier tokens AND the query to zero rows.
                          //   ST-054 flips this to >= noIdFormBm25Rows.
     // Tool-level recall@k floor (search_thoughts): MMR's top pick is always a build_failure
     // row (it dominates RRF), so at least one incident memory surfaces deterministically.
     noIdFormRecallAtKMin: 0.25,
     // search (vector-only) D1 characterization: the synthetic corpus never clears the 0.5
     // cosine floor against a live query embedding, so the incident memory is not surfaced today.
     searchSurfacesIncident: false, // ST-054 (floor-with-fallback) flips this to true.
   };

   // ── recall@k helper self-check (no network) ──────────────────────────────
   Deno.test("recallAtK computes |relevant ∩ topK| / |relevant|", () => {
     assertEquals(recallAtK(["a", "b", "c"], ["a", "z"], 3), 0.5);
     assertEquals(recallAtK(["a", "b"], ["a", "b"], 10), 1);
     assertEquals(recallAtK(["x"], ["a"], 10), 0);
   });

   // ── RRF/MMR golden-set regression (reads the committed query pairs) ───────
   // Excludes the deliberately vector-only pair (zoom-recording → …004), which has no BM25
   // overlap and is therefore non-deterministic under the live-embedding path.
   const VECTOR_ONLY_QUERY = "zoom recording auto archive";
   const GOLDEN_TOP_N = 3;

   const queryPairs: Array<{ query: string; expected_id: string }> = JSON.parse(
     await Deno.readTextFile(new URL("./fixtures/search-quality-queries.json", import.meta.url)),
   );

   for (const pair of queryPairs) {
     if (pair.query === VECTOR_ONLY_QUERY) continue; // vector-only; not BM25-deterministic
     Deno.test({
       name: `golden-set: "${pair.query}" surfaces ${pair.expected_id} in top-${GOLDEN_TOP_N}`,
       sanitizeResources: false,
       sanitizeOps: false,
       fn: async () => {
         const ids = await searchThoughtIds(pair.query, GOLDEN_TOP_N);
         assert(
           ids.includes(pair.expected_id),
           `Expected ${pair.expected_id} in top-${GOLDEN_TOP_N} for "${pair.query}". Got: ${ids.join(", ")}`,
         );
       },
     });
   }

   // ── Structural incident baselines (deterministic BM25 lane via SQL probe) ──
   Deno.test({
     name: "incident baseline: no-identifier form matches the build_failure set (BM25 lane)",
     sanitizeResources: false,
     sanitizeOps: false,
     fn: async () => {
       const rows = await sql<{ id: string }[]>`
         SELECT id::text AS id
         FROM thoughts, plainto_tsquery('english', ${normalizeForBm25(NO_ID_QUERY)}) AS q
         WHERE search_vector @@ q AND active = true
       `;
       const incident = rows.filter((r) => INCIDENT_RELEVANT_IDS.includes(r.id));
       assertEquals(
         incident.length,
         BASELINE.noIdFormBm25Rows,
         `Expected ${BASELINE.noIdFormBm25Rows} build_failure rows for the no-id form; got ${incident.length}`,
       );
     },
   });

   Deno.test({
     name: "incident baseline: identifier form ANDs to zero rows (D2 dilution — ST-054 flips)",
     sanitizeResources: false,
     sanitizeOps: false,
     fn: async () => {
       const rows = await sql<{ id: string }[]>`
         SELECT id::text AS id
         FROM thoughts, plainto_tsquery('english', ${normalizeForBm25(ID_QUERY)}) AS q
         WHERE search_vector @@ q AND active = true
           AND id = ANY(${INCIDENT_RELEVANT_IDS}::uuid[])
       `;
       assertEquals(
         rows.length,
         BASELINE.idFormBm25Rows,
         `Expected ${BASELINE.idFormBm25Rows} build_failure rows for the identifier form; got ${rows.length}`,
       );
     },
   });

   // ── Tool-level recall@k floor (search_thoughts, deterministic floor) ──────
   Deno.test({
     name: "incident baseline: search_thoughts recall@k (no-id form) meets the floor",
     sanitizeResources: false,
     sanitizeOps: false,
     fn: async () => {
       const ids = await searchThoughtIds(NO_ID_QUERY, RECALL_K);
       const recall = recallAtK(ids, INCIDENT_RELEVANT_IDS, RECALL_K);
       assert(
         recall >= BASELINE.noIdFormRecallAtKMin,
         `Expected recall@${RECALL_K} >= ${BASELINE.noIdFormRecallAtKMin}; got ${recall}. IDs: ${ids.join(", ")}`,
       );
     },
   });

   // ── search D1 characterization (the only live-embedding assertion; KD-2) ──
   Deno.test({
     name: "search D1: incident memory is NOT surfaced by `search` today (ST-054 flips)",
     sanitizeResources: false,
     sanitizeOps: false,
     fn: async () => {
       const result = await mcpCall("search", { query: NO_ID_QUERY });
       const text = extractText(result);
       const surfaced = INCIDENT_RELEVANT_IDS.some((id) => text.includes(id));
       assertEquals(
         surfaced,
         BASELINE.searchSurfacesIncident,
         `Expected search surfacing incident == ${BASELINE.searchSurfacesIncident}; got ${surfaced}`,
       );
     },
   });
   ```

   > **`search` response shape:** the `search` tool returns `{ results: [{ id, title, url }] }`; the JSON id strings appear in the serialized content text, so a substring check over `extractText` is sufficient. If the executor finds `extractText` does not expose the ids for the `search` tool's content shape, fall back to parsing `result.result.structuredContent` / the tool's JSON payload — record the shape in §6b.

2. Run the new test file (everything should be green on current `main`):
   ```powershell
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/search-golden-set.test.ts
   ```
   Expected: all tests pass. If a golden-set pair fails because its expected id is not in top-3 (live-embedding ranking), note it and proceed to Task 4.4 step 1 to retune `GOLDEN_TOP_N` / pair selection.

**Expected output:** A green test file encoding the baselines and the TDD seam.

**Requirement mapping:** §2d rows 1, 4, 5, 6

**Verification:** the command above passes; `grep` confirms the seam:
```powershell
docker compose --profile test exec mcp-test deno eval "const s = await Deno.readTextFile('tests/search-golden-set.test.ts'); console.log('seam ok:', /normalizeForBm25/.test(s) && /const BASELINE =/.test(s));"
# Expect: seam ok: true
```

---

### Task 4.4: Prove regression detection (RRF k 60→10) and finalise golden-pair selection

**Objective:** Demonstrate the golden-set notices an RRF parameter change, and confirm the standing golden-set is green with defaults. (QP-046 Acceptance #2.)

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. (If needed from Task 4.3) Choose `GOLDEN_TOP_N` and the included pairs so that **with defaults** every retained pair's expected id is in top-N, and so the corpus is rich enough that an RRF change can perturb membership. Prefer the BM25-deterministic pairs (`postgres autovacuum`→`…0b`, `bcf manager review`→`…07`, `typescript switch exhaustive`→`…0a`, etc.). Document the final `GOLDEN_TOP_N` in §6c.

2. Temporarily change RRF `k` from 60 to 10 in `server/index.ts` (the `1 / (60 + rank)` fusion terms), then restart `mcp-test` so the runtime picks up the change (bind mount updates the file but the running Deno process does not hot-reload):
   ```powershell
   docker compose --profile test restart mcp-test
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/search-golden-set.test.ts
   ```
   Expected: **at least one** golden-set assertion fails. If none fail, tighten `GOLDEN_TOP_N` (e.g. 3→2) or include a pair whose expected id sits at the top-N boundary, then repeat. Record the configuration that exhibits the break in §6c.

3. Revert the `k` change, restart `mcp-test`, and re-run:
   ```powershell
   docker compose --profile test restart mcp-test
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/search-golden-set.test.ts
   ```
   Expected: all green.

**Requirement mapping:** §2d row 1

**Verification:** the k=10 run shows ≥1 failure; the reverted run is fully green. Capture both outcomes in §6.

---

### Task 4.5: Full suite, e2e-regression check, and cross-model review

**Objective:** Confirm the regenerated corpus did not break any existing test, then review.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Run the full `mcp-test` suite:
   ```powershell
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
   ```
   Expected: all green, including `e2e.test.ts`. If a pre-existing *vector-luck* test (e.g. the `…004` vector-lane case) flakes because the 4 new axis-5 candidate rows shifted the live-embedding ranking, re-run once to confirm flakiness vs. a real break; record the finding in §6b and, if it is a genuine regression, treat it as a blocker (do not weaken the e2e assertion without PO sign-off).

2. **Cross-model review** (record notes in §6c): pass the diff (generator, `recall.ts`, `search-golden-set.test.ts`) to a second model and confirm:
   - The determinism claims hold: every standing baseline is BM25-structural or a guaranteed MMR floor; only the `search` D1 assertion touches the live embedding path.
   - The TDD seam is a true one-edit flip: ST-054 swaps `normalizeForBm25` and flips two `BASELINE` constants, no test-body rewrite.
   - The stemming invariant holds: stored incident content and `NO_ID_QUERY` share the `failure → failur` stem.
   - The corpus change is strictly additive and the null-embedding row remains `…1d`.

**Requirement mapping:** §2d rows 2, 7

**Verification:** full `tests/` suite green; review notes recorded in §6c.

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
| 1 | BM25-deterministic baselines + MMR-floor recall@k + one `search` characterization; corpus extended additively; TDD seam via `BASELINE`/`normalizeForBm25` | git HEAD (a1d1c67) | 🟢 Active |

---

## §6. Execution Log

---

## §6b. Surprises & Discoveries

---

## §6c. Decision Log

---

## §7. Compound Step / Closeout

1. Run the full verification suite (Task 4.5).
2. Apply the LE-owned board edits (QP-046 "Board edits to apply at finalization"): strike ST-046's two target-flavoured ACs and replace with baseline/mechanism wording; reword ST-054's gate bullet and add its target ACs; move ST-046 Backlog → Refined.
3. Commit (Conventional Commits, `Story: ST-046` trailer) and present results.

---

## §7b. Outcomes & Retrospective

*(populated on completion)*

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.11 (narrow: 3 query pairs, content-substring).
- 2026-06-04: Full rewrite to the widened ST-054-gate scope per QP-046 (Option A): identifier-free `build_failure` corpus, recall@k helper, structural BM25 baselines, `search` D1 characterization, and the `BASELINE`/`normalizeForBm25` TDD seam.
