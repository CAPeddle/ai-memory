---
phase: 05-policy-scope-foundation
reviewed: 2026-09-25T21:56:46Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - docker-compose.yml
  - server/db/007_policy_scope.sql
  - server/db/schema.sql
  - server/index.ts
  - server/src/consolidationWorker.ts
  - server/src/migrate.ts
  - server/src/policyScope.ts
  - shared/policyScope.ts
  - server/tests/policy-scope-migration.test.ts
  - server/tests/policy-scope-rls-spike.test.ts
  - server/tests/policy-scope-vocabulary.test.ts
  - server/tests/migrations.test.ts
  - server/tests/consolidation-worker-observability.test.ts
  - server/tests/e2e.test.ts
  - server/tests/embedding-backfill.test.ts
  - server/tests/entity-worker-observability.test.ts
  - server/tests/worker-observability-e2e.test.ts
  - server/tests/fixtures/build-search-quality-corpus.ts
findings:
  critical: 0
  warning: 3
  info: 9
  total: 12
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-09-25T21:56:46Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Scope: `git diff main..HEAD` for the 18 listed source files. That covers migration 007, the `schema.sql` column, bootstrap detection in `migrate.ts`, the two production INSERT sites, `withPolicyScope()`, the shared vocabulary module, and the new and updated tests. The generated `search-quality-corpus.sql` is excluded. The ADR, SUMMARYs and CONTEXT were read for intent only.

**I found no Critical issues, and I looked for them specifically.** Four checks came back clean:

- **No missed write site.** Every `INSERT INTO thoughts` in `server/` (TS and SQL, including PL/pgSQL bodies in `server/db/**/*.sql`) and in `docker/` supplies `policy_scope`. The only production sites are `server/index.ts:525` and `server/src/consolidationWorker.ts:123`, and both are covered. No trigger or function body inserts into `thoughts`.
- **Backfill does not fire triggers.** 007's blanket `UPDATE` fires none. `trg_queue_consolidation` is `AFTER INSERT`, `trg_queue_entity_extraction` is `AFTER INSERT OR UPDATE OF content`, and no `updated_at` bump trigger exists. The backfill therefore does not re-queue work or rewrite recency.
- **No scope widening on upsert.** `policy_scope` does not appear in any `ON CONFLICT ... DO UPDATE SET` list: not in capture, and not in the corpus fixture.
- **Test cleanup cascades.** `consolidation_queue` and the other queue tables that reference `thoughts` use `ON DELETE CASCADE`, so test cleanup of seeded shards does not leak queue rows.

**The three Warnings:**

1. Constraint detection matches by name only.
2. The global `content_fingerprint` uniqueness is not scope-aware. This contradicts the ADR's "mitigate (done)" row for `ON CONFLICT`.
3. The irreversible backfill leaves no in-band record of how many explicitly `personal`-tagged rows it reclassified.

The Info items are type-safety, drift and test-hygiene notes.

**Method disclosure:** the ce-code-review lenses (correctness, security, data-migration, testing, adversarial) all ran in this one reviewer context. No subagent tool was available, so agreement between lenses is not independent corroboration. The cross-model peer pass was not started, because this skill was loaded as a lens by the spawning workflow rather than run as a pipeline that could collect and fold a peer result, so no code left the machine.

## Warnings

### WR-01: Constraint detection matches `thoughts_policy_scope_check` by name only, in both the 007 guard and the v7 bootstrap probe

**Files:**
- `server/db/007_policy_scope.sql:31-37`
- `server/src/migrate.ts:206-208`

**Issue:** Both sites run `SELECT 1 FROM pg_constraint WHERE conname = 'thoughts_policy_scope_check'`. Neither restricts the lookup to `conrelid = 'public.thoughts'::regclass`, and neither checks the constraint body. Constraint names are not unique across tables or schemas, and Postgres auto-names any inline `CHECK` on a column `policy_scope` of any table called `thoughts` in any schema with exactly this name. Two cases slip through:

- a `thoughts` table in another schema, such as a restored backup or an archive copy;
- a same-named constraint on `public.thoughts` with a different or weaker body, such as a hand-applied ops fix or an earlier draft vocabulary.

In either case:

- 007 silently skips adding the real constraint, and `schema_migrations` still records v7 as applied.
- `detectBootstrapVersions` records v7 as migrated.

The comment at `migrate.ts:198-200` says this exact case ("recorded as migrated but not fully shaped") is the one the probe exists to close. On a security-boundary column, a silently absent or wrong `CHECK` means an out-of-vocabulary scope can be written. The RLS allow-list would then hide that row from everyone, so it becomes invisible data rather than a leak, but it is still a broken invariant.

**Fix:** scope both lookups to the table, and optionally assert the definition.

```sql
-- 007 guard
IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid = 'public.thoughts'::regclass
    AND conname  = 'thoughts_policy_scope_check'
) THEN ...
```

```ts
// migrate.ts
const [policyScopeCheck] = await tx`
  SELECT 1 AS found FROM pg_constraint
  WHERE conrelid = 'public.thoughts'::regclass
    AND conname = ${"thoughts_policy_scope_check"}
    AND contype = 'c'
`;
```

For a stronger guarantee, also compare `pg_get_constraintdef(oid)` against the expected four-value list. Alternatively, locate the constraint by definition (`contype = 'c'` on `public.thoughts` referencing `policy_scope`) rather than by name.

### WR-02: Global `UNIQUE (content_fingerprint)` merges captures across scopes; the ADR's "ON CONFLICT ... mitigate (done)" claim overstates

**Files:**
- `server/db/schema.sql:54`: `UNIQUE (content_fingerprint)`
- `server/index.ts:549-560`: the capture upsert

**Issue:** `policy_scope` is correctly absent from the `DO UPDATE SET` list, but the conflict target is the global fingerprint, so identical content in two scopes collapses into one row. The upsert then:

- reactivates the existing row (`active = true`);
- merges the new caller's tags into it;
- returns that row's `id`;

and it does all of this regardless of the existing row's `policy_scope`.

In v1.1 every capture writes `'corporate'`, so the effect is latent today. Once scope is declared at capture time (CAPTURE-01), or once RLS is enforced (Phase 6), the same path becomes one of two things:

- **Without RLS on the conflicting row:** a cross-scope write. A `personal` capture mutates the tags and active flag of a `corporate` row, and the `personal` content is silently filed as `corporate`.
- **Under RLS:** an existence oracle. `INSERT ... ON CONFLICT DO UPDATE` raises a row-security error when the conflicting row fails the UPDATE policy, which tells the caller that the content exists in another scope.

ADR-018's threat table marks "`ON CONFLICT` merge widening `policy_scope`" as "mitigate (done, 05-01)". That covers only the SET list, not the conflict key.

**Fix:** Phase 6 needs a decision on this before capture-side scope lands. The likely shape is `UNIQUE (content_fingerprint, policy_scope)`, with `ON CONFLICT (content_fingerprint, policy_scope)` in capture, and with promote and the corpus fixture adjusted to match. At minimum, record this as an open item in the ADR's threat table and in the Phase 6 plan, instead of listing the `ON CONFLICT` threat as done.

### WR-03: The irreversible `corporate` backfill leaves no in-band record of how many explicitly `personal`-tagged rows it reclassified

**File:** `server/db/007_policy_scope.sql:19`

**Issue:** D-02 is a product decision, and I am not re-arguing it. The problem is that the only safeguard attached to it lives outside the code. Here is how the pieces fit:

- Migration 006 converted every legacy `profile = 'personal'` row into the ADR-012 reserved tag `personal`, which is the only explicit personal marker in the data.
- 007 then overwrites those rows to `policy_scope = 'corporate'` with no reclassification path (Out of Scope).
- 05-01-SUMMARY says the `personal_tagged` count "has not been run against production. It must be run there before 007 deploys."
- `runMigrations()` runs at server boot, so deploying the code applies 007 in the same step. Nothing forces the check, and afterwards nothing records how many explicitly personal rows became corporate-visible once Phase 6 enforcement begins.

**Fix:** make the migration log its own blast radius. The cheapest version is a notice before the `UPDATE`:

```sql
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.thoughts
  WHERE policy_scope IS NULL AND 'personal' = ANY(tags);
  IF n > 0 THEN
    RAISE WARNING '007_policy_scope: % row(s) tagged personal are being backfilled to corporate (D-02)', n;
  END IF;
END $$;
```

For a durable trail, write the affected ids or count into a small audit table. If the PO would rather not accept the reclassification once the count is visible, the alternative is:

```sql
SET policy_scope = CASE WHEN 'personal' = ANY(tags) THEN 'personal' ELSE 'corporate' END
```

## Info

### IN-01: The `as T` cast in `withPolicyScope` hides postgres.js's `UnwrapPromiseArray` return type

**File:** `server/src/policyScope.ts:31-34`

**Issue:** `client.begin()` is typed to return `UnwrapPromiseArray<T>`, and the cast overrides that type. In postgres.js 3.4.4 the wrapper returns a Promise, which is not an array, so a returned `RowList` passes through intact and there is no runtime bug today.

The risk is a future caller whose `fn` returns an *array of pending queries*. The inner `await fn(tx)` resolves only the array itself, not the queries in it. Those queries would then run lazily after `COMMIT`, outside the scoped transaction. The cast stops the compiler from flagging this.

**Fix:** drop the cast and let the return type be `Promise<postgres.UnwrapPromiseArray<T>>`. Alternatively, constrain `fn` so it cannot return an array of `PendingQuery`.

### IN-02: `withPolicyScope` has no runtime check on `scope`

**File:** `server/src/policyScope.ts:28-33`

**Issue:** `scope` is checked only by the type system. A value cast from unvalidated input would be written into the GUC as-is. The RLS allow-list makes this fail closed (zero rows), so it is safe, but it is also silent.

**Fix:** add `if (!isPolicyScope(scope)) throw new Error(...)` at entry, so misuse is loud at the chokepoint.

### IN-03: Interim scope is a bare SQL literal

**File:** `server/index.ts:545`

**Issue:** The interim scope `'corporate'` is written directly into the SQL rather than taken from a named, typed constant. Phase 6 must find and replace this interim value, and a string literal inside SQL is easy to miss, with nothing tying it to `PolicyScope`.

**Fix:** `const INTERIM_CAPTURE_SCOPE = "corporate" satisfies PolicyScope;` and interpolate it with `${INTERIM_CAPTURE_SCOPE}`.

### IN-04: The policy-scope vocabulary is duplicated in five places, and no test ties them together

**Files:**
- `shared/policyScope.ts:10`
- `server/db/schema.sql:36`
- `server/db/007_policy_scope.sql:36`
- `server/db/workflow/001_workflow_schema.sql:49`
- the spike policy at `server/tests/policy-scope-rls-spike.test.ts:128`

**Issue:** The "Mirrors" comment is the only link between these copies. Nothing asserts that the DB `CHECK` matches `POLICY_SCOPES`.

**Fix:** add a test that reads `pg_get_constraintdef` for `thoughts_policy_scope_check` (and the `work_packets` equivalent) and compares the extracted values against `POLICY_SCOPES`.

### IN-05: `promote()` is exported for test visibility only

**File:** `server/src/consolidationWorker.ts:101-103`

**Issue:** `promote()` is a state-mutating internal. It is now part of the module's public surface, protected only by a doc comment.

**Fix:** acceptable as-is. If more internals follow, move them to a `_internal` export or test-only module instead.

### IN-06: Spike role name and password are duplicated as literals inside `DO $$` blocks

**File:** `server/tests/policy-scope-rls-spike.test.ts:88-89,253-254`

**Issue:** `SPIKE_ROLE` and `SPIKE_PASSWORD` are TS constants, but the role name and password are also hard-coded inside the `DO` blocks, which cannot take bind parameters. Changing a constant without changing the matching literal breaks authentication or teardown.

This is a test-reliability hazard, not a security finding: it affects db-test only.

**Fix:** build those statements from the constants, using `sql.unsafe` with identifier and literal quoting.

### IN-07: Redundant committed `DROP TABLE schema_migrations` + `runMigrations()` after a rolled-back transaction

**File:** `server/tests/policy-scope-migration.test.ts:130-131`

**Issue:** The `sql.begin` block always rolls back, so the real `schema_migrations` is already restored. The extra committed drop then:

- resets every `applied_at` on the shared db-test;
- makes the ledger depend on bootstrap detection being complete.

**Fix:** delete lines 130-131, or add a comment explaining why a committed re-bootstrap is needed here.

### IN-08: The spike's committed DDL is not safe against concurrent suite runs on the shared db-test

**File:** `server/tests/policy-scope-rls-spike.test.ts:121-134,233-235`

**Issue:** The committed DDL has three problems when two suite runs overlap:

- `CREATE POLICY` has no existence guard, and the role name is fixed.
- Two overlapping runs (container `exec` plus a host-side run against `127.0.0.1:5433`, a pattern CLAUDE.md already warns pollutes db-test) collide: one run fails at `CREATE POLICY`, or has RLS torn down mid-assertion by the other's `finally`.
- The `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY` statements take `ACCESS EXCLUSIVE` without a `lock_timeout`, so they can hang behind the running mcp-test workers.

The state self-heals through teardown.

**Fix:**
- `SET lock_timeout` for the DDL statements.
- Guard the policy or role with an advisory lock (`pg_advisory_lock`) so concurrent runs serialize.

### IN-09: The helper's own COMMIT and ROLLBACK revert paths are unexercised on a reused connection

**File:** `server/tests/policy-scope-rls-spike.test.ts:188-212`

**Issue:** Case (d) hand-rolls `BEGIN; set_config; COMMIT` on a reserved connection instead of going through `withPolicyScope()`. It proves the Postgres semantics, but not the helper's own commit path, and not the rollback path taken when `fn` throws. ADR-018 is honest about this.

**Fix:** in Phase 6, add a case that calls `withPolicyScope()` with `max: 1`, once succeeding and once with `fn` throwing, then issues an unscoped query on the same pool and asserts zero rows.

---

_Reviewed: 2026-09-25T21:56:46Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
