# ExecPlan — ST-052: Backpressure Control

> Status: ⬜ Not Ready
> Story: ST-052
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md

---

## §1. Background & Context

The entity extraction worker processes batches of 10 thoughts per cycle. If the queue grows unbounded (e.g., mass import), the worker never catches up and the queue table grows without limit. Similarly, the embedding fire-and-forget path in `capture_thought` has no backlog visibility.

This story adds backpressure controls:
1. **Queue depth monitoring** — expose current queue depth in health/stats endpoints.
2. **Capture rate gating** — if the embedding queue (entity extraction + embedding) exceeds a threshold, capture_thought returns a warning (not an error) so callers know to slow down.
3. **Worker adaptive batch size** — when queue depth > 100, batch size scales to 25; > 500 → 50.

**Depends on:** ST-045 (Worker Idempotency — provides the worker queue infrastructure that this story monitors and gates).

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- `/health` response includes `queueDepth` for entity extraction queue.
- When queue depth > configured threshold (default 200), `capture_thought` response includes a `"warning": "high queue depth"` field.
- Worker batch size adapts: 10 (default), 25 (>100 queued), 50 (>500 queued).
- Test confirms adaptive batch sizing.
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
| Backpressure signals prevent unbounded queue growth (QP-038 AC-12) | Queue depth in health, warning in capture, adaptive batch | Task 4.1-4.3 | Test: high queue triggers warning + batch scaling |

---

## §3. Preconditions

- ST-045 (Worker Idempotency) — queue infrastructure exists
- ST-040 (Worker Crash Isolation) — worker resilience

---

## §4. Task Definitions

### Task 4.1: Expose queue depth in health endpoint

**Steps:**

1. In the `/health` handler, add a query:
   ```typescript
   const [{ count }] = await sql`SELECT count(*) FROM entity_extraction_queue WHERE status = 'pending'`;
   // Include in response: { status: "ok", queueDepth: Number(count) }
   ```

---

### Task 4.2: Add warning to capture_thought when queue is deep

**Steps:**

1. After inserting into capture_thought, check queue depth:
   ```typescript
   const BACKPRESSURE_THRESHOLD = parseInt(Deno.env.get("BACKPRESSURE_THRESHOLD") ?? "") || 200;
   const [{ count }] = await sql`SELECT count(*) FROM entity_extraction_queue WHERE status = 'pending'`;
   const warning = Number(count) > BACKPRESSURE_THRESHOLD
     ? "High queue depth — entity extraction may be delayed"
     : undefined;
   ```
2. Include `warning` in the tool's text response if set.

---

### Task 4.3: Adaptive worker batch size

**Steps:**

1. In `server/src/entityWorker.ts`, at the start of `processQueue()`:
   ```typescript
   const [{ count }] = await sql`SELECT count(*) FROM entity_extraction_queue WHERE status = 'pending'`;
   const depth = Number(count);
   const batchSize = depth > 500 ? 50 : depth > 100 ? 25 : 10;
   ```
2. Use `batchSize` in the LIMIT clause instead of hardcoded 10.

---

### Task 4.4: Test

1. Insert 201 rows into `entity_extraction_queue` with status='pending'.
2. Call `capture_thought` → response should contain the backpressure warning.
3. Verify health endpoint shows `queueDepth >= 201`.

```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/backpressure.test.ts
```

---

## §5b. Recovery Ledger

| Field | Value |
|---|---|
| **Next task** | Task 4.1 |
| **Known blockers** | ST-045 |

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.14.
