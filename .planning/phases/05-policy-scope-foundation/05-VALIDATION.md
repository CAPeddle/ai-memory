---
phase: 05
slug: policy-scope-foundation
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: true  # no separate Wave 0 in the final plan — see "Wave 0 Requirements" below
created: 2026-08-28
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno's built-in test runner (`Deno.test`), no separate test framework config file |
| **Config file** | none — test discovery is by file convention (`server/tests/*.test.ts`), run explicitly per CLAUDE.md's documented commands |
| **Quick run command** | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/<new-file>.test.ts` |
| **Full suite command** | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git tests/` |
| **Estimated runtime** | ~30-60 seconds (full suite, per CLAUDE.md test inventory) |

---

## Sampling Rate

- **After every task commit:** Run the quick-run command against the specific new/changed test file
- **After every plan wave:** Run the full suite — this phase touches shared migration infrastructure (`migrate.ts`, `migrations.test.ts`) that other suites depend on, so a full-suite run before merge is not optional
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Task IDs below reflect PLAN.md's final task numbering (set at planning time, post plan-phase): the
migration-lockstep cluster is 05-01 Task 1 (the phase's tracer), the vocabulary module is 05-01 Task
2, and the insert-site fix is 05-01 Task 3 — not the provisional 05-01-01..04 numbering this table
originally carried. There is no separate Wave 0 in the final plan: each test file is created directly
by the task that needs it (Nyquist is satisfied per-task, not via a pre-stubbing wave), so "File
Exists" reads "❌ created by this task" rather than "❌ W0".

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01 Task 1 | 01 | 1 | POLICY-01, POLICY-02 | Default-allow gap | `thoughts.policy_scope` `CHECK`/`NOT NULL` reject out-of-vocabulary/missing values at the DB layer; migration backfills every pre-existing NULL row to `corporate` (D-02) | integration | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/policy-scope-migration.test.ts tests/migrations.test.ts` | ❌ created by this task | ⬜ pending |
| 05-01 Task 2 | 01 | 1 | POLICY-01 | Default-allow gap / Validation | `shared/policyScope.ts` accepts exactly the four closed values (`personal`/`corporate`/`mixed`/`public`) and rejects everything else | unit | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/policy-scope-vocabulary.test.ts` | ❌ created by this task | ⬜ pending |
| 05-01 Task 3 | 01 | 1 | POLICY-02 | Default-allow gap | `capture_thought`/`consolidationWorker` inserts (as updated) succeed with the D-05 interim value / carried-forward scope | integration | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/policy-scope-migration.test.ts` (extended) | ✅ (extends Task 1's file) | ⬜ pending |
| 05-01 Task 1/3 (regression) | 01 | 1 | POLICY-02 | Regression | Migration framework's version-list assertions (`server/tests/migrations.test.ts` lines 27, 41, 100, 107) include `7`/`"007_policy_scope.sql"` | regression | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/migrations.test.ts` | ✅ (extend existing) | ⬜ pending |
| 05-02 Task 1 | 02 | 2 | DECISION-01 | Session-variable leakage / RLS bypass / Fail-open predicate | Spike proves the D-03/D-06 visibility matrix (each scope sees `{itself, public}`), the fresh-connection absent-GUC fail-closed case, and the reused-connection empty-string fail-closed case (allow-list guard, not `IS NOT NULL` alone) | integration (`db-test`, committed-and-torn-down) | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/policy-scope-rls-spike.test.ts` | ❌ created by this task | ⬜ pending |
| 05-02 Task 2 | 02 | 2 | DECISION-01 | Documentation completeness (SC #2) | ADR-018 states the chosen mechanism, D-01 trust boundary, D-03/D-06 visibility matrix, and the "not yet enabled in production" caveat | doc-structure check | `test -f docs/design/adr/ADR-018-policy-scope-sql-enforcement-mechanism.md` plus heading/content greps (see PLAN.md Task 2 `<verify>`) | ❌ created by this task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — the final plan (see 05-01-PLAN.md / 05-02-PLAN.md) does not use a separate Wave 0
stub-creation step. Each test file is created directly, in full, by the task that needs it (Nyquist
is satisfied per-task):

- `server/tests/policy-scope-vocabulary.test.ts` — created by 05-01 Task 2 (POLICY-01, closed-vocabulary validation)
- `server/tests/policy-scope-migration.test.ts` — created by 05-01 Task 1, extended by Task 3 (POLICY-01/POLICY-02: column, CHECK, backfill, updated INSERT sites), styled on the existing migration-006 test pattern (`server/tests/migrations.test.ts:120-237`)
- `server/tests/policy-scope-rls-spike.test.ts` — created by 05-02 Task 1 (DECISION-01's technical spike); uses the commit-and-teardown design, not in-transaction-rollback

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
