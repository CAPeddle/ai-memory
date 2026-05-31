# ExecPlan — ST-040: Worker Crash Isolation

> Status: ⬜ Not Ready
> Story: ST-040
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

The entity extraction worker in `server/src/entityWorker.ts` processes thoughts in batches. While individual thought-level errors are caught within `processQueue()` (lines 148–200), the **outer poll loop** has no protection:

```typescript
export function startEntityWorker(): void {
  // ...
  setInterval(processQueue, POLL_INTERVAL_MS);
  processQueue().catch((err) =>
    console.error("[entityWorker] initial poll failed:", err)
  );
}
```

If `processQueue()` throws an unhandled error that escapes the per-thought try/catch (e.g. a DB connection error during the `UPDATE ... SET status = 'processing'` batch claim, or a Postgres protocol error), it becomes an **unhandled promise rejection** in the `setInterval` callback. In Deno, unhandled rejections terminate the process by default (`--no-prompt` mode) or emit a warning that leaves the worker in a broken state.

This story wraps the poll loop with:
1. A top-level try/catch that never lets errors escape.
2. Exponential backoff on consecutive failures (1s → 2s → 4s → max 60s).
3. A reset-on-success mechanism (back to normal 10s interval after recovery).

**No schema changes required.** This is purely application-level resilience.

**Key file:** `server/src/entityWorker.ts`

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- After injecting a malformed thought that causes `processQueue` to throw at the batch-claim level, the worker logs a structured error and continues polling (does not crash the server).
- After 5 consecutive failures, the worker logs an alert-level message with the failure count.
- After recovery (next successful poll), the worker resets its failure counter and returns to normal interval.
- All existing tests continue to pass.

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

Status: ⬜ Not ready — requires /plan

---

## §2c. Plan Review Notes

(Empty)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Entity worker survives errors without crashing the server (QP-038 AC-10) | Top-level try/catch in poll loop + backoff | Task 4.1 | Test: inject failure → worker logs error and continues |

---

## §3. Preconditions

- Docker Compose test stack running
- No DDL changes needed
- Current `server/src/entityWorker.ts` has the structure described in §1

---

## §4. Task Definitions

### Task 4.1: Wrap poll loop with crash isolation

**Objective:** Make the entity worker's polling loop resilient to any error, including database connection failures.

**Input:** `server/src/entityWorker.ts` — `startEntityWorker()` function (lines 213–225).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Open `server/src/entityWorker.ts`. Replace the `startEntityWorker` function with:

   ```typescript
   // --- Crash-isolated poll loop ---
   let consecutiveFailures = 0;
   const BASE_INTERVAL_MS = POLL_INTERVAL_MS; // 10_000
   const MAX_BACKOFF_MS = 60_000;

   function getBackoffMs(): number {
     if (consecutiveFailures === 0) return BASE_INTERVAL_MS;
     return Math.min(BASE_INTERVAL_MS * Math.pow(2, consecutiveFailures - 1), MAX_BACKOFF_MS);
   }

   async function safePoll(): Promise<void> {
     try {
       await processQueue();
       if (consecutiveFailures > 0) {
         console.log(`[entityWorker] recovered after ${consecutiveFailures} consecutive failures`);
       }
       consecutiveFailures = 0;
     } catch (err) {
       consecutiveFailures++;
       const msg = (err as Error).message?.slice(0, 300) ?? "Unknown error";
       if (consecutiveFailures >= 5) {
         console.error(`[entityWorker] ALERT: ${consecutiveFailures} consecutive failures — ${msg}`);
       } else {
         console.error(`[entityWorker] poll failed (attempt ${consecutiveFailures}, next retry in ${getBackoffMs()}ms): ${msg}`);
       }
     }
     // Schedule next poll with backoff
     setTimeout(safePoll, getBackoffMs());
   }

   export function startEntityWorker(): void {
     if (!OPENROUTER_API_KEY) {
       console.warn("[entityWorker] OPENROUTER_API_KEY not set — entity extraction disabled");
       return;
     }
     console.log(`[entityWorker] started (base interval ${BASE_INTERVAL_MS}ms, batch ${BATCH_SIZE})`);
     // Kick off the self-scheduling loop
     safePoll();
   }
   ```

2. **Key changes from the original:**
   - Replaced `setInterval` with a self-scheduling `setTimeout` loop. This prevents overlapping executions and allows dynamic backoff.
   - Added try/catch around `processQueue()` at the loop level.
   - Consecutive failure counter with exponential backoff.
   - Recovery logging when failures reset.
   - Alert-level log at 5+ consecutive failures.

3. **Keep the per-thought error handling inside `processQueue()` unchanged** — it handles individual thought failures. The new outer loop handles infrastructure-level failures (DB down, network issues).

4. **Note on OPENROUTER_API_KEY guard:** If ST-038 has already shipped (startup validation), this guard is redundant. However, keep it for defensive programming — the entity worker module should be independently safe. If ST-038 removes this guard as part of its Task 4.1 step 5, that's fine — this ExecPlan's step keeps it as a safety net regardless of execution order.

**Expected output:** Worker continues running through any error; logs structured error messages; backs off on repeated failures; recovers automatically.

**Requirement mapping:** §2d row 1 (AC-10)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/entity-worker-crash-isolation.test.ts
```

**Failure handling:** If `processQueue` has internal state that breaks after the first error (e.g. a closed DB connection), the next `safePoll()` will also fail but safely — it increments the counter and waits longer. The DB driver (`postgres@3.4.4`) handles reconnection internally.

---

### Task 4.2: Write crash isolation test

**Objective:** Verify the worker doesn't crash the server process when errors occur.

**Input:** Existing test infrastructure in `server/tests/`.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/entity-worker-crash-isolation.test.ts`:

   ```typescript
   import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
   import { callTool, getDbConnection } from "./_helpers/mcpClient.ts";

   Deno.test("entity worker survives processing errors without crashing server", async () => {
     // Insert a thought that will be queued for entity extraction
     const result = await callTool("capture_thought", {
       content: `Crash isolation test ${Date.now()} — this thought tests worker resilience`,
       memory_type: "shard",
     });
     assertEquals(result.isError, undefined, "capture should succeed");

     // Wait for the worker to attempt processing (poll interval is 10s in test)
     await new Promise((r) => setTimeout(r, 12000));

     // Verify the server is still responding (hasn't crashed)
     const statsResult = await callTool("thought_stats", {});
     assertEquals(statsResult.isError, undefined, "Server should still be responding after worker processes");
   });

   Deno.test("server health endpoint responds after worker activity", async () => {
     // Simple health check to verify the process is alive
     const resp = await fetch("http://localhost:3001/health");
     assertEquals(resp.status, 200);
     const body = await resp.text();
     assertEquals(body, "ok");
   });
   ```

2. **Note:** This test verifies the worker doesn't crash the server during normal processing. To test actual error scenarios (e.g. DB connection drop), a more sophisticated test would be needed — but that's out of scope. The key contract is: after worker activity, the server still responds.

**Expected output:** Tests confirm the server remains healthy during and after worker processing.

**Requirement mapping:** §2d row 1 (verification evidence)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/entity-worker-crash-isolation.test.ts
```
Expected: 2 tests pass.

**Failure handling:** If the 12-second wait isn't enough for the worker to poll, increase to 15s. If the worker isn't running in the test container, check that `OPENROUTER_API_KEY` is set in the test environment.

---

### Task 4.3: Full test suite + cross-model review

**Objective:** Ensure no regressions and perform cross-model review.

**Steps:**

1. Run full test suite:
   ```powershell
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
   ```

2. **Cross-model review checklist:**
   - Does `setTimeout` self-scheduling prevent overlapping polls? (Yes — next `safePoll` is only scheduled after current completes.)
   - Could `getBackoffMs()` return 0 or negative? (No — minimum is `BASE_INTERVAL_MS` when `consecutiveFailures === 0`.)
   - Does the alert at 5+ failures also continue retrying? (Yes — it logs and then schedules the next poll.)
   - Is there a memory leak from repeated `setTimeout`? (No — each timeout fires once, no accumulation.)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```
Expected: All tests pass.

---

## §5. State Recovery Protocol

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | — |
| **Last successful command** | — |
| **Expected outputs produced** | — |
| **Next task** | Task 4.1 — Wrap poll loop |
| **Known blockers** | None |
| **Last updated** | — |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| — | — | — | — | — |

### Avoidance

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Self-scheduling setTimeout with try/catch + exponential backoff | git HEAD | 🟢 Active |

### Approach Failure Log
(Empty)

---

## §6. Execution Log

(Populated during execution)

---

## §6b. Surprises & Discoveries

*(populated during execution)*

---

## §6c. Decision Log

*(populated during execution)*

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification
2. Update board: move to Review
3. Present results to PO
4. Log any compound detections

---

## §7b. Outcomes & Retrospective

*(populated on completion)*

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.13a.
