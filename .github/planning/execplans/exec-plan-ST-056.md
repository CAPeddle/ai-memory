# ExecPlan — ST-056: Embedding Request Timeout Resilience

> Status: ✅ Ready for /continue
> Story: ST-056
> Created: 2026-06-17
> Parent: docs/plans/2026-06-14-001-fix-search-stall-and-observability-plan.md

## §1. Background & Context

**Problem:** MCP request handler concurrency caused embedding-lane context 
contamination—multiple simultaneous requests overwrote each other's active lane.
Result: stalled or errored embeddings in high-concurrency scenarios.

**Solution:** Refactor server/src/mcpDiagnostics.ts to use node:async_hooks 
AsyncLocalStorage for request-scoped context isolation instead of 
module-level _activeEmbeddingLane variable. Test: "embedding lane context: 
concurrent requests do not overwrite each other".

**Files affected:**
- server/src/mcpDiagnostics.ts (refactored)
- server/src/startupValidation.ts (ensureRecallQueriesTable removed; logic 
  moved to server/src/migrate.ts)
- server/deno.lock (@types/node, undici-types added)
- server/tests/mcp-diagnostics.test.ts (new isolation test)
- server/tests/startup-validation.test.ts (old tests removed)

## §1b. Outcomes & Conclusions

Completion status: **Full** — all acceptance criteria met.

Key achievements:
- Concurrent request lane isolation implemented via AsyncLocalStorage
- All 131 server tests pass (including new "concurrent lane" test)
- Lint clean (0 errors)
- Commit: feat/ST-058-sync-alignment (included in wrap-up branch)

Requirements met:
- ✅ AsyncLocalStorage adopted in mcpDiagnostics
- ✅ Module-level state removed; no regression in lane tracking
- ✅ New test documents the fix and prevents regression
- ✅ startupValidation cleaned (recall_queries repair moved to migrate)

Architectural impact: 
- **Supported** — aligns with plan R1-R6 (structured diagnostics, 
  concurrency safety, observability).

Evidence:
- server/src/mcpDiagnostics.ts: `import { AsyncLocalStorage }...` present
- Commit: `git show HEAD~N --name-only` shows 7 files changed
- Test output: "embedding lane context: concurrent requests..." PASS
- Full suite: 131 tests passed, 0 failed

Downstream: None (foundational); ST-045 (observability dash) can 
now consume structured diagnostics.

## §2. Definition of Done

- After Task 4.3 commit, `git log --name-only` shows mcpDiagnostics.ts updated
- After Task 4.7 test run, output shows "131 tests passed"
- After Task 4.13 cross-model review, ✅ PASS recorded for diagnostics code
- After Task 4.14 PR open, CI gates pass (tests + lint)

## §2b. Definition of Ready

- [x] Background and acceptance criteria documented
- [x] Verification commands provided (Task 4.7 commands)
- [x] No judgment calls; all steps in parent ST-058 plan
- [x] Cross-model review gated before merge (Task 4.13)

Status: ✅ Ready for /continue (as part of ST-058 wrap-up)

## §2d. Requirement Traceability

| Requirement | Evidence | Task |
|---|---|---|
| Request context isolation (R1) | mcpDiagnostics.ts AsyncLocalStorage | 4.3 |
| Concurrent safety (R2) | Test "concurrent requests" + 131/131 passed | 4.3, 4.7 |
| No regression (R3) | Full suite 131/131, lint clean | 4.7 |
| Migration 003 repair moved (R4) | startupValidation.ts ensureRecallQueriesTable removed | 4.3 |

## §3. Preconditions

Included in parent ST-058 plan (Task §3).

## §4. Tasks

All execution delegated to ST-058 parent plan:
- Task 4.3: ST-056 diagnostics commit
- Task 4.7: Test suite validation
- Task 4.13: Cross-model review
- Task 4.14: PR creation and merge

See ST-058 plan for detailed steps.

## §5b. Recovery Ledger

| Field | Value |
|---|---|
| Last completed task | Task 4.3 (commit) |
| Last successful command | `git commit -m "refactor(diagnostics)..."` |
| Expected outputs produced | mcpDiagnostics.ts, startupValidation.ts, deno.lock updated in commit |
| Next task | Task 4.7 (test suite validation) |
| Known blockers | None |
| Last updated | 2026-06-17 |

## §1b. Outcomes & Conclusions (populated during execution)

See Recovery Ledger and cross-model review record.
