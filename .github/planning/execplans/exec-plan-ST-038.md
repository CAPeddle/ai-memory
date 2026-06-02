# ExecPlan — ST-038: Startup Safety & Input Guards

> Status: ✅ Completed (accepted and moved to Done 2026-06-02)
> Story: ST-038
> Created: 2026-05-31
> Approved: 2026-06-02
> Parent: QP-038-Vectorize-MCP-Repo-Review.md
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

The ai-memory MCP server currently has two silent-failure gaps:

1. **Missing env var → silent embedding failures.** `OPENROUTER_API_KEY` is read at the top of `server/index.ts`. When missing, the server logs a warning but continues running. Every subsequent `capture_thought` call fires-and-forgets an embedding request that immediately fails — the thought is saved without an embedding and there is no recovery path today.

2. **No content size limit.** `capture_thought` accepts arbitrarily large payloads. A malfunctioning agent could pass megabytes of text, causing expensive embedding calls, oversized rows, and potential OOM conditions.

This story adds:
- A **fail-fast startup check** that exits the process if required env vars are missing.
- A **32 KB content size limit** on `capture_thought` that returns a clear MCP error.

**Key files:**
- `server/index.ts` — server entry point, env var reads, tool registrations
- `server/src/db.ts` — already validates `DATABASE_URL` with `throw new Error()`
- `server/tests/` — test directory (tests run via `docker compose --profile test exec mcp-test deno test ...`)

**Terminology:**
- "Fail fast" = `Deno.exit(1)` with an error log before the HTTP server starts listening.
- "MCP error" = returning `{ content: [...], isError: true }` from the tool handler (not an HTTP error code; MCP tools report errors inside the JSON-RPC response).

---

## §1b. Outcomes & Conclusions

- ✅ Implemented fail-fast startup validation for required env vars (`OPENROUTER_API_KEY`, `MEMORY_API_KEY`) before server startup.
- ✅ Implemented `capture_thought` UTF-8 byte-size guard at 32KB (`MAX_CONTENT_BYTES = 32_768`) before context parsing, DB insert, or embedding work.
- ✅ Added/expanded test coverage:
  - `server/tests/capture-size-limit.test.ts`: oversized rejection, ASCII boundaries (32768/32769), multibyte UTF-8 boundaries, and oversized non-insert assertion.
  - `server/tests/startup-validation.test.ts`: required-env detection plus explicit `ensureRequiredEnv` fatal-log + exit(1) behavior.
- ✅ Final verification: `docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/` → `39 passed, 0 failed`.

---

## §2. Definition of Done

- After removing `OPENROUTER_API_KEY` from the container environment and starting the server, the process exits within 2 seconds with a log message naming the missing variable.
- After calling `capture_thought` with a content string longer than 32 KB, the MCP response contains `isError: true` and a message mentioning "32KB" or "32768".
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

Status: ✅ Ready for /continue

---

## §2c. Plan Review Notes

(Empty — populated by /continue when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Server fails fast at startup if required env vars are missing (QP-038 AC-1) | `server/index.ts` startup block exits before `Deno.serve()` | Task 4.1 | Process check: `unset OPENROUTER_API_KEY` run logs `FATAL: Required environment variable OPENROUTER_API_KEY is not set. Exiting.` and `EXIT_CODE:1`; plus `tests/startup-validation.test.ts` asserts fatal log + exit(1) path in `ensureRequiredEnv`. |
| `capture_thought` rejects content exceeding 32KB (QP-038 AC-5) | Size check in capture tool handler (before DB insert) | Task 4.2 | `tests/capture-size-limit.test.ts`: 64KB reject with `isError: true` and 32KB message, ASCII and multibyte boundary coverage, and assertion that oversized content is not inserted into `thoughts`. |

---

## §3. Preconditions

- Docker Compose dev stack running: `docker compose up -d`
- Test stack available: `docker compose --profile test up -d`
- `.env` file with valid `MEMORY_API_KEY`, `DB_PASSWORD`, `OPENROUTER_API_KEY`
- No Deno installation required on host — all commands run inside containers

---

## §4. Task Definitions

### Task 4.1: Add startup env validation (fail-fast)

**Objective:** Exit the process immediately if required environment variables are missing, before the HTTP server starts.

**Input:** `server/index.ts` — current code reads `OPENROUTER_API_KEY` on line 13 with a `?? ""` fallback and logs a warning.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Open `server/index.ts`. Locate the env var reads at the top (lines 13–16):
   ```typescript
   const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
   if (!OPENROUTER_API_KEY) {
     console.warn("OPENROUTER_API_KEY is not set — embedding generation will fail; vector search lane will be skipped");
   }
   ```

2. Replace with a fail-fast validation block. Place it **after** the imports, **before** any tool registration or `getEmbedding` definition:
   ```typescript
   // ---------------------------------------------------------------------------
   // Startup validation — fail fast if required config is missing
   // ---------------------------------------------------------------------------

   const REQUIRED_ENV = ["OPENROUTER_API_KEY", "MEMORY_API_KEY"] as const;

   for (const name of REQUIRED_ENV) {
     if (!Deno.env.get(name)) {
       console.error(`FATAL: Required environment variable ${name} is not set. Exiting.`);
       Deno.exit(1);
     }
   }

   const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
   ```

3. Remove the old `if (!OPENROUTER_API_KEY)` warning block.

4. Remove the `?? ""` fallback from the `OPENROUTER_API_KEY` declaration (the `!` non-null assertion is safe because we just verified it exists).

5. Also remove the `?? ""` fallback in `server/src/entityWorker.ts` line 8 — the entity worker will never run if the env var is missing (server exits first). Replace:
   ```typescript
   const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
   ```
   with:
   ```typescript
   const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
   ```
   And remove the early-return guard in `startEntityWorker()` that checks `if (!OPENROUTER_API_KEY)`.

6. `DATABASE_URL` is already validated with a throw in `server/src/db.ts` — no change needed there. `MEMORY_API_KEY` is read inside `requireApiKey` middleware; the startup check ensures it exists before any request arrives.

**Design decision:** `CITATION_BASE_URL` is NOT required (has a sensible default). Only variables whose absence causes silent data loss or security bypass are in the required set.

**Expected output:** Server exits immediately with code 1 and a clear message when `OPENROUTER_API_KEY` or `MEMORY_API_KEY` is missing.

**Requirement mapping:** §2d row 1 (AC-1)

**Verification:**
```powershell
# Test missing OPENROUTER_API_KEY causes exit
docker compose --profile test exec mcp-test sh -c "unset OPENROUTER_API_KEY && timeout 5 deno run --allow-net --allow-env --allow-read /app/index.ts 2>&1 || true" | Select-String "FATAL"
```
Expected result: Output contains `FATAL: Required environment variable OPENROUTER_API_KEY is not set. Exiting.` and the process exits with code 1.

**Failure handling:** If the server doesn't exit, check that the validation block is placed before `Deno.serve()` and that the env var is actually unset in the test shell (not inherited from Docker Compose env).

---

### Task 4.2: Add content size limit to `capture_thought`

**Objective:** Reject payloads exceeding 32 KB before any processing (embedding call, DB insert).

**Input:** `server/index.ts` — the `capture_thought` tool handler (starts around line 210).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Open `server/index.ts`. Locate the `capture_thought` tool handler's async function body.

2. Add a size check as the **first line** inside the try block, before `parseContext`:
   ```typescript
   const MAX_CONTENT_BYTES = 32_768; // 32 KB
   const contentBytes = new TextEncoder().encode(content).length;
   if (contentBytes > MAX_CONTENT_BYTES) {
     return {
       content: [{ type: "text" as const, text: `Error: Content exceeds maximum size of 32KB (received ${contentBytes} bytes, limit ${MAX_CONTENT_BYTES})` }],
       isError: true,
     };
   }
   ```

3. The constant can be module-level if preferred for clarity — place it near the other constants at the top of the file:
   ```typescript
   const MAX_CONTENT_BYTES = 32_768; // 32 KB content limit per thought
   ```

**Design decision:** The limit is measured in UTF-8 bytes (not characters) because that's what matters for storage and embedding tokenization costs. 32 KB is generous for a "thought" — even long technical explanations rarely exceed 8 KB.

**Expected output:** Calling `capture_thought` with content > 32 KB returns an MCP error response without hitting the database or embedding service.

**Requirement mapping:** §2d row 2 (AC-5)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/capture-size-limit.test.ts
```
Expected result: Test passes — a 64 KB payload is rejected with an error mentioning "32KB".

**Failure handling:** If test file doesn't exist yet, create it in Task 4.3.

---

### Task 4.3: Write tests

**Objective:** Add test coverage for both new behaviours.

**Input:** Existing test patterns in `server/tests/e2e.test.ts` and `server/tests/_helpers/`.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create `server/tests/capture-size-limit.test.ts`:
   ```typescript
   import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
   import { callTool } from "./_helpers/mcpClient.ts";

   Deno.test("capture_thought rejects content exceeding 32KB", async () => {
     const bigContent = "x".repeat(64 * 1024); // 64 KB
     const result = await callTool("capture_thought", {
       content: bigContent,
       memory_type: "shard",
     });
     assertEquals(result.isError, true);
     assertEquals(
       typeof result.content[0].text === "string" &&
         result.content[0].text.includes("32KB"),
       true,
       "Error message should mention 32KB limit",
     );
   });

   Deno.test("capture_thought accepts content at exactly 32768 bytes", async () => {
     // Exactly at the limit — must be accepted
     const boundaryContent = "a".repeat(32_768);
     const result = await callTool("capture_thought", {
       content: boundaryContent,
       memory_type: "shard",
     });
     assertEquals(result.isError, undefined);
     assertEquals(
       typeof result.content[0].text === "string" &&
         result.content[0].text.includes("Captured as"),
       true,
       "Content at exactly 32768 bytes should be accepted",
     );
   });

   Deno.test("capture_thought rejects content at 32769 bytes", async () => {
     // One byte over the limit — must be rejected
     const overByOne = "a".repeat(32_769);
     const result = await callTool("capture_thought", {
       content: overByOne,
       memory_type: "shard",
     });
     assertEquals(result.isError, true);
     assertEquals(
       typeof result.content[0].text === "string" &&
         result.content[0].text.includes("32KB"),
       true,
       "Error message should mention 32KB limit",
     );
   });

   Deno.test("capture_thought accepts content under 32KB", async () => {
     const okContent = "This is a normal-sized thought for testing size limits.";
     const result = await callTool("capture_thought", {
       content: okContent,
       memory_type: "shard",
     });
     assertEquals(result.isError, undefined);
     assertEquals(
       typeof result.content[0].text === "string" &&
         result.content[0].text.includes("Captured as"),
       true,
     );
   });
   ```

2. The `callTool` helper in `server/tests/_helpers/mcpClient.ts` should already handle MCP tool calls. If its signature doesn't match, adapt the import. Check the helper's interface before writing.

**Expected output:** Four tests — 64KB rejected, exactly 32768 bytes accepted, exactly 32769 bytes rejected, and normal content accepted.

**Requirement mapping:** §2d rows 1 and 2 (verification evidence)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/capture-size-limit.test.ts
```
Expected result: 4 tests pass (4 passed, 0 failed).

**Failure handling:** If `callTool` helper has a different signature, read `server/tests/_helpers/mcpClient.ts` and adapt the test accordingly.

---

### Task 4.4: Run full test suite + cross-model review

**Objective:** Verify no regressions and perform the mandatory cross-model review.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Run the full test suite:
   ```powershell
   docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
   ```

2. Verify all tests pass (including new ones from Task 4.3).

3. **Cross-model review:** Request a review from a different model. The reviewer should check:
   - Does the startup validation actually prevent the server from starting (not just log a warning)?
   - Does the size check measure bytes correctly for multi-byte Unicode?
   - Are there edge cases the tests miss (e.g. exactly 32768 bytes)?
   - Does removing the entity worker's `if (!OPENROUTER_API_KEY)` guard create a startup race?

**Expected output:** All tests green; cross-model review passes or issues are addressed.

**Requirement mapping:** Both §2d rows (final verification)

**Verification:**
```powershell
docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/
```
Expected result: All tests pass with 0 failures.

**Failure handling:** If pre-existing tests fail, check whether they depend on the `OPENROUTER_API_KEY` warning behaviour that was removed. If so, update those tests to match the new fail-fast semantics.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.4 — Run full test suite + cross-model review |
| **Last successful command** | `docker compose --profile test exec mcp-test deno test --allow-net --allow-env --allow-read tests/` |
| **Expected outputs produced** | Full suite green (`39 passed, 0 failed`); process-level fail-fast evidence captured (`FATAL...`, `EXIT_CODE:1`); cross-model review findings on test coverage addressed via startup-validation helper tests and expanded size-limit tests. |
| **Next task** | None — story completed, accepted by PO, and moved to Done |
| **Known blockers** | None |
| **Last updated** | 2026-06-02T15:04:36+02:00 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-06-02T14:29:07+02:00 | Task 4.1 | ✅ Complete | Startup with missing `OPENROUTER_API_KEY` logs FATAL and exits with code 1; `server/index.ts` now validates `OPENROUTER_API_KEY` + `MEMORY_API_KEY` at startup; `server/src/entityWorker.ts` uses non-null key and no longer self-disables. | Execute Task 4.2 |
| 2026-06-02T14:30:57+02:00 | Task 4.2 | ✅ Complete | `capture_thought` byte-size guard implemented at top of try block; verification command run and failed with "No such file" because `tests/capture-size-limit.test.ts` is created in Task 4.3 per plan failure handling. | Execute Task 4.3 |
| 2026-06-02T14:35:49+02:00 | Task 4.3 | ✅ Complete | `tests/capture-size-limit.test.ts` added and verified green: `4 passed, 0 failed`; tests assert `result.isError` and 32KB messaging, with cleanup for accepted captures. | Execute Task 4.4 |
| 2026-06-02T14:53:38+02:00 | Task 4.4 | ✅ Complete | Full suite rerun after review-driven fixes: `39 passed, 0 failed`; process-level fail-fast check confirms `EXIT_CODE:1` when key missing; cross-model review findings addressed with startup-exit assertions and UTF-8 boundary/non-insert tests. | Present to PO for review gate |
| 2026-06-02T15:04:36+02:00 | §7 closeout | ✅ Complete | PO accepted ST-038; board moved Refined → Review → Done; follow-up session handoff refreshed. | Story complete |

### Avoidance

- 2026-06-02: If `mcp-test` is not running, start the profile first with `docker compose --profile test up -d` before executing verification commands.
- 2026-06-02: After changing server runtime code, restart `mcp-test` (`docker compose --profile test restart mcp-test`) before running behavior checks; Deno modules are not hot-reloaded in the running container process.

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Fail-fast exit + size limit in capture handler | git HEAD before first commit | 🟢 Active |

### Approach Failure Log
(Empty — no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback (hard cap)

---

## §6. Execution Log

(Populated during execution)

---

## §6b. Surprises & Discoveries

- 2026-06-02: Task 4.1 verification initially failed because `mcp-test` was not running; bringing up the `--profile test` stack resolved it without code changes.
- 2026-06-02: Task 4.2 verification command surfaced expected missing-file error (`tests/capture-size-limit.test.ts` not yet present); Task 4.3 creates that file.
- 2026-06-02: A quick MCP probe initially returned pre-change behavior until `mcp-test` was restarted; restart is required to pick up runtime code changes.
- 2026-06-02: New test file initially hit Deno resource/op leak sanitizers on accepted-path MCP calls; setting `sanitizeResources: false` and `sanitizeOps: false` aligned with existing integration-test patterns.
- 2026-06-02: Initial cross-model review flagged verification gaps (startup-exit assertion, UTF-8 boundary coverage, and oversized non-insert proof); these were resolved within Task 4.4.
- 2026-06-02: Final cross-model gate rerun reported PASS with no acceptance-criteria violations.

---

## §6c. Decision Log

- 2026-06-02: Kept the required-env set exactly to `OPENROUTER_API_KEY` and `MEMORY_API_KEY` per plan; `AI_MEMORY_CITATION_BASE_URL` remains optional with default.
- 2026-06-02: Used `mcpCall` response shape (`result.isError`, `result.content[0].text`) in tests instead of introducing a new helper API.
- 2026-06-02: Added explicit DB cleanup for accepted capture tests to preserve corpus/test isolation guarantees.
- 2026-06-02: Extracted startup env validation to `server/src/startupValidation.ts` so exit-path behavior can be unit-tested without introducing `--allow-run` test requirements.
- 2026-06-02: Added multibyte UTF-8 boundary tests (`😀` payloads) to lock byte-based semantics and prevent accidental character-count regressions.

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

- Story objective achieved: startup now fails fast on missing required secrets, and `capture_thought` enforces a hard 32KB UTF-8 byte cap.
- Contract evidence now includes both process-level startup verification and automated exit-path assertions.
- Test suite expanded from 31 to 39 passing tests due to new startup validation and size-limit boundary cases.
- No plan-review escalation required; all cross-model review findings were addressed within ST-038 scope.

---

## Revision Notes

- 2026-05-31: Initial ExecPlan created from QP-038 §4.1 + §4.3.
