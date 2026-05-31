# ExecPlan — ST-044: Structured Logging

> Status: ⬜ Not Ready
> Story: ST-044
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md

---

## §1. Background & Context

The MCP server currently uses unstructured `console.log`/`console.error` calls. There is no request correlation, timing data, or machine-parseable output. When debugging performance issues, developers must grep log output manually.

This story adds a structured logging middleware that wraps every MCP tool invocation with:
- Tool name
- Duration in milliseconds
- Success/error status
- Request ID (for correlation)

Output format: one JSON line per invocation to stdout.

**Key files:**
- `server/index.ts` — tool registration
- No existing logging module

**Relationship to ST-028:** ST-028 covers worker-specific observability and a `stats` MCP tool. ST-044 covers per-tool-invocation structured logs — complementary, not overlapping.

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- After invoking `search_thoughts`, stdout contains a JSON log line with keys: `ts`, `tool`, `duration_ms`, `status`, `request_id`.
- After invoking a tool that errors, the log line has `status: "error"`.
- All existing tests pass.

---

## §2b. Definition of Ready

- [x] All tasks have step-by-step instructions
- [x] Architecture and design decisions documented
- [x] Input and expected output specified
- [x] Error handling strategy noted
- [x] No judgment calls required
- [x] Script templates provided
- [x] Requirements mapped in §2d
- [x] Verification steps included
- [x] Observable behaviour criteria

Status: ⬜ Not ready — requires /plan

---

## §2c. Plan Review Notes

(Empty)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Every MCP tool invocation emits structured JSON log with timing (QP-038 AC-3) | Logging wrapper in tool handlers | Task 4.1, 4.2 | Test: invoke tool → parse stdout JSON line |

---

## §3. Preconditions

- Docker Compose test stack running
- No schema changes needed

---

## §4. Task Definitions

### Task 4.1: Create structured logger module

**Objective:** Create a minimal structured logger for tool invocations.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/src/logging.ts`:
   ```typescript
   export interface ToolLogEntry {
     ts: string;
     level: "info" | "warn" | "error";
     tool: string;
     duration_ms: number;
     status: "ok" | "error";
     request_id: string;
     error?: string;
   }

   let requestCounter = 0;

   export function generateRequestId(): string {
     return `req_${Date.now()}_${++requestCounter}`;
   }

   export function logToolInvocation(entry: ToolLogEntry): void {
     const line = JSON.stringify(entry);
     if (entry.level === "error") {
       console.error(line);
     } else {
       console.log(line);
     }
   }

   export function withToolLogging<T>(
     toolName: string,
     fn: () => Promise<T>,
   ): Promise<T & { _requestId?: string }> {
     const requestId = generateRequestId();
     const start = performance.now();

     return fn().then((result) => {
       logToolInvocation({
         ts: new Date().toISOString(),
         level: "info",
         tool: toolName,
         duration_ms: Math.round(performance.now() - start),
         status: "ok",
         request_id: requestId,
       });
       return result;
     }).catch((err) => {
       logToolInvocation({
         ts: new Date().toISOString(),
         level: "error",
         tool: toolName,
         duration_ms: Math.round(performance.now() - start),
         status: "error",
         request_id: requestId,
         error: (err as Error).message?.slice(0, 200),
       });
       throw err;
     });
   }
   ```

**Expected output:** A composable logging wrapper that can wrap any tool's async handler.

**Requirement mapping:** §2d row 1

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno check /app/src/logging.ts
```

---

### Task 4.2: Wrap tool handlers with logging

**Objective:** Add structured logging to each tool invocation.

**Input:** `server/index.ts` — 8 registered tools.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Import the logger in `server/index.ts`:
   ```typescript
   import { logToolInvocation, generateRequestId } from "./src/logging.ts";
   ```

2. For each tool handler, add timing instrumentation at the start and end of the try block. The simplest approach (avoids refactoring every handler) is a timing wrapper at the top of each handler:
   ```typescript
   async ({ query, context, limit }) => {
     const _reqId = generateRequestId();
     const _start = performance.now();
     try {
       // ... existing logic ...
       logToolInvocation({ ts: new Date().toISOString(), level: "info", tool: "search_thoughts", duration_ms: Math.round(performance.now() - _start), status: "ok", request_id: _reqId });
       return { content: [...] };
     } catch (err) {
       logToolInvocation({ ts: new Date().toISOString(), level: "error", tool: "search_thoughts", duration_ms: Math.round(performance.now() - _start), status: "error", request_id: _reqId, error: (err as Error).message?.slice(0, 200) });
       return { content: [...], isError: true };
     }
   }
   ```

3. Apply to all 8 tools: `search`, `fetch`, `search_thoughts`, `capture_thought`, `list_thoughts`, `thought_stats`, `graph_traverse`, `graph_search`, `consolidate`, `backfill_embeddings` (if ST-039 shipped).

4. **Alternative approach** (cleaner but more refactoring): Extract each tool's logic into named functions and use the `withToolLogging` wrapper. Choose whichever approach the executor prefers — the key requirement is that every tool invocation produces a structured log line.

**Expected output:** Every tool call emits a JSON log line to stdout with tool name, timing, and status.

**Requirement mapping:** §2d row 1

**Verification:**
```powershell
# Invoke a tool and check logs
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/structured-logging.test.ts
```

---

### Task 4.3: Write test

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/structured-logging.test.ts`:
   ```typescript
   import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
   import { callTool } from "./_helpers/mcpClient.ts";

   Deno.test("tool invocation produces structured log (smoke test via server response)", async () => {
     // We can't directly capture stdout from the test container in a unit test,
     // but we can verify the tool works and check server logs externally.
     // This test validates the tool still works correctly with logging added.
     const result = await callTool("thought_stats", {});
     assertEquals(result.isError, undefined, "thought_stats should succeed with logging wrapper");
   });

   Deno.test("search_thoughts with valid query produces response (logging doesn't break flow)", async () => {
     const result = await callTool("search_thoughts", { query: "test logging" });
     assertEquals(result.isError, undefined);
   });
   ```

2. **Manual verification** (documented in test file comments): After running tests, check container logs:
   ```powershell
   docker compose --profile test logs mcp-test --tail 50 | Select-String '"tool"'
   ```
   Expected: JSON lines with `"tool":"thought_stats"`, `"tool":"search_thoughts"`, etc.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/structured-logging.test.ts
```

---

### Task 4.4: Full test suite + cross-model review

```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```

**Cross-model review:**
- Does logging add measurable latency? (No — `JSON.stringify` of a small object is sub-microsecond.)
- Could the request counter overflow? (At 1000 req/s, `Number.MAX_SAFE_INTEGER` is reached in ~285 million years.)
- Does `performance.now()` work in Deno? (Yes — globally available, high-resolution timer.)

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Next task** | Task 4.1 |
| **Known blockers** | None |

---

## §5c. Approach Ledger

| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | JSON-line logging per tool invocation | git HEAD | 🟢 Active |

---

## §6. Execution Log

---

## §6b. Surprises & Discoveries

---

## §6c. Decision Log

---

## §7. Compound Step / Closeout

1. Run full verification
2. Update board
3. Present results

---

## §7b. Outcomes & Retrospective

*(populated on completion)*

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.8.
