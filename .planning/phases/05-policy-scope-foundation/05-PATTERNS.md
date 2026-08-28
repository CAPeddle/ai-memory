# Phase 5: Policy-Scope Foundation - Pattern Map

**Mapped:** 2026-08-28
**Files analyzed:** 9
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `shared/policyScope.ts` (NEW) | utility (closed-vocabulary module) | transform/validate | `shared/tagGrammar.ts` | exact (same repo pattern, closed vs. open vocab) |
| `server/db/007_policy_scope.sql` (NEW) | migration | batch/DDL | `server/db/006_tags_replace_profile.sql` | exact (standalone idempotent delta) |
| `server/db/schema.sql` (EDIT) | config/schema | batch/DDL | itself — `CREATE TABLE public.thoughts` block, `tags`/`search_text` precedent | exact |
| `server/src/migrate.ts` (`detectBootstrapVersions`, EDIT) | service (migration runner) | batch | its own v6 branch (`tagsColumn`/`profileColumn`) | exact |
| `server/tests/migrations.test.ts` (EDIT) | test | batch/CRUD | its own migration-006 test block | exact |
| `server/tests/policy-scope-vocabulary.test.ts` (NEW) | test | transform | any `shared/*.ts` unit test (no direct tagGrammar test found — model off Zod-schema test conventions in repo) | role-match |
| `server/tests/policy-scope-migration.test.ts` (NEW) | test | batch | `server/tests/migrations.test.ts` migration-006 block | exact |
| `server/tests/policy-scope-rls-spike.test.ts` (NEW) | test (spike) | event-driven/pooled-connection | `server/tests/migrations.test.ts` (structure to avoid) + `server/tests/_helpers/testDatabaseGuard.ts` (guard pattern) + `server/db/workflow/001_workflow_schema.sql` header (spike/disposable framing) | role-match |
| `server/src/policyScope.ts` (NEW, spike output `withPolicyScope()`) | service/middleware (session-scoped SQL helper) | request-response (transaction-scoped) | `server/src/db.ts` (pool + `sql.begin` usage) | role-match |
| `server/index.ts` `capture_thought` INSERT (EDIT, lines ~525-546) | controller (MCP tool handler) | CRUD (insert) | itself | exact |
| `server/src/consolidationWorker.ts` promote INSERT (EDIT, lines ~120-134) | service (background worker) | CRUD (insert) | itself | exact |

## Pattern Assignments

### `shared/policyScope.ts` (utility, closed-vocabulary)

**Analog:** `shared/tagGrammar.ts` (full file read, 119 lines)

**Structural pattern to copy** (tagGrammar.ts is an *open*-grammar validator; policyScope.ts is a *closed* enum, so copy the *shape* — branded type export, exported constants, boolean type-guard function — not the regex machinery):
```typescript
// shared/tagGrammar.ts:1, 10-16 — shape to mirror
export type ValidatedTag = string & { readonly __validatedTag: unique symbol };
export const TAG_PATTERN = /^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)?$/;
export const MAX_TAGS = 16;
export const MAX_TAG_LENGTH = 64;

export function isValidatedTag(value: string): value is ValidatedTag {
  return value.length <= MAX_TAG_LENGTH && TAG_PATTERN.test(value);
}
```

**Recommended `policyScope.ts` shape** (RESEARCH.md Pattern 2, design recommendation — no existing closed-enum+Zod precedent in repo, so this is the first of its kind, modeled on tagGrammar's export style plus Zod since the vocabulary is closed/finite unlike tags):
```typescript
export const POLICY_SCOPES = ["personal", "corporate", "mixed", "public"] as const;
export type PolicyScope = typeof POLICY_SCOPES[number];

export function isPolicyScope(value: string): value is PolicyScope {
  return (POLICY_SCOPES as readonly string[]).includes(value);
}

import { z } from "zod";
export const PolicyScopeSchema = z.enum(POLICY_SCOPES);
```
`zod` is already pinned in `server/deno.json:9` (v4.1.13) — no new dependency.

---

### `server/db/007_policy_scope.sql` (migration, DDL)

**Analog:** `server/db/006_tags_replace_profile.sql` (lines 1-20 read)

**Header/idempotency pattern** (lines 1-6):
```sql
-- ADR-012: replace binary profile scoping with flexible tags.
-- Standalone idempotent delta for existing databases.

ALTER TABLE public.thoughts
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
```
Note: 006 uses `ADD COLUMN IF NOT EXISTS ... DEFAULT`. The new column is a **boundary/security column and must deliberately omit DEFAULT** — copy the no-default rationale from the shipped `workflow.work_packets.policy_scope` precedent instead (see next block), not from 006's tags column.

**Exact column/CHECK shape to mirror** — `server/db/workflow/001_workflow_schema.sql:48-49` (read in full, lines 1-60):
```sql
policy_scope      text         NOT NULL
                                 CHECK (policy_scope IN ('personal', 'corporate', 'mixed', 'public')),
```
Rationale comment directly above it (lines 32-36), reuse verbatim as the design justification in the new migration's header comment:
```sql
-- policy_scope is NOT NULL with NO DEFAULT, deliberately. A permissive default
-- on a boundary column silently mints permissive rows wherever an INSERT forgets
-- the column (the memory domain's consolidation promote at
-- consolidationWorker.ts:121-134 is exactly that shape). No default means every
-- write site must state a scope, and forgetting fails loudly at deploy time.
```

**Full migration shape** (RESEARCH.md Code Examples, mirrors 006's "standalone idempotent delta" convention plus the add-nullable/backfill/constrain sequence Claude's Discretion selected):
```sql
ALTER TABLE public.thoughts
  ADD COLUMN IF NOT EXISTS policy_scope text;

UPDATE public.thoughts
  SET policy_scope = 'corporate'
  WHERE policy_scope IS NULL;

ALTER TABLE public.thoughts
  ALTER COLUMN policy_scope SET NOT NULL;

ALTER TABLE public.thoughts
  ADD CONSTRAINT thoughts_policy_scope_check
  CHECK (policy_scope IN ('personal', 'corporate', 'mixed', 'public'));
```

---

### `server/db/schema.sql` (EDIT — add `policy_scope` to `CREATE TABLE public.thoughts`)

**Analog:** itself — confirm final column shape matches the migration exactly (schema.sql already carries cumulative end-state columns from migrations 003-006 per `server/db/schema.sql:16-30, 148-157, 209-238`). Add:
```sql
policy_scope text NOT NULL CHECK (policy_scope IN ('personal', 'corporate', 'mixed', 'public')),
```
directly in the `CREATE TABLE public.thoughts (...)` block, matching the migration's final shape (no DEFAULT).

---

### `server/src/migrate.ts` `detectBootstrapVersions()` (EDIT — add v7 branch)

**Analog:** its own v6 branch, lines ~171-196 (read in full):
```typescript
const [tagsColumn] = await tx`
  SELECT 1 AS found FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'thoughts' AND column_name = ${"tags"}
`;
const [profileColumn] = await tx`
  SELECT 1 AS found FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'thoughts' AND column_name = ${"profile"}
`;
const [recallQueriesProfileColumn] = await tx`
  SELECT 1 AS found FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'recall_queries' AND column_name = ${"profile"}
`;
if (tagsColumn && !profileColumn && recallQueriesTable && !recallQueriesProfileColumn) {
  await tx`
    INSERT INTO schema_migrations (version, filename)
    VALUES (6, '006_tags_replace_profile.sql')
    ON CONFLICT (version) DO NOTHING
  `;
}
```
**New v7 branch:** probe `information_schema.columns` for `thoughts.policy_scope`; if found, `INSERT INTO schema_migrations (version, filename) VALUES (7, '007_policy_scope.sql') ON CONFLICT (version) DO NOTHING`. Follow the exact `SELECT 1 AS found ... WHERE table_schema = 'public' AND table_name = 'thoughts' AND column_name = ${"policy_scope"}` probe idiom used by every prior branch (e.g. `needsEmbeddingColumn` at lines ~121-127).

---

### `server/tests/migrations.test.ts` (EDIT — extend version-list assertions)

**Analog:** its own bootstrap assertion, lines 27-35:
```typescript
assertEquals(afterBootstrap.map((row) => row.version), [1, 2, 3, 4, 5, 6]);
assertEquals(afterBootstrap.map((row) => row.filename), [
  "001_initial.sql",
  "002_needs_embedding.sql",
  "003_search_text_and_recall_queries.sql",
  "004_worker_runs.sql",
  "005_feedback_events.sql",
  "006_tags_replace_profile.sql",
]);
```
Extend both arrays to append `7` / `"007_policy_scope.sql"`. This file must be touched in the same change as the migration or the suite reds (confirmed pattern from ST-084 §6.2 per RESEARCH.md Pitfall 4).

---

### `server/tests/policy-scope-migration.test.ts` (NEW — mirrors migration-006 test)

**Analog:** `server/tests/migrations.test.ts` "migration 006: backfills profile values..." block, lines ~120-194 (read in full):
```typescript
Deno.test({
  name: "migration 006: backfills profile values, creates GIN tags index, and drops binary columns",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const migration = await Deno.readTextFile(new URL("../db/006_tags_replace_profile.sql", import.meta.url));

    await sql.begin(async (tx) => {
      await tx`ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS profile text`;
      ...
      const [professional] = await tx<{ id: string }[]>`
        INSERT INTO public.thoughts (content, content_fingerprint, profile, tags)
        VALUES (...)
        RETURNING id
      `;
      ...
      await tx.unsafe(migration);
      // assert post-migration column shape / values
      ...
      throw new Error("rollback migration 006 fixture");
    }).catch((err) => {
      if ((err as Error).message !== "rollback migration 006 fixture") throw err;
    });
  },
});
```
Copy this exact `sql.begin(...).catch(...)` in-transaction-rollback shape for the 007 test — it is the correct pattern here because this test only needs to prove DDL *content* correctness (single connection), unlike the RLS spike below. Assert: pre-migration nullable state, backfill value `'corporate'` for pre-existing NULL rows, post-migration `NOT NULL` + `CHECK` constraint presence, and that the constraint rejects an out-of-vocabulary value.

**Also add a companion "bootstrap: only marks v7 when policy_scope exists" test**, mirroring `server/tests/migrations.test.ts`'s "migration 006 bootstrap: only marks v6 when tags exists and profile is absent" test that immediately follows the block above.

---

### `server/tests/policy-scope-rls-spike.test.ts` (NEW — DECISION-01 spike, do NOT reuse the in-transaction-rollback shape above)

**Analogs:**
1. `server/tests/_helpers/testDatabaseGuard.ts` (`requireTestDatabase()`, lines 1-60+ read) — mandatory guard, call at module top exactly like `migrations.test.ts:14`:
```typescript
import { requireTestDatabase } from "./_helpers/testDatabaseGuard.ts";
await requireTestDatabase();
```
2. `server/db/workflow/001_workflow_schema.sql` header (lines 1-20) — the "spike/disposable, full teardown is one statement" framing to model the RLS spike's own teardown comment on:
```sql
-- SPIKE / DISPOSABLE. Full teardown:
--   DROP SCHEMA workflow CASCADE;
```
For this spike, teardown is `DROP POLICY`, `ALTER TABLE thoughts NO FORCE ROW LEVEL SECURITY`, `ALTER TABLE thoughts DISABLE ROW LEVEL SECURITY` in an unconditional `try/finally`, run against `db-test` only.

**Explicitly reject this shape** (`server/tests/migrations.test.ts:127, 151, 191-194` — the migration-006 rollback pattern) for the RLS spike, per RESEARCH.md Pitfall 2: a single outer `sql.begin()` cannot exercise pool-checkout behavior because `withPolicyScope()`'s inner `sql.begin()` call checks out a *different* physical connection from the pool — DDL applied on the outer, uncommitted connection is invisible to the inner one. The spike must **commit** the RLS DDL against `db-test`, run the real `withPolicyScope()` helper against the real pool, assert the full D-03 visibility matrix plus the fail-closed/reused-connection cases, then tear down in `finally`.

**Predicate to test literally** (RESEARCH.md Pattern 3 / Code Examples — the fail-closed allow-list form, not the two broken attempts documented before it):
```sql
ALTER TABLE thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE thoughts FORCE ROW LEVEL SECURITY;
CREATE POLICY policy_scope_isolation ON thoughts
  USING (
    current_setting('app.policy_scope', true) IN ('personal', 'corporate', 'mixed', 'public')
    AND (
      policy_scope = 'public'
      OR policy_scope = current_setting('app.policy_scope', true)
    )
  );
```
Required assertion cases (RESEARCH.md Pattern 3, final paragraph): (a) each scope sees exactly `{itself, public}`; (b) a fresh never-scoped connection returns zero rows, including zero `public`; (c) `public`-declared scope sees only `public` rows (D-06); (d) a connection that just completed a scoped transaction, then receives an unscoped query (simulating pool reuse), also returns zero rows — this is the case that actually exercises D-04's reason for existing.

**Never enable RLS on production `thoughts`** — this spike targets `db-test` scratch state only (RESEARCH.md Pitfall 1, highest-severity finding).

---

### `server/src/policyScope.ts` (NEW — `withPolicyScope()` helper, spike output kept unwired)

**Analog:** `server/src/db.ts` (pool/`sql` export — read for import shape only, not quoted at length since it's a one-line pool definition consumed everywhere).

**Exact helper shape** (RESEARCH.md Pattern 4 / Code Examples — critical: use `set_config()`, never a templated `SET LOCAL` literal, because `SET`/`SET LOCAL` cannot take a bind parameter under the extended query protocol postgres.js's tagged templates always use):
```typescript
import { sql } from "./db.ts";
import type { PolicyScope } from "../../shared/policyScope.ts";

export async function withPolicyScope<T>(
  scope: PolicyScope,
  fn: (tx: Parameters<Parameters<typeof sql.begin>[0]>[0]) => Promise<T>,
): Promise<T> {
  return await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.policy_scope', ${scope}, true)`;
    return await fn(tx);
  });
}
```
`sql.begin()` reserves one physical connection for the callback and auto-issues `COMMIT`/`ROLLBACK`, which clears the transaction-scoped GUC before the pool can reassign the connection — this is the exact guarantee the codebase was previously burned by *not* having (bare `SET` in `server/db/workflow/001_workflow_schema.sql:14-21`, AGE `search_path` leak). Keep this file committed and unit-tested but **unwired from any production tool call site this phase** — no `server/index.ts` tool handler references it yet (Phase 6 wires it).

---

### `server/index.ts` `capture_thought` INSERT (EDIT, lines 525-546 read)

**Current shape:**
```typescript
INSERT INTO thoughts (
  content, search_text, normalizer_version, metadata, memory_type,
  project, tags, content_fingerprint, source
)
VALUES (
  ${content}, ${searchText}, ${IDENTIFIER_NORMALIZER_VERSION}, ${sql.json(metadata)},
  ${memory_type ?? "shard"}, ${project}, ${tags}, ${fingerprint}, 'user-taught'
```
**Change:** add `policy_scope` to the column list and a hardcoded interim value `'corporate'` (D-05/A1) to the `VALUES` list — **not** a table DEFAULT, to preserve the "forgetting fails loudly" property. Also verify (RESEARCH.md Pitfall 3) that the `ON CONFLICT (content_fingerprint) DO UPDATE ... SET` clause at `server/index.ts:547-558` does **not** add `policy_scope` to its SET list — the existing row's scope must win, never merge/overwrite on conflict.

---

### `server/src/consolidationWorker.ts` promote INSERT (EDIT, lines 120-134 read)

**Current shape:**
```typescript
INSERT INTO thoughts
  (content, memory_type, source, confidence, supersedes, project, tags, metadata)
SELECT
  ${normalised}, 'wiki', 'auto-promoted', ${score}, NULL,
  project, tags,
  jsonb_build_object('generated_by', 'consolidation_worker', 'source_shard_id', id::text)
FROM thoughts
WHERE id = ${shardId}
RETURNING id
```
**Change:** add `policy_scope` to the column list and, per RESEARCH.md Pitfall 3's "more correct fix," **carry the source shard's scope forward** rather than hardcoding a literal — add `policy_scope` to the `SELECT` list from the same `FROM thoughts WHERE id = ${shardId}` row, since a wiki promoted from a `personal`-scoped shard must not silently become `corporate`:
```sql
SELECT
  ${normalised}, 'wiki', 'auto-promoted', ${score}, NULL,
  project, tags, policy_scope,
  jsonb_build_object(...)
FROM thoughts
WHERE id = ${shardId}
```

## Shared Patterns

### No-default boundary column (POLICY-01/POLICY-02)
**Source:** `server/db/workflow/001_workflow_schema.sql:32-49`
**Apply to:** `server/db/007_policy_scope.sql`, `server/db/schema.sql` — never give `policy_scope` a table-level `DEFAULT`; every INSERT site must state a value explicitly.

### Migration lockstep (4 surfaces)
**Source:** `server/db/006_tags_replace_profile.sql` + `server/src/migrate.ts` v6 branch + `server/tests/migrations.test.ts:27-35` + `docker/postgres-age/Dockerfile:24-27`
**Apply to:** every migration-touching file in this phase — `007_policy_scope.sql`, `schema.sql`, `migrate.ts`, `migrations.test.ts` must all move together in one change or a fresh `db-test` build silently diverges from an upgraded `db`.

### Test-database guard
**Source:** `server/tests/_helpers/testDatabaseGuard.ts` (`requireTestDatabase()`)
**Apply to:** `policy-scope-migration.test.ts`, `policy-scope-rls-spike.test.ts` — any test that mutates schema state must call `await requireTestDatabase();` at module top, exactly as `server/tests/migrations.test.ts:14` does.

### `set_config()` not bare `SET`/`SET LOCAL` template
**Source:** `server/db/workflow/001_workflow_schema.sql:14-21` (documented prior AGE `search_path` pooling bug) + Postgres docs
**Apply to:** `server/src/policyScope.ts`'s `withPolicyScope()` — this codebase has already shipped the bare-`SET` pooling bug once; do not repeat it for the RLS GUC.

## No Analog Found

None — all 9 files/edits have at least a role-match analog in the current codebase (see table above). The one genuinely novel piece is the closed-enum + Zod pairing in `shared/policyScope.ts`, which has no direct precedent (tagGrammar.ts is open-grammar, not closed-enum) but is explicitly named in RESEARCH.md as the recommended shape to author fresh.

## Metadata

**Analog search scope:** `shared/`, `server/db/`, `server/db/workflow/`, `server/src/`, `server/tests/`, `server/tests/_helpers/`, `server/index.ts`
**Files scanned:** `shared/tagGrammar.ts`, `server/db/workflow/001_workflow_schema.sql`, `server/db/006_tags_replace_profile.sql`, `server/src/migrate.ts`, `server/tests/migrations.test.ts`, `server/tests/_helpers/testDatabaseGuard.ts`, `server/index.ts` (capture_thought insert), `server/src/consolidationWorker.ts` (promote insert)
**Pattern extraction date:** 2026-08-28
