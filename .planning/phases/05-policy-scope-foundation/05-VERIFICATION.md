---
phase: 05-policy-scope-foundation
verified: 2026-09-26T00:15:00Z
status: human_needed
score: 12/13 must-haves verified
covered_files:
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/05-policy-scope-foundation/05-01-PLAN.md"
  - ".planning/phases/05-policy-scope-foundation/05-01-SUMMARY.md"
  - ".planning/phases/05-policy-scope-foundation/05-02-PLAN.md"
  - ".planning/phases/05-policy-scope-foundation/05-02-SUMMARY.md"
  - "docker-compose.yml"
  - "docs/design/adr/ADR-018-policy-scope-sql-enforcement-mechanism.md"
  - "server/db/007_policy_scope.sql"
  - "server/db/schema.sql"
  - "server/index.ts"
  - "server/src/consolidationWorker.ts"
  - "server/src/migrate.ts"
  - "server/src/policyScope.ts"
  - "server/tests/consolidation-worker-observability.test.ts"
  - "server/tests/e2e.test.ts"
  - "server/tests/embedding-backfill.test.ts"
  - "server/tests/entity-worker-observability.test.ts"
  - "server/tests/fixtures/build-search-quality-corpus.ts"
  - "server/tests/fixtures/search-quality-corpus.sql"
  - "server/tests/migrations.test.ts"
  - "server/tests/policy-scope-migration.test.ts"
  - "server/tests/policy-scope-rls-spike.test.ts"
  - "server/tests/policy-scope-vocabulary.test.ts"
  - "server/tests/worker-observability-e2e.test.ts"
  - "shared/policyScope.ts"
covered_digest: "v1:sha256:fc829ac3dc191e5db5ed282320d288a6bedbf0f0dbd986a66d96e6126b75a4d2"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "A written threat-model/trust-boundary statement documents the chosen primary SQL enforcement mechanism, validated by a technical spike against one real query path"
    reason: "Spike exercises the real public.thoughts table and real postgres.js pool checkout via withPolicyScope(); handler-level integration deferred to Phase 6 wiring, as recorded in ADR-018 'What the spike did NOT prove'"
    accepted_by: "CAPeddle"
    accepted_at: "2026-11-02T21:07:18Z"
human_verification:
  - test: "Confirm that ROADMAP SC #2's 'validated by a technical spike against one real query path' is satisfied by a spike that runs raw SELECTs through withPolicyScope() against the real db-test public.thoughts table and the real postgres.js pool, but NOT through list_thoughts or any other MCP tool handler."
    expected: "The PO either accepts this reading (and records the override below) or requires a list_thoughts-routed spike case before Phase 6 starts."
    why_human: "D-04 in 05-CONTEXT.md names list_thoughts as the spike target. The 05-02 plan review logged the departure as an unresolved P2 finding, and ADR-018 says outright that no real retrieval path was exercised. Whether 'real query path' means 'real table and pool' or 'a real tool handler' is a scope interpretation, not something code can settle."
  - test: "Prohibition review (05-01, judgment tier): the interim policy_scope value at capture_thought and promote must not be implemented as a table-level DEFAULT."
    expected: "Reviewer confirms. LLM-judge verdict (non-authoritative): HELD. information_schema.columns.column_default is empty for thoughts.policy_scope on db-test; schema.sql and 007 contain no DEFAULT clause; capture_thought writes the literal 'corporate' per statement; promote selects the source row's policy_scope."
    why_human: "unverified-prohibition, human review recommended. Judgment-tier prohibition; autonomous verify may not mark it passed."
  - test: "Prohibition review (05-02, judgment tier): the chosen mechanism must not be considered documented merely because the spike passes; ADR-018 must be an independent deliverable."
    expected: "Reviewer confirms. LLM-judge verdict (non-authoritative): HELD. docs/design/adr/ADR-018-policy-scope-sql-enforcement-mechanism.md exists as a separate 156-line document with Decision, matrix, trust boundary, threat table, non-goals and consequences, and it passes GovernanceAssetValidator validate."
    why_human: "unverified-prohibition, human review recommended."
  - test: "Prohibition review (05-02, judgment tier): ADR-018 must not describe the mechanism as already enforced or live on public.thoughts."
    expected: "Reviewer confirms. LLM-judge verdict (non-authoritative): HELD. The ADR status line, Decision section and Non-Goals all say 'not yet enabled' on production and name Phase 6 as the phase that wires and enables it; no shipped migration or source file contains ENABLE/FORCE ROW LEVEL SECURITY or CREATE POLICY."
    why_human: "unverified-prohibition, human review recommended."
  - test: "Before 007 deploys to any non-dev database, run the read-only pre-migration count (total, personal_tagged, work_tagged) from 05-01-PLAN Task 1 against it."
    expected: "Counts are recorded. If personal_tagged > 0, the PO knowingly accepts that those rows become policy_scope=corporate per D-02 (or reopens D-02)."
    why_human: "05-01-SUMMARY records the check ran only against the empty dev db (0/0/0) and 'has not been run against production'. runMigrations() applies 007 at server boot, so nothing in code forces this check (see review WR-03). Only an operator with production access can run it."
  - test: "Decide whether ADR-018 stays status 'proposed' or moves to 'accepted' now that the phase goal says the mechanism is 'chosen'."
    expected: "PO sets the ADR status deliberately; either value is fine if intended."
    why_human: "The ADR frontmatter says status: proposed. That is consistent with 'proven but not enabled', but the phase goal and DECISION-01 describe the mechanism as chosen. This is a governance call."
---

# Phase 5: Policy-Scope Foundation Verification Report

**Phase Goal:** A closed-vocabulary policy-scope field exists on every thought with no default-allow gap, and the primary SQL enforcement mechanism for every later phase is chosen and documented.
**Verified:** 2026-09-26T00:15:00Z
**Status:** human_needed
**Re-verification:** No. This is the initial verification.

The code delivers the goal. Every item routed to human review is an interpretation question, a governance decision, or an operational precondition. None of them is a missing implementation.

## Goal Achievement

### Observable Truths

ROADMAP success criteria (the contract) come first, followed by PLAN must-haves that add detail. PLAN truths that restate an SC are folded into it.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Every thought (new and pre-existing) carries a non-null `policy_scope` from the closed vocabulary, with no default-allow gap during or after migration | ✓ VERIFIED | Live db-test: 37 rows, 0 NULL, 0 out-of-vocabulary. `is_nullable = NO`, `column_default` empty. `thoughts_policy_scope_check` = `CHECK (policy_scope = ANY (ARRAY['personal','corporate','mixed','public']))` on `thoughts`. `migrate.ts:51` wraps each migration file in `sql.begin()`, so ADD COLUMN, backfill and SET NOT NULL commit atomically. `policy-scope-migration.test.ts` test 1 (backfill→corporate, 23514 on 'bogus', 23502 on omitted) PASSED on this run. |
| SC2 | A written threat-model/trust-boundary statement documents the chosen mechanism, validated by a technical spike against one real query path | ? UNCERTAIN (WARNING, human decision) | ADR-018 states Decision = RLS keyed on `app.policy_scope` with an allow-list guard, gives the D-01 trust boundary, and includes a STRIDE threat table. `policy-scope-rls-spike.test.ts` PASSED on this run, against the real `public.thoughts` table and the real pool, as a non-superuser role. **Caveat:** the spike does not route through `list_thoughts` (the D-04 target); see Human Verification #1. The threat table also overstates one row; see WR-02 below. |
| SC3 | A cross-scope visibility matrix specifies what each scope may see | ✓ VERIFIED | ADR-018 § Cross-Scope Visibility Matrix: personal→{personal,public}, corporate→{corporate,public}, mixed→{mixed,public} (explicitly not a union), public→{public}, absent/NULL/''/other→nothing. It matches D-03/D-06 and is asserted row by row in spike cases (a)–(d). |
| P1-2 | Out-of-vocabulary insert fails with a CHECK violation | ✓ VERIFIED | Named test asserts SQLSTATE 23514 inside a savepoint. PASSED. |
| P1-3 | Insert omitting policy_scope fails with NOT NULL; no table DEFAULT | ✓ VERIFIED | Asserts 23502. PASSED. `column_default` is empty on db-test. |
| P1-4 | capture_thought supplies 'corporate'; promote carries the source scope forward | ✓ VERIFIED | `server/index.ts:545` writes the literal `'corporate'`, and `policy_scope` is absent from the `ON CONFLICT DO UPDATE SET` list. `consolidationWorker.ts:124-127` selects `policy_scope` from the source row. The promote test (personal in, personal out, via the real exported `promote()`) PASSED. Single e2e `capture_thought stores context tags and merges duplicate captures by union` PASSED over HTTP against the running mcp-test, whose `/app` mount is this checkout. That insert would raise 23502 if the running code omitted the column. |
| P1-5 | Every INSERT INTO thoughts in server/ supplies policy_scope; seed uses ON_ERROR_STOP | ✓ VERIFIED | Independent grep across `server/`, `docker/`, `shared/`. The only two sites without `policy_scope` nearby are `policy-scope-migration.test.ts:68`, the deliberate NOT NULL negative case, and `workflow-boundary.test.ts:333`, a string literal fed to a regex scanner rather than a query. The corpus has 33 INSERTs and 33 `policy_scope` occurrences. `docker-compose.yml` seed now uses `-v ON_ERROR_STOP=1` for corpus.sql. |
| P1-6 | Fresh schema.sql build and migrated db converge; the migrate.ts v7 branch and all four migrations.test.ts version lists move together | ✓ VERIFIED | schema.sql declares the identical inline NOT NULL + CHECK, which Postgres auto-names `thoughts_policy_scope_check` (confirmed in pg_constraint). All four arrays include 7. `migrations.test.ts` 6/6 PASSED. db-test `schema_migrations` lists v1–v7. |
| P1-7 | shared/policyScope.ts exports POLICY_SCOPES, PolicyScope, isPolicyScope, PolicyScopeSchema; no new dependency | ✓ VERIFIED | File read. It is imported by `server/src/policyScope.ts` and by the tests via `../../shared/policyScope.ts`, and mcp-test mounts `/shared`. `policy-scope-vocabulary.test.ts` 3/3 PASSED (4 accepts, 6 near-miss rejects, guard and Zod agree). |
| P1-bootstrap | detectBootstrapVersions marks v7 only on the full NOT NULL + CHECK shape | ✓ VERIFIED | `migrate.ts:198-215`. The bootstrap test (no column → not marked, bare column → not marked, full shape → marked) PASSED. Name-only match caveat: WR-01. |
| P2-1 | withPolicyScope() uses set_config(...,true) inside begin() and is not called from production | ✓ VERIFIED | `server/src/policyScope.ts` read. `grep withPolicyScope\|policyScope.ts` over `server/index.ts` and `server/src/` returns no importers besides the file itself. |
| P2-2/3 | The spike proves the matrix as a non-superuser role, fails closed on fresh and reused connections, and tears itself down, with the teardown proven in catalogs | ✓ VERIFIED | Spike 1/1 PASSED on this run. Afterwards I ran independent psql checks on db-test: `relrowsecurity=f`, `relforcerowsecurity=f`, 0 rows in pg_policies for thoughts, 0 `ai_memory_rls_spike` roles. |
| P2-5 | Production public.thoughts has RLS disabled throughout this phase | ✓ VERIFIED (codebase half) | `grep -rniE "ROW LEVEL SECURITY\|CREATE POLICY" server/db server/src server/index.ts` returns nothing. The only RLS DDL is inside the spike test, which is gated by `requireTestDatabase()`. No production DB was reachable, and the dev `db` container is down, so live production state was not queried. Nothing this phase ships can enable RLS. |

**Score:** 12/13 truths verified, 1 UNCERTAIN (SC2, spike-realism clause), 0 present-but-behavior-unverified. Every behavior-dependent truth (backfill, constraint rejection, promote carry-forward, RLS matrix, reused-connection fail-closed, teardown) has a named test that I ran and saw pass in this session.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `shared/policyScope.ts` | Closed vocabulary module | ✓ VERIFIED | 18 lines, all four exports, imported |
| `server/db/007_policy_scope.sql` | Add / backfill / NOT NULL / guarded CHECK, no DEFAULT | ✓ VERIFIED | Order matches the plan. The guard is required for re-apply on a schema.sql-built db |
| `server/db/schema.sql` | Inline column | ✓ VERIFIED | Identical shape |
| `server/src/migrate.ts` | v7 bootstrap branch | ✓ VERIFIED | Wired into `detectBootstrapVersions()` |
| `server/tests/migrations.test.ts` | Four version lists extended | ✓ VERIFIED | 6/6 pass |
| `server/tests/policy-scope-vocabulary.test.ts` | Vocabulary tests | ✓ VERIFIED | 3/3 pass |
| `server/tests/policy-scope-migration.test.ts` | Migration, bootstrap and promote tests | ✓ VERIFIED | 3/3 pass |
| `server/index.ts` | capture supplies scope | ✓ VERIFIED | e2e capture test passes |
| `server/src/consolidationWorker.ts` | promote carries scope | ✓ VERIFIED | Exported for test; carry-forward proven |
| Test/fixture INSERT edits (5 test files + corpus builder + regenerated corpus) | Supply policy_scope | ✓ VERIFIED | Grep inventory above |
| `docker-compose.yml` | Seed ON_ERROR_STOP | ✓ VERIFIED | Diff read |
| `server/src/policyScope.ts` | withPolicyScope helper | ✓ VERIFIED | Unwired by design; exercised by the spike |
| `server/tests/policy-scope-rls-spike.test.ts` | Empirical spike | ✓ VERIFIED | 1/1 pass, self-cleaning |
| `docs/design/adr/ADR-018-policy-scope-sql-enforcement-mechanism.md` | Mechanism, trust boundary, matrix, not-enabled caveat | ✓ VERIFIED | Present. `GovernanceAssetValidator validate .` → "Validation succeeded." |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/src/policyScope.ts` | `shared/policyScope.ts` | `import type { PolicyScope }` | WIRED | Compiles and runs under the spike |
| `007_policy_scope.sql` | `schema.sql` | constraint name `thoughts_policy_scope_check` | WIRED | Confirmed in pg_constraint on a schema.sql-built db-test. Name-only lookup: WR-01 |
| `migrate.ts` v7 branch | `migrations.test.ts` | version arrays | WIRED | All four arrays include 7; tests pass |
| capture `ON CONFLICT DO UPDATE SET` | policy_scope excluded | SET list | WIRED | 0 references to policy_scope in the SET list. The conflict *key* is not scope-aware: WR-02 |
| ADR-018 Decision | Spike result | Mechanism named matches what was proven | WIRED | The ADR quotes the exact policy SQL and helper the test uses |
| ADR-018 matrix | D-03/D-06 | verbatim | WIRED | Matches |

### Data-Flow Trace (Level 4)

Not applicable. The phase renders no dynamic data. The only runtime data path is the write of `policy_scope`. At capture it is the literal `'corporate'`; at promote it comes from the source row via `SELECT ... policy_scope FROM thoughts`. Both are traced above and proven by tests.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Vocabulary | `deno test ... tests/policy-scope-vocabulary.test.ts` (in mcp-test) | 3 passed, 0 failed | ✓ PASS |
| Migration 007, bootstrap, promote carry-forward | `... tests/policy-scope-migration.test.ts` | 3 passed, 0 failed | ✓ PASS |
| RLS spike | `... tests/policy-scope-rls-spike.test.ts` | 1 passed, 0 failed | ✓ PASS |
| Migration framework | `... tests/migrations.test.ts` | 6 passed, 0 failed | ✓ PASS |
| capture_thought over HTTP post-migration | `... tests/e2e.test.ts --filter "capture_thought stores context tags"` | 1 passed, 17 filtered | ✓ PASS |
| db-test column and constraint state | psql on db-test | 0 NULL, 0 OOV, NOT NULL, no default, CHECK present, v7 recorded, RLS f/f, 0 policies, 0 spike roles | ✓ PASS |
| Mount sanity | `docker inspect` mcp-test | `/home/cpeddle/projects/ai-memory/server -> /app`, `.../shared -> /shared`, single worktree | ✓ PASS |

I did not run the full suite. The 9 OpenRouter-401 failures recorded in `deferred-items.md` are pre-existing and environmental: the caller reproduced them on base `0769548`. They are excluded from scoring.

### Probe Execution

Step 7c: SKIPPED. The phase declares no probes, and no `scripts/*/tests/probe-*.sh` exist.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| POLICY-01 | 05-01 | Closed-vocabulary `policy_scope` on thoughts, distinct from tags | ✓ SATISFIED | Column, CHECK and module verified. The tags column is untouched |
| POLICY-02 | 05-01 | Backfill with no default-allow gap during transition | ✓ SATISFIED | Transactional migration, backfill test, 0 NULL rows on db-test |
| DECISION-01 | 05-02 | Mechanism chosen via spike, with threat model and visibility matrix | ? NEEDS HUMAN (spike-realism clause; see human item 1, and WR-02 on threat-table accuracy) | ADR-018 plus the passing spike |

No orphaned requirements: REQUIREMENTS.md maps exactly POLICY-01, POLICY-02 and DECISION-01 to Phase 5, and each is claimed by a plan.

### Anti-Patterns Found

Debt-marker scan: `grep -nE "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` over every non-planning file changed in `main..HEAD` found **no matches** in any file (xargs exit 123 = grep returned 1 for every file). No stub patterns.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `docs/design/adr/ADR-018-...md` | threat table, `ON CONFLICT` row | Overstated "mitigate (done, 05-01)" (review WR-02) | ⚠️ Warning | Only the SET list is scope-safe. `UNIQUE (content_fingerprint)` is global, so identical content captured in two scopes merges into one row (cross-scope tag/active mutation without RLS; an existence oracle under RLS). Latent while every capture writes 'corporate'. **Recommend amending the row to "partial: conflict key not scope-aware; Phase 6/CAPTURE-01 decision".** No later phase's success criteria name this explicitly, so it is not deferred. |
| `server/db/007_policy_scope.sql` / `server/src/migrate.ts` | 31-37 / 206-208 | Constraint lookup by `conname` only, not scoped to `conrelid` or checked against its body (WR-01) | ⚠️ Warning | A same-named constraint on another `thoughts` table, or one with a weaker body, would skip the real CHECK and still record v7. Not reachable in the current repo's databases. |
| `server/db/007_policy_scope.sql` | 19 | Irreversible corporate backfill emits no in-band count of personal-tagged rows (WR-03) | ⚠️ Warning | Backs Human Verification #5 |
| `server/src/policyScope.ts` | 31-34 | `as T` cast; no runtime `isPolicyScope` check (IN-01, IN-02) | ℹ️ Info | Fails closed under the allow-list; tidy up in Phase 6 |
| `server/index.ts` | 545 | Interim `'corporate'` is a bare SQL literal (IN-03) | ℹ️ Info | Easy to miss when CAPTURE-01 lands |
| various | n/a | IN-04..IN-09 (vocabulary duplicated without a tie test, spike concurrency on shared db-test, helper's own commit/rollback revert path unexercised) | ℹ️ Info | Test hygiene. IN-09 is a Phase 6 test obligation |

### Prohibitions

All three prohibitions are string-form `[flagged-unverified]` with no `verification:` tier, so they are treated as judgment tier. Each has a non-authoritative LLM-judge verdict of HELD and carries **unverified-prohibition, human review recommended** (Human Verification #2–#4). None is silently counted as passed.

### Human Verification Required

1. **SC #2 "one real query path" reading.** The spike used the real table, the real pool and the real helper, as a non-superuser role, but not `list_thoughts` (the D-04 target). Accept the reading or require a handler-routed case. If you accept it, add this to the frontmatter:

   ```yaml
   overrides:
     - must_have: "A written threat-model/trust-boundary statement documents the chosen primary SQL enforcement mechanism, validated by a technical spike against one real query path"
       reason: "Spike exercises the real public.thoughts table and real postgres.js pool checkout via withPolicyScope(); handler-level integration deferred to Phase 6 wiring, as recorded in ADR-018 'What the spike did NOT prove'"
       accepted_by: "{name}"
       accepted_at: "{ISO timestamp}"
   ```
2. **Prohibition (05-01): no table DEFAULT.** Judge verdict: HELD.
3. **Prohibition (05-02): the ADR is an independent deliverable.** Judge verdict: HELD.
4. **Prohibition (05-02): the ADR does not claim live enforcement.** Judge verdict: HELD.
5. **Production pre-migration count** before 007 deploys anywhere real. The only run so far was against the empty dev db.
6. **ADR-018 status** `proposed` vs `accepted`.

### Gaps Summary

There are no blocking gaps. The column, its no-default NOT NULL + CHECK guarantees, the transactional backfill, every write site, the bootstrap/migration lockstep, the unwired `withPolicyScope()` helper, the self-cleaning RLS spike and ADR-018 all exist, are wired, and have tests that I ran and saw pass in this session. Independent catalog queries on db-test confirm the state.

Two things keep the status at `human_needed` rather than `passed`. First, the judgment-tier prohibitions, which autonomous verification may not self-certify. Second, three decisions only the PO or an operator can make: the SC #2 interpretation, ADR status, and the production pre-deploy count. Separately, I recommend correcting ADR-018's `ON CONFLICT` threat row (WR-02) before Phase 6 plans against it, since that row is the one factual inaccuracy in the phase's documented threat model.

---

_Verified: 2026-09-26T00:15:00Z_
_Verifier: Claude (gsd-verifier)_
