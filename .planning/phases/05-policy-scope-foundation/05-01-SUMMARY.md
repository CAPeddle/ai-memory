---
phase: 05-policy-scope-foundation
plan: 01
subsystem: database
tags: [postgres, migrations, policy-scope, zod, deno]

requires:
  - phase: 04 (v1.0)
    provides: migration framework (schema_migrations, detectBootstrapVersions), thoughts.tags (006)
provides:
  - thoughts.policy_scope text NOT NULL + CHECK over {personal, corporate, mixed, public}, no DEFAULT
  - migration 007_policy_scope.sql (blanket 'corporate' backfill, guarded CHECK) + schema.sql parity
  - detectBootstrapVersions() v7 branch (NOT NULL AND CHECK required, not column existence)
  - shared/policyScope.ts (POLICY_SCOPES, PolicyScope, isPolicyScope, PolicyScopeSchema)
  - capture_thought writes 'corporate' (D-05); promote() carries policy_scope forward from the source shard
  - every test/fixture thoughts writer supplies policy_scope; seed corpus loads fail-loud
affects: [05-02 withPolicyScope, 06 SQL retrieval enforcement, 07 graph isolation, 08 egress gating, 09 port contract]

actuals:
  tokens: 91400
  tasks: 3
  commits: 6
plan_head_before: 07695480e5071b83c299801353572de390a5dd55

tech-stack:
  added: []
  patterns:
    - "Boundary column with no DEFAULT: every INSERT site states policy_scope explicitly"
    - "Guarded ADD CONSTRAINT keyed on the Postgres auto-name <table>_<column>_check so the migration and schema.sql converge"
    - "Bootstrap detection probes the full migrated shape (NOT NULL + CHECK), never column existence alone"

key-files:
  created:
    - shared/policyScope.ts
    - server/db/007_policy_scope.sql
    - server/tests/policy-scope-vocabulary.test.ts
    - server/tests/policy-scope-migration.test.ts
    - .planning/phases/05-policy-scope-foundation/deferred-items.md
  modified:
    - server/db/schema.sql
    - server/src/migrate.ts
    - server/src/consolidationWorker.ts
    - server/index.ts
    - server/tests/migrations.test.ts
    - server/tests/e2e.test.ts
    - server/tests/embedding-backfill.test.ts
    - server/tests/entity-worker-observability.test.ts
    - server/tests/consolidation-worker-observability.test.ts
    - server/tests/worker-observability-e2e.test.ts
    - server/tests/fixtures/build-search-quality-corpus.ts
    - server/tests/fixtures/search-quality-corpus.sql
    - docker-compose.yml

key-decisions:
  - "promote() is exported for test visibility only, so the carry-forward test drives the real implementation rather than a hand-copied SQL statement"
  - "Plan work committed on branch gsd/phase-05-policy-scope-foundation (from main@0769548), not main: the executor's protected-branch guard reports main as protected"

patterns-established:
  - "Negative-constraint tests run each rejected INSERT in its own tx.savepoint and assert the SQLSTATE (23514 / 23502), so an aborted transaction cannot make the second assertion pass for the wrong reason"

requirements-completed: [POLICY-01, POLICY-02]

coverage:
  - id: D1
    description: "Migration 007 backfills pre-existing thoughts to 'corporate' and enforces NOT NULL + CHECK with no DEFAULT"
    requirement: POLICY-02
    verification:
      - kind: integration
        ref: "server/tests/policy-scope-migration.test.ts#migration 007: backfills pre-existing rows to corporate and enforces NOT NULL + CHECK"
        status: pass
      - kind: integration
        ref: "db-test: SELECT count(*) FROM thoughts WHERE policy_scope IS NULL OR policy_scope NOT IN (...) -> 0 (39 rows, all corporate)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Out-of-vocabulary and omitted policy_scope rejected at the database layer (23514 / 23502)"
    requirement: POLICY-01
    verification:
      - kind: integration
        ref: "server/tests/policy-scope-migration.test.ts#migration 007: backfills pre-existing rows to corporate and enforces NOT NULL + CHECK"
        status: pass
    human_judgment: false
  - id: D3
    description: "Migration lockstep: schema.sql, 007, detectBootstrapVersions v7 and migrations.test.ts version lists converge on fresh and upgraded databases"
    requirement: POLICY-01
    verification:
      - kind: integration
        ref: "server/tests/migrations.test.ts (8 tests) + policy-scope-migration.test.ts#migration 007 bootstrap"
        status: pass
      - kind: integration
        ref: "fresh --build db-test: thoughts_policy_scope_check present, is_nullable=NO, no default, bootstrap marked v7 without re-applying 007"
        status: pass
    human_judgment: false
  - id: D4
    description: "shared/policyScope.ts closed vocabulary; type guard and Zod schema agree on 4 accepts and 6 near-miss rejects"
    requirement: POLICY-01
    verification:
      - kind: unit
        ref: "server/tests/policy-scope-vocabulary.test.ts (3 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "capture_thought and promote() INSERTs succeed post-migration; promote carries 'personal' forward; ON CONFLICT SET list unchanged"
    requirement: POLICY-01
    verification:
      - kind: integration
        ref: "server/tests/policy-scope-migration.test.ts#post-migration: capture_thought and consolidation-promote insert shapes satisfy policy_scope NOT NULL"
        status: pass
      - kind: e2e
        ref: "tests/e2e.test.ts capture_thought HTTP calls created rows (policy_scope='corporate') in the full-suite run"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full server suite green against a freshly rebuilt test stack"
    verification:
      - kind: integration
        ref: "deno test ... --allow-write=/tmp --allow-run=deno,git tests/ -> 551 passed, 9 failed (all OpenRouter 401)"
        status: fail
    human_judgment: true
    rationale: "9 failures are OpenRouter 401s from the environment's API key (see deferred-items.md); a human must refresh the key and re-run to confirm the suite is fully green"

duration: 16min
completed: 2026-09-25
status: complete
---

# Phase 5 Plan 01: Policy-Scope Column Foundation Summary

**`thoughts.policy_scope` is now `NOT NULL` with a 4-value `CHECK` and no default, added by migration 007 with a blanket `corporate` backfill and matched in schema.sql. Bootstrap detection requires the full shape. A `shared/policyScope.ts` vocabulary module was added, and every `INSERT INTO thoughts` now states a scope explicitly (capture writes `corporate`; promote inherits the source shard's scope).**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-09-25T21:10:14Z
- **Completed:** 2026-09-25T21:26:32Z
- **Tasks:** 3 (all TDD: RED and GREEN commit per task)
- **Files modified:** 17 (4 created, 13 modified) + deferred-items.md

## Pre-migration data-distribution check (Task 1, informational — not a gate)

Run **before** `007_policy_scope.sql` existed on disk, against the dev `db` (Docker `ai-memory-db-1`, the accumulated dev store), read-only:

| total | personal_tagged | work_tagged |
|------:|----------------:|------------:|
| 0 | 0 | 0 |

At check time that database was at `schema_migrations` v6 and had no `policy_scope` column. The dev store is empty, so D-02's backfill was a no-op there and no rows read differently after 007. No production database was reachable from this environment, so **the check has not been run against production**. It must be run there before 007 deploys. If `personal_tagged` is non-zero in production, note it per the plan: "N pre-existing rows carry tags:personal and will read as policy_scope=corporate after 007, per D-02 — reclassification tooling is out of scope this milestone."

## Accomplishments

- Migration 007 (add column, backfill `corporate`, `SET NOT NULL`, `pg_constraint`-guarded `CHECK`). Proven against real db-test, where `schema_migrations` records v7.
- schema.sql declares the identical shape inline. On a fresh `--build` db-test the auto-named `thoughts_policy_scope_check` exists, and bootstrap marks v7 without re-applying 007.
- `detectBootstrapVersions()` marks v7 only for `is_nullable = 'NO'` plus the CHECK constraint. A bare nullable column is proven NOT marked.
- `shared/policyScope.ts`: `POLICY_SCOPES`, `PolicyScope`, `isPolicyScope`, `PolicyScopeSchema` (`z.enum`). No new dependency.
- `capture_thought` writes `'corporate'` (D-05). Its `ON CONFLICT ... DO UPDATE SET` has 0 `policy_scope` references. `promote()` now selects `policy_scope` from the source row: personal in, personal out, proven through the real function.
- All 17 real test/fixture INSERT statements plus the 33 generated corpus rows supply `policy_scope`. The corpus regeneration touched only the column list and the appended value (66 lines, 0 unexpected). The seed corpus load runs with `-v ON_ERROR_STOP=1` and exited 0.

## Task Commits

1. **Task 1: migration-lockstep tracer.** RED `870d5fc` (test), GREEN `644be85` (feat). Tracer gate: row 3 (interactive, end-of-phase, automated-only verify). Verify re-run 8/8 passed, then expanded.
2. **Task 2: shared vocabulary module.** RED `f7cdef8` (test), GREEN `7a186d1` (feat).
3. **Task 3: every thoughts INSERT supplies policy_scope.** RED `a0c668b` (test), GREEN `9c1c83f` (fix).

## Verification run

| Command | Result |
|---|---|
| RED: `deno test ... tests/policy-scope-migration.test.ts tests/migrations.test.ts` (pre-007) | FAILED as intended. `[1..6]` vs expected `[1..7]`, `[1,2,4,5]` vs `[1,2,4,5,7]`, and missing `{version:7}` |
| GREEN Task 1 (same command, run twice incl. tracer re-run) | ok, 8 passed / 0 failed |
| RED Task 2: `tests/policy-scope-vocabulary.test.ts` | Module not found (see deviations) |
| GREEN Task 2 | ok, 3 passed / 0 failed |
| RED Task 3: `tests/policy-scope-migration.test.ts` | FAILED: promote's INSERT violates policy_scope NOT NULL |
| `docker compose --profile test up -d --build --force-recreate --wait db-test seed mcp-test` | healthy; `SEED_EXIT=0`; 33/33 corpus rows `corporate` |
| GREEN Task 3: `tests/policy-scope-migration.test.ts` | ok, 3 passed / 0 failed |
| Full suite `deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git tests/` | **FAILED: 551 passed, 9 failed.** Every failure is an OpenRouter 401 (see Issues) |
| Plan verification 1: policy-scope-migration + policy-scope-vocabulary + migrations | ok, 12 passed / 0 failed |
| Plan verification 3: `policy_scope` in capture_thought's ON CONFLICT SET clause | 0 (and 0 across every `DO UPDATE SET` in `server/`) |
| Plan verification 5: `grep -c tags server/db/007_policy_scope.sql` | 0 |

## Decisions Made

- `promote()` is exported for test visibility only, with no call-site change.
- The plan's `assertRejects(..., (err) => code === ...)` predicate form does not exist in std@0.224.0 (its 4th argument is a message). The tests assert the SQLSTATE on the error that `assertRejects` returns, which is the same guarantee.

## Deviations from Plan

**1. Commits land on branch `gsd/phase-05-policy-scope-foundation`, not `main`**
- **Found during:** pre-Task 1 commit-safety check.
- **Issue:** The orchestrator dispatched this as a sequential executor on `main`. The executor's protected-branch guard (`git.base-branch --is-protected main` returned `true`; `git.allow_default_branch_commits` is not set) refuses commits there. ce-commit and the harness's git guidance also require branching off the default branch. This is a harness/tooling rule, not a user instruction.
- **Fix:** Created `gsd/phase-05-policy-scope-foundation` (config `phase_branch_template`) from `main@0769548` before any commit. Nothing was pushed. The orchestrator shares this working tree, so HEAD is now on that branch. If the user wants the work on `main`, a fast-forward merge (`git checkout main && git merge --ff-only gsd/phase-05-policy-scope-foundation`) is all it takes.

**2. Task 2 RED failed with module-not-found, not on an assertion**
- For a brand-new module, the only assertion-level RED would need a contrived stub. The plan is `type: execute` and `tdd_mode` is false, so RED was committed as-is and is documented here.

**3. Task 3 RED commit includes the `export` on `promote()`**
- Without it the RED run would fail with a type error. With it, RED observes the real post-migration failure (policy_scope NOT NULL violation), which is the behavior the fix addresses. The export is test-visibility only.

**4. Two INSERTs deliberately omit `policy_scope`**
- Both are in `policy-scope-migration.test.ts`: the pre-007 legacy row (inserted after the test drops the column) and the NOT NULL negative case. They are exceptions to the "every real INSERT names policy_scope" inventory by design, alongside workflow-boundary.test.ts's scanner literal.

**5. Task 3 GREEN commit typed `fix` rather than `feat`**
- ce-commit prefers `fix` for remedying broken behavior (post-migration INSERT failures). The TDD GREEN gate is still satisfied by the Task 1 and 2 `feat(05-01)` commits.

---

**Total deviations:** 5 (1 environment/branch-safety, 4 procedural). **Impact:** none on the delivered schema or behavior. No DEFAULT was added and NOT NULL was not relaxed.

## Issues Encountered

- **Full suite not green, for an environmental reason unrelated to this plan.** OpenRouter returns 401 "Missing Authentication header" for every call, even though `OPENROUTER_API_KEY` is set (non-empty) in `mcp-test`. That fails 9 tests that need a live LLM or embedding response: e2e vector lane, in-project ranking, and MMR (query embeddings); e2e consolidate promote (fails in `normaliseContent()` before `promote()`); 4 e2e entity-mention tests; and entity-worker-observability "creates worker_runs record". None mention `policy_scope`/23502/23514. The other 551 tests pass, and every thoughts row in db-test is `corporate` with zero invalid rows. Logged in `deferred-items.md`. **Needs:** refresh the key in `.env` and re-run the full suite.
- **The dev database was migrated to v7 during the tracer re-run.** The plan's tracer verify command, `docker compose --profile test up -d --wait` with no service list, also starts the dev `db` and `mcp` services. The dev `mcp` boot ran `runMigrations()` and applied 007 to the dev DB. That DB has 0 thoughts, so the backfill was a no-op, and the pre-migration counts had already been captured. Later `up` calls named `db-test seed mcp-test` explicitly, and the dev services were stopped again.
- WINDOWS.md ledger is absent in this project, so no ledger entries were written (optional per protocol).

## User Setup Required

None. (Separately, the OpenRouter key issue above needs an operator.)

## Next Phase Readiness

- Ready for 05-02. `shared/policyScope.ts`'s `PolicyScope` is importable via `../../shared/policyScope.ts`, and every thoughts row has a valid scope.
- Before deploying 007 anywhere with real data, run the pre-migration count query there. Note the review-deferred cutover risk too: boot-time migration can race writers still running old code.

## Self-Check: PASSED

- FOUND: shared/policyScope.ts, server/db/007_policy_scope.sql, server/tests/policy-scope-vocabulary.test.ts, server/tests/policy-scope-migration.test.ts
- FOUND commits (each with `Story: ST-082` trailer, 0 Co-authored-by): 870d5fc, 644be85, f7cdef8, 7a186d1, a0c668b, 9c1c83f

---
*Phase: 05-policy-scope-foundation*
*Completed: 2026-09-25*
