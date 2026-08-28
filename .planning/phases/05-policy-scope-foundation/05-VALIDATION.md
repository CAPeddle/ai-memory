---
phase: 05
slug: policy-scope-foundation
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 0 | POLICY-01 | Default-allow gap / Validation | `shared/policyScope.ts` accepts exactly the four closed values (`personal`/`corporate`/`mixed`/`public`) and rejects everything else | unit | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/policy-scope-vocabulary.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | POLICY-01 | Default-allow gap | `thoughts.policy_scope` `CHECK` constraint rejects an out-of-vocabulary value at the DB layer | integration | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/policy-scope-migration.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | POLICY-02 | Default-allow gap | Migration backfills every pre-existing NULL row to `corporate` (D-02); post-migration `INSERT` without `policy_scope` fails; `capture_thought`/`consolidationWorker` inserts (as updated) succeed with the D-05 interim value | integration | same file as above | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | POLICY-02 | Regression | Migration framework's version-list assertions (`server/tests/migrations.test.ts:27-35`) include `7`/`"007_policy_scope.sql"` | regression | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/migrations.test.ts` | ✅ (extend existing) | ⬜ pending |
| 05-02-01 | 02 | 2 | DECISION-01 | Session-variable leakage / RLS bypass / Fail-open predicate | Spike proves the D-03/D-06 visibility matrix (each scope sees `{itself, public}`), the fresh-connection absent-GUC fail-closed case, and the reused-connection empty-string fail-closed case (allow-list guard, not `IS NOT NULL` alone) | integration (`db-test`, committed-and-torn-down) | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/policy-scope-rls-spike.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/tests/policy-scope-vocabulary.test.ts` — stubs for POLICY-01 (closed-vocabulary validation)
- [ ] `server/tests/policy-scope-migration.test.ts` — stubs for POLICY-01/POLICY-02 (column, CHECK, backfill, updated INSERT sites), styled on the existing migration-006 test pattern (`server/tests/migrations.test.ts:120-194`)
- [ ] `server/tests/policy-scope-rls-spike.test.ts` — stubs for DECISION-01's technical spike; must use the commit-and-teardown design, not in-transaction-rollback

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
