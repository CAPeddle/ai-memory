---
phase: 05-policy-scope-foundation
verified: 2026-11-03T21:35:47Z
status: passed
score: 13/13 must-haves verified
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
covered_digest: "v4:sha256:632bf6edd17ff29e0df7725a37059fe9a404438d1a27e54d7832beed229b48d1"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "A written threat-model/trust-boundary statement documents the chosen primary SQL enforcement mechanism, validated by a technical spike against one real query path"
    reason: "Spike exercises the real public.thoughts table and real postgres.js pool checkout via withPolicyScope(); handler-level integration deferred to Phase 6 wiring, as recorded in ADR-018 'What the spike did NOT prove'"
    accepted_by: "CAPeddle"
    accepted_at: "2026-11-02T21:07:18Z"
re_verification:
  previous_status: human_needed
  previous_score: 12/13
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 5: Policy-Scope Foundation Verification Report

**Phase Goal:** A closed-vocabulary policy-scope field exists on every thought with no default-allow gap, and the primary SQL enforcement mechanism for every later phase is chosen and documented.
**Verified:** 2026-11-03T21:35:47Z (HEAD `f786fca`)
**Status:** passed
**Re-verification:** Yes. This regenerates the report after UAT closed and ADR-018 was accepted. The prior report (written at `4bd7099`, `human_needed`, 12/13) had no `gaps:` section, so there were no gaps to close. Six human items were routed to UAT, and all six now pass.

## Evidence Basis (read this first)

This session could not run the test stack. The clone has no `.env`, Docker is not running, and the caller told me not to create the one or start the other. Test evidence for the behavior-dependent truths is therefore **inherited** from the prior verifier's run. That inheritance holds because I confirmed the code under test is unchanged:

- `git diff --stat 4bd7099..HEAD` over the **entire tracked tree** touches exactly six files. Five are planning documents (`05-COVERAGE.md`, `05-HANDOFF.md`, `05-SECURITY.md`, `05-UAT.md`, `05-VERIFICATION.md`). The sixth is `docs/design/adr/ADR-018-policy-scope-sql-enforcement-mechanism.md` (+4/-3, commit `2989d72`). Every other file in the repository is byte-identical to the tree the prior verifier tested, including every file under `server/`, `shared/`, `docker/`, `docker-compose.yml`, `deno.lock`, `server/src/db.ts` and the test helpers. That covers more than the 25 covered files.
- So the prior run's results (vocabulary 3/3, migration 3/3, rls-spike 1/1, migrations 6/6, e2e capture 1/1, plus the db-test catalog checks) apply unchanged to this tree. Below, those rows are marked "inherited", not re-run.
- The only changed file is documentation. I checked it fresh against the current text. See SC2, the Prohibitions section, and the Anti-Patterns section.

## Goal Achievement

### Observable Truths

ROADMAP success criteria (the contract) come first. PLAN must-haves that add detail follow. PLAN truths that restate an SC are folded into that SC.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Every thought (new and pre-existing) carries a non-null `policy_scope` from the closed vocabulary, with no default-allow gap during or after migration | ✓ VERIFIED | Re-read this session: `007_policy_scope.sql` runs ADD COLUMN, then backfill to `'corporate'`, then SET NOT NULL, then a guarded CHECK, with no DEFAULT. `schema.sql:35-36` declares the identical inline `NOT NULL CHECK (...)`, also with no DEFAULT. `migrate.ts` applies each file inside `sql.begin()`. Behavior evidence is inherited (identical tree): `policy-scope-migration.test.ts` test 1 (backfill to corporate, 23514 on `'bogus'`, 23502 when the column is omitted) passed. The prior run's db-test check found 37 rows, 0 NULL and 0 out-of-vocabulary. |
| SC2 | A written threat-model/trust-boundary statement documents the chosen mechanism, validated by a technical spike against one real query path | ✓ PASSED (override) | Override: Spike exercises the real public.thoughts table and real postgres.js pool checkout via withPolicyScope(); handler-level integration deferred to Phase 6 wiring, as recorded in ADR-018 'What the spike did NOT prove'. Accepted by CAPeddle on 2026-11-02T21:07:18Z. Corroborated by 05-UAT.md test 1 (pass). Checked this session against current text: ADR-018 names RLS keyed on `app.policy_scope` with an allow-list guard, gives the trust boundary, and has a STRIDE table. Line 94 still says plainly that no real retrieval path was exercised. Spike 1/1 pass is inherited. |
| SC3 | A cross-scope visibility matrix specifies what each scope may see | ✓ VERIFIED | The ADR-018 matrix (personal→{personal,public}, corporate→{corporate,public}, mixed→{mixed,public}, public→{public}, absent/''/other→nothing) is unchanged by `2989d72`, which touched only the frontmatter, the Status line and the threat table. Spike cases (a)–(d) assert it row by row (inherited pass). |
| P1-2 | Out-of-vocabulary insert fails with a CHECK violation | ✓ VERIFIED | Named test asserts SQLSTATE 23514 (inherited pass). The CHECK body is visible in both 007 and schema.sql. |
| P1-3 | Insert omitting policy_scope fails with NOT NULL; no table DEFAULT | ✓ VERIFIED | Asserts 23502 (inherited pass). `grep` finds no DEFAULT on the column in 007 or schema.sql. |
| P1-4 | capture_thought supplies 'corporate'; promote carries the source scope forward | ✓ VERIFIED | Re-read this session: `server/index.ts:533,545` writes the literal `'corporate'`, and the `ON CONFLICT (content_fingerprint) DO UPDATE SET` list (`:549-560`) does not include `policy_scope`. `consolidationWorker.ts:124,127` selects and inserts the source row's `policy_scope`. The promote carry-forward test and the e2e capture test passed in the prior run (inherited). |
| P1-5 | Every INSERT INTO thoughts in server/ supplies policy_scope; seed uses ON_ERROR_STOP | ✓ VERIFIED | The prior verifier's grep inventory is unchanged because the tree is identical. `docker-compose.yml:114` runs both seed loads with `-v ON_ERROR_STOP=1` (re-read this session). |
| P1-6 | Fresh schema.sql build and migrated db converge; the migrate.ts v7 branch and all four migrations.test.ts version lists move together | ✓ VERIFIED | Re-read this session: `migrations.test.ts:27,42,101,108` all include 7. `migrate.ts:198-215` contains the v7 bootstrap branch. `migrations.test.ts` 6/6 passed (inherited). |
| P1-7 | shared/policyScope.ts exports POLICY_SCOPES, PolicyScope, isPolicyScope, PolicyScopeSchema; no new dependency | ✓ VERIFIED | Re-read this session: all four exports are present, and the only import is `zod`, which is already pinned. Vocabulary tests 3/3 passed (inherited). |
| P1-bootstrap | detectBootstrapVersions marks v7 only on the full NOT NULL + CHECK shape | ✓ VERIFIED | `migrate.ts:198-215`. The bootstrap test passed (inherited). The name-only match caveat remains (WR-01, Warning). |
| P2-1 | withPolicyScope() uses set_config(...,true) inside begin() and is not called from production | ✓ VERIFIED | Re-read this session: `server/src/policyScope.ts` calls `client.begin(...)` and then `set_config('app.policy_scope', ${scope}, true)`. Running `grep withPolicyScope\|policyScope.ts` over `server/index.ts` and `server/src/`, excluding the file itself, matched nothing (exit 1). |
| P2-2/3 | The spike proves the matrix as a non-superuser role, fails closed on fresh and reused connections, and tears itself down, with the teardown proven in catalogs | ✓ VERIFIED | Spike 1/1 passed, and the prior verifier's independent catalog checks on db-test found `relrowsecurity=f`, `relforcerowsecurity=f`, 0 pg_policies rows and 0 spike roles. Both are inherited; the test file is byte-identical. |
| P2-5 | Production public.thoughts has RLS disabled throughout this phase | ✓ VERIFIED (codebase half) | Re-run this session: `grep -rniE "ROW LEVEL SECURITY\|CREATE POLICY" server/db server/src server/index.ts` matched nothing (exit 1). Nothing this phase ships can enable RLS. I could not query live production state, which is the same caveat as the prior report. |

**Score:** 13/13 truths verified (1 via the PASSED (override) on SC2). 0 are present-but-behavior-unverified. Every behavior-dependent truth has a named passing test from the prior run on a byte-identical tree.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `shared/policyScope.ts` | Closed vocabulary module | ✓ VERIFIED | 18 lines, all four exports present, imported by `server/src/policyScope.ts` |
| `server/db/007_policy_scope.sql` | Add / backfill / NOT NULL / guarded CHECK, no DEFAULT | ✓ VERIFIED | Re-read; steps run in the planned order |
| `server/db/schema.sql` | Inline column | ✓ VERIFIED | Lines 33-36, same shape as 007 |
| `server/src/migrate.ts` | v7 bootstrap branch | ✓ VERIFIED | Lines 198-215 |
| `server/tests/migrations.test.ts` | Four version lists extended | ✓ VERIFIED | Lines 27, 42, 101, 108 |
| `server/tests/policy-scope-vocabulary.test.ts` | Vocabulary tests | ✓ VERIFIED | Unchanged; 3/3 (inherited) |
| `server/tests/policy-scope-migration.test.ts` | Migration, bootstrap and promote tests | ✓ VERIFIED | Unchanged; 3/3 (inherited) |
| `server/index.ts` | capture supplies scope | ✓ VERIFIED | Lines 533 and 545 |
| `server/src/consolidationWorker.ts` | promote carries scope | ✓ VERIFIED | Lines 124 and 127 |
| Test/fixture INSERT edits | Supply policy_scope | ✓ VERIFIED | Unchanged since the prior inventory |
| `docker-compose.yml` | Seed ON_ERROR_STOP | ✓ VERIFIED | Line 114 |
| `server/src/policyScope.ts` | withPolicyScope helper | ✓ VERIFIED | Unwired by design; the spike exercises it |
| `server/tests/policy-scope-rls-spike.test.ts` | Empirical spike | ✓ VERIFIED | Unchanged; 1/1 (inherited), cleans up after itself |
| `docs/design/adr/ADR-018-policy-scope-sql-enforcement-mechanism.md` | Mechanism, trust boundary, matrix, not-enabled caveat | ✓ VERIFIED | Changed in `2989d72`; re-checked this session (157 lines). `status: "accepted"` is a value 7 other ADRs already use. The validator (`CatalogValidationEngine.cs`) requires `status` to be present but does not restrict its value. I did not re-run `GovernanceAssetValidator validate` because building it would write `bin/`/`obj/` outside the one file I may modify. The change is a string swap, so the risk is low. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server/src/policyScope.ts` | `shared/policyScope.ts` | `import type { PolicyScope }` | WIRED | Import line present |
| `007_policy_scope.sql` | `schema.sql` | constraint name `thoughts_policy_scope_check` | WIRED | Name relied on in 007's guard and in migrate.ts:207; schema.sql:34 documents the auto-name. Name-only lookup is WR-01 |
| `migrate.ts` v7 branch | `migrations.test.ts` | version arrays | WIRED | All four arrays include 7 |
| capture `ON CONFLICT DO UPDATE SET` | policy_scope excluded | SET list | WIRED | No `policy_scope` in the SET list. The conflict-key limitation is now recorded correctly in ADR-018 (see Anti-Patterns) |
| ADR-018 Decision | Spike result | Mechanism named matches what was proven | WIRED | Unchanged by `2989d72` |
| ADR-018 matrix | D-03/D-06 | verbatim | WIRED | Unchanged |

### Data-Flow Trace (Level 4)

Not applicable. The phase renders no dynamic data. The only runtime data path is the write of `policy_scope`: the literal `'corporate'` at capture, and the source row's value at promote. Both are traced above.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Covered/whole-tree drift since prior run | `git diff --stat 4bd7099..HEAD` (whole tree, and the 25 covered files) | Only ADR-018 among covered files; whole tree adds only 5 phase planning docs | ✓ PASS (run this session) |
| No production RLS DDL | `grep -rniE "ROW LEVEL SECURITY\|CREATE POLICY" server/db server/src server/index.ts` | no matches | ✓ PASS (run this session) |
| withPolicyScope unwired | `grep -rn "withPolicyScope\|policyScope.ts" server/index.ts server/src/` (excl. self) | no matches | ✓ PASS (run this session) |
| Vocabulary | `deno test ... tests/policy-scope-vocabulary.test.ts` (mcp-test) | 3 passed | ✓ PASS (inherited from prior run at identical tree; not re-run, no Docker/.env) |
| Migration 007, bootstrap, promote carry-forward | `... tests/policy-scope-migration.test.ts` | 3 passed | ✓ PASS (inherited; not re-run) |
| RLS spike | `... tests/policy-scope-rls-spike.test.ts` | 1 passed | ✓ PASS (inherited; not re-run) |
| Migration framework | `... tests/migrations.test.ts` | 6 passed | ✓ PASS (inherited; not re-run) |
| capture_thought over HTTP post-migration | `... tests/e2e.test.ts --filter "capture_thought stores context tags"` | 1 passed | ✓ PASS (inherited; not re-run) |
| db-test catalog state | psql on db-test | 0 NULL, 0 OOV, NOT NULL, no default, CHECK present, v7 recorded, RLS f/f, 0 policies, 0 spike roles | ✓ PASS (inherited; not re-run) |

The 9 OpenRouter-401 failures recorded in `deferred-items.md` predate this phase, come from the environment, and are excluded from scoring, as in the prior report.

### Probe Execution

Step 7c: SKIPPED. The phase declares no probes, and no `scripts/*/tests/probe-*.sh` exist.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| POLICY-01 | 05-01 | Closed-vocabulary `policy_scope` on thoughts, distinct from tags | ✓ SATISFIED | Column, CHECK and module verified; the tags column is untouched |
| POLICY-02 | 05-01 | Backfill with no default-allow gap during transition | ✓ SATISFIED | Transactional migration, backfill test (inherited pass), 0 NULL rows on db-test. The production pre-migration count was run and passed by the PO (05-UAT.md test 5) |
| DECISION-01 | 05-02 | Mechanism chosen via spike, with threat model and visibility matrix | ✓ SATISFIED | ADR-018 is accepted as the mechanism decision (05-UAT.md test 6), the spike passed (inherited), and the SC2 override covers the spike-realism reading (UAT test 1) |

No orphaned requirements. REQUIREMENTS.md (lines 74-76) maps exactly POLICY-01, POLICY-02 and DECISION-01 to Phase 5, and each is claimed by a plan.

### Prohibitions

All three prohibitions are string-form `[flagged-unverified]` items with no `verification:` tier, so they are treated as judgment tier. The PO resolved all three explicitly at UAT, so none is left flagged.

| # | Prohibition | Status | Evidence |
|---|-------------|--------|----------|
| 1 | (05-01) The interim policy_scope must not be a table-level DEFAULT | HELD (human-resolved) | 05-UAT.md test 2, pass. Neither 007 nor schema.sql has a DEFAULT clause; both write sites supply the value per statement |
| 2 | (05-02) The mechanism must not count as documented merely because the spike passes; ADR-018 is an independent deliverable | HELD (human-resolved) | 05-UAT.md test 3, pass. ADR-018 is a separate 157-line document |
| 3 | (05-02) ADR-018 must not describe the mechanism as enforced or live | HELD (human-resolved, and re-checked this session against the changed text) | 05-UAT.md test 4, pass. This prohibition is the one most exposed by the `proposed`→`accepted` change, so I re-read the current text. Line 18 says "as the mechanism decision only ... Acceptance does not mean enforcement is live ... It is **not yet enabled** on production `public.thoughts`, and no retrieval path calls it." Line 73 says "This is not currently enforced on production `public.thoughts`." Lines 135-136 repeat the not-enabled and no-caller statements and name Phase 6. Line 129 still accepts "Production not yet enforced" as a deliberate risk. |

### Anti-Patterns Found

Debt-marker scan: `grep -nE "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` on the one file changed since the prior scan (ADR-018) found no matches. Every other implementation file is byte-identical to the tree the prior scan cleared.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `docs/design/adr/ADR-018-...md` | threat table | Overstated "ON CONFLICT ... mitigate (done)" (review WR-02) | ✓ Resolved | Fixed by `2989d72`. The row is now split. "SET list overwriting policy_scope" stays mitigated. "Cross-scope merge through the global conflict key" is recorded as **open, precondition of capture-side scope and Phase 6**, with the likely fix stated. I checked that claim against `schema.sql:54` (`UNIQUE (content_fingerprint)`) and `index.ts:549`, and it matches the code. |
| `server/db/007_policy_scope.sql` / `server/src/migrate.ts` | 31-37 / 206-208 | Constraint lookup by `conname` only (WR-01) | ⚠️ Warning | Unchanged. No database in the current repo can reach it. Not blocking |
| `server/db/007_policy_scope.sql` | 19 | Irreversible backfill emits no in-band count (WR-03) | ℹ️ Info (operationally discharged) | The PO ran and passed the production pre-migration count (UAT test 5). The code-level absence remains as designed |
| `server/src/policyScope.ts` | 31-34 | `as T` cast; no runtime `isPolicyScope` check (IN-01, IN-02) | ℹ️ Info | Fails closed under the allow-list; tidy up in Phase 6 |
| `server/index.ts` | 545 | Interim `'corporate'` is a bare SQL literal (IN-03) | ℹ️ Info | Easy to miss when CAPTURE-01 lands |
| various | n/a | IN-04..IN-09 | ℹ️ Info | Test hygiene. IN-09 is a Phase 6 test obligation |

No blockers.

### Advisory (New Scope, Unevidenced)

None.

### Human Verification Required

None. All six items from the prior report were resolved in 05-UAT.md (status complete, 6/6 pass, 2026-11-03):

1. SC2 spike-realism reading: accepted, with the override recorded (test 1)
2. to 4. The three judgment-tier prohibitions: confirmed HELD (tests 2-4)
5. Production pre-migration count: run and passed by the PO (test 5)
6. ADR-018 status: set to `accepted` after the WR-02 fix (test 6), as verified above

### Gaps Summary

No gaps. Phase 5's goal is achieved:

- Every thought carries a closed-vocabulary, NOT NULL, DEFAULT-free `policy_scope`, and the backfill is transactional.
- Both production write sites supply a value explicitly.
- The schema and migration paths converge.
- The enforcement mechanism (RLS through `withPolicyScope()`, behind an allow-list guard) is proven by a spike that cleans up after itself, and is documented in ADR-018. ADR-018 is accepted as the mechanism decision, and it still states plainly that enforcement is not live.

The status moves from `human_needed` to `passed` because every human item is now closed, not because any code changed. The only change since the prior run is ADR-018's documentation fix, and it makes the threat model more accurate, not less.

Phase 6 carries forward these obligations, each already recorded in ADR-018 as open or as a precondition rather than as a Phase 5 gap:

- a non-superuser runtime role
- the scope-aware conflict key (WR-02)
- concurrency, idle-reconnect and helper revert-path coverage (IN-09)
- handler-level integration (the SC2 override)

---

_Verified: 2026-11-03T21:35:47Z_
_Verifier: Claude (gsd-verifier)_
