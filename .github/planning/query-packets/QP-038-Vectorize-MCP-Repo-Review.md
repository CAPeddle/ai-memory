Here's the updated ExecPlan with all gaps filled:

---

# ExecPlan: Operational Hardening & Search Quality Improvements

## §1 Context

**Story:** TBD (to be registered on story-board)  
**Origin:** Best practices review comparing ai-memory against vectorize-mcp-worker patterns and industry standards (May 2026).  
**Scope:** Server-side (server) operational hardening, search quality improvements, and schema safety. No .NET changes.

## §1a Insight Catalog

These 19 findings (yielding 17 ACs) emerged from comparing ai-memory against [dannwaneri/vectorize-mcp-worker](https://github.com/dannwaneri/vectorize-mcp-worker) (hybrid RAG on Cloudflare Edge) and general MCP server best practices (May 2026).

**Priority tiers:**
- 🔴 **Must fix** — Active data loss, silent failures, or security gaps in current usage
- 🟡 **Should fix** — Operational gaps that will bite during Phase 2 (cloud deployment) or sustained use
- 🟢 **Nice to have** — Defense-in-depth or polish; valuable but not blocking current use or next phase

| # | Insight | Priority | Source | Task |
|---|---------|----------|--------|------|
| 1 | No startup validation — missing env vars cause silent embedding failures | 🔴 Must fix | vectorize-mcp-worker validates config at boot | §4.1 |
| 2 | No feature flags — can't safely disable graph/entity features | 🟡 Should fix | Industry standard for progressive rollout | §4.2 |
| 3 | No content size limit — agents can pass arbitrarily large payloads | 🔴 Must fix | Cost/security risk; vectorize validates input shapes | §4.3 |
| 4 | Context string silently parses garbage — no validation feedback | 🟡 Should fix | vectorize-mcp-worker validates metadata filter shapes extensively | §4.4 |
| 5 | Fire-and-forget embeddings — transient failures silently lose data | 🔴 Must fix | vectorize uses retry with exponential backoff | §4.5, §4.6, §4.7 |
| 6 | No embedding model versioning — model upgrades require manual re-embed | 🟡 Should fix | Neither repo handles this; future-proofing column | §4.5 |
| 7 | No structured logging — no request correlation or timing visibility | 🟡 Should fix | vectorize targets explicit p99 latency budgets | §4.8 |
| 8 | No queryable metrics — can't answer "what's slow?" without log parsing | 🟢 Nice to have | vectorize uses Cloudflare Analytics Engine | §4.9 |
| 9 | No query routing — always runs both search lanes regardless of query type | 🟢 Nice to have | vectorize skips irrelevant lanes (keyword-only, semantic-only) | §4.10 |
| 10 | No golden-set regression tests — tuning RRF/MMR could silently degrade recall | 🟡 Should fix | vectorize tests specific queries against expected result sets | §4.11 |
| 11 | No latency assertions in tests — performance regressions go undetected | 🟢 Nice to have | Industry best practice for search services | §4.11 |
| 12 | No migration framework — schema drift between dev/test/prod | 🟡 Should fix | Industry standard; prevents manual DDL application | §4.12 |
| 13 | Entity worker crash can propagate — unhandled rejection kills server | 🔴 Must fix | Must run in isolated try/catch with backoff | §4.13 |
| 14 | Worker lacks idempotency — crash during processing may duplicate/skip work | 🟡 Should fix | Needs `entity_extracted` flag for safe replay | §4.13 |
| 15 | No backpressure — unbounded queue if thoughts arrive faster than extraction | 🟢 Nice to have | Bounded queue with observational alerting | §4.14 |
| 16 | Cypher injection mitigation is partial — `$$` stripping insufficient | 🔴 Must fix | Keyword allow-list + MATCH-only enforcement needed | §4.15 |
| 17 | No rate limiting — runaway agent loops burn embedding quotas | 🟢 Nice to have | Neither repo implements; critical for agent-facing services | §4.16 |
| 18 | Tool descriptions lack examples — AI agents invoke tools poorly without them | 🟡 Should fix | vectorize uses detailed, example-rich tool descriptions | §4.18 |
| 19 | Health check is shallow — no DB latency, queue depth, or degraded state | 🟢 Nice to have | Industry standard for container orchestration | §4.17 |

Note: Insights 5+6 map to the same tasks (embedding resilience), hence 17 ACs from 19 catalog entries.

When this QP is picked up for planning, **must fix** items form the core stories. **Should fix** items are planned as follow-on stories. **Nice to have** items are created as separate stories referencing this QP, clearly marked as non-blocking polish — they can be deferred or deprioritised without affecting the system's correctness or safety.

## §1b Phase 2 Pickup Rule

This QP is designed to be **fully consumed in a single /plan pass**. The planner should:

1. Create **one ExecPlan per must-fix story** (ST-A through ST-D) — these are implementation-ready.
2. Create **one ExecPlan per should-fix story** (ST-E through ST-J) — these are implementation-ready but lower priority.
3. Create **board entries (story stubs) for each nice-to-have story** (ST-L through ST-Q) with a lightweight ExecPlan or a `Status: ⬜ Not Ready` placeholder marked `Deferred — plan when cloud deployment (Phase 2) begins`.
4. After processing, **this QP should never need to be revisited** — all work is on the board with ExecPlans or stubs.

A must-fix ExecPlan **must not** include work from §4.9, §4.10, §4.14, §4.16, or §4.17 unless the PO explicitly broadens scope during the planning round.

### Story → AC Mapping

| Story | In-scope ACs | Out of scope |
|-------|-------------|-------------|
| **ST-A: Startup Safety & Input Guards** | AC-1, AC-5 | All others |
| **ST-B: Embedding Resilience** | AC-2, AC-17 | All others |
| **ST-C: Worker Crash Isolation** | AC-10 | AC-11 (needs idempotency flag from ST-H) |
| **ST-D: Cypher Injection Hardening** | AC-12 | AC-14 (rate limiting is separate) |
| **ST-E: Migration Framework** | AC-9 | — |
| **ST-F: Context Validation + Feature Flags** | AC-6, AC-16 | — |
| **ST-G: Structured Logging** | AC-3 | AC-4 (metrics table is ST-L) |
| **ST-H: Worker Idempotency** | AC-10 (extended), AC-11 | — |
| **ST-I: Golden-Set Regression Tests** | AC-7 | AC-8 (latency assertions are ST-N) |
| **ST-J: Tool Descriptions** | AC-15 | — |
| **ST-L: Queryable Metrics Table** | AC-4 | — |
| **ST-M: Query Routing** | AC-13 | — |
| **ST-N: Latency Assertions** | AC-8 | — |
| **ST-O: Rate Limiting** | AC-14 | — |
| **ST-P: Backpressure Control** | AC-11 | — |
| **ST-Q: Deep Health Check** | (no dedicated AC — operational polish) | — |

## §2 Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-1 | Server fails fast at startup if required env vars are missing | Remove `OPENROUTER_API_KEY` from .env, observe immediate exit with clear error |
| AC-2 | Thoughts with failed embeddings are recoverable via backfill | Insert thought, simulate embedding failure, run backfill, confirm embedding populated |
| AC-3 | Every MCP tool invocation emits structured JSON log with timing | Invoke `search_thoughts`, observe JSON log line with `tool`, `duration_ms`, `status` |
| AC-4 | Tool metrics are persisted to a queryable `metrics` table | After 10 invocations, `SELECT * FROM tool_metrics` returns 10 rows with timing data |
| AC-5 | `capture_thought` rejects content exceeding 32KB | Call with 64KB payload, receive 400-level error |
| AC-6 | Malformed `context` strings are rejected with a clear error | Call with `context: "garbage!!!"`, receive validation error naming the expected format |
| AC-7 | Search quality golden-set test catches regressions | Modify RRF k, run test, observe failure on expected ranking |
| AC-8 | Search tests include latency assertions | Seeded-corpus search completes in < 500ms or test fails |
| AC-9 | Schema changes are applied via numbered migrations | New `schema_migrations` table tracks applied migrations |
| AC-10 | Entity worker survives errors without crashing the server | Inject malformed thought, worker logs error and continues |
| AC-11 | Entity worker respects backpressure limits | When queue exceeds bound, new items are deferred (not dropped), alert logged |
| AC-12 | `graph_traverse` rejects mutation keywords | Send `CREATE` in Cypher, receive rejection error |
| AC-13 | Query routing skips vector lane for keyword-only queries | Search for an exact error code, observe vector lane skipped in logs |
| AC-14 | Rate limiting returns 429 after threshold exceeded | Send 100+ requests/sec from one key, observe 429 responses |
| AC-15 | All MCP tool descriptions include usage examples and parameter docs | Inspect tool listings, confirm examples present |
| AC-16 | Feature flags disable graph/entity features when toggled off | Set `FEATURE_ENTITY_WORKER=false`, restart, confirm worker does not start |
| AC-17 | Embedding model version is recorded per thought | After capture, SELECT embedding_model FROM thoughts WHERE id = $1 returns 'text-embedding-3-small' |

## §3 Prerequisites

- Dev + test Docker stacks healthy (`docker compose --profile test up -d`)
- .env populated with all current keys
- Seed corpus loaded in `db-test`

## §4 Tasks

### Phase A: Startup Safety & Input Validation (Low effort, High impact)

#### §4.1 — Env validation at boot

**File:** `server/src/config.ts` (new)

1. Create `config.ts` that reads and validates all required env vars:
   - `MEMORY_API_KEY`, `DB_PASSWORD`, `OPENROUTER_API_KEY`, `DATABASE_URL` (or individual DB params)
2. Export a typed `Config` object (frozen, immutable after validation).
3. On missing/empty required var → `console.error` with the var name + guidance → `Deno.exit(1)`.
4. Import and call validation at the top of index.ts before any other initialization.

**Verification:**
```powershell
docker compose --profile test exec mcp-test sh -c "unset OPENROUTER_API_KEY && deno run --allow-net --allow-env --allow-read /app/index.ts"
# Expect: exit code 1, message mentioning OPENROUTER_API_KEY
```

#### §4.2 — Feature flags

**File:** `server/src/config.ts` (extend from §4.1)

1. Add optional boolean env vars with defaults:
   - `FEATURE_ENTITY_WORKER` (default: `true`)
   - `FEATURE_GRAPH_TOOLS` (default: `true`)
   - `FEATURE_EMBEDDING_BACKFILL` (default: `true`)
2. Export as part of the `Config` object.
3. Guard worker startup and tool registration behind these flags in `index.ts`.
4. Log which features are enabled/disabled at startup.

**Verification:**
```powershell
docker compose --profile test exec mcp-test sh -c "FEATURE_ENTITY_WORKER=false deno run --allow-net --allow-env --allow-read /app/index.ts"
# Expect: log line "Entity worker: disabled by feature flag", worker does not start
```

#### §4.3 — Content size limit on `capture_thought`

**File:** `server/src/tools/captureThought.ts` (or wherever capture logic lives)

1. Add a constant `MAX_CONTENT_BYTES = 32768`.
2. Before processing, check `new TextEncoder().encode(content).length > MAX_CONTENT_BYTES`.
3. Return MCP error response with clear message: `"Content exceeds maximum size of 32KB"`.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/capture-size-limit.test.ts
```

#### §4.4 — Context string validation

**File:** `server/src/parseContext.ts`

1. Define the valid context format: comma-separated `key:value` pairs where keys are from an allow-list (`project`, `profile`) plus an optional bare keyword (`strict`).
2. On parse: if the string doesn't match the expected grammar, return a structured validation error with:
   - What was received
   - What the expected format is (with example: `"project:myapp,profile:work,strict"`)
   - Which specific token failed
3. Update all tool handlers to surface this validation error to the MCP caller (not silently ignore it).

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/context-validation.test.ts
```

### Phase B: Embedding Resilience (Medium effort, High impact)

> **Decoupled from migration framework.** Phase B applies its schema change via a standalone DDL script (`server/db/002_needs_embedding.sql`) executed by the Docker init entrypoint or manually. It does NOT depend on the migration runner from §4.12. This allows the highest-impact data-loss fix to ship independently.

#### §4.5 — Add `needs_embedding` flag + embedding versioning

**DDL file:** `server/db/002_needs_embedding.sql` (standalone, idempotent — all statements use `IF NOT EXISTS` or are `UPDATE` with WHERE guards)

**Application method:**

- **New databases** (first `docker compose up`): Add to Docker entrypoint init directory (`docker/postgres-age/`) so it runs automatically after `schema.sql`. Note: Postgres's `/docker-entrypoint-initdb.d/` only runs on first `initdb` — this handles fresh volumes only.
- **Existing databases** (dev volume already initialized): Execute manually against both `db` and `db-test`:
  ```powershell
  # Apply to dev database
  docker compose exec db psql -U postgres -d memory -f /docker-entrypoint-initdb.d/002_needs_embedding.sql

  # Apply to test database (if test stack is running)
  docker compose --profile test exec db-test psql -U postgres -d memory_test -f /docker-entrypoint-initdb.d/002_needs_embedding.sql
  ```
  **Verification** (run after either method):
  ```powershell
  docker compose exec db psql -U postgres -d memory -c "SELECT column_name FROM information_schema.columns WHERE table_name='thoughts' AND column_name IN ('needs_embedding','embedding_model');"
  # Expect: 2 rows returned (needs_embedding, embedding_model)
  ```
- **If §4.12 has already shipped**: Place in `server/db/migrations/002_needs_embedding.sql` and let the runner apply it instead. The DDL is idempotent so double-application is harmless.

```sql
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS needs_embedding BOOLEAN DEFAULT true;
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS embedding_model TEXT;

-- Mark existing thoughts with embeddings as done (idempotent — re-running is safe)
UPDATE thoughts SET needs_embedding = false WHERE embedding IS NOT NULL AND needs_embedding = true;

-- Index for backfill sweep
CREATE INDEX IF NOT EXISTS idx_thoughts_needs_embedding ON thoughts (needs_embedding) WHERE needs_embedding = true;
```

#### §4.6 — Implement backfill sweep

**File:** `server/src/embeddingBackfill.ts` (new)

1. Query: `SELECT id, content FROM thoughts WHERE needs_embedding = true ORDER BY created_at LIMIT 50`.
2. For each batch: call embedding API with exponential backoff (max 3 retries, base 1s).
3. On success: `UPDATE thoughts SET embedding = $1, needs_embedding = false, embedding_model = $2 WHERE id = $3`.
4. On permanent failure (4xx): log error, set `needs_embedding = false` (prevent infinite retry), add `embedding_error` note.
5. Run on a 60-second interval timer, started from `index.ts` (guarded by `FEATURE_EMBEDDING_BACKFILL` flag).

#### §4.7 — Update `capture_thought` to use flag

Modify capture flow:
1. Insert thought with `needs_embedding = true`.
2. Attempt embedding immediately (fire-and-forget).
3. On success: update `needs_embedding = false, embedding_model = 'text-embedding-3-small'`.
4. On failure: leave `needs_embedding = true` — backfill will retry.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/embedding-backfill.test.ts
```

### Phase C: Observability (Low-Medium effort, High impact)

#### §4.8 — Structured logging middleware

**File:** `server/src/logging.ts` (new)

1. Create a Hono middleware that:
   - Generates a `request_id` (crypto.randomUUID()).
   - Records `start_time` on request entry.
   - On response: emits a JSON log line:
     ```json
     {"ts":"...","request_id":"...","method":"POST","path":"/mcp","status":200,"duration_ms":42}
     ```
2. Apply middleware globally in `index.ts`.

#### §4.9 — Tool-level timing instrumentation + metrics table

**File:** `server/src/toolMetrics.ts` (new)

1. Create migration `server/db/migrations/003_tool_metrics.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS tool_metrics (
     id BIGSERIAL PRIMARY KEY,
     tool_name TEXT NOT NULL,
     duration_ms INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'ok',
     error_message TEXT,
     request_id TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   CREATE INDEX idx_tool_metrics_created ON tool_metrics (created_at DESC);
   CREATE INDEX idx_tool_metrics_tool ON tool_metrics (tool_name, created_at DESC);
   ```
2. Create a wrapper that instruments each MCP tool handler:
   - Emits structured JSON log: `{"ts":"...","tool":"search_thoughts","duration_ms":87,"status":"ok","request_id":"..."}`
   - Inserts row into `tool_metrics` (fire-and-forget, don't block response).
3. Wrap all tool handlers.
4. Add a utility query (or expose via `thought_stats` enhancement) to report p50/p95/p99 over last hour:
   ```sql
   SELECT tool_name,
     percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) as p50,
     percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95,
     percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) as p99
   FROM tool_metrics WHERE created_at > now() - interval '1 hour'
   GROUP BY tool_name;
   ```

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/observability.test.ts
```

### Phase D: Search Quality (Medium effort, Medium impact)

#### §4.10 — Query routing (lane skipping)

**File:** `server/src/searchQuality.ts`

1. Add a function `classifyQuery(query: string): 'keyword' | 'semantic' | 'hybrid'`:
   - `keyword`: query matches patterns like error codes (`ERR-\d+`), UUIDs, exact file paths, quoted strings, or is ≤3 tokens with no natural language.
   - `semantic`: query is a natural language question (>5 tokens, contains question words or descriptive phrases).
   - `hybrid`: default fallback.
2. In the search pipeline:
   - `keyword` → skip vector lane, use BM25 only.
   - `semantic` → skip BM25 lane, use vector only.
   - `hybrid` → run both lanes + RRF fusion (current behavior).
3. Log the classification decision in structured output (tool metrics log).

#### §4.11 — Golden-set regression tests with latency assertions

**File:** `server/tests/search-golden-set.test.ts` (new)

1. Define 10+ query/expected-result pairs against the seeded corpus:
   - Keyword queries (expect exact matches at top)
   - Semantic queries (expect conceptually relevant results)
   - Mixed queries (expect balanced results)
2. For each: assert that expected document IDs appear in top-5 results.
3. Assert on lane classification (keyword/semantic/hybrid) for known queries.
4. **Latency assertions**: wrap each search call in timing and assert < 500ms for single-query on the seeded corpus. Use `Deno.now()` for monotonic timing. Mark as `{ sanitizeOps: false }` if needed for async timing.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/search-golden-set.test.ts
```

### Phase E: Schema Safety (Medium effort, Medium impact)

#### §4.12 — Migration framework

**Structure:**
```
server/db/migrations/
  001_initial.sql          (extract from current schema.sql + graph.sql + search.sql)
  002_needs_embedding.sql  (from §4.5 — may already be applied via Docker init)
  003_tool_metrics.sql     (from §4.9)
  004_entity_extracted.sql (from §4.14)
```

**File:** `server/src/migrate.ts` (new)

1. On startup (after config validation, before server listen):
   - Ensure `CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`.
   - Read all `NNN_*.sql` files from `server/db/migrations/`, sorted numerically.
   - For each not in `schema_migrations`: execute in a transaction, insert version.
2. If any migration fails: log error, `Deno.exit(1)`.
3. Integrate into `index.ts` startup sequence.

**Bootstrap behavior for existing databases:**

Existing dev/test databases were created by Docker init scripts loading `schema.sql` directly — they have the tables but no `schema_migrations` table. The migration runner MUST handle this gracefully:

- On first run: if `schema_migrations` does not exist but target tables (e.g., `thoughts`) already do, **seed `schema_migrations` with all versions whose DDL is already applied** rather than attempting to re-run `001_initial.sql`.
- Detection: after creating `schema_migrations`, check `SELECT to_regclass('public.thoughts')`. If it exists, insert version 1 as already-applied. Similarly check for `needs_embedding` column presence to mark version 2, etc.
- All migration DDL MUST use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` as a safety net, so that even if detection fails, re-running is idempotent rather than fatal.
- Document this bootstrap logic in a code comment in `migrate.ts` so future maintainers understand the first-run path.

**Verification:**
```powershell
# Test against fresh DB (no tables) — all migrations applied
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/migrations.test.ts

# Test against existing DB (tables exist, no schema_migrations) — bootstraps correctly
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/migrations-bootstrap.test.ts
```

### Phase F: Worker Hardening (Medium effort, Medium impact)

#### §4.13a — Entity worker crash isolation (ST-C scope)

**File:** `server/src/entityWorker.ts`

This subsection is scoped to **ST-C: Worker Crash Isolation** (must-fix). It does NOT require schema changes.

1. Wrap the main processing loop in try/catch:
   - On error: log structured error, increment failure counter, sleep with exponential backoff (1s → 2s → 4s → max 60s).
   - After 5 consecutive failures: log alert-level message, continue with max backoff.
   - On success: reset failure counter and backoff.
2. Never let an unhandled rejection from the worker propagate to the main process.
3. Ensure the worker loop restarts after any single-thought failure (do not exit the loop).

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/entity-worker-crash-isolation.test.ts
```

#### §4.13b — Entity worker idempotency (ST-H scope)

**File:** `server/src/entityWorker.ts`

This subsection is scoped to **ST-H: Worker Idempotency** (should-fix). It requires the migration framework from §4.12 (ST-E).

1. Add `entity_extracted BOOLEAN DEFAULT false` column (migration `004_entity_extracted.sql`).
2. Worker only picks thoughts where `entity_extracted = false`.
3. Mark `entity_extracted = true` after successful processing (even if no entities found).
4. Re-processing a thought that already has `entity_extracted = true` is a no-op (idempotent).

#### §4.14 — Backpressure control

**File:** `server/src/entityWorker.ts` (extend from §4.13b)

1. Add a configurable queue bound: `ENTITY_WORKER_MAX_PENDING` (env var, default: 500).
2. On each sweep, count pending: `SELECT COUNT(*) FROM thoughts WHERE entity_extracted = false`.
3. If pending > bound:
   - Log alert: `{"level":"warn","msg":"Entity extraction backpressure","pending":612,"max":500}`
   - Process only the oldest `batch_size` (default 10) per sweep — don't try to catch up all at once.
   - Reduce sweep interval from normal (30s) to fast (5s) until pending < bound.
4. Items are never dropped — they remain with `entity_extracted = false` until processed. The backpressure signal is observational (for health check and alerting).
5. Expose pending count to the health check (§4.17).

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/entity-worker-resilience.test.ts
```

### Phase G: Security Hardening (Low-Medium effort, Medium impact)

#### §4.15 — Harden `graph_traverse` Cypher validation

**File:** `server/src/tools/graphTraverse.ts` (or equivalent)

1. Replace `$$` stripping with a proper allow-list parser:
   - Tokenize the query and reject if any of these keywords appear (case-insensitive): `CREATE`, `SET`, `DELETE`, `REMOVE`, `MERGE`, `DETACH`, `DROP`, `CALL`, `LOAD`.
   - Only allow queries starting with `MATCH` (after whitespace trimming).
2. Add max query length limit (4096 chars).
3. Add deprecation notice in tool description recommending `graph_search` for new integrations.

#### §4.16 — Rate limiting

**File:** `server/src/rateLimit.ts` (new)

1. Implement a simple sliding-window rate limiter:
   - Key: API key (from Bearer token).
   - Window: 60 seconds.
   - Limit: 120 requests/minute (configurable via env `RATE_LIMIT_PER_MINUTE`).
   - Storage: In-memory Map (sufficient for single-instance; document that multi-instance needs Redis).
2. On limit exceeded: return HTTP 429 with `Retry-After` header.
3. Apply as Hono middleware on `/mcp` route, after auth.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/rate-limit.test.ts
```

### Phase H: Health Check & Documentation (Low effort, Medium impact)

#### §4.17 — Deep health check

**File:** `server/src/health.ts` (or inline in `index.ts`)

1. Enhance `/health` to return:
   ```json
   {
     "status": "healthy" | "degraded" | "unhealthy",
     "checks": {
       "database": { "status": "ok", "latency_ms": 2 },
       "embedding_queue": { "status": "ok", "pending": 3 },
       "entity_worker": { "status": "ok", "pending": 12, "last_run": "..." }
     }
   }
   ```
2. `degraded`: DB ok but embedding queue > 100 or entity worker pending > bound or worker hasn't run in 5 min.
3. `unhealthy`: DB unreachable.
4. Keep returning 200 for `healthy`/`degraded` (container stays up), 503 for `unhealthy`.

#### §4.18 — Enrich MCP tool descriptions

**File:** `server/index.ts`

1. Update every tool's `description` field to include:
   - One-line purpose summary
   - Parameter format with example values
   - Example invocation showing typical arguments
   - Edge case notes (e.g., what happens with empty context, max content size)
2. Follow this template per tool:
   ```
   Search for thoughts using hybrid BM25 + vector retrieval.

   Parameters:
   - query (required): Natural language or keyword search. Examples: "authentication flow", "ERR-4012"
   - context (optional): Scoping string. Format: "project:<name>,profile:<name>,strict". Example: "project:zoom,profile:work"
   - limit (optional): Max results, 1-50. Default: 10.

   Notes:
   - Keyword-like queries (error codes, UUIDs) use BM25 only for precision.
   - Use "strict" in context to restrict results to the exact project (no cross-project bleed).
   ```
3. Keep descriptions concise but complete — these are the primary API docs for AI agent consumers.

**Verification:**
```powershell
# Manual: call tools/list via MCP and inspect descriptions
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/tool-descriptions.test.ts
```

The `tool-descriptions.test.ts` asserts that each tool's description contains at minimum: a parameter list, at least one example value, and mentions expected error conditions.

## §5 Recovery

> **Note:** This section is illustrative — it shows the commit strategy from the original monolithic plan. When this QP is consumed into per-story ExecPlans, each ExecPlan gets its own §5 with story-scoped checkpoints. Do not copy this section verbatim into individual ExecPlans.

### §5a Checkpoints (illustrative, per original monolithic structure)

| After Task | Checkpoint | Rollback |
|------------|-----------|----------|
| §4.3 | Commit: `feat(config): startup validation + content size limit` | Revert commit |
| §4.7 | Commit: `feat(embed): needs_embedding flag + backfill with retry` | Revert DDL + commits |
| §4.8 | Commit: `feat(obs): structured logging middleware` | Revert commit |
| §4.11 | Commit: `test(search): golden-set regression tests` | Revert commits |
| §4.12 | Commit: `feat(schema): migration framework with bootstrap` | Revert commits |
| §4.13a | Commit: `fix(worker): crash isolation with backoff` | Revert commit |
| §4.13b | Commit: `feat(worker): idempotency via entity_extracted flag` | Revert migration + commit |
| §4.15 | Commit: `fix(security): harden graph_traverse Cypher validation` | Revert commit |

### §5b Recovery Ledger

| Commit | SHA | Timestamp | Notes |
|--------|-----|-----------|-------|
| *(populated during execution within each story's ExecPlan)* | | | |

## §6 Notes

### §6a Assumptions

- The seeded test corpus in `search-quality-corpus.sql` has sufficient diversity to build meaningful golden-set assertions.
- OpenRouter's embedding endpoint returns standard HTTP error codes (4xx = permanent, 5xx = transient).
- Single-instance deployment (in-memory rate limiting is acceptable; document Redis needed for multi-instance).
- Current `schema.sql` can be treated as migration `001` without data loss in dev/test. **Mitigation**: §4.12 includes explicit bootstrap detection for pre-existing databases (see "Bootstrap behavior" section).
- 500ms latency assertion is generous for a seeded corpus on local Docker — adjust if tests prove flaky.
- Phase B (embedding resilience) ships independently of Phase E (migrations) — it uses a standalone idempotent DDL script applied via Docker init, not the migration runner.

### §6b Surprises & Discoveries

*(populated during execution)*

---

## Phasing Recommendation

Stories are grouped by priority tier. **Must fix** and **Should fix** stories are planned directly. **Nice to have** stories are created separately, referencing this QP, and can be deferred indefinitely.

### 🔴 Must Fix (plan immediately)

| # | Story | Phases | Tasks | Effort | Depends on |
|---|-------|--------|-------|--------|------------|
| 1 | **ST-A: Startup Safety & Input Guards** | A(§4.1, §4.3) | §4.1, §4.3 | Small | — |
| 2 | **ST-B: Embedding Resilience** | B | §4.5–§4.7 | Medium | — |
| 3 | **ST-C: Worker Crash Isolation** | F(§4.13a only) | §4.13a | Small | — |
| 4 | **ST-D: Cypher Injection Hardening** | G(§4.15 only) | §4.15 | Small | — |

**Execution order:** All independent — can execute in parallel or any sequence.

ST-B uses a standalone idempotent DDL script (not the migration runner). ST-C adds try/catch + backoff to the entity worker without schema changes.

### 🟡 Should Fix (plan as follow-on stories)

| # | Story | Phases | Tasks | Effort | Depends on |
|---|-------|--------|-------|--------|------------|
| 5 | **ST-E: Migration Framework** | E | §4.12 | Medium | — |
| 6 | **ST-F: Context Validation + Feature Flags** | A(§4.2, §4.4) | §4.2, §4.4 | Small | — |
| 7 | **ST-G: Structured Logging** | C(§4.8) | §4.8 | Small | — |
| 8 | **ST-H: Worker Idempotency** | F(§4.13b) | §4.13b (entity_extracted flag) | Small | ST-E (migration framework) |
| 9 | **ST-I: Golden-Set Regression Tests** | D(§4.11) | §4.11 | Medium | — |
| 10 | **ST-J: Tool Descriptions** | H(§4.18) | §4.18 | Small | — |


**Execution order:** ST-E first (enables ST-H). Others are independent.

### 🟢 Nice to Have (create as separate stories, clearly marked deferrable)

| # | Story | Phases | Tasks | Effort | Depends on |
|---|-------|--------|-------|--------|------------|
| 12 | **ST-L: Queryable Metrics Table** | C(§4.9) | §4.9 | Medium | ST-E (migration framework) |
| 13 | **ST-M: Query Routing (Lane Skipping)** | D(§4.10) | §4.10 | Medium | — |
| 14 | **ST-N: Latency Assertions in Tests** | D(§4.11 ext) | §4.11 (timing assertions) | Small | ST-I (golden-set tests exist) |
| 15 | **ST-O: Rate Limiting** | G(§4.16) | §4.16 | Small–Medium | — |
| 16 | **ST-P: Backpressure Control** | F(§4.14) | §4.14 | Small | ST-H (entity_extracted flag) |
| 17 | **ST-Q: Deep Health Check** | H(§4.17) | §4.17 | Small | ST-B + ST-C (needs queue/worker state to report) |

**Note:** Nice-to-have stories should reference `QP-038` in their story description. They become relevant when the system moves to cloud deployment (Phase 2 in the delivery plan) or when sustained multi-agent usage creates operational pressure.

---

All 19 insights (17 ACs) are captured with explicit priority tiers. Must-fix stories can be planned and executed immediately without waiting for the migration framework or other infrastructure.

After a /plan pass consumes this QP, all stories should be on the board with ExecPlans (or deferred stubs for nice-to-have). This QP should not need revisiting.
