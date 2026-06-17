# Cross-Model Review Request — ST-058 Sync Alignment Wrap-Up

> **Reviewer:** Different model (not the executor of ST-058)
> **Branch:** `feat/ST-058-sync-alignment`
> **Base:** `origin/main`
> **Scope:** ST-056 (diagnostics refactor) + ST-042 (migration framework)
> **Requested:** 2026-06-17

---

## What changed

This branch reconciles three independently-completed work-streams with governance artifacts. The code changes themselves were authored and tested in prior sessions; this wrap-up commits them together and validates the whole.

### ST-056: Embedding request timeout resilience (7 files)

| File | Change |
|---|---|
| `server/src/mcpDiagnostics.ts` | Replaced module-level `_activeEmbeddingLane` with `node:async_hooks.AsyncLocalStorage` for request-scoped context isolation |
| `server/src/startupValidation.ts` | Removed `ensureRecallQueriesTable` (logic moved to `server/src/migrate.ts` migration 003) |
| `server/deno.lock` | Added `@types/node` and `undici-types` for AsyncLocalStorage types |
| `server/tests/mcp-diagnostics.test.ts` | Added test: "embedding lane context: concurrent requests do not overwrite each other" |
| `server/tests/startup-validation.test.ts` | Removed tests for `ensureRecallQueriesTable` |

### ST-042: Migration framework (4 files)

| File | Change |
|---|---|
| `server/src/migrate.ts` | New: lightweight migration runner — numbered SQL files, bootstrap detection, `Deno.exit(1)` on failure |
| `server/db/001_initial.sql` | New: initial schema (moved from `schema.sql`) |
| `server/db/002_needs_embedding.sql` | New: embedding backfill table (moved from ST-039 DDL) |
| `server/db/003_recall_queries.sql` | New: recall_queries + search_text columns (replaces startupValidation probe) |
| `server/tests/migrations.test.ts` | 3 tests: bootstrap from fresh DB, partial artifact detection, repair re-apply |

### ST-041 baseline verification (no code changes — cypher fix was already on origin/main)

| File | Change |
|---|---|
| `server/tests/cypher-injection.test.ts` | New: 20 tests validating token-aware deny-list behavior |

### Governance & docs

| File | Change |
|---|---|
| `.github/planning/execplans/exec-plan-ST-041.md` | §1b populated, §2c completion notes added |
| `.github/planning/execplans/exec-plan-ST-042.md` | Status → Ready, §2c populated |
| `.github/planning/execplans/exec-plan-ST-056.md` | Created new |
| `.github/planning/story-board.md` | ST-041/042/056 → Done, ST-058 added |
| `FollowUpSessionLog.txt` | Replaced with session handoff |
| `STRATEGY.md`, `.opencode/`, `opencode-mcp.json` | New governance artifacts |

---

## Review focus areas

### ST-056 — AsyncLocalStorage correctness

1. **Does the refactor eliminate the race?** The original bug was concurrent `/mcp` requests overwriting `_activeEmbeddingLane`. Verify that every path that reads/writes the lane now goes through `AsyncLocalStorage.run()` or `AsyncLocalStorage.getStore()`. Check for any remaining direct references to `_activeEmbeddingLane`.
2. **Is the fallback correct?** If `getStore()` returns `undefined` (no AsyncLocalStorage context), does the code handle it gracefully without throwing?
3. **Test validity:** Does `embedding lane context: concurrent requests do not overwrite each other` actually create interleaved requests? Is there a false-positive risk (test passes even if isolation is broken)?
4. **Deno compatibility:** `node:async_hooks` is available in Deno 2.0 via `@types/node`, but are there any Deno-specific gotchas (e.g., `Deno.core` vs Node.js event loop)?

### ST-042 — Migration framework safety

1. **Bootstrap robustness:** Can two pods start simultaneously against the same fresh DB and both succeed? (LWW on `schema_migrations` INSERT — is there a unique constraint violation or a `CREATE TABLE IF NOT EXISTS` guard?)
2. **Partial migration:** What happens if the server crashes mid-migration (e.g., after writing `schema_migrations` but before the DDL completes)? Is there any detection/recovery beyond operator intervention?
3. **Migration 003 repair:** The repair probe in `migrate.ts` detects a missing `recall_queries` table when version 003 is already recorded. Is this logic sound, or could it false-positive (e.g., on a naming collision)?
4. **File ordering:** Migrations are loaded by sorted filenames (`001_`, `002_`, etc.). What happens if a migration file is renamed after it was applied? Is there a version collision safeguard based on the recorded version number rather than the filename?
5. **Test isolation:** `migrations.test.ts` uses a separate test database. Does it clean up after itself? Could a failed test leave `schema_migrations` in a corrupted state for subsequent tests?

---

## Deliverables expected from review

- ✅ PASS — no blocking issues (ready for PR merge)
- ⚠️ PASS WITH NOTES — minor concerns that don't block merge
- ❌ FAIL — blocking issues requiring fixes before merge

Record verdict in ExecPlan §2c.
