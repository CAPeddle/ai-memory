---
title: feat: Deep health check with /ready endpoint
type: feat
status: active
date: 2026-06-23
---

# feat: Deep health check with `/ready` endpoint

## Summary

Make the server health surface SRS-compliant: keep `GET /health` as a shallow liveness probe returning `{ "status": "healthy" }`, and add a new `GET /ready` endpoint that performs deep dependency probes. `/ready` reports `healthy`, `degraded`, or `unhealthy`, returning HTTP 503 only when Postgres is unreachable. Probes cover Postgres latency, the pgvector and AGE extensions, embedding API reachability, the embedding backlog, and the last-run recency of both background workers. Docker Compose and CI healthchecks continue to use the shallow `/health` endpoint and remain unaffected.

---

## Problem Frame

`docs/requirements/SRS.md` §5.10 mandates a `/health` + `/ready` split:

- `GET /health` → `200 { "status": "healthy" }` (process liveness)
- `GET /ready` → `200` when the database connection is confirmed, `503` when it cannot connect

The current implementation only exposes `/health`, returning plain text `"ok"`. There is no `/ready` endpoint and no deep dependency probing, so a container with a broken Postgres connection, missing vector/graph extensions, or stalled background workers can still appear healthy to orchestrators. The drafted `exec-plan-ST-053.md` proposed folding the deep check into `/health`, which conflicts with the binding SRS; the PO confirmed Option A (SRS-compliant split) during planning.

---

## Requirements

- **R1.** `GET /health` returns `200 OK` with body `{ "status": "healthy" }` and performs no dependency probes (FR-H-001).
- **R2.** `GET /ready` returns deep readiness state with HTTP `200` for `healthy`/`degraded` and HTTP `503` for `unhealthy` (FR-H-002 extended to full dependency surface).
- **R3.** `/ready` probes Postgres connectivity + latency, the `pgvector` extension, the `age` extension, embedding API reachability, embedding backlog depth, entity worker last-run recency, and consolidation worker last-run recency.
- **R4.** `/ready` returns `unhealthy` only when Postgres is unreachable; all other probe failures produce `degraded`.
- **R5.** Both `/health` and `/ready` remain unauthenticated for Docker and orchestration probes.
- **R6.** The existing Docker Compose healthcheck (`curl -sf http://localhost:3000/health`) and CI wait loops continue to pass.

---

## Scope Boundaries

### In scope

- Update `/health` to return the SRS-compliant JSON liveness response.
- Create a reusable deep-health probe module.
- Add the `/ready` Hono route wired to the probe module.
- Unit tests for the probe module and integration tests for `/ready`.
- Update the existing test that asserts on the old `/health` text body.

### Out of scope

- Persisting health probe history or metrics to a table (owned by ST-048).
- Backpressure thresholds, capture gating, or adaptive worker batch sizing (owned by ST-052).
- Alerting, paging, or external monitoring integrations (deployment-host concern).
- A dedicated worker heartbeat table — ST-040 only shipped crash isolation, so worker state is derived from the existing `worker_runs` table.

### Deferred to follow-up work

- REST `/api/v1/stats` endpoint (SRS FR-H-003) — distinct surface, not MCP.
- Direct liveness probe of the embedding backfill worker itself; backlog count is the observable signal.

---

## Context & Research

### Relevant code and patterns

- **`server/index.ts:1046-1047`**: current `/health` handler returns `c.text("ok")`. The route is registered before `/mcp` and is intentionally unauthenticated.
- **`server/src/db.ts`**: shared `postgres` client (`max: 10`, `connect_timeout: 10`). Health probes compete with real traffic for pool connections, so probes must be lightweight and bounded.
- **`server/src/entityWorker.ts`** and **`server/src/consolidationWorker.ts`**: both write per-run state to `worker_runs` (`started_at`, `ended_at`, `errors`). There is no heartbeat column or table.
- **`server/src/embeddingBackfill.ts`**: tracks incomplete embeddings through `thoughts.needs_embedding = true` (added in ST-039). No separate `embedding_queue` table exists.
- **`server/src/embeddings.ts`**: `OPENROUTER_BASE` defaults to `https://openrouter.ai/api/v1`, `EMBEDDING_MODEL` is `openai/text-embedding-3-small`. These are the source of truth for embedding probe target configuration.
- **`server/src/workerLogger.ts`** / **`docs/runbooks/observability.md`**: document the `worker_runs` schema and the `stats` tool response contract, which this plan mirrors for worker-state reporting.
- **`docker-compose.yml:37-42,100-105`**: Docker healthcheck uses `curl -sf http://localhost:3000/health || exit 1`; it checks HTTP status only, not body.
- **`server/tests/entity-worker-crash-isolation.test.ts:21-28`**: asserts `await response.text() === "ok"` — must be updated to the new JSON body.

### Institutional learnings

- **`docs/solutions/workflow-issues/explicit-test-requirements-in-plans-2026-06-19.md`**: plans should specify red-step regression assertions (e.g., mock DB unreachable → 503; missing extension → degraded) rather than vague "verify health works" tasks.
- The SRS `/health` + `/ready` split is binding. Folding readiness into `/health` would violate Tier 1 requirements.

### External references

- None required — local patterns, SRS, and the origin ExecPlan are sufficient.

---

## Key Technical Decisions

- **Endpoint split (Option A)**: keep `/health` shallow per SRS; implement deep probes on a new `/ready` route. `/health` does not touch the database.
- **Worker state source**: derive worker recency from `worker_runs.ended_at` rather than inventing a new heartbeat table. This matches the schema shipped by ST-028 and avoids a migration.
- **Disabled-worker handling**: when `FEATURE_ENTITY_WORKER === "false"` or `FEATURE_CONSOLIDATION_WORKER === "false"`, the corresponding `/ready` check reports `"n/a"` instead of `"error"`, so intentionally disabled workers do not permanently degrade readiness.
- **Disabled-backfill handling**: when `FEATURE_EMBEDDING_BACKFILL === "false"` or `EMBEDDING_BACKFILL_DISABLED === "true"`, the `embedding_backlog` check reports `"n/a"` instead of comparing against the threshold, following the same pattern. Disabled workers leave no backlog, so the probe should not report degraded. Operators who disable backfill lose backlog visibility.
- **Fresh-boot handling**: if `worker_runs` has no completed run for a worker, the check is `"ok"`. This avoids false `degraded` on a newly provisioned database before workers have completed their first cycle.
- **Embedding API probe**: `GET ${OPENROUTER_BASE}/models` with an `Authorization: Bearer` header from `OPENROUTER_API_KEY`, a 5-second timeout, and a 60-second in-memory cache. The response body is discarded after status-code check. The `/models` endpoint does not consume tokens. An invalid `OPENROUTER_API_KEY` correctly causes degraded — the probe should not mask an invalid key since embedding calls would also fail.
- **Embedding backlog signal**: `SELECT COUNT(*) FROM thoughts WHERE needs_embedding = true`. This is the actual backlog left by the fire-and-forget embedding path and the backfill worker.
- **Status semantics**: `unhealthy` only when the Postgres probe throws (connection lost); `degraded` for any other failing probe or exceeded threshold; `healthy` otherwise.
- **Threshold defaults** (configurable via environment variables):
  - Postgres latency: `> 500 ms` → degraded (`HEALTH_POSTGRES_LATENCY_MS`, default 500).
  - Embedding backlog: `> 100` pending → degraded (`HEALTH_EMBEDDING_BACKLOG`, default 100).
  - Worker last run: `> 90 s` since last completed run → degraded (`HEALTH_WORKER_STALE_S`, default 90).
- **Response schema**: each check is an object (`{ status: "ok" | "error" | "n/a", ... }`) so consumers can add metadata (latency, pending count, version, last_run_at) without breaking the contract.
- **Testability**: `deepHealthCheck` accepts an optional `deps` object (SQL executor, `fetch`, `now`, env reader) so unit tests can simulate DB-down, missing extensions, stale workers, and OpenRouter failures without touching the network or database.

---

## Implementation Units

### U1. SRS-compliant shallow `/health`

**Goal:** Update `/health` to return the SRS-mandated JSON liveness response and update the existing test that pins the old text body.

**Requirements:** R1, R5, R6

**Dependencies:** None

**Files:**
- Modify: `server/index.ts`
- Modify: `server/tests/entity-worker-crash-isolation.test.ts`

**Approach:**
- Replace `app.get("/health", (c) => c.text("ok"));` with `app.get("/health", (c) => c.json({ status: "healthy" }));`.
- Keep the route before `/mcp` and outside the auth middleware.
- Update `entity-worker-crash-isolation.test.ts` to parse JSON and assert `status === "healthy"` instead of `await response.text() === "ok"`.

**Patterns to follow:**
- Existing Hono JSON response pattern in `server/index.ts` (`c.json(result, status)`).

**Test scenarios:**
- Happy path: `GET /health` returns HTTP 200 and body `{ "status": "healthy" }`.
- Edge case: `GET /health` succeeds without an `Authorization` header.
- Regression: the updated crash-isolation test still passes against the new response shape.

**Verification:**
- `GET /health` returns JSON `{ "status": "healthy" }`.
- Docker Compose `mcp` and `mcp-test` healthchecks still report healthy.

---

### U2. Deep health probe module

**Goal:** Create `server/src/healthCheck.ts` with a testable `deepHealthCheck()` function that probes all dependencies and returns the readiness state.

**Requirements:** R2, R3, R4

**Dependencies:** None (pure module; default deps import real clients)

**Files:**
- Create: `server/src/healthCheck.ts`
- Create: `server/tests/health-check.unit.test.ts`

**Approach:**

> The interface and probe descriptions below illustrate the intended shape of the health module and are directional guidance for review, not implementation specification. The implementing agent should treat them as context, not code to reproduce.

- Define a `HealthResult` type:
  ```typescript
  interface HealthResult {
    status: "healthy" | "degraded" | "unhealthy";
    checks: Record<string, { status: "ok" | "error" | "n/a"; [key: string]: unknown }>;
  }
  ```
- Define an injectable `HealthDeps` interface:
  ```typescript
  interface HealthDeps {
    sql?: typeof import("./db.ts").sql;
    fetch?: typeof globalThis.fetch;
    now?: () => number;
    env?: (name: string) => string | undefined;
  }
  ```
- Implement probe functions, each returning `{ status, ...metadata }`:
  - `postgres`: `SELECT 1`; record `latency_ms`. Status `error` on throw; status `ok` if reachable (latency recorded as metadata).
  - `pgvector`: `SELECT extversion FROM pg_extension WHERE extname = 'vector'`; record `version`. Status `error` if no row.
  - `age`: `SELECT extversion FROM pg_extension WHERE extname = 'age'`; record `version`. Status `error` if no row.
  - `embedding_api`: use cached `HEAD` to `${OPENROUTER_BASE}/models` with `AbortSignal.timeout(5000)`. Cache TTL is 60 seconds. Status `error` on non-2xx or throw.
  - `embedding_backlog`: `SELECT COUNT(*)::int AS pending FROM thoughts WHERE needs_embedding = true`. Record `pending`. Status `error` if `pending > threshold`; status `n/a` if `FEATURE_EMBEDDING_BACKFILL === "false"` or `EMBEDDING_BACKFILL_DISABLED === "true"`.
  - `entity_worker`: `SELECT ended_at, errors FROM worker_runs WHERE worker = 'entity' AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1`. Record `last_run_at`. Status `error` if row exists and `now - ended_at > threshold`; status `ok` if no row (fresh boot); status `n/a` if `FEATURE_ENTITY_WORKER === "false"`.
  - `consolidation_worker`: same pattern as entity worker, keyed to `worker = 'consolidation'`, with `FEATURE_CONSOLIDATION_WORKER` guard.
- Aggregate status:
  - `unhealthy` if `postgres.status === "error"` (connection lost).
  - `degraded` if Postgres is reachable but latency exceeds threshold, or if any other check has `status === "error"`.
  - `healthy` otherwise.
- Export `deepHealthCheck(deps?: HealthDeps): Promise<HealthResult>`.

**Patterns to follow:**
- `server/src/startupValidation.ts` for dependency-injection style (`readEnv`, `exit` injectables).
- `server/src/embeddingBackfill.ts` for env-driven timeout/interval defaults.
- `server/src/logging.ts` / `server/src/mcpDiagnostics.ts` for structured JSON log emission on `degraded`/`unhealthy` (optional; log only state changes or failures to avoid per-probe noise).

**Test scenarios:**
- Happy path: all probes pass → `healthy` with all checks `"ok"`.
- Error path: Postgres throws → `unhealthy`, `postgres.status === "error"`.
- Error path: Postgres reachable but slow (>500ms) → `degraded`, aggregate status is `"degraded"`.
- Error path: pgvector missing → `degraded`, `pgvector.status === "error"`.
- Error path: AGE missing → `degraded`, `age.status === "error"`.
- Error path: embedding API returns 500 → `degraded`, `embedding_api.status === "error"`.
- Error path: embedding backlog > threshold → `degraded`, `embedding_backlog.status === "error"`.
- Error path: worker last run older than threshold → `degraded`, worker check `status === "error"`.
- Edge case: disabled worker (`FEATURE_*_WORKER=false`) → worker check `status === "n/a"`, not error.
- Edge case: disabled embedding backfill (`FEATURE_EMBEDDING_BACKFILL=false` or `EMBEDDING_BACKFILL_DISABLED=true`) → `embedding_backlog` check `status === "n/a"`, not error.
- Edge case: no `worker_runs` rows (fresh DB) → worker checks `status === "ok"`.
- Edge case: embedding API result is cached; repeated calls within TTL reuse cached status.
- Edge case: cache expires and next call refreshes.

**Verification:**
- `deepHealthCheck()` unit tests pass with mocked dependencies.
- All specified error paths produce the correct aggregate status.

---

### U3. `/ready` route and integration tests

**Goal:** Expose the deep health probe as `GET /ready` in the Hono app and verify the HTTP contract end-to-end.

**Requirements:** R2, R3, R4, R5

**Dependencies:** U2

**Files:**
- Modify: `server/index.ts`
- Create: `server/tests/health-ready.test.ts`

**Approach:**
- Import `deepHealthCheck` in `server/index.ts`.
- Add `app.get("/ready", async (c) => { const result = await deepHealthCheck(); const status = result.status === "unhealthy" ? 503 : 200; return c.json(result, status); });` immediately after `/health`.
- Keep `/ready` unauthenticated (outside the `/mcp` auth path).
- Integration tests use the running `mcp-test` container and the test database.

**Patterns to follow:**
- Existing Hono route registration in `server/index.ts`.
- `server/tests/_helpers/mcpClient.ts` for HTTP requests (reuse plain `fetch` since `/ready` is not an MCP endpoint).
- `server/tests/entity-worker-crash-isolation.test.ts` for health-endpoint fetch pattern.

**Test scenarios:**
- Happy path: healthy test stack → `GET /ready` returns HTTP 200, `status === "healthy"`, and all expected check keys are present.
- Error path: simulate Postgres unreachable (e.g., by injecting a failing SQL executor in a unit-style route test, or by temporarily pointing `DATABASE_URL` to a closed port in a dedicated test) → HTTP 503, `status === "unhealthy"`.
- Error path: insert stale `worker_runs` row → HTTP 200 `degraded` with worker check `status === "error"`.
- Error path: insert `needs_embedding = true` rows above threshold → HTTP 200 `degraded`.
- Edge case: `GET /ready` succeeds without an `Authorization` header.
- Edge case: response schema is stable — every probe key listed in R3 is present.

**Verification:**
- `deno test tests/health-ready.test.ts` passes against the `mcp-test` container.
- Full server suite passes after the changes.

---

## System-Wide Impact

- **Endpoint surface:** adds one unauthenticated HTTP endpoint (`/ready`). No MCP tools are added or changed.
- **Auth surface:** no change; `/health` and `/ready` remain outside the `/mcp` auth middleware.
- **Docker/CI:** no changes required. The existing healthcheck continues to target `/health` and receives HTTP 200. CI wait loops that call `/health` continue to work; they may optionally switch to `/ready` later.
- **Existing tests:** only `entity-worker-crash-isolation.test.ts` needs updating because `/health` body changes from plain text to JSON.
- **Connection pool:** `/ready` issues several short SQL queries per call. Under normal orchestrator polling (every 10–30 s) the load is negligible, but concurrent probes are bounded by the shared `sql` pool (`max: 10`).
- **Worker state semantics:** readiness uses `worker_runs` completion records, not a live heartbeat. A worker that is currently mid-run but has not yet written `ended_at` will appear as having its previous run recency. This is acceptable for a readiness signal and avoids adding a heartbeat write path.
- **Backpressure forward-compatibility:** `/ready` already reports `embedding_backlog.pending` and can be extended by ST-052 to include `entity_extraction_queue` depth and a backpressure threshold without changing the response shape.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Default thresholds are wrong for the deployment environment | Expose thresholds via env vars (`HEALTH_POSTGRES_LATENCY_MS`, `HEALTH_EMBEDDING_BACKLOG`, `HEALTH_WORKER_STALE_S`) with sensible defaults; document how to tune them |
| Concurrent `/ready` calls stampede OpenRouter when the embedding cache expires | 60-second TTL + single-flight refresh (e.g., promise-coalescing) so only one pending probe call hits the API at a time |
| Disabled workers permanently degrade readiness | Report `"n/a"` for workers disabled by feature flag |
| Fresh database reports degraded before workers finish their first run | Treat missing `worker_runs` rows as `"ok"` |
| `/ready` hangs if Postgres is slow but not down | Use `AbortSignal.timeout` or the existing `connect_timeout` pool config; document that probe latency is included in the response |

**Dependencies:**
- ST-028 (worker observability) — Done; provides `worker_runs` table.
- ST-039 (embedding resilience) — Done; provides `thoughts.needs_embedding` flag.
- ST-040 (worker crash isolation) — Done; ensures workers keep running and writing `worker_runs`.

---

## Documentation / Operational Notes

- Update `docs/runbooks/observability.md` with the `/ready` response schema and probe semantics once the implementation is stable.
- No new environment variables are required; the optional threshold variables have defaults.
- Verify the local `dev.sh` start script still waits on `/health` (status only), or update it to use `/ready` if the PO wants startup to block on readiness.
- The existing `server-info` MCP resource lists `toolNames`; no change is needed because `/ready` is an HTTP endpoint, not an MCP tool.

---

## Open Questions

### Deferred to implementation

- **Cache stampede implementation.** Whether to use a simple `Promise` coalescing pattern or a library helper for the embedding API cache. The contract is that concurrent `/ready` calls during cache expiry trigger at most one outbound `HEAD` request.
- **Threshold env var naming.** Confirm the names `HEALTH_POSTGRES_LATENCY_MS`, `HEALTH_EMBEDDING_BACKLOG`, and `HEALTH_WORKER_STALE_S` before wiring them into `startupValidation.ts` or reading them directly.
- **Structured logging on failure.** Decide whether `/ready` emits a `[health]` JSON log line on `degraded`/`unhealthy` and what fields it contains.

### Reconcile with ExecPlan

- `exec-plan-ST-053.md` was drafted before the SRS split was re-emphasized and assumed a worker heartbeat table. After this plan is accepted, update the ExecPlan to: (a) reflect the `/health` + `/ready` split, (b) remove the dependency on a non-existent heartbeat mechanism, and (c) point to `worker_runs` as the worker-state source.

---

## Sources & References

- **Story:** ST-053 on `.github/planning/story-board.md`
- **Origin ExecPlan:** `.github/planning/execplans/exec-plan-ST-053.md`
- **Source query packet:** `.github/planning/query-packets/QP-038-Vectorize-MCP-Repo-Review.md` §4.17
- **Binding requirements:** `docs/requirements/SRS.md` FR-H-001, FR-H-002
- **Delivery plan:** `docs/planning/delivery-plan.md` Phase 3 done criterion #8
- **Related code:** `server/index.ts`, `server/src/db.ts`, `server/src/entityWorker.ts`, `server/src/consolidationWorker.ts`, `server/src/embeddingBackfill.ts`, `server/src/embeddings.ts`, `server/db/schema.sql`, `server/db/graph.sql`, `docker-compose.yml`
- **Related stories:** ST-028 (worker observability), ST-039 (embedding resilience), ST-040 (worker crash isolation), ST-048 (queryable metrics table), ST-052 (backpressure control)
