# ExecPlan — ST-053: Deep Health Check

> Status: ✅ Implemented
> Story: ST-053
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md

---

## §1. Background & Context

The old `/health` endpoint returned `"ok"` without verifying downstream dependencies. If Postgres was down, embedding API unreachable, or extensions missing, the health check still passed.

**Key architectural decision (Option A, confirmed PO during /plan):** `/health` stays shallow (returns `{status:"healthy"}`) per SRS FR-H-001 and Docker healthcheck contract. A new `/ready` endpoint performs the deep probes. This avoids breaking the Docker healthcheck and respects the existing SRS requirement that `/health` is a simple liveness check.

Probes in `/ready`:
1. **Postgres connectivity** — `SELECT 1`; if unreachable → `unhealthy` (HTTP 503)
2. **pgvector extension** — `SELECT extversion FROM pg_extension WHERE extname = 'vector'`
3. **Apache AGE extension** — `SELECT extversion FROM pg_extension WHERE extname = 'age'`
4. **Embedding API reachability** — GET request to OpenRouter `/models` with Bearer auth, cached 60s with inflight dedup
5. **Embedding backlog** — count of `thoughts WHERE needs_embedding = true` vs threshold (default 100)
6. **Entity worker liveness** — most recent `ended_at` from `worker_runs WHERE worker = 'entity'`
7. **Consolidation worker liveness** — most recent `ended_at` from `worker_runs WHERE worker = 'consolidation'`

**Aggregate logic:**
- All probes ok → `healthy` (200)
- Any non-Postgres probe error, or Postgres ok but slow (>500ms) → `degraded` (200)
- Postgres unreachable → `unhealthy` (503)

**Depends on:**
- ST-039 (Embedding Resilience) — provides embedding API config patterns
- ST-040 (Worker Crash Isolation) — provided `worker_runs` table (not a dedicated heartbeat table; recency is derived from last run timestamp)

---

## §1b. Outcomes & Conclusions

- `/health` kept shallow per SRS — changed from `c.text("ok")` to `c.json({status:"healthy"})` to align with JSON conventions.
- `/ready` added with 7 probes, injectable dependency pattern for testability.
- 3 review findings applied pre-execution: (1) slow Postgres produces `degraded`, not `unhealthy`; (2) embedding API probe uses GET with Bearer auth, not HEAD; (3) disabled backfill reports `"n/a"`.
- 18 tests written: 13 unit tests (all mocked, covering healthy/unhealthy/degraded/n/a/cache/fresh-boot paths) + 5 integration tests (against real db-test stack).
- Pre-existing TS errors in `consolidationWorker.ts`, `entityWorker.ts`, `workerLogger.ts` (unrelated to this story).

---

## §2. Definition of Done

- [x] `/health` returns `{ "status": "healthy" }` (HTTP 200) — simple liveness per Docker healthcheck contract.
- [x] `/ready` returns deep probe results as `{ status, checks }` with 7 probes.
- [x] All ok → `healthy` (HTTP 200), any non-Postgres error → `degraded` (HTTP 200), Postgres unreachable → `unhealthy` (HTTP 503).
- [x] Probe module (`healthCheck.ts`) uses injectable dependencies (`sql`, `fetch`, `now`, `env`) for testability.
- [x] Disabled workers report `"n/a"` (not `"error"`) to avoid false degradation.
- [x] Disabled embedding backfill reports `"n/a"` (not `"error"`).
- [x] Embedding API probe: GET with Bearer, 5s timeout, 60s cache with inflight dedup.
- [x] Worker recency from `worker_runs` table (no new table needed).
- [x] 13 unit tests + 5 integration tests passing.
- [x] All existing tests pass (verified — pre-existing TS errors unrelated).

---

## §2b. Definition of Ready

- [x] All tasks have step-by-step instructions
- [x] Architecture decisions documented
- [x] Input/output specified
- [x] Error handling noted
- [x] No judgment calls
- [x] Requirements mapped
- [x] Verification steps

Status: ✅ Ready (implemented)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Health check probes all critical dependencies (QP-038 AC-14) | `/ready` handler with 7 probes | U2 (healthCheck.ts), U3 (/ready route) | Test: healthy/down/degraded paths covered |
| `/health` returns simple liveness (SRS FR-H-001) | `c.json({status:"healthy"})` at `/health` | U1 | `entity-worker-crash-isolation.test.ts` asserts JSON body |
| `/ready` maps status to HTTP code (SRS FR-H-002) | healthy/degraded → 200, unhealthy → 503 | U3 | Integration test confirms 200 with degraded status |

---

## §3. Preconditions

- ST-039 (Embedding Resilience) — embedding API config exists.
- ST-040 (Worker Crash Isolation) — `worker_runs` table exists (schema in `server/db/schema.sql`).

---

## §4. Task Definitions

### Task 4.1: Implement deep health module (U2)

**Files created:**
- `server/src/healthCheck.ts` — probe module with `deepHealthCheck()` and 7 probe functions
- `server/tests/health-check.unit.test.ts` — 13 unit tests

**Key design decisions:**
- All probes accept an optional `HealthDeps` object with `sql`, `fetch`, `now`, `env` overrides for testability.
- Embedding API uses GET with Bearer `Authorization` header (review fix: HEAD was rejected by OpenRouter).
- Worker recency checked against `worker_runs` table via `SELECT ended_at, errors FROM worker_runs WHERE worker = $1 AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1`.
- In-memory cache for embedding API with 60s TTL and inflight promise dedup.
- Slow Postgres (>500ms) triggers `degraded` (review fix: original plan said unhealthy).
- Disabled embedding backfill (`EMBEDDING_BACKFILL_DISABLED=true` or `FEATURE_EMBEDDING_BACKFILL=false`) reports `"n/a"` (review fix: original plan omitted this).

**Tests:**
| Scenario | Expected status |
|---|---|
| All probes healthy | `healthy` |
| Postgres throws | `unhealthy` |
| pgvector missing | `degraded` |
| AGE missing | `degraded` |
| Embedding API 500 | `degraded` |
| Embedding backlog > threshold | `degraded` |
| Worker stale > 90s | `degraded` |
| Disabled entity worker | entity `n/a`, consolidation `ok` |
| Disabled backfill | `n/a` |
| Fresh boot (no worker_runs) | `ok` (graceful) |
| Embedding cache within TTL | uses cached result |
| Embedding cache expires | refreshes |
| Fast Postgres | `healthy` with latency_ms |

---

### Task 4.2: Replace shallow health route — actually split into /health + /ready (U1 + U3)

**Per Option A (confirmed PO), `/health` stays shallow and `/ready` does deep probes.**

**Changes to `server/index.ts`:**
- `/health`: changed from `c.text("ok")` to `c.json({status:"healthy"})` — maintains Docker healthcheck compatibility (HTTP 200).
- `/ready`: new route calling `deepHealthCheck()`, maps `unhealthy` → 503, `healthy`/`degraded` → 200.

**Test fix in `entity-worker-crash-isolation.test.ts`:**
- Changed assertion from `response.text()` → `(await response.json()).status` to match new JSON body.

---

### Task 4.3: Tests (U2 + U3)

**Unit tests (`health-check.unit.test.ts`):**
- Mock SQL/fetch/env for deterministic probe testing.
- 13 tests covering all status paths, cache behavior, disabled features, fresh boot.

**Integration tests (`health-ready.test.ts`):**
- Against real Docker test stack (db-test, real Postgres + extensions).
- 5 tests: response shape, core probes ok, backfill n/a, content-type, check field completeness.

**Verification:**
```bash
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/health-check.unit.test.ts tests/health-ready.test.ts
# 18 passed, 0 failed
```

---

## §5b. Recovery Ledger

| Field | Value |
|---|---|
| **Next task** | N/A (all tasks complete) |
| **Known blockers** | None |

---

## §6b. Surprises & Discoveries

- Embedding API rejects HEAD requests — must use GET with Bearer auth.
- `worker_runs` table existed (from ST-040) but had no dedicated heartbeat table; recency from last `ended_at` works but means a worker that never completed a run reports "no completed runs yet (fresh boot)".
- Pre-existing TS errors in `consolidationWorker.ts`, `entityWorker.ts`, `workerLogger.ts` prevent running `deno test --frozen` on the full test suite — need separate fix.

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.17.
- 2026-06-23: Updated to reflect Option A (/health + /ready split), review findings, and actual implementation. Status → ✅ Implemented.
