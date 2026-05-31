# ExecPlan — ST-051: Rate Limiting

> Status: ⬜ Not Ready
> Story: ST-051
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md

---

## §1. Background & Context

The MCP server has no rate limiting. A misconfigured or runaway agent could flood the server with thousands of requests, exhausting Postgres connections and embedding API quota.

This story adds a simple in-memory rate limiter at the Hono middleware layer:
- Per-API-key: 60 requests per minute (configurable via env).
- Returns HTTP 429 with Retry-After header when exceeded.
- Does NOT use external state (Redis) — in-memory sliding window is sufficient for single-instance deployment.

**Key consideration:** The MCP transport (SSE) keeps connections open. Rate limiting should count MCP tool invocations (JSON-RPC calls within the session), not HTTP connections. The limiter hooks into the tool dispatch layer, not the HTTP layer.

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- After 60 rapid tool calls within 60 seconds, the 61st returns an MCP error (not HTTP 429 — MCP errors are JSON-RPC).
- The error message includes "rate limit" and a retry hint.
- Rate limit window resets after the configured interval.
- Environment variable `RATE_LIMIT_PER_MIN` overrides the default.
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
| Rate limiting prevents runaway clients from exhausting resources (QP-038 AC-13) | `server/src/rateLimiter.ts` + integration in tool dispatch | Task 4.1, 4.2 | Test: 61st rapid call returns rate-limit error |

---

## §3. Preconditions

- No external dependencies
- Docker Compose test stack running

---

## §4. Task Definitions

### Task 4.1: Implement rate limiter

**Steps:**

1. Create `server/src/rateLimiter.ts`:
   ```typescript
   const DEFAULT_LIMIT = 60;
   const WINDOW_MS = 60_000;

   interface BucketEntry {
     timestamps: number[];
   }

   const buckets = new Map<string, BucketEntry>();

   export function checkRateLimit(apiKey: string): { allowed: boolean; retryAfterMs?: number } {
     const limit = parseInt(Deno.env.get("RATE_LIMIT_PER_MIN") ?? "") || DEFAULT_LIMIT;
     const now = Date.now();
     const entry = buckets.get(apiKey) ?? { timestamps: [] };

     // Slide window
     entry.timestamps = entry.timestamps.filter(t => now - t < WINDOW_MS);

     if (entry.timestamps.length >= limit) {
       const oldest = entry.timestamps[0];
       const retryAfterMs = WINDOW_MS - (now - oldest);
       return { allowed: false, retryAfterMs };
     }

     entry.timestamps.push(now);
     buckets.set(apiKey, entry);
     return { allowed: true };
   }

   // Periodic cleanup to prevent memory leak from stale keys
   setInterval(() => {
     const now = Date.now();
     for (const [key, entry] of buckets) {
       entry.timestamps = entry.timestamps.filter(t => now - t < WINDOW_MS);
       if (entry.timestamps.length === 0) buckets.delete(key);
     }
   }, WINDOW_MS);
   ```

---

### Task 4.2: Integrate into tool dispatch

**Steps:**

1. In `server/index.ts` tool handler wrapper, before executing any tool:
   ```typescript
   import { checkRateLimit } from "./src/rateLimiter.ts";

   // Extract API key from transport/session context
   const { allowed, retryAfterMs } = checkRateLimit(apiKey);
   if (!allowed) {
     return {
       content: [{
         type: "text",
         text: `Rate limit exceeded. Try again in ${Math.ceil((retryAfterMs ?? 60000) / 1000)} seconds.`,
       }],
       isError: true,
     };
   }
   ```

---

### Task 4.3: Write test

1. Create `server/tests/rate-limit.test.ts`:
   - Fire 61 rapid `thought_stats` calls (lightweight).
   - Assert: first 60 succeed, 61st returns rate-limit error.
   - Wait 61 seconds (or mock time) and confirm reset.

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/rate-limit.test.ts
```

---

## §5b. Recovery Ledger

| Field | Value |
|---|---|
| **Next task** | Task 4.1 |
| **Known blockers** | None |

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.16.
