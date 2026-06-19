# ExecPlan — ST-043: Context Validation + Feature Flags

> Status: ✅ Completed
> Story: ST-043
> Created: 2026-05-31
> Parent: QP-038-Vectorize-MCP-Repo-Review.md

---

## §1. Background & Context

**Context validation:** The `parseContext()` function in `server/src/parseContext.ts` currently silently ignores malformed input. If an agent passes `context: "garbage!!!"`, it returns an empty scope (null or `{}`) with no feedback. The agent then gets unscoped results without knowing its filter was invalid.

**Feature flags:** The entity worker and consolidation worker start unconditionally at boot. There's no way to disable graph/entity features without removing code — useful for debugging, staged rollouts, or running in degraded mode.

This story adds:
1. Validation in `parseContext()` that returns a structured error for malformed input.
2. Environment-variable-based feature flags (`FEATURE_ENTITY_WORKER`, `FEATURE_CONSOLIDATION_WORKER`) that disable workers when set to `false`.

**Key files:**
- `server/src/parseContext.ts` — context parser
- `server/index.ts` — worker startup (lines 530–535)

---

## §1b. Outcomes & Conclusions

- parseContext now returns `ContextParseResult | null` (union of `ContextScope` or `ContextParseError`). Unknown keys, bare tokens (except "strict"), empty values, and invalid profile/visibility values all produce structured error objects with `message`, `received`, `expected`, and `failedToken` fields.
- `isContextError()` type guard enables tool handlers to short-circuit with `isError: true`.
- Three tools (`search_thoughts`, `capture_thought`, `list_thoughts`) surface context validation errors. `search` and `fetch` don't use context — no change needed.
- `FEATURE_ENTITY_WORKER` and `FEATURE_CONSOLIDATION_WORKER` env vars default to enabled; only `"false"` disables. Node `startEmbeddingBackfill` already respected `EMBEDDING_BACKFILL_DISABLED` (pre-existing pattern).
- All 21 ST-043 tests pass (17 unit + 4 integration).

---

## §2. Definition of Done

- Calling any tool with `context: "garbage!!!"` returns an MCP error naming the expected format.
- Calling with `context: "project:zoom,profile:professional"` works as before.
- Setting `FEATURE_ENTITY_WORKER=false` and restarting → worker does not start (log confirms).
- Setting `FEATURE_CONSOLIDATION_WORKER=false` and restarting → consolidation worker does not start.
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

Status: ✅ Ready — executed 2026-06-19

---

## §2c. Plan Review Notes

(Empty)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Malformed context strings rejected with clear error (QP-038 AC-6) | Validation in `parseContext.ts` + error surfacing in tool handlers | Task 4.1, 4.2 | Test: `"garbage!!!"` returns validation error |
| Feature flags disable graph/entity features (QP-038 AC-16) | Env var check before worker startup | Task 4.3 | Test: `FEATURE_ENTITY_WORKER=false` → worker log says disabled |

---

## §3. Preconditions

- Docker Compose test stack running
- No schema changes needed

---

## §4. Task Definitions

### Task 4.1: Add validation to parseContext

**Objective:** Return a structured error when the context string doesn't match the expected grammar.

**Input:** `server/src/parseContext.ts` — current implementation silently skips unrecognized pairs.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Update `server/src/parseContext.ts` to add a validation result type:
   ```typescript
   export interface ContextParseError {
     error: true;
     message: string;
     received: string;
     expected: string;
     failedToken?: string;
   }

   export type ContextParseResult = ContextScope | ContextParseError;

   const VALID_KEYS = new Set(["project", "entity", "profile", "visibility", "story", "strict"]);
   const VALID_PROFILES = new Set(["professional", "personal"]);
   const VALID_VISIBILITIES = new Set(["prefer", "exclusive", "cross-only"]);
   ```

2. Modify `parseContext` to return `ContextParseResult | null`:
   ```typescript
   export function parseContext(raw: string | undefined): ContextParseResult | null {
     if (!raw) return null;

     const scope: Partial<ContextScope> = {};

     for (const pair of raw.split(",")) {
       const trimmed = pair.trim();
       if (!trimmed) continue;

       // Special case: bare "strict" keyword
       if (trimmed === "strict") {
         scope.strict = true;
         continue;
       }

       const colonIdx = trimmed.indexOf(":");
       if (colonIdx === -1) {
         return {
           error: true,
           message: `Invalid token "${trimmed}" — expected key:value format`,
           received: raw,
           expected: 'Comma-separated key:value pairs. Example: "project:myapp,profile:professional,strict"',
           failedToken: trimmed,
         };
       }

       const k = trimmed.slice(0, colonIdx).trim();
       const v = trimmed.slice(colonIdx + 1).trim();

       if (!VALID_KEYS.has(k)) {
         return {
           error: true,
           message: `Unknown key "${k}" — valid keys: ${[...VALID_KEYS].join(", ")}`,
           received: raw,
           expected: 'Comma-separated key:value pairs. Example: "project:myapp,profile:professional"',
           failedToken: trimmed,
         };
       }

       if (!v) {
         return {
           error: true,
           message: `Key "${k}" has empty value`,
           received: raw,
           expected: `"${k}:<value>"`,
           failedToken: trimmed,
         };
       }

       if (k === "project")         scope.projects   = v.split(";");
       else if (k === "entity")     scope.entities   = v.split(";");
       else if (k === "profile") {
         if (!VALID_PROFILES.has(v)) {
           return {
             error: true,
             message: `Invalid profile "${v}" — must be "professional" or "personal"`,
             received: raw,
             expected: '"profile:professional" or "profile:personal"',
             failedToken: trimmed,
           };
         }
         scope.profile = v as ContextScope["profile"];
       }
       else if (k === "visibility") {
         if (!VALID_VISIBILITIES.has(v)) {
           return {
             error: true,
             message: `Invalid visibility "${v}" — must be "prefer", "exclusive", or "cross-only"`,
             received: raw,
             expected: '"visibility:prefer", "visibility:exclusive", or "visibility:cross-only"',
             failedToken: trimmed,
           };
         }
         scope.visibility = v as ContextScope["visibility"];
       }
       else if (k === "story")      scope.sourceStoryId = v;
       else if (k === "strict")     scope.strict = v === "true";
     }

     return scope as ContextScope;
   }
   ```

3. Add a type guard helper:
   ```typescript
   export function isContextError(result: ContextParseResult | null): result is ContextParseError {
     return result !== null && "error" in result && result.error === true;
   }
   ```

**Expected output:** Malformed context returns a structured error object; valid context returns scope as before.

**Requirement mapping:** §2d row 1

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/parseContext.test.ts
```

**Failure handling:** If existing tests break because they pass slightly non-standard context strings, check what those tests send and ensure it's valid.

---

### Task 4.2: Surface validation errors in tool handlers

**Objective:** Tool handlers return MCP errors when context validation fails.

**Input:** `server/index.ts` — tools that call `parseContext(context)`.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Import the new type guard in `server/index.ts`:
   ```typescript
   import { parseContext, isContextError } from "./src/parseContext.ts";
   ```

2. In each tool handler that uses `parseContext` (search_thoughts, capture_thought, list_thoughts), add a check after the call:
   ```typescript
   const scopeResult = parseContext(context);
   if (isContextError(scopeResult)) {
     return {
       content: [{ type: "text" as const, text: `Context validation error: ${scopeResult.message}\nExpected: ${scopeResult.expected}\nReceived: "${scopeResult.received}"` }],
       isError: true,
     };
   }
   const scope = scopeResult;
   ```

3. Update the variable names from `const scope = parseContext(context)` to the pattern above in each handler (search_thoughts, capture_thought, list_thoughts). The `search` and `fetch` tools don't use context — no change needed.

**Expected output:** Invalid context returns a detailed error to the caller.

**Requirement mapping:** §2d row 1

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/context-validation.test.ts
```

---

### Task 4.3: Add feature flags for workers

**Objective:** Allow workers to be disabled via environment variables.

**Input:** `server/index.ts` — worker startup at the bottom of the file.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Before the worker startup calls at the bottom of `server/index.ts`, add:
   ```typescript
   // Feature flags — set to "false" to disable
   const FEATURE_ENTITY_WORKER = Deno.env.get("FEATURE_ENTITY_WORKER") !== "false";
   const FEATURE_CONSOLIDATION_WORKER = Deno.env.get("FEATURE_CONSOLIDATION_WORKER") !== "false";
   ```

2. Wrap the worker startups:
   ```typescript
   if (FEATURE_ENTITY_WORKER) {
     startEntityWorker();
   } else {
     console.log("[server] Entity worker: disabled by feature flag (FEATURE_ENTITY_WORKER=false)");
   }

   if (FEATURE_CONSOLIDATION_WORKER) {
     startConsolidationWorker().catch((err) =>
       console.error("[server] consolidation worker failed to start:", err)
     );
   } else {
     console.log("[server] Consolidation worker: disabled by feature flag (FEATURE_CONSOLIDATION_WORKER=false)");
   }
   ```

3. Default is **enabled** (flag not set or set to anything other than "false"). Only explicit `"false"` disables.

**Expected output:** Workers can be toggled off without code changes.

**Requirement mapping:** §2d row 2

**Verification:**
```powershell
docker compose --profile test exec mcp-test sh -c "FEATURE_ENTITY_WORKER=false FEATURE_CONSOLIDATION_WORKER=false timeout 5 deno run --allow-net --allow-env --allow-read /app/index.ts 2>&1 || true" | Select-String "disabled by feature flag"
```
Expected: Two lines matching "disabled by feature flag".

---

### Task 4.4: Write tests + update existing parseContext tests

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Update `server/tests/parseContext.test.ts` to add validation test cases:
   ```typescript
   Deno.test("parseContext rejects unknown keys", () => {
     const result = parseContext("garbage:value");
     // Should return error (implementation detail depends on Task 4.1)
   });

   Deno.test("parseContext rejects bare tokens (not key:value)", () => {
     const result = parseContext("randomstring");
     // Note: "strict" is a valid bare token; others are not
   });
   ```

2. Create `server/tests/context-validation.test.ts` for integration-level tests via MCP:
   ```typescript
   import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
   import { callTool } from "./_helpers/mcpClient.ts";

   Deno.test("search_thoughts rejects malformed context", async () => {
     const result = await callTool("search_thoughts", {
       query: "test",
       context: "garbage!!!",
     });
     assertEquals(result.isError, true);
     assertEquals(result.content[0].text.includes("Context validation error"), true);
   });

   Deno.test("search_thoughts accepts valid context", async () => {
     const result = await callTool("search_thoughts", {
       query: "test",
       context: "project:zoom,profile:professional",
     });
     // May return no results but should not error
     assertEquals(result.isError, undefined);
   });
   ```

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/parseContext.test.ts tests/context-validation.test.ts
```

---

### Task 4.5: Full test suite + cross-model review

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```

**Cross-model review:**
- Does the "strict" bare keyword still work? (Yes — explicitly handled before the colon check.)
- Does disabling entity worker prevent entity extraction queue from growing? (No — thoughts still queue; they just won't be processed until re-enabled.)
- Is the feature flag check racey with top-level await? (No — the flags are evaluated synchronously before worker start.)

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Next task** | Complete |
| **Known blockers** | None |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-06-19 | Task 4.1 | ✅ Done | parseContext.ts updated with ContextParseError, ContextParseResult, isContextError | Task 4.2 |
| 2026-06-19 | Task 4.2 | ✅ Done | index.ts: 3 tool handlers now check isContextError | Task 4.3 |
| 2026-06-19 | Task 4.3 | ✅ Done | FEATURE_ENTITY_WORKER / FEATURE_CONSOLIDATION_WORKER env vars added | Task 4.4 |
| 2026-06-19 | Task 4.4 | ✅ Done | parseContext.test.ts 17 tests pass; context-validation.test.ts 4 integration tests pass | Task 4.5 |
| 2026-06-19 | Task 4.5 | ✅ Done | Full suite 150 pass, 16 pre-existing failures; all ST-043 tests green | — |

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Validation errors + env-based feature flags | git HEAD | 🟢 Active |

---

## §6. Execution Log

(Populated during execution)

---

## §6b. Surprises & Discoveries

---

## §6c. Decision Log

---

## §7. Compound Step / Closeout

1. Run full verification
2. Update board: move to Review
3. Present results to PO

---

## §7b. Outcomes & Retrospective

*(populated on completion)*

---

## Revision Notes

- 2026-05-31: Initial ExecPlan from QP-038 §4.2 + §4.4.
