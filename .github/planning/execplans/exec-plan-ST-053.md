# ExecPlan — ST-053: Deep Health Check

> Status: ⬜ Not Ready
> Story: ST-053
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md

---

## §1. Background & Context

The current `/health` endpoint returns `{ status: "ok" }` without verifying downstream dependencies. If Postgres is down, embedding API unreachable, or the AGE extension not loaded, the health check still passes.

This story replaces the shallow check with a deep health check that probes:
1. **Postgres connectivity** — `SELECT 1`
2. **pgvector extension** — `SELECT extversion FROM pg_extension WHERE extname = 'vector'`
3. **Apache AGE extension** — `SELECT extversion FROM pg_extension WHERE extname = 'age'`
4. **Embedding API reachability** — HEAD request to OpenRouter (or cached result within 60s)
5. **Worker liveness** — entity worker last heartbeat < 30s ago

If any probe fails, return `{ status: "degraded", checks: {...} }` with HTTP 200 (still alive) but degraded flag. If Postgres itself is down, return HTTP 503.

**Depends on:**
- ST-039 (Embedding Resilience) — provides embedding API config/error patterns
- ST-040 (Worker Crash Isolation) — provides worker heartbeat mechanism

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- `/health` probes Postgres, pgvector, AGE, embedding API (cached), and worker heartbeat.
- When all pass: `{ status: "ok", checks: { postgres: "ok", pgvector: "ok", age: "ok", embedding: "ok", worker: "ok" } }`
- When one fails: `{ status: "degraded", checks: { ... } }` (HTTP 200).
- When Postgres is unreachable: HTTP 503.
- Docker healthcheck still works (checks HTTP status, not body).
- All existing tests pass.

---

## §2b. Definition of Ready

- [x] All tasks have step-by-step instructions
- [x] Architecture decisions documented
- [x] Input/output specified
- [x] Error handling noted
- [x] No judgment calls
- [x] Requirements mapped
- [x] Verification steps

Status: ⬜ Not ready — requires /plan

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Health check probes all critical dependencies (QP-038 AC-14) | Deep health handler in `/health` route | Task 4.1, 4.2 | Test: mock DB down → 503; mock ext missing → degraded |

---

## §3. Preconditions

- ST-039 (Embedding Resilience) — embedding config exists
- ST-040 (Worker Crash Isolation) — worker heartbeat exists

---

## §4. Task Definitions

### Task 4.1: Implement deep health module

**Steps:**

1. Create `server/src/healthCheck.ts`:
   ```typescript
   import { sql } from "./db.ts";

   interface HealthResult {
     status: "ok" | "degraded" | "down";
     checks: Record<string, "ok" | "error">;
   }

   export async function deepHealthCheck(): Promise<HealthResult> {
     const checks: Record<string, "ok" | "error"> = {};

     // Postgres
     try {
       await sql`SELECT 1`;
       checks.postgres = "ok";
     } catch {
       return { status: "down", checks: { ...checks, postgres: "error" } };
     }

     // pgvector
     try {
       const [row] = await sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
       checks.pgvector = row ? "ok" : "error";
     } catch {
       checks.pgvector = "error";
     }

     // AGE
     try {
       const [row] = await sql`SELECT extversion FROM pg_extension WHERE extname = 'age'`;
       checks.age = row ? "ok" : "error";
     } catch {
       checks.age = "error";
     }

     // Embedding API (cached — recheck every 60s)
     checks.embedding = await checkEmbeddingReachable();

     // Worker heartbeat
     checks.worker = await checkWorkerHeartbeat();

     const status = Object.values(checks).every(v => v === "ok") ? "ok" : "degraded";
     return { status, checks };
   }

   let embeddingCacheResult: "ok" | "error" = "ok";
   let embeddingCacheTime = 0;

   async function checkEmbeddingReachable(): Promise<"ok" | "error"> {
     if (Date.now() - embeddingCacheTime < 60_000) return embeddingCacheResult;
     try {
       const resp = await fetch("https://openrouter.ai/api/v1/models", {
         method: "HEAD",
         signal: AbortSignal.timeout(5000),
       });
       embeddingCacheResult = resp.ok ? "ok" : "error";
     } catch {
       embeddingCacheResult = "error";
     }
     embeddingCacheTime = Date.now();
     return embeddingCacheResult;
   }

   async function checkWorkerHeartbeat(): Promise<"ok" | "error"> {
     try {
       // Worker writes heartbeat to a known key/table
       // If ST-040 uses a heartbeat table:
       const [row] = await sql`
         SELECT last_heartbeat FROM worker_heartbeats
         WHERE worker_name = 'entity_extraction'
         AND last_heartbeat > now() - interval '30 seconds'`;
       return row ? "ok" : "error";
     } catch {
       return "error";
     }
   }
   ```

2. Adapt the worker heartbeat check to whatever mechanism ST-040 implements (it might be a simple `updated_at` column or a dedicated table).

---

### Task 4.2: Replace shallow health route

**Steps:**

1. In `server/index.ts`, replace the `/health` handler:
   ```typescript
   import { deepHealthCheck } from "./src/healthCheck.ts";

   app.get("/health", async (c) => {
     const result = await deepHealthCheck();
     const httpStatus = result.status === "down" ? 503 : 200;
     return c.json(result, httpStatus);
   });
   ```

---

### Task 4.3: Tests

1. Create `server/tests/health-deep.test.ts`:
   - With healthy stack: response is `{ status: "ok", checks: {...} }`, HTTP 200.
   - All `checks` values are `"ok"` when extensions are loaded.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/health-deep.test.ts
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```

---

## §5b. Recovery Ledger

| Field | Value |
|---|---|
| **Next task** | Task 4.1 |
| **Known blockers** | ST-039, ST-040 |

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.17.
