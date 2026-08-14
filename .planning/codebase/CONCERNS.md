# Codebase Concerns

**Analysis Date:** 2026-08-05

## Tech Debt

### Connection Pool Search Path Pollution

**Issue:** PostgreSQL connection pooling creates sticky session state pollution via `search_path` that can corrupt subsequent queries.

**Files:** `server/src/workflow/store.ts`, `server/src/entityWorker.ts`

**Details:** The workflow module explicitly documents and compensates for this issue (store.ts:1-15: "AGE graph queries leave a sticky polluted `search_path` on pooled connections"). The entityWorker uses `sql.unsafe()` with `SET search_path = ag_catalog, "$user", public;` to reset the path before Cypher queries (lines 113, 123). This is a **known workaround, not a fix** — any new code path touching AGE must remember to reset the path or risk silent query failures.

**Impact:** 
- New code interacting with the memory graph can silently fail if search_path is not reset
- Debugging these failures is opaque (query succeeds structurally but searches wrong schema)
- Pooled connections inherited from prior queries in different schemas

**Fix approach:** 
1. Encapsulate AGE graph access in a dedicated SQL transaction wrapper that manages search_path as part of the connection lease, not per-query
2. Document in `db.ts` that all `sql` handles must reset search_path when switching schema contexts
3. Add a lint rule or test-time assertion that detects `SELECT * FROM` without schema qualification in workflow files

---

### SQL Injection Surface in Entity Graph Extraction

**Issue:** Entity extraction writes to Cypher via string interpolation with escaping, but the architecture relies on allow-lists and manual sanitization rather than parameterized queries.

**Files:** `server/src/entityWorker.ts` (lines 100-130), allow-list at lines 5-6

**Details:**
```typescript
// Allow-lists enforce a closed vocabulary
const ALLOWED_LABELS = new Set(["Person", "Function", "Error", "Topic", "Project"]);
const ALLOWED_RELS = new Set(["CAUSED_BY", "LIKES", "WORKS_ON", "USES", "RELATED_TO"]);

// Escaping handles Cypher syntax characters
function escapeForCypher(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\$\$/g, "");
}

// Writes use sql.unsafe() with escaped interpolation
await sql.unsafe(`
  SELECT * FROM cypher('memory_graph', $$
    MERGE (a {name: '${escapeForCypher(edge.from)}'})
  $$) AS t(v agtype);
`);
```

The LLM response is filtered through `filterExtraction()` (lines 82-100) which validates node labels and rel types against allow-lists, and manually extracts name strings. If LLM returns a label outside the allow-list or a name that bypasses the filter, the `escapeForCypher` function is the only defense.

**Impact:**
- LLM hallucination could produce malformed JSON that the filter rejects, creating silent drops without logging the bad response
- If filter logic drifts from allow-list enforcement, arbitrary Cypher injection becomes possible
- No parameterized Cypher API exists in the postgres library, so `sql.unsafe()` is unavoidable today

**Fix approach:**
1. Log all LLM responses that fail `filterExtraction()` — currently silent
2. Add comprehensive test cases for LLM injection attempts (labels/names containing Cypher syntax)
3. Consider a future migration to a Cypher library that supports parameterized queries (AGE does not currently)
4. Maintain the filter + escape layering but make it explicit in documentation that both layers are required

---

### Large, Complex Workflow Store Module

**Issue:** `server/src/workflow/store.ts` is the single persistence layer for all workflow operations and has grown to 625 lines with dense SQL and complex state invariants.

**Files:** `server/src/workflow/store.ts`

**Impact:**
- High risk of regression when modifying packet status transitions, decision resolution, or criterion enforcement
- State invariants (e.g., "cannot add criterion to completed packet") are enforced in code, not as database constraints, so bypassing this module corrupts state
- Difficult to trace multi-step operations like `completePacket()` which coordinates criteria verification, packet status change, and potential decision promotion

**Fragile areas:**
- Lines 200-280: Criterion enforcement logic with complex queries checking evidence presence, requirement flags, and packet status
- Lines 380-450: Decision resolution with optional promotion side-effect and idempotency handling
- Lines 450-550: Packet completion gate with unmet-criteria detection and dedup checks

**Fix approach:**
1. Break store.ts into focused modules: `store/packets.ts`, `store/decisions.ts`, `store/criteria.ts` with delegated responsibilities
2. Add database constraints for workflow state invariants (cannot freeze criteria on non-open packets, cannot resolve open decisions post-completion)
3. Increase test coverage for state transition edge cases (workflow-boundary.test.ts runs, but needs expanded scenarios)

---

### Consolidation Worker Dry-Run Logic Complexity

**Issue:** `server/src/consolidationWorker.ts` uses a dry-run mode that inverts queue updates (sets status back to 'pending' and clears timestamps) to avoid mutating the thoughts table. This double-negative control flow is error-prone.

**Files:** `server/src/consolidationWorker.ts` (lines 180-250)

**Details:** Every consolidation operation (promote, flag, skip) is followed by conditional queue updates:
```typescript
if (!dryRun) {
  await sql`UPDATE consolidation_queue SET status = 'skipped', processed_at = now() WHERE thought_id = ${thoughtId}`;
} else {
  await sql`UPDATE consolidation_queue SET status = 'pending', processed_at = NULL WHERE thought_id = ${thoughtId}`;
}
```

This pattern repeats 6+ times in the file. If a new operation is added without both branches, dry-run mode silently diverges from real behavior.

**Impact:**
- Dry-run correctness is not validated by tests that run dry-run separately; the only validation is manual code review
- Missing a dry-run branch for a new operation breaks evaluation without clear error message

**Fix approach:**
1. Extract a helper: `updateQueueStatus(thoughtId, status, dryRun)` that ensures both paths are in one place
2. Add a test that runs the same scenario in dry-run and wet modes, then asserts the queue state differs only in `status` and `processed_at`
3. Consider a schema-level marker (e.g., `dry_run_candidate` flag on queue rows) instead of inverting all updates

---

## Known Bugs

### Embedding Backfill Retry Without Exponential Backoff

**Issue:** `server/src/embeddingBackfill.ts` retries failed embeddings with a simple retry-attempt counter, but does not increase backoff delay between retries.

**Files:** `server/src/embeddingBackfill.ts` (lines 45-60)

**Details:**
```typescript
const MAX_ATTEMPTS = 5;                // mirrors entityWorker MAX_ATTEMPTS
const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = Number(Deno.env.get("EMBEDDING_BACKFILL_INTERVAL_MS") ?? "60000");

// Polling loop
setInterval(async () => {
  const rows = await sql`
    SELECT id, content FROM thoughts
    WHERE needs_embedding = true AND embedding IS NULL AND embedding_attempts < ${MAX_ATTEMPTS}
  `;
  for (const row of rows) {
    try {
      const emb = await embed(row.content);
      // ... store embedding
      succeeded++;
    } catch (err) {
      // Increment counter but no delay
      await sql`UPDATE thoughts SET embedding_attempts = embedding_attempts + 1, ...`;
      failed++;
    }
  }
}, POLL_INTERVAL_MS);
```

If the embedding provider is overloaded or temporarily down, the backfill worker will hammer it with 5 × BATCH_SIZE retries every POLL_INTERVAL_MS (default 60s), amplifying the load.

**Impact:**
- Under provider degradation, backfill worker becomes a DoS vector
- No jitter or exponential backoff, so retry storms are synchronized across deployments
- After 5 attempts, embeddings are silently abandoned (embedding_attempts maxes out)

**Trigger:** 
- Set EMBEDDING_BACKFILL_INTERVAL_MS to a small value (e.g., 5000ms)
- Simulate embedding provider timeout or 5xx errors
- Watch embedding_attempts increment rapidly without backoff delays

**Workaround:** 
- Increase EMBEDDING_BACKFILL_INTERVAL_MS to reduce retry frequency
- Disable backfill with FEATURE_EMBEDDING_BACKFILL=false until provider recovers

**Fix approach:**
1. Add `embedding_backoff_until` timestamp column to `thoughts` table
2. Store exponential backoff delay (2^attempt seconds, capped) in the database
3. Only select rows where `now() >= embedding_backoff_until`
4. Add jitter to backoff calculation to desynchronize retries across processes

---

### Migration Repair Logic Depends on Fragile State Detection

**Issue:** `server/src/migrate.ts` contains auto-repair logic for migration-003 that probes the existing schema to detect partial bootstrap state. If schema has drifted in unexpected ways, the repair silently skips.

**Files:** `server/src/migrate.ts` (lines 17-30)

**Details:**
```typescript
const migration003 = files.find((file) => file.version === 3);
if (migration003) {
  await sql.begin(async (tx) => {
    await repairMissingMigration003Artifacts(tx, migration003);
  });
}
```

The `repairMissingMigration003Artifacts()` function (not shown in view range) likely checks for the presence of certain tables or columns to determine if repair is needed. If the detection heuristic misses a partially-applied state, the migration may leave the schema in an inconsistent state.

**Impact:**
- Future queries that depend on migration-003 artifacts fail with opaque constraint or column-not-found errors
- No audit trail showing whether repair was attempted
- Deployment gets stuck in a state where migrations report success but schema is broken

**Trigger:**
- Deployment interrupted during migration-003 application
- Subsequent boot runs, encounters partially-applied schema
- Repair detection heuristic misses the edge case
- Schema remains broken but migrations complete "successfully"

**Workaround:**
- Manual schema inspection and repair via direct SQL
- Force re-run of migrations with a version bump

**Fix approach:**
1. Make repair logic explicit and logged: emit a repair attempt/success/failure entry to schema_migrations
2. Add a `validate_schema()` function that runs post-migration to check for required objects (tables, columns, constraints)
3. Add comprehensive test cases for interrupted migration states (test-fixture: apply migration, abort transaction, restart, assert repair)

---

## Security Considerations

### Provider Access Control Gap Between Flag and Request Path

**Issue:** `MODEL_PROVIDER_ENABLED=false` does not actually gate all model provider requests. Three MCP tool handlers (`search`, `search_thoughts`, `capture_thought`) call `getEmbedding()` directly, bypassing the flag check.

**Files:** `server/src/startupValidation.ts` (lines 30-65), `server/src/embeddings.ts` (lines 47-72), `server/index.ts` (lines 179, 305, 538)

**Details:**
From startupValidation.ts:
```typescript
/**
 * **What it does NOT gate: the request path.** `getEmbedding` is called directly,
 * with no flag check, from three MCP tool handlers — server/index.ts:179 (`search`),
 * :305 (`search_thoughts`), and :538 (`capture_thought`). Setting
 * `MODEL_PROVIDER_ENABLED=false` does not stop those calls; it stops only the two
 * things named above. An operator reading "this process makes no model-provider
 * request" into this flag is wrong for any deployment that also serves those three
 * tools.
 */
```

The flag only gates:
1. Health probe that checks embedding provider readiness (`healthCheck.ts` probeEmbeddingApi)
2. Startup validation refusal to start if a provider-dependent worker is enabled

But the request path itself (`getEmbedding()` in the three tool handlers) has no gate, so a deployment can set the flag `false` and still issue embedding requests when a client calls `/mcp/search`.

**Impact:**
- **Confidentiality:** Operator sets MODEL_PROVIDER_ENABLED=false expecting no model provider contact, but deployment still sends queries to the provider
- **Compliance/Audit:** Regulatory requirement "this deployment must not contact external models" cannot be guaranteed
- **Cost:** Unexpected billing if provider charges per token and operator thought embedding was disabled

**Risk:** High — affects data privacy and compliance posture

**Current mitigation:** The startupValidation.ts comment explicitly states this is a known gap, not a fix. This is an **outstanding design decision the PO has not made**.

**Fix approach:**
1. Clarify whether MODEL_PROVIDER_ENABLED should gate:
   - Only background workers (current behavior) → rename to FEATURE_WORKERS_CONTACT_PROVIDER or document narrowly
   - All provider contact including request path → add gate in getEmbedding() before any network call
   - Some requests but not others → explicit allowlist per tool handler
2. Update startupValidation to match chosen semantics
3. Add tests that verify the flag's actual behavior with all three tool handlers

---

### Cypher Allow-List Reliance Without Fallback

**Issue:** Entity extraction depends on an allow-list of node labels and relationship types. If allow-list is incomplete or wrong, the system silently drops valid entities without alerting operators or developers.

**Files:** `server/src/entityWorker.ts` (lines 5-6, 82-100)

**Details:**
```typescript
const ALLOWED_LABELS = new Set(["Person", "Function", "Error", "Topic", "Project"]);
const ALLOWED_RELS = new Set(["CAUSED_BY", "LIKES", "WORKS_ON", "USES", "RELATED_TO"]);

// filterExtraction silently drops nodes/edges not in allow-list
function filterExtraction(raw: ExtractionResult): ExtractionResult {
  const validNames = new Set(raw.nodes.filter(n => ALLOWED_LABELS.has(n.label)).map(n => n.name));
  return {
    nodes: raw.nodes.filter(n => ALLOWED_LABELS.has(n.label)),
    edges: raw.edges.filter(e => ALLOWED_RELS.has(e.rel) && validNames.has(e.from) && validNames.has(e.to))
  };
}
```

No logging occurs when entities are dropped. If the LLM extracts a legitimate "Organization" or "Team" label and it's not in ALLOWED_LABELS, the entity vanishes silently.

**Risk:** Medium — affects data completeness, not confidentiality

**Impact:**
- Knowledge graph remains incomplete without operator awareness
- LLM extraction quality cannot be validated (good extractions vs. filtering artifacts)
- Allow-list expansion requires code change + deployment, not configuration

**Fix approach:**
1. Log dropped entities with the reasoning (label not in allow-list, edge references unknown node, etc.)
2. Expose allow-list as environment variables (ENTITY_ALLOWED_LABELS, ENTITY_ALLOWED_RELS) to avoid deployments requiring code changes
3. Add a metrics endpoint that counts entities dropped per reason, to alert on allow-list mismatches
4. Consider a "warn then keep" mode in non-production deployments to surface LLM hallucinations

---

## Performance Bottlenecks

### Consolidation Worker Batch Processing Without Concurrency

**Issue:** `server/src/consolidationWorker.ts` processes consolidation queue serially: one thought at a time, with LLM calls blocking the batch.

**Files:** `server/src/consolidationWorker.ts` (lines 195-250)

**Details:**
```typescript
const BATCH_SIZE = 10;
const LLM_RETRY_INTERVAL = "1 hour";

async function drainPendingOnce(...) {
  const batch = await claimBatch(BATCH_SIZE);
  for (const { thought_id } of batch) {
    try {
      const metrics = await fetchMetrics(thought_id);
      // ... scoring ...
      const normalised = await normaliseContent(thought.content); // SERIAL LLM CALL
      // ... write results ...
    } catch (err) {
      // ... retry_after handling ...
    }
  }
}
```

With BATCH_SIZE=10 and LLM normalisation taking 2-5s per request, a single batch drains in 20-50 seconds. Under high queue backlog, this becomes a bottleneck.

**Impact:**
- High-recall thoughts may queue for hours waiting for consolidation
- LLM API is underutilized (one request at a time, not concurrent)
- Backlog grows faster than drain rate during peak ingestion periods

**Scaling limit:** At ~1 request/5s, max throughput is 12 consolidated thoughts/minute; production systems may ingest faster than this

**Fix approach:**
1. Use Promise.all() or pLimit() to parallelize LLM calls within a batch: `await Promise.all(batch.map(async r => { ... await normaliseContent(...) ... }))`
2. Measure end-to-end latency of scoring path (fetching metrics, calling LLM, writing log) to identify next bottleneck
3. Consider a separate LLM call pool with configurable concurrency (default 3-5 concurrent)
4. Monitor queue depth; alert if backlog grows faster than drain rate

---

### Entity Extraction Worker Re-scans Entire Queue on Each Poll

**Issue:** `server/src/entityWorker.ts` polls for pending entity extractions with a broad scan of the queue, then claims a batch with FOR UPDATE SKIP LOCKED. Under high contention, multiple workers re-scan redundantly.

**Files:** `server/src/entityWorker.ts` (lines 118-135)

**Details:**
```typescript
const POLL_INTERVAL_MS = 10_000;

async function processQueue(): Promise<void> {
  // Every worker re-scans the entire queue to find "pending" rows
  const rows = await sql`
    UPDATE entity_extraction_queue
    SET status = 'processing', started_at = now(), attempt_count = attempt_count + 1
    WHERE thought_id IN (
      SELECT thought_id FROM entity_extraction_queue
      WHERE status = 'pending'
        AND (retry_after IS NULL OR retry_after <= now())
      ORDER BY queued_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING thought_id
  `;
}
```

In a deployment with 5+ entity workers, each polls every 10s, resulting in 5 × (SELECT from queue) queries per polling cycle. Only one worker claims rows; the others scan for nothing.

**Impact:**
- Excessive index scans on entity_extraction_queue
- High contention on shared table under heavy ingestion
- Backoff mechanism (getPollBackoffMs) increases latency when queue is empty

**Fix approach:**
1. Use a single "coordinator" worker or distributed lock (advisory lock on a fixed key) to claim a batch once per cycle
2. Broadcast claimed row IDs to other workers via a message queue or shared cache
3. Add a queue depth gauge to decide dynamically whether to spawn more workers or reduce poll interval
4. Consider LISTEN/NOTIFY to replace polling entirely (await new entries via Postgres notification)

---

## Fragile Areas

### Workflow State Invariant Enforcement in Application Code

**Files:** `server/src/workflow/store.ts`, `server/src/workflow/api.ts`

**Why fragile:** State transitions (open → complete, open → resolved for decisions) are enforced by application logic, not database constraints. Direct SQL or a bypassed code path can corrupt state.

**Example fragility:**
- `completePacket()` checks all criteria have evidence before allowing status change to `complete`
- If a caller invokes `UPDATE workflow.work_packets SET status = 'complete' WHERE ...` directly, the gate is bypassed
- Subsequent `addCriterion()` attempts may fail due to the `CriteriaFrozenError`, but state is now inconsistent

**Safe modification:**
- All state changes must go through exported functions in store.ts (createPacket, completePacket, resolveDecision, etc.)
- Never execute workflow SQL outside store.ts
- Add a test (workflow-boundary.test.ts enhancement) that scans for raw UPDATE/DELETE on workflow tables in index.ts

**Test coverage:** Limited — only narrow edge cases around status transitions are tested; comprehensive state machine coverage is missing

---

### Consolidation Scoring Dependency on Batch Statistics

**Files:** `server/src/consolidationScoring.ts`, `server/src/consolidationWorker.ts`

**Why fragile:** Consolidation score is relative to the current batch's min/max metrics. If batch statistics change (e.g., a recall event occurs between batch claim and scoring), the score band may shift, causing a candidate to be promoted or skipped unexpectedly.

**Example:** A shard at position 5 in the batch scores as "promote" with batch maxima; by the time it's scored, a new high-recall shard is added to the batch, shifting the maxima, and the shard now scores as "skip". The queue state has been updated, but the shard is never reconsidered.

**Safe modification:**
- Snapshot batch maxima at claim time and pass them through the pipeline, rather than recomputing per-shard
- Add a test that modifies recall events between claim and score, asserting the score remains stable

---

### Health Check Embedding Provider Probe Timing

**Files:** `server/src/healthCheck.ts` (lines 80-130)

**Why fragile:** The embedding API probe caches results for 60s (EMBEDDING_CACHE_TTL_MS). If the provider goes down 30s after a successful probe, the health check will report healthy for another 30s.

**Impact:** Clients may route traffic to a deployment that cannot reach the embedding provider, causing request failures.

**Safe modification:**
- Reduce cache TTL to match the health check interval (default 5-10s)
- Add a per-request timeout assertion in search/capture tools that gates on provider health

---

## Missing Critical Features

### No Exponential Backoff Across Background Workers

**Issue:** Both consolidationWorker and entityWorker implement exponential backoff for consecutive poll failures, but the implementation details differ and neither integrates with adaptive queue depth.

**Files:** `server/src/consolidationWorker.ts`, `server/src/entityWorker.ts`

**Problem:** Under sustained high load or provider degradation, workers will hammer the queue even as failures accumulate, creating cascading failures.

**Blocks:** Scalability testing and production stability under adverse conditions

**Fix approach:**
1. Create a shared `backoffManager.ts` module with standardized exponential backoff + jitter
2. Make max backoff and backoff cap configurable per worker
3. Emit metrics for backoff state so operators can see when workers are degraded

---

### No Circuit Breaker for OpenRouter API

**Issue:** Embedding calls and LLM calls to OpenRouter have timeouts and error logging, but no circuit breaker. A temporarily-failed provider will be retried immediately, potentially causing cascading failures across all tools.

**Files:** `server/src/embeddings.ts`, `server/src/consolidationLLM.ts`, `server/src/entityWorker.ts`

**Impact:** Under provider outage, every search/consolidation/extraction request fails immediately rather than degrading gracefully. No backpressure on the provider.

**Blocks:** Production resilience, graceful degradation under external failures

---

## Test Coverage Gaps

### Workflow Completion Invariant Not Validated

**Untested area:** Packet completion requires all criteria to have evidence. No test verifies that the invariant is actually enforced in the database (e.g., via constraint violation if evidence is later deleted).

**Files:** `server/src/workflow/store.ts` (completePacket function), test coverage in `server/tests/workflow-store.test.ts` (likely minimal)

**Risk:** High — a future schema change or query refactor could silently break the invariant

**Fix approach:**
1. Write a test that: creates packet, adds criteria, adds evidence, completes packet, then tries to delete evidence via direct SQL, expecting a constraint violation
2. Add database constraints (NOT DEFERRABLE) that enforce the invariant at the database level
3. Document the invariant in ARCHITECTURE.md

---

### Entity Extraction LLM Failure Paths Incomplete

**Untested area:** What happens if callLLM() returns malformed JSON, empty nodes/edges, or a response that fails filterExtraction()? Test the silent-drop behavior and add logging coverage.

**Files:** `server/src/entityWorker.ts`, `server/tests/entity-worker-*.test.ts`

**Risk:** Medium — LLM errors are silently swallowed, making debugging difficult

**Fix approach:**
1. Add a test with LLM returning `{"nodes": [], "edges": []}` (valid JSON but empty) — verify it's logged as a valid extraction, not a failure
2. Add a test with LLM returning invalid JSON — verify retry_after is set correctly and the error is logged
3. Verify filterExtraction() drops count are logged or exposed via metrics

---

*Concerns audit: 2026-08-05*
