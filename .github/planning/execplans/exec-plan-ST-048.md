# ExecPlan — ST-048: Queryable Metrics Table

> Status: ⬜ Not Ready
> Story: ST-048
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md

---

## §1. Background & Context

Structured logging (ST-044) emits tool timing to stdout. For historical queries ("what's been slow this week?"), a `tool_metrics` table provides persistent, queryable data. Each tool invocation writes one row with tool name, duration, status, and timestamp.

**Depends on:** ST-042 (Migration Framework) — the table is added via migration `003_tool_metrics.sql`.

**Relationship to ST-028:** ST-028's `stats` MCP tool could read from this table for tool-level metrics. This story creates the table and write path; ST-028 decides what to surface.

---

## §1b. Outcomes & Conclusions

*(populated on completion)*

---

## §2. Definition of Done

- After 10 tool invocations, `SELECT count(*) FROM tool_metrics` returns ≥ 10 rows.
- Each row contains: tool name, duration_ms, status (ok/error), timestamp.
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
- [x] Observable criteria

Status: ⬜ Not ready — requires /plan

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Tool metrics persisted to queryable table (QP-038 AC-4) | `tool_metrics` table + write in logging middleware | Task 4.1, 4.2 | SELECT returns rows after invocations |

---

## §3. Preconditions

- ST-042 (Migration Framework) complete
- ST-044 (Structured Logging) complete (provides the hook point)

---

## §4. Task Definitions

### Task 4.1: Create migration

**Steps:**

1. Create `server/db/migrations/003_tool_metrics.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS public.tool_metrics (
     id          bigserial   PRIMARY KEY,
     tool        text        NOT NULL,
     duration_ms integer     NOT NULL,
     status      text        NOT NULL CHECK (status IN ('ok', 'error')),
     request_id  text,
     error       text,
     created_at  timestamptz NOT NULL DEFAULT now()
   );

   CREATE INDEX IF NOT EXISTS idx_tool_metrics_tool_created
     ON public.tool_metrics(tool, created_at DESC);

   -- 30-day retention via periodic DELETE (or pg_cron if available)
   -- For now, managed by application-level sweep
   ```

**Verification:**
```powershell
docker compose --profile test restart mcp-test
docker compose --profile test exec db-test psql -U postgres -d memory_test -c "\d tool_metrics"
```

---

### Task 4.2: Write metrics on each tool invocation

**Steps:**

1. In `server/src/logging.ts`, after emitting the JSON log line, also INSERT into `tool_metrics`:
   ```typescript
   import { sql } from "./db.ts";

   export function logToolInvocation(entry: ToolLogEntry): void {
     // Stdout log
     console.log(JSON.stringify(entry));
     // Persist (fire-and-forget — metric loss is acceptable)
     sql`INSERT INTO tool_metrics (tool, duration_ms, status, request_id, error)
         VALUES (${entry.tool}, ${entry.duration_ms}, ${entry.status}, ${entry.request_id}, ${entry.error ?? null})`
       .catch(() => {}); // silently ignore metric write failures
   }
   ```

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/tool-metrics.test.ts
```

---

### Task 4.3: Write test

1. Create `server/tests/tool-metrics.test.ts` — invoke several tools, then query `tool_metrics` for rows.

---

## §5b. Recovery Ledger

| Field | Value |
|---|---|
| **Next task** | Task 4.1 |
| **Known blockers** | ST-042, ST-044 |

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.9.
