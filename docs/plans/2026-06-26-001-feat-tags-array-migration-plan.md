---
title: "feat: Implement ADR-012 tags array migration"
type: feat
status: shipped
date: 2026-06-26
origin: docs/design/adr/ADR-012-tags-replace-binary-profile.md
---

# feat: Implement ADR-012 Tags Array Migration

## Summary

Implement ADR-012 by replacing the binary `profile` scoping column on stored thoughts with a flexible `tags text[]` column, backfilling existing rows, and adding a GIN index for tag containment queries. The ADR uses the conceptual name `memory_shards`; the current server schema stores shards and wiki records in `public.thoughts`, so this implementation targets `public.thoughts` and updates the fresh-schema baseline plus the numbered migration path.

---

## Problem Frame

The current `profile: professional | personal` field encodes a product-level concept into the platform schema. Contact Memory needs multi-domain shards, especially for colleagues who are both contact-domain and developer-domain entities. A single enum cannot represent `contact`, `developer`, `colleague`, project-specific tags, and future product tags together.

ADR-012 chooses `tags: string[]` with Postgres GIN indexing as the platform scoping primitive. The implementation must migrate existing data safely and remove stale profile assumptions from schema, runtime writes, context parsing, and tests.

---

## Requirements

- R1. Add `tags text[] NOT NULL DEFAULT '{}'::text[]` to `public.thoughts` for both fresh databases and existing databases.
- R2. Backfill existing data: `profile = 'professional'` becomes `ARRAY['developer']`; `profile = 'personal'` becomes `ARRAY['personal']`; `profile IS NULL` becomes an empty array.
- R3. Create a GIN index on `public.thoughts(tags)` to support containment queries such as `tags @> ARRAY['contact']`.
- R4. Remove the `public.thoughts.profile` column and all runtime dependencies on binary profile scoping.
- R5. Preserve existing non-profile behavior: capture, search, list, fetch, consolidation, recall logging, and existing tests must continue to work with default empty tags.
- R6. Tests must explicitly prove the migration, index definition, fresh-schema baseline, runtime capture, duplicate-capture tag merging, and consolidation copy behavior.
- R7. Tags accepted from MCP inputs must follow a bounded grammar and validation policy before they become persisted classification metadata.

---

## Scope Boundaries

- **In scope:** platform schema migration from `profile` to `tags`, app code updates needed to write/read/copy tags, and tests proving the new invariant.
- **In scope:** tag parsing for `capture_thought` storage. Search/list tag filtering is deferred unless this story explicitly implements and tests it; public tool descriptions must not imply tag-based filtering before runtime supports it.
- **Out of scope:** full Contact MCP tool implementation, Contact Memory domain schema, Android API authentication, and WhatsApp parser behavior.
- **Out of scope:** normalizing tags into a lookup table or `thought_tags` join table. ADR-012 explicitly rejected this for current personal-use volume.
- **No compatibility shim:** do not keep `profile` as a hidden alias in the persisted platform schema. If a temporary parser alias is considered, it must be explicitly removed before this story is complete unless the PO creates a compatibility requirement.
- **Deployment assumption:** this is a single-process/downtime migration. Do not run old server or worker code after migration 006 drops `profile`; if multi-instance or rolling deploy becomes necessary, split this into expand/contract migrations first.

### Deferred to Follow-Up Work

- Product-level authorization of reserved tags (`contact`, `developer`, `personal`, `professional`) plus known domain/example tags such as `colleague` and namespaced tags (`project:*`, `contact:*`) can be tightened when Contact MCP tools are implemented.
- Replacing `profile` vocabulary in older planning docs can be handled as documentation cleanup unless those docs are directly touched by this implementation.

---

## Context & Research

### Relevant Code and Patterns

- `server/db/schema.sql` is the fresh database baseline and currently defines `public.thoughts.profile text CHECK (profile IN ('professional', 'personal'))`.
- Runtime migration files live directly under `server/db/` as numbered `NNN_description.sql` files. `server/src/migrate.ts` loads matching files from `server/db/`, applies each pending file inside a transaction, and records it in `schema_migrations`.
- Existing migration style is idempotent DDL with `IF NOT EXISTS` where possible. Current files include `server/db/001_initial.sql` through `server/db/005_feedback_events.sql`, so ADR-012 should add `server/db/006_tags_replace_profile.sql`.
- `server/src/migrate.ts` bootstraps existing databases by probing schema artifacts in `detectBootstrapVersions`; it currently records versions 1 through 5.
- `server/index.ts` writes `profile` during `capture_thought` and parses `profile` from context. Existing project search/list behavior does not provide true profile filtering, so ADR-012 must not accidentally invent or document tag filtering unless the implementation adds it. `server/src/consolidationWorker.ts` copies `profile` from shard to promoted wiki row. `server/src/searchQuality.ts` logs `profile` into `recall_queries`.
- `server/tests/migrations.test.ts` asserts the expected migration versions and must be updated to include version 6 and schema assertions for tags.

### Institutional Learnings

- `docs/solutions/workflow-issues/explicit-test-requirements-in-plans-2026-06-19.md` applies: tests must name the regressions they prevent, not merely assert that migrations run.
- Existing Docker init scripts only affect fresh databases. This spec updates both `server/db/schema.sql` and a numbered migration so fresh and persistent databases converge.
- Migration tests should use the isolated `mcp-test` / `db-test` workflow so data mutation does not affect the persistent dev database.

---

## Key Technical Decisions

- **KTD-1 — Target `public.thoughts`, not `memory_shards`.** ADR-012's `memory_shards` name is conceptual. The active Deno/Postgres server stores memories in `public.thoughts`, so the implementation updates that table and its callers.
- **KTD-2 — Use `text[]` plus GIN index, not JSONB or a join table.** This follows ADR-012's chosen option and keeps containment queries simple and indexable with `tags @> ARRAY[...]`.
- **KTD-3 — Backfill before dropping `profile`.** Existing rows must retain their scope information. Dropping first would make the migration irreversible without a backup.
- **KTD-4 — Keep `project` as a first-class column for now.** ADR-012 allows namespaced `project:*` tags, but the current search/list behavior and project boost use `project` directly. Replacing `project` with tags is not part of this migration.
- **KTD-5 — Replace profile persistence with tag persistence, but do not claim tag filtering unless implemented.** Runtime capture and consolidation should carry `tags`, not `profile`, so tests do not encode a half-migrated state. Search/list tag filtering is a separate runtime behavior and must either be implemented with tests or explicitly not advertised.
- **KTD-6 — Remove binary profile diagnostics instead of expanding diagnostics by default.** `recall_queries.profile` is diagnostic metadata, not shard schema. This story should remove binary profile logging. Do not add `recall_queries.tags` unless there is a concrete current consumer and a privacy/retention decision for storing tag metadata in query logs.
- **KTD-7 — Duplicate captures merge tags by union.** Existing global content-fingerprint deduplication means the same thought can be captured from multiple domains. On conflict, preserve existing tags and add incoming tags without duplicates; never overwrite or drop existing tags.
- **KTD-8 — Tag input is validated as classification metadata.** Accepted tags must be lowercase strings matching a bounded grammar such as `^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)?$`, with a maximum tag count and length. Empty, duplicate, whitespace-padded, or dangerous/ambiguous values are rejected or normalized by explicit tests. Tags enter `capture_thought` only via the parsed context string; `parseContext.ts` is the sole validation boundary. The insert statement must not accept a raw tags parameter from external callers.

---

## Migration SQL Contract

This is the intended SQL shape for `server/db/006_tags_replace_profile.sql`. The implementer may adjust names for exact repo conventions, but must preserve the behavior and ordering.

```sql
ALTER TABLE public.thoughts
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'thoughts' AND column_name = 'profile'
  ) THEN
    UPDATE public.thoughts
    SET tags = ARRAY(
      SELECT DISTINCT tag
      FROM unnest(
        tags || CASE profile
          WHEN 'professional' THEN ARRAY['developer']::text[]
          WHEN 'personal' THEN ARRAY['personal']::text[]
          ELSE '{}'::text[]
        END
      ) AS tag
      WHERE tag <> ''
    );

    ALTER TABLE public.thoughts DROP COLUMN profile;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_thoughts_tags
  ON public.thoughts USING GIN (tags);
```

Remove binary diagnostics rather than introducing tag-scoped query logs by default:

```sql
ALTER TABLE public.recall_queries
  DROP COLUMN IF EXISTS profile;
```

---

## Implementation Units

### U1. Add the ADR-012 database migration

**Goal:** Add a versioned SQL migration that creates `tags`, migrates existing `profile` values, creates the GIN index, and removes the old column.

**Requirements:** R1, R2, R3, R4, R6.

**Dependencies:** None.

**Files:**
- Create: `server/db/006_tags_replace_profile.sql`
- Modify: `server/src/migrate.ts`
- Modify: `server/tests/migrations.test.ts`

**Approach:**
- Add `server/db/006_tags_replace_profile.sql` using the SQL contract above.
- Extend `detectBootstrapVersions` to mark version 6 applied when `public.thoughts.tags` exists and the schema has reached the ADR-012 shape.
- The version 6 bootstrap probe must check that `public.thoughts.tags` exists **and** `public.thoughts.profile` does not exist before marking version 6 applied.
- Update migration framework tests to expect version 6 in bootstrap and rerun paths.
- Keep the migration idempotent for partially applied dev databases, including the case where `tags` already exists and `profile` is absent but version 6 is not recorded.

**Patterns to follow:** `server/db/004_worker_runs.sql`, `server/db/005_feedback_events.sql`, and `server/src/migrate.ts` version-detection probes.

**Test scenarios:**
- Migration applies to a database with `profile = 'professional'` and produces `tags = ARRAY['developer']`.
- Migration applies to a database with `profile = 'personal'` and produces `tags = ARRAY['personal']`.
- Migration applies to rows with `profile IS NULL` and produces an empty tags array.
- Migration preserves existing non-empty tags while unioning the profile-derived tag into the array.
- Migration creates a GIN index named `idx_thoughts_tags` on `public.thoughts(tags)`.
- Catalog assertions prove `idx_thoughts_tags` uses the `gin` access method, targets `public.thoughts`, and indexes the `tags` column.
- Migration removes `public.thoughts.profile`.
- Migration skips safely when `tags` exists, `profile` is absent, and schema version 6 is missing.
- Running `runMigrations()` twice records version 6 once and leaves the schema unchanged on the second run.

**Verification:** Migration tests prove schema shape, data migration, index presence, and idempotent rerun.

---

### U2. Update the fresh schema baseline

**Goal:** Ensure fresh databases created from Docker init start with the ADR-012 schema without relying on the migration to repair them later.

**Requirements:** R1, R3, R4.

**Dependencies:** U1.

**Files:**
- Modify: `server/db/schema.sql`
- Modify: `server/tests/migrations.test.ts`

**Approach:**
- Replace the `profile` column in `public.thoughts` with `tags text[] NOT NULL DEFAULT '{}'::text[]`.
- Add `CREATE INDEX IF NOT EXISTS idx_thoughts_tags ON public.thoughts USING GIN(tags);` alongside the other thoughts indexes.
- Update schema comments from `project/profile context` to project plus tags context.
- Remove `recall_queries.profile` from `server/db/schema.sql`. Do not add `recall_queries.tags` in this implementation.

**Patterns to follow:** Current `server/db/schema.sql` baseline includes later migration artifacts such as `worker_runs` and `feedback_events`; ADR-012 should follow that precedent.

**Test scenarios:**
- Fresh baseline schema contains `public.thoughts.tags` as `text[] NOT NULL DEFAULT '{}'::text[]`.
- Fresh baseline schema does not contain `public.thoughts.profile`.
- Fresh baseline has the GIN index on `tags`.
- Fresh baseline verification rebuilds or directly applies `server/db/schema.sql` to an isolated scratch database/schema so the test proves the baseline, not only the post-migration shape observed after `mcp-test` startup.

**Verification:** A fresh `db-test` initialized from the schema matches the migrated schema for the ADR-012 fields.

---

### U3. Replace runtime profile writes and copies with tags

**Goal:** Update server code so new and promoted records use `tags` instead of `profile`.

**Requirements:** R4, R5, R6, R7.

**Dependencies:** U1, U2.

**Files:**
- Modify: `server/index.ts`
- Modify: `server/src/consolidationWorker.ts`
- Modify: `server/src/searchQuality.ts`
- Modify: `server/tests/e2e.test.ts`
- Modify: `server/tests/search-tool-contract.test.ts`
- Modify: `server/tests/mcp-protocol-compat.test.ts`

**Approach:**
- Update `capture_thought` to store tags from the parsed context object. Tags enter `capture_thought` only via the context string, for example `context: "project:zoom,tags:developer;contact"`; do not add a raw external `tags` parameter.
- On duplicate `content_fingerprint`, union incoming tags with existing tags without removing any existing tag.
- Use this exact conflict-update shape, adjusted only for local query-builder syntax, so repeated captures do not create duplicate tags:

  ```sql
  tags = ARRAY(
    SELECT DISTINCT tag
    FROM unnest(public.thoughts.tags || EXCLUDED.tags) AS tag
    WHERE tag <> ''
    ORDER BY tag
  )
  ```

- Update promotion code to copy tags from the source shard to the promoted row.
- Remove binary profile scope from recall diagnostics; do not add diagnostic tags unless a current consumer and privacy decision are added to this plan.
- Remove profile-oriented text from tool descriptions unless describing removed legacy behavior.

**Patterns to follow:** Existing tests that assert MCP tool descriptions do not overclaim profile filtering should become tag-accuracy regression tests.

**Test scenarios:**
- Capturing a thought with no tags stores an empty tags array.
- Capturing a thought with multiple tags stores all tags and does not require a profile.
- `capture_thought` has no raw external `tags` parameter; invalid tags supplied through `context` are rejected by `parseContext.ts` before persistence.
- Capturing duplicate content first with `['developer']` and then with `['contact']` stores both tags on the single deduplicated row.
- Promoting a shard copies its tags to the promoted row.
- Tool metadata does not claim binary profile filtering or profile isolation.
- Existing search/list behavior by project still works after tags are introduced.

**Verification:** Runtime tests pass and direct SQL assertions show captured/promoted rows have expected tags.

---

### U4. Replace context parsing profile assumptions with tags

**Goal:** Remove request/context `profile` assumptions and define the minimal tag input contract needed for capture storage.

**Requirements:** R4, R5, R7.

**Dependencies:** U3.

**Files:**
- Modify: `server/src/parseContext.ts`
- Modify: `server/tests/parseContext.test.ts`
- Modify: `server/tests/context-validation.test.ts`

**Approach:**
- Use `tags:developer;contact` as the accepted context syntax only where tags are stored with a capture. It parses to `string[]`, de-duplicates repeated tags, and rejects empty segments.
- Keep `project:` parsing unchanged because project boost/filter behavior is outside this migration.
- Remove `profile:` from accepted context examples and validation unless the PO explicitly requires a temporary compatibility alias.
- If a compatibility alias is added during implementation, tests must assert it maps to tags and is marked deprecated; otherwise tests must assert `profile:` is rejected.

**Patterns to follow:** `server/tests/context-validation.test.ts` already checks context contract precision; update those assertions rather than adding broad smoke tests.

**Test scenarios:**
- Context `project:zoom,tags:developer;contact` parses to project `zoom` and tags `['developer', 'contact']`.
- Empty tag segments are rejected.
- Duplicate tags are de-duplicated while preserving first occurrence.
- Invalid tags outside the accepted grammar are rejected before persistence.
- `profile:professional` is rejected unless a temporary alias is explicitly approved.
- Existing `strict` project behavior remains unchanged.

**Verification:** Parser and MCP contract tests prove the public context examples use tags, not profile.

---

### U5. Add tag query contract coverage

**Goal:** Prove the new database representation supports ADR-012's intended containment queries.

**Requirements:** R3, R5, R6.

**Dependencies:** U1, U3, U4.

**Files:**
- Modify: `server/tests/e2e.test.ts`
- Modify: `server/tests/search-tool-contract.test.ts`
- Modify: `server/tests/migrations.test.ts`

**Approach:**
- Add direct SQL coverage for `tags @> ARRAY[...]` because the GIN index exists specifically for containment queries.
- Do not add search/list tag filters in this migration unless explicitly re-scoped. Add metadata tests that prevent claiming tag filtering prematurely.
- Keep project behavior tests intact so this migration does not accidentally replace project scoping.

**Patterns to follow:** `docs/solutions/workflow-issues/explicit-test-requirements-in-plans-2026-06-19.md` recommends semantic regression assertions over vague coverage.

**Test scenarios:**
- Direct SQL query `tags @> ARRAY['developer']` returns rows migrated from `professional`.
- Direct SQL query `tags @> ARRAY['personal']` returns rows migrated from `personal`.
- Direct SQL query `tags @> ARRAY['contact', 'developer']` works for multi-tag rows.
- Tool metadata does not claim tag filtering for search/list unless this story is explicitly expanded to implement and test it.

**Verification:** Tests prove containment semantics and prevent misleading tool-contract claims.

---

## System-Wide Impact

- **Database:** `public.thoughts.profile` is removed; `public.thoughts.tags` becomes the platform scoping field. Existing rows are rewritten once during migration.
- **Search/list behavior:** Project scoping remains unchanged. Tag filtering is deferred by default; tags are stored and queryable by direct SQL for follow-up tool work.
- **Consolidation:** Promoted rows must preserve tags from source shards so domain membership survives promotion.
- **Diagnostics:** `recall_queries.profile` must not remain as a binary scoping artifact. Remove scope diagnostics by default rather than storing more sensitive tag metadata in query logs.
- **Docs/contracts:** Tool descriptions, context examples, and tests must stop implying binary profile isolation.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Existing rows lose scope during migration | Backfill from `profile` before dropping the column; test each mapping explicitly |
| Fresh DB and migrated DB drift | Update both `server/db/schema.sql` and `server/db/006_tags_replace_profile.sql`; verify both paths |
| Runtime still writes `profile` after schema drops it | Grep-driven cleanup plus capture/consolidation tests that insert and inspect tags |
| Tool docs claim tag filtering before runtime supports it | Add MCP metadata tests that either verify real tag filtering or prevent false claims |
| Partial migration leaves both columns with ambiguous truth | Migration tests assert final schema has `tags` and no `profile` |
| A bad migration loses the original scoping boundary | Take a pre-migration snapshot/export of `thoughts(id, profile, tags, project, created_at)` and row counts by profile/tag; define restore steps before applying to persistent data |
| Free-form tags become trusted classification metadata | Enforce bounded tag grammar, count/length limits, normalization, and reserved/namespaced tag tests before persistence |
| Old code runs against new schema after `profile` is dropped | Treat this as a single-process/downtime migration; stop old server/workers before migration and restart only the updated code |

---

## Open Questions

### Resolved During Planning

- **Which table gets the ADR-012 schema?** `public.thoughts`; `memory_shards` is conceptual wording in ADR-012.
- **Should `project` be removed in favor of `project:*` tags now?** No; out of scope. Current project boost/filter behavior stays on the `project` column.
- **Should the migration keep a persisted `profile` compatibility column?** No; ADR-012 replaces it.

### Deferred to Implementation

- **Operational rollback details:** exact backup/restore command shape depends on the deployment environment, but the implementation must document and verify the pre-migration snapshot/export before applying to persistent data.

---

## Verification Strategy

- Run focused migration tests after U1/U2 to verify schema and data migration.
- Run parser and context contract tests after U4 to verify public examples no longer use `profile`.
- Run focused e2e/tool tests after U3/U5 to verify capture, promotion, and metadata behavior.
- Run the full Deno server test suite in `mcp-test` before marking the implementation complete.

### Final ADR-012 Review

Scoped ADR-012 verification passed on 2026-06-27.

- **No stale active profile references:** targeted grep across ADR-012-modified files found only intentional historical/removal uses: migration 006 backfills from and drops `thoughts.profile`; migration bootstrap/tests probe for absence; parser/context/MCP tests reject removed `profile:` inputs. No runtime insert/query path writes or reads `profile` as an active scoping field.
- **`recall_queries.profile` removed:** `server/db/schema.sql` has no `recall_queries.profile` column, runtime recall logging writes `(tool, query, normalized_query, project, result_count, top_result_ids)`, and migration 006 removes the legacy column with `ALTER TABLE public.recall_queries DROP COLUMN IF EXISTS profile`.
- **No `recall_queries.tags`:** no tag metadata was added to query diagnostics.
- **Current `recall_queries` columns:** `id`, `tool`, `query`, `normalized_query`, `project`, `result_count`, `top_result_ids`, `created_at`.
- **Duplicate capture tag merge:** `server/index.ts` merges `thoughts.tags || EXCLUDED.tags` through `unnest(...)`, `SELECT DISTINCT`, and `ORDER BY tag`; repeated captures do not append duplicate tags.
- **Tag validation boundary:** tags enter `capture_thought` only through the `context` string. `server/src/parseContext.ts` is the sole validation boundary; it enforces the bounded tag grammar, count/length limits, empty-segment rejection, whitespace rejection, and de-duplication before `server/index.ts` inserts tags.

Focused verification commands passed:

```sh
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/parseContext.test.ts tests/migrations.test.ts tests/context-validation.test.ts tests/mcp-protocol-compat.test.ts
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/e2e.test.ts --filter "capture_thought stores context tags"
```

Workflow correction for dependency caching:

```sh
deno cache --frozen tests/**/*.ts src/**/*.ts index.ts
```

Do not pass `--allow-net`, `--allow-env`, or `--allow-read` to `deno cache`; those are runtime permissions for `deno test`/`deno run`, not cache flags.

Incidental implementation findings beyond ADR-012 specification scope:

- `server/src/workerLogger.ts`: made `ts` optional and avoided a duplicate spread.
- `server/src/consolidationWorker.ts`: tightened JSON summary typing.
- `server/src/entityWorker.ts`: tightened JSON summary typing.
- `server/tests/parseContext.test.ts`: corrected the invalid-tag case to reject a multi-colon tag while allowing one namespaced separator.
- `server/index.ts`: adjusted capture metadata wording so the tool contract explicitly says tags are stored with the thought.
- `server/tests/migrations.test.ts`: corrected the `postgres.Result` equality assertion by comparing a plain array.

Confirmed full-suite follow-up track, separate from ADR-012 scope:

- OpenRouter authentication failures: entity extraction and consolidation tests fail with `OpenRouter 401: Missing Authentication header` when the test environment lacks a usable provider key.
- Graph comment expectations: `cypher-injection` comment-handling expectations fail independently of tags/profile changes.
- Search/vector/MMR expectations: vector lane, project-rank, and MMR expectation failures remain a search-quality track. The new ADR-012 tag-capture e2e test passes in isolation.
- Worker-observability duplicate queue state: worker observability tests can fail on duplicate `entity_extraction_queue` rows or fixture state and are not part of the ADR-012 migration behavior.
- Cross-check nuance: some remaining full-suite failures are reported from `tests/e2e.test.ts`, which ADR-012 touched for tag assertions. The failing assertions are not the added tag assertions and do not mention `profile`, `tags`, or `recall_queries`; the focused ADR-012 e2e tag test passes.

---

## Sources & References

- Origin ADR: `docs/design/adr/ADR-012-tags-replace-binary-profile.md`
- Contact Memory architecture: `docs/architecture/ai_memory_architecture_decisions.md`
- Current schema baseline: `server/db/schema.sql`
- Migration runner: `server/src/migrate.ts`
- Migration tests: `server/tests/migrations.test.ts`
- Planning/test learning: `docs/solutions/workflow-issues/explicit-test-requirements-in-plans-2026-06-19.md`
