# ExecPlan — ST-050: Latency Assertions

> Status: ⬜ Not Ready
> Story: ST-050
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md

---

## §1. Background & Context

There are no automated checks that tool response times stay within acceptable bounds. As the corpus grows or code changes introduce regressions, response times could degrade silently.

This story adds latency-asserting tests that fail if tools exceed their SLA:
- `search_thoughts`: p99 < 2000ms (corpus size ≤ 100 thoughts)
- `capture_thought`: p99 < 1000ms (excluding embedding time, since embedding is fire-and-forget)
- `list_thoughts`: p99 < 500ms

These are assertions in the golden-set test file or a dedicated performance test file.

**Depends on:** ST-046 (golden-set infra provides the test corpus).

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- Latency test runs 5 iterations of each tool and asserts max < threshold.
- Tests pass against the seeded test corpus (db-test).
- A simulated slow path (e.g., pg_sleep) causes the assertion to fail, proving it's meaningful.
- All existing tests pass.

---

## §2b. Definition of Ready

- [x] All tasks have step-by-step instructions
- [x] Architecture decisions documented
- [x] Input/output specified
- [x] No judgment calls
- [x] Requirements mapped
- [x] Verification steps

Status: ⬜ Not ready — requires /plan

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Automated latency bounds checked in CI (QP-038 AC-11) | `server/tests/latency.test.ts` | Task 4.1 | Test: real run < threshold; simulated slow fails |

---

## §3. Preconditions

- ST-046 (Golden-Set Tests) — test corpus seeded
- Docker Compose test stack running

---

## §4. Task Definitions

### Task 4.1: Write latency test

**Steps:**

1. Create `server/tests/latency.test.ts`:
   ```typescript
   import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
   import { callTool } from "./_helpers/mcpClient.ts";

   const SEARCH_THRESHOLD_MS = 2000;
   const CAPTURE_THRESHOLD_MS = 1000;
   const LIST_THRESHOLD_MS = 500;
   const ITERATIONS = 5;

   async function measureMs(fn: () => Promise<unknown>): Promise<number> {
     const start = performance.now();
     await fn();
     return performance.now() - start;
   }

   Deno.test("latency: search_thoughts < 2000ms", async () => {
     const timings: number[] = [];
     for (let i = 0; i < ITERATIONS; i++) {
       const ms = await measureMs(() =>
         callTool("search_thoughts", { query: "memory architecture", limit: 10 })
       );
       timings.push(ms);
     }
     const maxMs = Math.max(...timings);
     assert(
       maxMs < SEARCH_THRESHOLD_MS,
       `search_thoughts max latency ${maxMs.toFixed(0)}ms exceeds ${SEARCH_THRESHOLD_MS}ms threshold`,
     );
   });

   Deno.test("latency: capture_thought < 1000ms", async () => {
     const timings: number[] = [];
     for (let i = 0; i < ITERATIONS; i++) {
       const ms = await measureMs(() =>
         callTool("capture_thought", {
           content: `Latency test thought ${Date.now()}-${i}`,
           memory_type: "shard",
         })
       );
       timings.push(ms);
     }
     const maxMs = Math.max(...timings);
     assert(
       maxMs < CAPTURE_THRESHOLD_MS,
       `capture_thought max latency ${maxMs.toFixed(0)}ms exceeds ${CAPTURE_THRESHOLD_MS}ms threshold`,
     );
   });

   Deno.test("latency: list_thoughts < 500ms", async () => {
     const timings: number[] = [];
     for (let i = 0; i < ITERATIONS; i++) {
       const ms = await measureMs(() =>
         callTool("list_thoughts", { limit: 20 })
       );
       timings.push(ms);
     }
     const maxMs = Math.max(...timings);
     assert(
       maxMs < LIST_THRESHOLD_MS,
       `list_thoughts max latency ${maxMs.toFixed(0)}ms exceeds ${LIST_THRESHOLD_MS}ms threshold`,
     );
   });
   ```

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/latency.test.ts
```

---

### Task 4.2: Full test suite

```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```

---

## §5b. Recovery Ledger

| Field | Value |
|---|---|
| **Next task** | Task 4.1 |
| **Known blockers** | ST-046 (corpus) |

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.11 (timing subset).
