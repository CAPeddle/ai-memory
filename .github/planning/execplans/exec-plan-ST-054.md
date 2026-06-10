# ExecPlan - ST-054: Retrieval robustness (false-empty, identifier dilution, zero-result observability)

> Status: ✅ Ready for /continue
> Story: ST-054
> Created: 2026-06-05
> Parent: `.github/planning/query-packets/QP-054-retrieval-robustness.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

ST-054 hardens retrieval behavior in the cloud MCP server so incident-style queries do not silently fail.

Current behavior has four defects proven in QP-054 and in local verification:
- `search` can return `[]` when relevant nearest neighbors exist, because it hard-gates on similarity `>= 0.5` in `server/index.ts`.
- Identifier-heavy queries (example: `build 65008 PRI-5751 pipeline failure`) collapse BM25 recall because `plainto_tsquery` ANDs lexemes against `search_vector` built from raw `content`.
- Zero-result searches are not query-observable: `recall_events` logs only per-returned-thought rows.
- `search_thoughts` currently returns plain text blocks, so consumers cannot reliably parse confidence/quality.

This story applies a structural retrieval fix, not prompt-discipline guidance:
- Keep raw `content` immutable.
- Add derived retrieval text (`search_text`) and a `normalizer_version` marker.
- Normalize identifier-heavy query text before both BM25 and embedding lanes.
- Keep the `search` contract shape (`{results:[{id,title,url}]}`) while changing false-empty behavior via floor-with-fallback.
- Add query-level observability via a new `recall_queries` table.
- Change `search_thoughts` to structured JSON with per-result `score` and `quality_band`.

Backfill of all historical rows is explicitly out of scope for ST-054. Existing rows continue to work through `coalesce(search_text, content)` until a follow-up story handles full re-normalization.

Key implementation files for this story:
- `server/index.ts`
- `server/src/searchQuality.ts`
- `server/src/identifierNormalization.ts` (new)
- `server/db/schema.sql`
- `server/db/003_search_text_and_recall_queries.sql` (new)
- `server/tests/search-golden-set.test.ts`
- `server/tests/search-tool-contract.test.ts` (new)
- `server/tests/identifier-normalization.test.ts` (new)

---

## §1b. Outcomes & Conclusions

Required fields:
- completion status: not completed
- key findings/achievements: pending execution
- requirements met vs unmet: pending execution
- architectural impact: pending execution
- supporting evidence: pending execution
- downstream changes: pending execution

---

## §2. Definition of Done

Acceptance criteria phrased as observable behavior:
- After running `search` with a query whose nearest neighbors are below 0.5, the tool still returns a non-empty `{results:[{id,title,url}]}` payload when matching active embedded rows exist.
- After capturing/querying identifier-heavy text, retrieval uses normalized text while raw `content` remains unchanged and identifier facets are persisted in `metadata`.
- After running zero-result queries through both `search` and `search_thoughts`, query-level rows are persisted in `recall_queries` with `result_count=0`.
- After calling `search_thoughts`, the response text is JSON parseable and each result carries `score` and `quality_band` (`high|medium|low`).
- After running ST-046 harness checks, the ST-054 flip-points are green in `server/tests/search-golden-set.test.ts`:
  - `normalizeForBm25` uses the real normalizer hook.
  - identifier-form BM25 baseline flips from 0 to parity target.
  - search D1 baseline flips from false to true.
- Cross-model critical review is completed and passes before moving the story to Review.

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
- [x] Acceptance criteria phrased as observable behavior

Status: ✅ Ready for /continue

---

## §2c. Plan Review Notes

- 2026-06-08: Execution paused during Task 4.4 governance verification. Focused ST-054 checks are green, but full-suite `deno test tests/` was failing on `tests/mcp-protocol-compat.test.ts` (ST-057 scope). PO requested ST-057 be completed first.
- 2026-06-10: **Plan-review resolved.** ST-057 completed (commit `cadd6e1`, full suite 87 passed / 0 failed). Block cleared. ST-054 resumes at Task 4.4 — no scope change. PO approved 2026-06-10.

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| D1 floor-with-fallback in `search` while preserving shape (QP-054) | `server/index.ts`, `server/tests/search-tool-contract.test.ts` | 4.1, 4.3 | targeted deno test for `search-tool-contract` plus ST-054 D1 baseline flip in `search-golden-set.test.ts` |
| D2 non-destructive normalization, persisted `search_text`, `normalizer_version`, facets (QP-054) | `server/src/identifierNormalization.ts`, `server/index.ts`, `server/db/schema.sql`, `server/db/003_search_text_and_recall_queries.sql`, tests | 4.2, 4.3 | identifier unit tests + integration assertions on raw content/facets + schema grep |
| D2 token boundary: strip Jira/build; preserve UUID/error/versions (PO scope lock 2026-06-05) | `server/src/identifierNormalization.ts`, unit tests | 4.2 | `identifier-normalization.test.ts` pass with explicit preserve/strip cases |
| D3 query-level observability for zero-result and non-zero-result searches (QP-054 + PO scope lock) | `server/src/searchQuality.ts`, `server/index.ts`, `server/db/schema.sql`, migration SQL | 4.3 | integration test queries `recall_queries` for both tools and both result_count states |
| D3b structured JSON output with result score+band from `search_thoughts` (PO scope lock) | `server/index.ts`, parser helper updates in tests | 4.3, 4.4 | JSON parse assertions + per-result field assertions in updated tests |
| Gate: ST-046 harness flip points for ST-054 are red-then-green (story AC) | `server/tests/search-golden-set.test.ts` | 4.1, 4.4 | red checkpoint command before code changes, then green command after implementation |
| Cross-model critical review before Review move (repo gate) | ExecPlan §1b + PO review evidence | 4.5 | reviewer verdict captured and linked in execution log |

---

## §3. Preconditions

- Repo root: `c:\projects\ai-memory`
- Docker stacks are available and running:
  - `docker compose up -d`
  - `docker compose --profile test up -d`
- Tests execute in `mcp-test` container, not host Deno.
- If runtime modules are edited during execution, restart test server before behavior checks:
  - `docker compose --profile test restart mcp-test`
- Environment variables required in `.env`: `MEMORY_API_KEY`, `DB_PASSWORD`, `OPENROUTER_API_KEY`.
- Board precondition: `.github/planning/story-board.md` must list ST-054 in `Refined` with this ExecPlan marked Ready before `/continue` starts execution. If the board lists ST-054 in `Done`, `Review`, or omits the card, stop and ask the PO to repair the board state before executing implementation tasks.

Reusable command template:
```powershell
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read <path>
```

---

## §4. Task Definitions

### Task 4.1: Establish red checkpoint and contract baselines

**Objective:** Create/confirm baseline tests that prove current false-empty and identifier-dilution behavior before implementation.

**Input:** Current `main` with ST-046 done and ST-054 not implemented.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Add `server/tests/search-tool-contract.test.ts` to characterize `search` response shape and below-floor behavior.
2. Confirm ST-054 seams in `server/tests/search-golden-set.test.ts` remain pre-flip (`normalizeForBm25` identity and baseline constants old values).
3. For the red checkpoint, temporarily edit only `server/tests/search-golden-set.test.ts` so the ST-054 target values are asserted (`normalizeForBm25` calls the real normalizer once it exists, identifier-form BM25 target is parity with no-id rows, and `searchSurfacesIncident` is `true`). Run the golden-set command and record the failing assertion output in §6. Immediately restore `server/tests/search-golden-set.test.ts` to the pre-flip baseline values before committing Task 4.1.
4. Verify the temporary target-flip edit is not present before commit by running `git diff -- server/tests/search-golden-set.test.ts` and confirming only intentional baseline/contract additions remain.
5. Record the red evidence in §6 execution log.

**Expected output:** Baseline tests exist and red/green seam is demonstrably real.

**Requirement mapping:** D1 shape pin, Gate red checkpoint.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/search-tool-contract.test.ts
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/search-golden-set.test.ts
git diff -- server/tests/search-golden-set.test.ts
```
Expected result: contract suite passes; golden-set suite reflects pre-ST-054 baseline values; the final diff does not contain temporary target-flip assertions.

**Failure handling:** If tests are non-deterministic, restart `mcp-test`, reseed via profile stack restart, rerun once. If still unstable, escalate plan-review.

---

### Task 4.2: Implement identifier normalization module and unit tests

**Objective:** Introduce a pure normalizer with explicit strip/preserve boundaries and versioning metadata.

**Input:** Decision lock from QP-054 scope round (strip Jira/build numbers; preserve UUID/error/versions).

**Working directory:** `c:\projects\ai-memory\server`

**Steps:**
1. Create `src/identifierNormalization.ts` exporting:
  - `IDENTIFIER_NORMALIZER_VERSION = 1`
  - `normalizeIdentifiers(input: string): { retrievalText: string; facets: { tickets: string[]; builds: string[] }; normalizerVersion: number }`
  - deterministic whitespace collapse for `retrievalText`
  - token class handling in this order: protect UUIDs, semantic versions, and error-code-like tokens; extract/remove Jira-style tickets (`[A-Z]{2,}-\d+`); extract/remove bare build numbers (`\b\d{4,}\b`); restore protected tokens unchanged.
2. Add `tests/identifier-normalization.test.ts` with boundary cases:
   - `build 65008 PRI-5751 pipeline failure` stripping behavior
   - UUID preserved
   - semantic version preserved
   - error code preserved
   - idempotence and empty-input behavior
3. Keep module pure (no DB/network dependencies).

**Expected output:** Deterministic normalization API with complete boundary coverage.

**Requirement mapping:** D2 normalization, D2 token boundary.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/identifier-normalization.test.ts
```
Expected result: all normalization unit tests pass.

**Failure handling:** If a boundary case conflicts with ST-049 precision rules, stop and escalate plan-review (do not improvise regex rules).

---

### Task 4.3: Wire runtime + schema changes (D1, D2, D3, D3b)

**Objective:** Apply retrieval behavior and observability changes in runtime and schema without mutating raw content.

**Input:** Tasks 4.1 and 4.2 complete.

**Working directory:** `c:\projects\ai-memory\server`

**Steps:**
1. Update `index.ts`:
   - `search`: implement floor-with-fallback while preserving `{results:[{id,title,url}]}` shape.
  - `search_thoughts`: normalize query before BM25/vector lanes; produce structured JSON response with this exact shape:
    ```json
    { "query": "raw query", "normalized_query": "normalized query", "results": [{ "id": "uuid", "content": "raw content", "memory_type": "shard|wiki", "project": "project-or-null", "score": 0.123, "quality_band": "high|medium|low" }] }
    ```
  - Compute `score` as the final post-boost RRF/MMR score already used for ranking. Compute `quality_band` deterministically from both lane evidence and vector similarity: `high` when vector similarity is `>= 0.5` or the result appears in both BM25 and vector top-10 lanes; `medium` when vector similarity is `>= 0.35` or BM25 rank is `<= 10`; otherwise `low`. If no query embedding or row embedding is available, omit vector-similarity evidence and fall back to BM25-rank evidence only.
   - `capture_thought`: derive `search_text`, `normalizer_version`, and identifier facets in `metadata` while storing raw `content` unchanged.
2. Update `src/searchQuality.ts` to support query-level logging helper(s) used by both `search` and `search_thoughts` and insert into new `recall_queries` table. Query logs must capture `tool`, `query`, `normalized_query`, `project`, `profile`, `result_count`, and `top_result_ids`; truncate stored `query` and `normalized_query` to 2,048 characters before insert so a pathological query cannot bloat telemetry rows. Logging failures must be fire-and-forget and must not fail the tool response.
3. Update DB artifacts:
  - `db/schema.sql`: add nullable columns `search_text text`, `normalizer_version integer`; define `search_vector` as `GENERATED ALWAYS AS (to_tsvector('english', coalesce(search_text, content))) STORED`; add `recall_queries` table and indexes.
  - add `db/003_search_text_and_recall_queries.sql` as the idempotent delta for existing DBs. Because PostgreSQL does not support altering a generated column expression in place, the delta must explicitly drop and recreate the dependent search-vector index and generated column in this order: `DROP INDEX IF EXISTS idx_thoughts_search_vec`; add nullable `search_text` and `normalizer_version` columns if missing; `ALTER TABLE public.thoughts DROP COLUMN IF EXISTS search_vector`; `ALTER TABLE public.thoughts ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(search_text, content))) STORED`; recreate `idx_thoughts_search_vec`. This rebuilds the generated column and GIN index but loses no user-authored data.
  - define `recall_queries` with at least: `id bigserial primary key`, `tool text not null check (tool in ('search','search_thoughts'))`, `query text not null`, `normalized_query text not null`, `project text`, `profile text`, `result_count int not null check (result_count >= 0)`, `top_result_ids uuid[] not null default '{}'::uuid[]`, `created_at timestamptz not null default now()`, plus an index on `(tool, created_at desc)`.
4. Ensure historical-row behavior is backward compatible via `coalesce(search_text, content)` (no full backfill in this story).
5. Restart test runtime container after module edits.

**Expected output:** Runtime behavior changed per requirements, schema supports new derived fields and observability.

**Requirement mapping:** D1, D2, D3, D3b.

**Verification:**
```powershell
docker compose --profile test restart mcp-test
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/search-tool-contract.test.ts
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/search-quality.test.ts
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/e2e.test.ts
```
Expected result: updated contract/quality/e2e tests pass; response format, query logging, raw-content preservation, and capture facets assertions are green.

**Failure handling:** If schema migration causes deterministic failures tied to generated-column rebuild behavior, document in §6b and escalate if workaround requires design changes.

---

### Task 4.4: Flip ST-046 gate assertions to target values and run focused + full verification

**Objective:** Consume the harness gate by flipping ST-054-specific baselines to target behavior and proving green.

**Input:** Runtime and schema changes complete.

**Working directory:** `c:\projects\ai-memory\server`

**Steps:**
1. In `tests/search-golden-set.test.ts`, replace ST-054 seam placeholders:
   - switch `normalizeForBm25` hook to real normalizer
   - flip identifier-form BM25 baseline to target parity
   - flip `searchSurfacesIncident` from `false` to `true`
2. Update `tests/_helpers/recall.ts` so `searchThoughtIds` parses the new structured JSON response first and keeps the old `ID:` text parser only as a temporary backward-compatible fallback for tests not yet migrated in the same task.
3. Run focused suites, then full server suite.

**Expected output:** ST-054 gate is demonstrably green and regressions are covered.

**Requirement mapping:** Gate, D1, D2, D3b.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/search-golden-set.test.ts
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/
```
Expected result: golden-set and full suite pass with ST-054 target assertions green.

**Failure handling:** If failures indicate undefined response contract impacts for external clients, stop and escalate plan-review.

---

### Task 4.5: Closeout, cross-model review gate, and board transitions

**Objective:** Finish story governance requirements before move to Review.

**Input:** All implementation and verification tasks complete.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Populate §1b outcomes with concrete evidence.
2. Request and complete cross-model critical review against §2 and §2d contract.
3. If review passes (or PO waives), move board card Refined -> In Progress -> Review per workflow, then present AC evidence to PO.
4. On PO acceptance to Done, clear any board `Blocked by: ST-054` references.

**Expected output:** Story governance complete with review gate evidence and board state correctness.

**Requirement mapping:** Cross-model gate, story completion governance.

**Verification:**
```powershell
git status --short
```
Expected result: only intended story artifacts changed; no unintended drift.

**Failure handling:** If reviewer finds contract gaps, reopen implementation task and do not move to Review.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.4 - Flip ST-046 gate assertions to target values and run focused + full verification |
| **Last successful command** | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/` |
| **Expected outputs produced** | ST-054 gate assertions are now green in `tests/search-golden-set.test.ts`, focused golden-set verification passed 16/16, and full server suite passed 87/0 including `tests/mcp-protocol-compat.test.ts` |
| **Next task** | Task 4.5 - Closeout, cross-model review gate, and board transitions |
| **Known blockers** | None |
| **Last updated** | 2026-06-10 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-06-05T00:00:00Z | Planning | Complete | ExecPlan created and marked Ready | Task 4.1 |
| 2026-06-07T22:52:52+02:00 | Task 4.1 | Complete | Added `tests/search-tool-contract.test.ts`; red checkpoint failed only on D1 with `Expected search surfacing incident == true; got false`; restored golden-set baseline and re-ran Task 4.1 verification green | Task 4.2 |
| 2026-06-07T22:54:29+02:00 | Task 4.2 | Complete | Added `src/identifierNormalization.ts` and `tests/identifier-normalization.test.ts`; unit suite passed 6/6 covering ticket/build stripping, UUID/semver/error-code preservation, empty/identifier-only input, and idempotence | Task 4.3 |
| 2026-06-08T03:37:55+02:00 | Task 4.3 | Complete | Implemented D1/D2/D3/D3b across runtime and schema (`index.ts`, `searchQuality.ts`, `schema.sql`, `003_search_text_and_recall_queries.sql`) and updated contract/e2e tests; verification green: `tests/search-tool-contract.test.ts` 2/2, `tests/search-quality.test.ts` 9/9, `tests/e2e.test.ts` 17/17 | Task 4.4 |
| 2026-06-08T04:00:00+02:00 | Task 4.4 | Blocked (plan-review) | ST-054 gate assertions flipped and focused verification green, but full-suite still fails in `tests/mcp-protocol-compat.test.ts` (ST-057 scope). PO instructed "stop and resolve mcp-protocol-compat failures" before continuing. | Escalate to `/plan` |
| 2026-06-10T00:00:00Z | Task 4.4 | Complete | Re-ran required verification after plan-review clearance: `tests/search-golden-set.test.ts` 16/16 and full suite `tests/` 87/0 (including `tests/mcp-protocol-compat.test.ts`); gate is green | Task 4.5 |

### Avoidance

- 2026-06-05: Restart `mcp-test` after runtime module edits before behavior checks (`docker compose --profile test restart mcp-test`).
- 2026-06-05: Keep Deno verification in `mcp-test`; do not use host test runners.
- 2026-06-05: Do not mutate raw `content`; all retrieval normalization must be derived (`search_text`) and facet-based.
- 2026-06-07 doc review: Do not leave generated-column migration mechanics to executor judgment. `003_search_text_and_recall_queries.sql` must drop/recreate the generated `search_vector` column and its GIN index in the documented order.
- 2026-06-07 doc review: Do not leave `quality_band` thresholds implicit. Use the lane/vector-similarity thresholds documented in Task 4.3 unless a plan-review changes them.

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Persisted `search_text` + query normalizer + floor-with-fallback + structured JSON output | Before Task 4.3 runtime/schema edits | 🟢 Active |
| 2 | Reserve: escalate plan-review if contract or schema assumptions break | N/A | ⬜ Reserve |

### Approach Failure Log
(Empty - no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true -> propose rollback
- 3 failed attempts at same task -> MUST propose rollback (hard cap)

---

## §6. Execution Log

- 2026-06-07T22:52:52+02:00 - Task 4.1: added `server/tests/search-tool-contract.test.ts` to pin the `search` JSON-text payload shape and current below-floor empty-result baseline for the incident query.
- 2026-06-07T22:52:52+02:00 - Task 4.1 red checkpoint: temporarily flipped `server/tests/search-golden-set.test.ts` seam to ST-054 target values, ran the golden-set harness, and captured the required failure: `AssertionError: Values are not equal: Expected search surfacing incident == true; got false` at `tests/search-golden-set.test.ts:176:5`.
- 2026-06-07T22:52:52+02:00 - Task 4.1 restore/verify: restored the pre-flip golden-set baseline, re-ran `tests/search-tool-contract.test.ts` and `tests/search-golden-set.test.ts`, and confirmed the temporary edit was gone before closeout.
- 2026-06-07T22:54:29+02:00 - Task 4.2: added `server/src/identifierNormalization.ts` with versioned, pure strip/preserve logic and `server/tests/identifier-normalization.test.ts`; verified the boundary suite green in `mcp-test`.
- 2026-06-08T03:37:55+02:00 - Task 4.3: wired floor-with-fallback in `search`, structured JSON response + quality bands in `search_thoughts`, capture-time `search_text`/`normalizer_version`/identifier facets, and query-level telemetry via `logRecallQuery` + `recall_queries` schema.
- 2026-06-08T03:37:55+02:00 - Task 4.3 verification: rebuilt test profile services (`db-test`, `seed`, `mcp-test`) so schema updates were present, then re-ran focused and e2e verification to green.
- 2026-06-08T04:00:00+02:00 - Task 4.4: flipped ST-046 seam to use `normalizeIdentifiers` and target baselines; updated `tests/_helpers/recall.ts` to parse structured JSON first with legacy fallback.
- 2026-06-08T04:00:00+02:00 - Task 4.4 escalation: full-suite command remains red only on `tests/mcp-protocol-compat.test.ts` (prompts/resources compatibility expectations). PO requested those failures be resolved before continuation; execution halted and escalated to plan-review because ST-057 fixes are out of this ExecPlan scope.
- 2026-06-10T00:00:00Z - Task 4.4 resume: resumed after plan-review clearance noted in §2c and re-ran focused ST-054 verification (`tests/search-golden-set.test.ts`) to confirm seam assertions are green.
- 2026-06-10T00:00:00Z - Task 4.4 verification: ran full suite `tests/` in `mcp-test`; all 87 tests passed including `tests/mcp-protocol-compat.test.ts`, closing the previous blocker without scope changes.

---

## §6b. Surprises & Discoveries

- 2026-06-07: The first focused validation failed because the test profile stack was not running; `docker compose --profile test up -d` was required before Task 4.1 verification could execute inside `mcp-test`.
- 2026-06-08: Task 4.3 initially failed on `search_text`/`recall_queries` missing in `db-test`; the fix required rebuilding the `db-test` image with `--build --force-recreate` so the updated schema/init SQL was applied.

---

## §6c. Decision Log

- Decision: Keep historical re-normalization/backfill out of ST-054 scope.
  Rationale: PO scope lock 2026-06-05; preserve compatibility via `coalesce(search_text, content)`.
  Date: 2026-06-05

- Decision: Use `recall_queries` table instead of weakening `recall_events` semantics.
  Rationale: `recall_events` is row-per-returned-thought; zero-result rows need query-level schema.
  Date: 2026-06-05

- Decision: Make `search_thoughts` JSON contract and quality-band thresholds explicit in the ExecPlan.
  Rationale: Document review found the earlier plan required structured output but left response shape and band semantics to executor judgment.
  Date: 2026-06-07

- Decision: Define generated-column migration mechanics in the plan.
  Rationale: PostgreSQL generated-column expressions cannot be altered in place; the implementation must drop/recreate `search_vector` and its index deliberately.
  Date: 2026-06-07

- Decision: Treat "error-code-like" preservation conservatively as exact uppercase-letter-plus-digits tokens such as `E0123`.
  Rationale: This satisfies the plan's explicit example without colliding with Jira-ticket stripping in Task 4.2.
  Date: 2026-06-07

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Ensure cross-model critical review passed (or PO waiver recorded)
3. Move board card to Review only after gate pass
4. Present results to PO with artifact links and AC evidence

### §7b. Outcomes & Retrospective

(Populate at completion)
