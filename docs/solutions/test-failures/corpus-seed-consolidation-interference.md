---
title: "Consolidation queue auto-enqueues during corpus seed, breaking test baselines"
module: "server/tests"
component: "testing_framework"
problem_type: "test_failure"
date: "2026-08-04"
severity: "high"
tags:
  - "corpus"
  - "seed"
  - "consolidation-queue"
  - "trigger"
  - "test-isolation"
  - "embedding"
  - "hybrid-search"
status: "documented"
symptoms:
  - "BM25 incident-baseline test expected 4 rows, got 3"
  - "Hybrid search golden-set tests ('zoom meeting rotation', 'bcf retention rule') failed on vector-lane ranking"
  - "CI integration tests pass, but failures appear inconsistently with background consolidation worker"
root_cause: "test_isolation"
resolution_type: "test_fix"
related_components:
  - "consolidationWorker.ts"
  - "search-golden-set.test.ts"
  - "build-search-quality-corpus.ts"
  - "trg_queue_consolidation trigger"
---

## Problem

The `trg_queue_consolidation` database trigger fires AFTER every INSERT on `thoughts` where `memory_type = 'shard'`, automatically enqueuing rows for the consolidation worker. When the test corpus is seeded (a bulk INSERT of shard rows), the trigger enqueues all of them. The consolidation worker runs asynchronously between seed completion and test execution, calling `UPDATE thoughts SET active = false` on processed shards. This deactivates corpus rows before test assertions run, corrupting the incident baseline count and breaking golden-set membership expectations.

Additionally, hybrid BM25 + vector search tests are non-deterministic in CI when the test environment includes live embeddings (from live `OPENROUTER_API_KEY` used by other tests and the entity worker). Real-embedding rows outrank synthetic corpus embeddings in the vector lane, breaking golden-set membership baselines that assume the corpus dominates vector search.

## Symptoms

**In CI:**

1. **BM25 baseline count test:** Expected 4 `INCIDENT_RELEVANT_IDS` rows, but only 3 are active by test time. The missing row was deactivated by the consolidation worker after it processed the queue entry created at seed time.

2. **Golden-set membership failures:** "zoom meeting rotation" and "bcf retention rule" tests fail because their synthetic-embedding corpus rows are outranked by real-embedding rows inserted by other tests via the live OpenRouter API during the same CI run.

3. **Inconsistency:** Tests pass locally (where only the native Deno server runs, no async worker interference) but fail in CI (where the orchestrated test containers and background workers are fully live).

**Error signatures:**

- Expected 4, Received 3 from BM25 query
- Row `...001e`, `...001f`, or `...0020` missing from results
- Real-embedding IDs appearing in top-10 results when corpus synthetic embeddings should dominate

## What Didn't Work

**Original fix attempt: DELETE from consolidation_queue after seed completes**

```sql
-- Corpus seed SQL (FAILED APPROACH)
INSERT INTO thoughts (...) VALUES (...), (...);  -- trg_queue_consolidation enqueues each row
DELETE FROM consolidation_queue WHERE thought_id IN (...);  -- try to clear the queue
```

**Why it failed:** The consolidation worker is a background service that processes queue entries. Between the INSERT and DELETE, the worker may have already read and processed one or more entries in milliseconds — a race condition. The DELETE removes only entries that have not yet been claimed by the worker, leaving processed entries (with their shards now `active = false`) orphaned. The race is non-deterministic, making the fix unreliable. Evidence: ST-010 documented this same failure mode in a different context.

## Solution

**Approach 1: DISABLE TRIGGER during seed** (the durable fix)

```sql
-- server/tests/fixtures/search-quality-corpus.sql (lines 5-end+2)
ALTER TABLE thoughts DISABLE TRIGGER trg_queue_consolidation;

INSERT INTO thoughts (id, memory_type, content, ...) VALUES 
  (...),
  (...),
  -- ... all corpus rows ...
  (...);

ALTER TABLE thoughts ENABLE TRIGGER trg_queue_consolidation;
```

**Why this works:** By disabling the trigger BEFORE any INSERT, the consolidation queue never sees any corpus entries. The trigger is re-enabled after the seed completes, so future non-corpus work is unaffected. No race condition — the structural prevention eliminates the window entirely.

**Approach 2: Exclude non-deterministic queries from golden-set baseline**

```typescript
// server/tests/search-golden-set.test.ts (lines 85-92)
const LIVE_MEMBERSHIP_EXCLUDED_QUERIES = [
  "zoom meeting rotation",
  "bcf retention rule",
  // Queries that depend on vector embeddings and are not deterministic
  // when the test environment includes real embeddings from other tests
];
```

**Why this works:** Hybrid BM25 + vector search is inherently environment-sensitive. The corpus uses synthetic embeddings (constructed vectors); real embeddings from live API calls will outrank them when both are present. These specific queries are not part of the BM25-deterministic baseline, so excluding them from golden-set membership tests (which require exact, reproducible results) preserves structural coverage (incident baseline tests still validate BM25 counts) while accepting hybrid-query environment sensitivity. The trade-off is documented and intentional.

**Approach 3: Sync the generator with the seed SQL**

```typescript
// server/tests/fixtures/build-search-quality-corpus.ts (lines 116-122, 136-139)
const sqlLines = [
  "ALTER TABLE thoughts DISABLE TRIGGER trg_queue_consolidation;",
  // ... INSERT statements ...
];

// After all INSERTs:
sqlLines.push("ALTER TABLE thoughts ENABLE TRIGGER trg_queue_consolidation;");
```

**Why this works:** The corpus seed SQL is marked "do not edit by hand" because it is generated. If someone regenerates the corpus with the `build-search-quality-corpus.ts` script, the trigger guards must survive the regeneration. By updating the generator to emit the DISABLE/ENABLE guards, future regenerations preserve the fix automatically.

## Why This Works

1. **DISABLE TRIGGER is structural, not a race:** A trigger can only fire when it is enabled. Disabling it before the seeding operation prevents the consolidation queue from ever being populated with corpus-shard entries. No timing dependency, no race condition — the guarantee is structural.

2. **Hybrid queries are environment-dependent:** When multiple tests run in the same CI container with a shared database and the same live embedding API key, real-embedding rows accumulate. Synthetic corpus embeddings were designed with known topic structure; they are not competitive in vector-lane ranking against real embeddings from a production API. Excluding these queries from deterministic golden-set baselines is an honest trade-off that preserves structural test coverage (BM25-only incident tests still validate the problem baseline) while accepting that hybrid queries are integration tests, not unit tests of corpus quality.

3. **Generator sync ensures durability:** Corpus SQL has high churn risk. The "do not edit by hand" comment in the template makes regeneration easy, but it also means hand-edits are fragile. Updating the generator ensures the fix survives regeneration, making it durable through corpus updates.

## Prevention

**For future corpus-dependent test work:**

1. **Always consider trigger side-effects:** If a test seed INSERTs into a table with auto-enqueuing triggers (like `trg_queue_consolidation` on `thoughts`), either:
   - DISABLE the trigger before seeding (preferred — structural fix)
   - DELETE the entire queue before assertions (less preferred — retry-vulnerable)
   - Ensure the background worker cannot run during test time (brittle)

2. **Document seed SQL limitations:** Mark seed SQL with "do not edit by hand" comments and keep the generator in sync with any structural changes (DISABLE/ENABLE guards, seed order, fixture-specific logic). Regeneration should be a no-op relative to human edits.

3. **Separate deterministic from integration tests:** Use golden-set membership baselines (deterministic) for BM25-only queries and corpus structure validation. Use looser acceptance criteria (or exclude entirely) for hybrid or embedding-dependent queries in CI environments where live embeddings contaminate the vector lane. Document the trade-off.

**Test case example — validate the fix is live:**

```typescript
// Corpus seed has DISABLED the trigger, so no queue entries should exist
test("consolidation queue is empty after corpus seed", async () => {
  const queueCount = await db.query(
    "SELECT COUNT(*) FROM consolidation_queue WHERE thought_id IN (SELECT id FROM thoughts WHERE memory_type = 'shard')"
  );
  expect(queueCount).toEqual(0);
});

// Verify trigger is re-enabled for non-corpus work
test("consolidation queue populates after seeding completes", async () => {
  const newShardId = await db.query(
    "INSERT INTO thoughts (memory_type, content) VALUES ('shard', 'test') RETURNING id"
  );
  const queueCount = await db.query(
    "SELECT COUNT(*) FROM consolidation_queue WHERE thought_id = $1",
    [newShardId]
  );
  expect(queueCount).toEqual(1);
});
```

## References

- **PR #46** (merged to main as `382c291`): Corpus seed with DISABLE/ENABLE trigger guards + golden-set query exclusions + generator update
- **ST-010:** Original consolidation-worker deactivation documented in session history
- **server/db/schema.sql:** `trg_queue_consolidation` trigger definition (AFTER INSERT ON thoughts WHERE memory_type = 'shard')
- **server/src/consolidationWorker.ts** (line 136): Worker's `UPDATE thoughts SET active = false` that deactivates processed shards
- **server/tests/fixtures/search-quality-corpus.sql** (lines 5, end+2): Trigger DISABLE/ENABLE placement
- **server/tests/fixtures/build-search-quality-corpus.ts** (lines 116-139): Generator that emits the guards
- **server/tests/search-golden-set.test.ts** (lines 85-92, 29, 111-145): LIVE_MEMBERSHIP_EXCLUDED_QUERIES and incident baseline tests
