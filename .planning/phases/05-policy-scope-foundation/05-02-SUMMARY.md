---
phase: 05-policy-scope-foundation
plan: 02
subsystem: database
tags: [postgres, rls, row-level-security, postgres.js, policy-scope, adr, deno]

requires:
  - phase: 05-policy-scope-foundation (05-01)
    provides: thoughts.policy_scope NOT NULL + CHECK (migration 007), shared/policyScope.ts PolicyScope type
provides:
  - server/src/policyScope.ts withPolicyScope(scope, fn, client?) using set_config('app.policy_scope', scope, true) inside client.begin() (committed, unwired)
  - server/tests/policy-scope-rls-spike.test.ts, a commit-and-teardown RLS spike on db-test proving the D-03/D-06 matrix and both fail-closed cases via a non-superuser role
  - ADR-018, which resolves DECISION-01 as RLS with an allow-list guard and records the trust boundary, visibility matrix, STRIDE table, and Phase 6 preconditions
affects: [06 SQL retrieval enforcement, 07 graph isolation, 08 egress gating, 09 port contract]

actuals:
  tokens: 7770
  tasks: 2
  commits: 3
plan_head_before: 0d54e76cccbde0339472b516f673be431009397f

tech-stack:
  added: []
  patterns:
    - "Transaction-local GUC via set_config(name, value, true) inside client.begin(), never a templated SET LOCAL"
    - "RLS predicate guarded by an allow-list IN (...) over the closed vocabulary, not IS NOT NULL (a reused pooled connection reads '' after a committed scoped transaction)"
    - "RLS tests run as a dedicated non-superuser role asserted rolsuper=false/rolbypassrls=false, because the app role is a superuser"
    - "Commit-and-teardown spikes on shared db-test: teardown steps are collected best-effort, then catalog assertions are the last statements of finally"

key-files:
  created:
    - server/src/policyScope.ts
    - server/tests/policy-scope-rls-spike.test.ts
    - docs/design/adr/ADR-018-policy-scope-sql-enforcement-mechanism.md
  modified: []

key-decisions:
  - "DECISION-01 resolved: Postgres RLS keyed on a transaction-local app.policy_scope GUC set only by withPolicyScope(), with an allow-list guard. Proven on db-test only and not enabled in production (ADR-018)"
  - "A non-superuser application runtime role is a precondition of Phase 6 enabling RLS, because ai_memory is a superuser and RLS would otherwise be a silent no-op"
  - "Only the RLS arm was built, so per-query WHERE predicates are recorded as an unvalidated contingency, not a tested alternative"

patterns-established:
  - "Case (b) (fresh connection, GUC asserted NULL) runs before any scoped call, and case (d) (same reserved connection after COMMIT, GUC asserted '') makes the two unscoped states distinct by observation"

requirements-completed: [DECISION-01]

coverage:
  - id: D1
    description: "withPolicyScope() sets app.policy_scope via set_config(..., true) inside client.begin() and is imported by no production handler or worker"
    requirement: DECISION-01
    verification:
      - kind: integration
        ref: "server/tests/policy-scope-rls-spike.test.ts#DECISION-01 spike: RLS + withPolicyScope() enforces the D-03/D-06 visibility matrix and fails closed"
        status: pass
      - kind: other
        ref: "grep -rl policyScope.ts server/index.ts server/src/entityWorker.ts server/src/consolidationWorker.ts server/src/embeddingBackfill.ts -> no matches"
        status: pass
    human_judgment: false
  - id: D2
    description: "RLS spike proves personal/corporate/mixed see {self, public}, public sees {public}, a fresh connection and a reused post-COMMIT connection both see zero rows, running as a non-superuser role"
    requirement: DECISION-01
    verification:
      - kind: integration
        ref: "server/tests/policy-scope-rls-spike.test.ts (1 test, passed on 2 consecutive runs)"
        status: pass
      - kind: other
        ref: "Throwaway mutation run: IS NOT NULL guard makes case (d) fail (public row leaks), while case (b) still passes"
        status: pass
    human_judgment: false
  - id: D3
    description: "Spike teardown leaves db-test with RLS disabled and not forced, no policy_scope_isolation policy, no spike role, and no seeded rows, on both pass and fail paths"
    requirement: DECISION-01
    verification:
      - kind: integration
        ref: "In-test finally assertions against pg_class, pg_policies, pg_roles, and seeded-id count"
        status: pass
      - kind: other
        ref: "Independent psql check on db-test after the RED (fail-path) run, the GREEN runs, the mutation (fail-path) run, and the full suite: f|f, 0 policies, 0 roles, 0 rows"
        status: pass
    human_judgment: false
  - id: D4
    description: "ADR-018 records the mechanism, D-01 trust boundary, D-03/D-06 matrix, STRIDE table, the not-yet-enabled/Phase 6 caveat, the superuser precondition, the concurrency limits, and the CAPTURE-01 caveat"
    requirement: DECISION-01
    verification:
      - kind: other
        ref: "Task 2 automated grep verify -> VERIFY_OK; ~/.dotnet/dotnet run --project tools/GovernanceAssetValidator -- validate . -> Validation succeeded"
        status: pass
    human_judgment: true
    rationale: "ADR-018 is status: proposed. The PO should accept it and decide who introduces the non-superuser runtime role, and when, before Phase 6 enables RLS"
  - id: D5
    description: "Full server suite shows no new failures and no lingering RLS state"
    verification:
      - kind: integration
        ref: "deno test ... --allow-write=/tmp --allow-run=deno,git tests/ -> 552 passed, 9 failed (the same 9 OpenRouter-401 failures as the 05-01 baseline)"
        status: fail
    human_judgment: true
    rationale: "The 9 failures are the pre-existing OpenRouter 401s from the environment's API key (deferred-items.md). A human must refresh the key and re-run to see the suite fully green"

duration: 12min
completed: 2026-09-25
status: complete
---

# Phase 5 Plan 02: DECISION-01 RLS Spike and ADR-018 Summary

**DECISION-01 is settled empirically. Postgres row-level security, keyed on a transaction-local `app.policy_scope` GUC set by `withPolicyScope()` (`set_config(..., true)` inside `client.begin()`) and guarded by an allow-list, implements the D-03/D-06 matrix through postgres.js's real pool and fails closed on both fresh and reused connections. ADR-018 records the result, the trust boundary, and the preconditions Phase 6 must meet before enabling it in production.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-09-25T21:31:03Z
- **Completed:** 2026-09-25T21:43Z
- **Tasks:** 2
- **Files:** 3 created, 0 modified

## Accomplishments

- `server/src/policyScope.ts`: `withPolicyScope<T>(scope, fn, client = sql)`. It is imported by no handler or worker, so Phase 6 wires it.
- `server/tests/policy-scope-rls-spike.test.ts` commits RLS DDL onto db-test's real `public.thoughts` and runs every RLS-sensitive query as `ai_memory_rls_spike`, which is asserted non-superuser and non-BYPASSRLS. It then proves:
  - (b) runs first: a fresh connection (GUC asserted `NULL`) sees 0 rows.
  - (a) each of personal, corporate, and mixed sees exactly `{self, public}`, checked by scope and row id.
  - (c) public sees `{public}`.
  - (d) one reserved connection after `BEGIN`/`set_config`/`COMMIT` has its GUC asserted `''` (and `IS NOT NULL` true). An unscoped query on it sees 0 rows.
- Teardown runs in the mandated order, and its catalog proof (`pg_class`, `pg_policies`, `pg_roles`, seeded-row count) is the last statements of `finally`. It was verified on the fail path twice: the RED run and the mutation run.
- **Mutation check (not committed):** replacing the allow-list guard with `IS NOT NULL` made case (d) fail because the public row leaked, while case (b) still passed. This shows the allow-list guard is load-bearing and that fresh-connection tests alone would miss the hole.
- ADR-018 was written from what the spike proved, including what it did not prove: only the RLS arm, no real handler path, no INSERT/UPDATE/DELETE under the policy, and only sequential single-connection reuse.

## Task Commits

1. **Task 1: withPolicyScope() + RLS spike (TDD).** RED `68d0a16` (test, with a stub helper that skips `set_config`), GREEN `bea5f30` (feat). No refactor was needed.
2. **Task 2: ADR-018.** `f4022bd` (docs).

## Verification run

| Command | Result |
|---|---|
| RED: `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/policy-scope-rls-spike.test.ts` (stub helper) | FAILED as intended, exit 1: `case (a): personal visibility`, actual `[]`, expected `["personal","public"]`. Teardown assertions held on the fail path |
| RED evidence: `gsd-tools check tdd-red-evidence` on a record built from the `--reporter=tap` run | `INVALID_RED (zero_tests_discovered)`. The tool is a false negative here: its parser needs node:test's `# tests/# pass/# fail` summary lines, which Deno's TAP reporter does not emit. It did identify the target test as the failing test. See Deviations |
| GREEN: same command, run twice | ok, 1 passed / 0 failed (both runs) |
| Mutation (IS NOT NULL guard, throwaway file, deleted) | FAILED on `case (d): reused unscoped connection must see zero rows`, as expected |
| db-test catalog check via psql after RED, GREEN, mutation, and full suite | `f\|f`, 0 policies on thoughts, 0 spike roles, 0 seeded rows |
| Plan verification 3: `grep -rl "policyScope.ts" server/index.ts server/src/{entityWorker,consolidationWorker,embeddingBackfill}.ts` | no matches |
| Acceptance: `grep -nE "(^\|[^e])sql\.reserve\(\)"` on the spike | 0 matches |
| Task 2 verify greps | VERIFY_OK |
| `~/.dotnet/dotnet run --project tools/GovernanceAssetValidator -- validate .` | Validation succeeded |
| Plan verification 4, full suite `deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git tests/` | **552 passed, 9 failed.** These are the same 9 OpenRouter-401 tests as the 05-01 baseline (551 + the new spike). No RLS or permission errors |

## Decisions Made

- DECISION-01 is decided as RLS with an allow-list guard. It is proven on db-test and **not enabled in production** (see ADR-018).
- The `withPolicyScope()` signature uses `postgres.TransactionSql` and `postgres.Sql` from `import type postgres from "npm:postgres@3.4.4"`, not the plan's `Parameters<Parameters<typeof sql.begin>[0]>[0]`. `sql.begin` is overloaded (`begin(cb)` / `begin(options, cb)`), and `Parameters<>` of an overload set resolves against the last overload, whose first parameter is the options string.
- ADR number 018 was confirmed unclaimed across every local and remote-tracking ref, so no renumbering was needed.

## Deviations from Plan

**1. [Rule 3 - Blocking] The verify command's bare `docker compose --profile test up -d --wait` was not run**
- The plan's `<verify>` prefixes the test with an unscoped `up`, which also starts and migrates the dev `db`/`mcp` (05-01 hit exactly this). The orchestrator instructed that dev stay stopped, and `db-test`/`mcp-test` were already up, so only the `exec ... deno test` half was run.

**2. [Rule 2 - Correctness] The spike asserts more than the plan's text requires**
- It asserts the GUC value itself in (b) (`NULL`) and (d) (`''`, plus `IS NOT NULL` = true), so the two unscoped cases are distinct by observation. It also asserts `current_user` is the spike role in (b).
- It casts `ANY(${testIds}::uuid[])`, because postgres.js binds a `text[]`.
- Teardown deletes `consolidation_log` rows for the seeded ids before `DELETE FROM thoughts`. Seeding fires `trg_queue_consolidation`, and `consolidation_log` has no `ON DELETE CASCADE`. The plan's order (disable RLS before any delete) is preserved.
- It rolls back each held reserved connection before release, so a connection left mid-transaction cannot hold a lock that blocks `DROP POLICY`.
- Each teardown step is collected best-effort, so one failing step does not skip the rest. The catalog assertions still run last, and any teardown errors are then raised.

**3. [TDD] RED commit includes a stub `server/src/policyScope.ts`**
- Without the module, RED would fail on module-not-found, which is invalid RED under #3770. The stub has the final signature but omits `set_config`, so RED failed on the case (a) assertion. GREEN added the one line.

**4. [Tooling] The RED-evidence checker cannot parse Deno TAP**
- `check tdd-red-evidence` returned `INVALID_RED (zero_tests_discovered)` because it requires node:test summary comments. The raw run is unambiguous (`not ok 1 - <target test>` with an AssertionError, `1..1`, exit 1). The record is at the session scratchpad (`red-05-02.json`). I did not synthesize summary lines to satisfy the parser. The plan is `type: execute` with `tdd_mode: false`, so the plan-level TDD gate does not apply.

**Total deviations:** 4 (1 environment safety, 1 test-hardening, 2 TDD procedural). **Impact:** none on the delivered mechanism. They only strengthen the evidence.

## Issues Encountered

- The full suite still has the 9 pre-existing OpenRouter-401 failures (deferred-items.md, from 05-01). No new failures.
- WINDOWS.md ledger is absent in this project, so no ledger entries were written.

## Open items handed to Phase 6 (recorded in ADR-018)

- **Non-superuser runtime role (precondition).** `ai_memory` is a superuser, so enabling RLS as things stand is a silent no-op. Open: who introduces the role and when, and how migrations and the AGE extension load keep elevated rights.
- A per-command policy contract (INSERT/UPDATE/DELETE, `WITH CHECK`) and an authorized cross-scope context for background workers. Neither was tested by the spike.
- Concurrency limits are unverified: concurrent differing-scope traffic across the pool, reuse after several intervening queries, and reconnection after `idle_timeout`.
- ADR-018 is `status: proposed` and awaits PO acceptance.

## Threat Flags

None. The spike's role, grant, and RLS state exist only transiently on db-test and are proven torn down. No production surface was added.

## Next Phase Readiness

- Phase 5's plans are both complete. Phase 6 builds against ADR-018's predicate, its matrix, and `withPolicyScope()`, after resolving the non-superuser role precondition.

## Self-Check: PASSED

- FOUND: server/src/policyScope.ts, server/tests/policy-scope-rls-spike.test.ts, docs/design/adr/ADR-018-policy-scope-sql-enforcement-mechanism.md
- FOUND commits (each with `Story: ST-082` trailer, 0 Co-authored-by): 68d0a16, bea5f30, f4022bd

---
*Phase: 05-policy-scope-foundation*
*Completed: 2026-09-25*
