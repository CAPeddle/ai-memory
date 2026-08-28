# Phase 5: Policy-Scope Foundation - Research

**Researched:** 2026-08-28
**Domain:** PostgreSQL access-control mechanism selection (RLS vs. WHERE-clause) + closed-vocabulary schema migration, on a pooled `postgres.js` connection
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Trust boundary (threat-model input)**
- **D-01:** Scope is caller-declared under the existing single-key trust model — the same trust boundary as today's `project:X,tags:Y` context string and the single `MEMORY_API_KEY`. Any authenticated caller may request any scope by naming it; there is no second credential or per-scope role in this milestone. — **Reversibility:** costly — introducing a scoped credential later (e.g. an `AWCP_AGENT_API_KEY`-style second key limiting which scopes a caller may request) means retrofitting an authorization layer on top of every path built against the single-key assumption in Phases 6-9.

**Legacy backfill value (POLICY-02)**
- **D-02:** Pre-existing thoughts are backfilled to `corporate`, not `personal`. Rationale given: the bulk of thoughts captured to date are work/dev content — backfilling to `personal` would wrongly hide most existing memory from normal (corporate-scope) retrieval once default-deny is enforced. — **Reversibility:** one-way — REQUIREMENTS.md's Out of Scope explicitly excludes "legacy-row backfill tooling beyond the interim default," so there is no planned reclassification path; reversing this choice later means a manual data migration outside this milestone's delivered tooling.

**Cross-scope visibility matrix (DECISION-01, SC #3)**
- **D-03:** Strict isolation, with `public` universally visible: `personal` sees `{personal, public}`; `corporate` sees `{corporate, public}`; `mixed` sees `{mixed, public}` only — `mixed` is its own bucket, not a union of `personal`+`corporate`. `public` is visible to every scope automatically (no separate opt-in required). — **Reversibility:** costly — this matrix is the shape every WHERE-clause/RLS predicate in Phases 6-9 is written against; widening or narrowing it later means revisiting every enforcement site and its negative-isolation tests.

**RLS vs. explicit WHERE resolution approach (DECISION-01, SC #2)**
- **D-04:** Resolve DECISION-01 by building the real technical spike this phase — prototype `withPolicyScope()` + `FORCE ROW LEVEL SECURITY` against one real path (`list_thoughts`, per SUMMARY.md's suggestion) and let the pooled-connection/`SET LOCAL` behavior observed in that spike settle the choice, rather than deciding from the research write-up alone. This directly satisfies SC #2's "validated by a technical spike" wording. Both STACK.md and ARCHITECTURE.md are HIGH-confidence and disagree; the spike is the tiebreaker.

### Claude's Discretion
- Migration mechanics for adding `thoughts.policy_scope` (three-step add-nullable / backfill / set-NOT-NULL-and-CHECK vs. any faster path Postgres 15 supports) — implementation detail, not raised as a gray area.
- Exact spike scaffolding/teardown shape for D-04, beyond targeting `list_thoughts` and prototyping `withPolicyScope()` + forced RLS.
- Whether `recall_events`/`recall_queries` gain scope columns in this phase or a later one — SUMMARY.md's Phase-1 sketch mentions this but it is not in this phase's REQUIREMENTS.md (POLICY-01/POLICY-02/DECISION-01 only); left to planning to scope correctly against VERIFY-03 (Phase 9).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. The scoped-credential trust model (alternative to D-01) and the union-bucket interpretation of `mixed` (alternative to D-03) were considered and explicitly rejected in favor of the recommended options, not deferred to a later phase.

### Project Constraints (from CLAUDE.md)
- Tests that touch the database run in `mcp-test`/`db-test`, never against the shared dev database: `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read [--allow-write=/tmp] [--allow-run=...] tests/<file>.ts`.
- `db-test` is shared and accumulating across runs within a session (wiped only when its container stops) — any spike that mutates schema state on it must have reliable teardown, not rely on container restart.
- Migrations are numbered, sequential, `IF NOT EXISTS`/idempotent, one file = one transaction, no down-migrations, tracked in `schema_migrations`.
- Every commit for board-tracked work carries a `Story: ST-NNN` trailer; this phase's work should be tied to the ai-memory v1.1 story per `.planning/STATE.md` (ST-082).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POLICY-01 | A closed-vocabulary `policy_scope` field (`personal`\|`corporate`\|`mixed`\|`public`) exists on thoughts, distinct from free-form descriptive tags | `shared/policyScope.ts` module design (mirrors `shared/tagGrammar.ts`); `thoughts.policy_scope text NOT NULL CHECK (...)` column shape (mirrors `workflow.work_packets.policy_scope`); migration touch-point inventory (4 files, all verified with line ranges) |
| POLICY-02 | Existing thoughts are backfilled to a scope value with no default-allow gap during the transition | Add-nullable → backfill(`corporate`) → set-NOT-NULL+CHECK sequence, single transaction per migrate.ts's per-file `sql.begin()`; verified that the backfill `UPDATE` fires **no** trigger on `thoughts` (both existing triggers are INSERT-only or `UPDATE OF content`-scoped); **the two existing `INSERT INTO thoughts` call sites also need the column added or they will hard-fail post-migration** — this is the "during or after migration" gap CONTEXT.md's decisions don't explicitly cover |
| DECISION-01 | Primary SQL enforcement mechanism chosen via technical spike, written threat-model/trust-boundary statement, cross-scope visibility matrix | Full RLS-vs-WHERE tradeoff analysis below; `postgres.js`/pooling verification via Context7 and a Supabase pooling discussion; fail-closed RLS predicate derivation; concrete, safe spike design (Correction 2, below) that avoids a false-pass trap in the obvious "wrap in `sql.begin()` and roll back" approach |
</phase_requirements>

## Summary

This phase has two genuinely separable halves, and the plan should treat them as such. **POLICY-01/POLICY-02** are mechanical: add a `text NOT NULL CHECK (policy_scope IN ('personal','corporate','mixed','public'))` column with no `DEFAULT` to `thoughts`, following the exact pattern already shipped in `workflow.work_packets.policy_scope` (`server/db/workflow/001_workflow_schema.sql:48-49`), backfill existing rows to `'corporate'` per D-02, and ship a `shared/policyScope.ts` module mirroring `shared/tagGrammar.ts`. The non-obvious part is that this repo has **three schema-definition surfaces that must all move together** for a new column to actually exist everywhere the server expects it (fresh Docker builds, existing databases, and the migration test suite) — missing any one of the three leaves a database in a state where either the column is silently absent or `migrate.ts` tries to re-run DDL that already succeeded via a different path. Separately, **the two existing `INSERT INTO thoughts` call sites** (`capture_thought` and `consolidationWorker.ts`'s promote) do not currently supply a `policy_scope` value; once the column is `NOT NULL` with no default, both will hard-fail on the very next call unless the plan explicitly updates them, which is a corollary of POLICY-02's "no default-allow gap ... during or after migration" wording that CONTEXT.md's decisions do not name.

**DECISION-01** is a real, unresolved architecture question and the research passes that fed CONTEXT.md are right that it needs a spike, not a read of this document. Both candidate mechanisms are technically sound; the deciding factors are pooling correctness and the shape of a mistake. Explicit `WHERE policy_scope = ANY($allowed)` predicates are simple and have zero pooling risk, but require correctness at every one of 15+ enumerable read paths — "14 of 15 right" is indistinguishable from wrong. Forced Postgres RLS closes that gap by making every current and future `SELECT` on `thoughts` safe by construction, but only if `SET LOCAL` (via `set_config(..., true)`, not the bare `SET` statement — see the Postgres bind-parameter limitation below) is applied correctly inside a `sql.begin()`-reserved connection on every request; the codebase has already been burned once by a *bare* `SET` leaking across the pool (`server/db/workflow/001_workflow_schema.sql:14-21`), so the spike must specifically prove `SET LOCAL`-in-transaction does not repeat that failure — which the underlying library's transaction semantics and a corroborating third-party discussion of the identical hazard both say it should not. The one design point this research adds beyond CONTEXT.md's framing: **whichever way the spike resolves, the production `thoughts` table must not have `FORCE ROW LEVEL SECURITY` actually enabled by this phase's migration**, because no other tool (`search_thoughts`, `capture_thought`, `thought_stats`, `fetch`, `search`, the three background workers) calls `withPolicyScope()` yet — forcing RLS now would make every one of those paths return zero rows or fail, which is a production outage caused by the "foundation" phase, not a later enforcement phase.

**Primary recommendation:** Ship the column via a `007_policy_scope.sql` migration (data-only: add, backfill, constrain — no RLS), updated in lockstep with `schema.sql`, `migrate.ts`'s `detectBootstrapVersions()`, and `migrations.test.ts`'s hardcoded version lists; update both `INSERT INTO thoughts` sites to supply an interim scope value; and resolve DECISION-01 with a **committed-and-torn-down spike against `db-test`** (not an in-transaction rollback — see Pitfall 2) that exercises the real `withPolicyScope()` helper and a real `FORCE ROW LEVEL SECURITY` policy on the actual pooled connection, asserting the full D-03 visibility matrix plus the absent-GUC fail-closed case.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Closed-vocabulary definition (`personal`\|`corporate`\|`mixed`\|`public`) | API/Backend (`shared/*.ts`, consumed by both server and future clients) | Database (`CHECK` constraint as the enforced source of truth) | Vocabulary must be enforced at the DB boundary (no default-allow gap) but described once in TypeScript for tool schemas and validation, exactly like `shared/tagGrammar.ts` |
| Column existence + backfill (POLICY-01/02) | Database/Storage | API/Backend (migration runner, write-site updates) | A schema fact; TypeScript never invents a scope, it only validates/threads one |
| SQL enforcement mechanism (DECISION-01) | Database/Storage (if RLS wins) or API/Backend (if explicit WHERE wins) | — | This is exactly what the spike must decide — the tier boundary itself is the open question |
| Threat-model/trust-boundary statement | Documentation artifact (repo docs, not code) | — | A written decision record, consumed by every later phase's test design, not a runtime component |
| Cross-scope visibility matrix (D-03) | Database/Storage (encoded as the RLS predicate or WHERE-clause allow-list) | API/Backend (documented as a constant for WHERE-clause callers if that mechanism wins) | The matrix is data, not behavior — it must be expressible as a single boolean predicate regardless of which mechanism wins |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL | 15 (already pinned, `docker/postgres-age/Dockerfile:1`) | RLS / CHECK constraint enforcement | Already the platform; RLS (`FORCE ROW LEVEL SECURITY`, `CREATE POLICY`) is a PG 9.5+ feature, no version gap |
| `postgres` (postgres.js) | `3.4.4` pinned in `server/src/db.ts:1` (latest on npm: `3.4.9` [VERIFIED: npm registry, `npm view postgres version`]) | Pooled SQL client; `sql.begin()` is the transaction-scoping primitive the D-04 spike depends on | Already the platform driver — no new dependency |
| `zod` | `4.1.13` pinned in `server/deno.json:9` (latest on npm: `4.4.3` [VERIFIED: npm registry, `npm view zod version`]) | `z.enum(POLICY_SCOPES)` schema for `shared/policyScope.ts`, mirroring `shared/tagGrammar.ts`'s pattern | Already the platform validation library |

No version bump is required or recommended for either dependency in this phase — both pinned versions support everything this phase needs (`sql.begin`, `sql.reserve`, `z.enum`).

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| — | — | — | No new runtime dependency is needed. All four research passes (STACK.md, ARCHITECTURE.md, FEATURES.md, SUMMARY.md) independently converge on this: the vocabulary is `text NOT NULL CHECK (...)` + `z.enum`, not a policy-engine library. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `text CHECK` column | A general-purpose policy engine (OPA, Cedar, Casbin) | Explicitly rejected in `.planning/REQUIREMENTS.md`'s Out of Scope table — over-engineered for one subject × one closed 4-value vocabulary |
| Explicit `WHERE` predicates | Postgres RLS | This is DECISION-01 itself, not a settled default — see below |

**Installation:** None. No `npm install` / `deno add` step — every library used is already a direct dependency.

## Package Legitimacy Audit

**Not applicable.** This phase introduces zero new external packages. `postgres` and `zod` are pre-existing pinned dependencies (`server/src/db.ts:1`, `server/deno.json:9`), both verified present and current on the npm registry (see Standard Stack table above). No `checkpoint:human-verify` gating is needed for this phase's dependency surface.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────────┐
                     │            server/index.ts (MCP tools)       │
                     │  list_thoughts / search_thoughts / capture_  │
                     │  thought / thought_stats / fetch / search    │
                     └───────────────┬───────────────────────────────┘
                                     │  plain `sql\`...\`` (today)
                                     │  → `withPolicyScope(scope, fn)` (D-04 spike target)
                                     ▼
                     ┌─────────────────────────────────────────────┐
                     │        server/src/db.ts — postgres.js pool   │
                     │        (npm:postgres@3.4.4, max: 10)         │
                     └───────────────┬───────────────────────────────┘
                                     │ sql.begin(async tx => {
                                     │   SELECT set_config('app.policy_scope', $1, true);
                                     │   ... tx queries ...
                                     │ })   ← reserves ONE connection for the block
                                     ▼
                     ┌─────────────────────────────────────────────┐
                     │  public.thoughts                             │
                     │  policy_scope text NOT NULL                  │
                     │    CHECK (IN ('personal','corporate',        │
                     │               'mixed','public'))             │
                     │                                               │
                     │  [If RLS wins DECISION-01 — Phase 6, not      │
                     │   this phase, flips this on for real:]        │
                     │  FORCE ROW LEVEL SECURITY                     │
                     │  CREATE POLICY ... USING (                    │
                     │    current_setting('app.policy_scope', true)  │
                     │      IS NOT NULL                              │
                     │    AND (policy_scope = 'public'               │
                     │         OR policy_scope =                     │
                     │            current_setting('app.policy_scope',│
                     │                             true))            │
                     │  )                                            │
                     └───────────────────────────────────────────────┘

  Migration-time surfaces that must move together (Phase 5's real deliverable):
  ┌───────────────┐   ┌──────────────┐   ┌────────────────────┐   ┌──────────────────────┐
  │ 007_policy_   │   │ schema.sql   │   │ migrate.ts          │   │ migrations.test.ts   │
  │ scope.sql     │   │ (fresh-      │   │ detectBootstrap     │   │ hardcoded version    │
  │ (delta on     │──▶│  Docker-     │──▶│ Versions() v7       │──▶│ lists (lines 27-35)  │
  │  existing DBs)│   │  build path) │   │ branch              │   │                      │
  └───────────────┘   └──────────────┘   └────────────────────┘   └──────────────────────┘
```

### Recommended Project Structure
```
shared/
├── tagGrammar.ts        # existing precedent — closed-vocabulary + Zod pattern
└── policyScope.ts        # NEW — POLICY_SCOPES tuple, PolicyScope type, z.enum schema

server/db/
├── 007_policy_scope.sql  # NEW — add column, backfill, set NOT NULL + CHECK (data-only, no RLS)
└── schema.sql             # EDIT — add policy_scope to the CREATE TABLE thoughts block

server/src/
├── db.ts                  # unchanged this phase (pool definition)
├── migrate.ts              # EDIT — detectBootstrapVersions() gains a v7 branch
└── policyScope.ts          # NEW (spike output) — withPolicyScope(scope, fn) helper, kept
                             #   unwired from any production tool call site this phase

server/tests/
├── migrations.test.ts                 # EDIT — version-list assertions extended to include 7
├── policy-scope-vocabulary.test.ts    # NEW — shared/policyScope.ts unit tests
├── policy-scope-migration.test.ts     # NEW — 007 backfill/constraint behavior (mirrors
                                        #   migrations.test.ts's existing migration-006 pattern)
└── policy-scope-rls-spike.test.ts     # NEW — DECISION-01's technical spike (see Pitfall 2
                                        #   for why this must NOT use the in-transaction
                                        #   rollback pattern the migration tests use)
```

### Pattern 1: Closed-vocabulary column, no DEFAULT, mirroring shipped precedent

**What:** `policy_scope` is `text NOT NULL` with a `CHECK (... IN (...))` constraint and explicitly **no** `DEFAULT`.

**When to use:** Any boundary/security-relevant column where a permissive default would silently mint permissive rows at any INSERT site that forgets the column.

**Example — the exact shipped precedent this phase's column must mirror:**
```sql
-- Source: server/db/workflow/001_workflow_schema.sql:48-49 [VERIFIED: server/db/workflow/001_workflow_schema.sql:48-49]
policy_scope      text         NOT NULL
                                 CHECK (policy_scope IN ('personal', 'corporate', 'mixed', 'public')),
```
The comment directly above this column in the same file (`001_workflow_schema.sql:32-36`) states the rationale explicitly and names a real hazard already present in this codebase:
> `policy_scope is NOT NULL with NO DEFAULT, deliberately. A permissive default on a boundary column silently mints permissive rows wherever an INSERT forgets the column (the memory domain's consolidation promote at consolidationWorker.ts:121-134 is exactly that shape).` [VERIFIED: server/db/workflow/001_workflow_schema.sql:32-36]

That comment is not hypothetical — see Pitfall 1 below: `consolidationWorker.ts`'s promote INSERT is a real, currently-shipping write site that does not supply `policy_scope`.

### Pattern 2: `shared/policyScope.ts` — closed-vocabulary module, mirrored on `shared/tagGrammar.ts`

**What:** A single `shared/*.ts` file exporting the vocabulary as a `const` tuple, a derived TypeScript union, and (unlike `tagGrammar.ts`, which is a free-form pattern validator) a Zod `z.enum` since the vocabulary is closed and finite.

**Verbatim precedent shape** [VERIFIED: shared/tagGrammar.ts:1-16]:
```typescript
export type ValidatedTag = string & { readonly __validatedTag: unique symbol };
// ...
export const TAG_PATTERN = /^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)?$/;
export const MAX_TAGS = 16;
export const MAX_TAG_LENGTH = 64;

export function isValidatedTag(value: string): value is ValidatedTag {
  return value.length <= MAX_TAG_LENGTH && TAG_PATTERN.test(value);
}
```

**Recommended `shared/policyScope.ts` shape** (new file — no existing code to quote, this is a design recommendation, not a verified quote):
```typescript
export const POLICY_SCOPES = ["personal", "corporate", "mixed", "public"] as const;
export type PolicyScope = typeof POLICY_SCOPES[number];

export function isPolicyScope(value: string): value is PolicyScope {
  return (POLICY_SCOPES as readonly string[]).includes(value);
}

// Zod schema for MCP tool input validation (server/index.ts inputSchema blocks)
import { z } from "zod";
export const PolicyScopeSchema = z.enum(POLICY_SCOPES);
```

### Pattern 3: Fail-closed RLS predicate — the absent-GUC case must be a named branch, not implicit

**What:** A `CREATE POLICY ... USING (...)` boolean expression that denies (not permits) when the session GUC is unset.

**Why it matters:** A predicate of the shape `policy_scope = 'public' OR policy_scope = current_setting('app.policy_scope', true)` **fails open for public rows** when the GUC is unset: `policy_scope = NULL` evaluates to `NULL` (falsy), but `policy_scope = 'public'` is still `TRUE` independent of the GUC — so an unscoped/malformed request would see every `public` row. `.planning/STATE.md`'s binding constraint ("Fail-closed, not fail-open... Absence of scope must deny") and VERIFY-02's required "absent-scope denial" test both require the explicit guard:

```sql
-- Fails OPEN for public rows when app.policy_scope is unset — DO NOT USE:
CREATE POLICY policy_scope_isolation ON thoughts
  USING (
    policy_scope = 'public'
    OR policy_scope = current_setting('app.policy_scope', true)
  );

-- Fails CLOSED — the form the spike must actually test:
CREATE POLICY policy_scope_isolation ON thoughts
  USING (
    current_setting('app.policy_scope', true) IS NOT NULL
    AND (
      policy_scope = 'public'
      OR policy_scope = current_setting('app.policy_scope', true)
    )
  );
```
This single predicate correctly implements the entire D-03 visibility matrix (`personal`→`{personal,public}`, `corporate`→`{corporate,public}`, `mixed`→`{mixed,public}`) in one expression — no per-scope branching is needed, because "sees itself, plus public" is symmetric across all three values. The spike's assertions should therefore be: (a) each of the three scopes sees exactly `{itself, public}` and nothing else; (b) the GUC unset case returns zero rows, including zero `public` rows; (c) `public`-declared scope sees only `public` rows (see Open Questions — D-03 doesn't explicitly say what a `public`-declaring caller sees, but this predicate's natural behavior is "only public," which is the conservative, spec-consistent reading).

### Pattern 4: `SET LOCAL` cannot take a bind parameter — use `set_config()` instead

**What:** Postgres's `SET`/`SET LOCAL` statement does not accept a placeholder (`$1`) in its value position under the extended query protocol that `postgres.js`'s tagged templates always use for `${}` substitutions — only the `set_config(setting_name, new_value, is_local)` **function** (a normal SQL expression) accepts one. [CITED: postgresql.org/docs/current/functions-admin.html — "This function corresponds to the SQL command SET"; general community corroboration via WebSearch of "SET LOCAL bind parameter not supported" showing `set_config()` as the standard workaround]

**Practical consequence for `withPolicyScope()`:** ARCHITECTURE.md's sketched helper shape (`tx\`SET LOCAL app.policy_scope = ${scope}\``) is very likely a syntax error once postgres.js parameterizes the template — **the spike must verify this concretely** and use the function form instead:

```typescript
// Recommended shape — uses set_config(), not a literal SET LOCAL with a template hole
export async function withPolicyScope<T>(
  scope: PolicyScope,
  fn: (tx: import("postgres").TransactionSql) => Promise<T>,
): Promise<T> {
  return await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.policy_scope', ${scope}, true)`;
    return await fn(tx);
  });
}
```
`sql.begin()` reserves one physical connection for the whole callback and automatically issues `COMMIT`/`ROLLBACK` [VERIFIED: Context7 `/porsager/postgres` — "Use sql.begin to start a transaction. It reserves a connection and provides a scoped sql instance."], which is exactly the guarantee `SET LOCAL`/`set_config(..., true)` needs: the setting is transaction-scoped and Postgres itself clears it at `COMMIT`/`ROLLBACK`, before the connection can be checked out by the pool for an unrelated request. This is corroborated by a third-party discussion of the structurally identical pooled-connection hazard: "the critical guarantee is that PostgreSQL automatically reverts SET LOCAL values at transaction end... this means the GUC is already cleared before the pooler could reassign the connection to another client" [CITED: github.com/orgs/supabase/discussions/47946]. That discussion also names the exact failure mode this codebase already hit once: **bare, non-`LOCAL` `SET` leaks across the pool** — precisely what `server/db/workflow/001_workflow_schema.sql:14-21` documents happened with AGE's `search_path`.

### Anti-Patterns to Avoid
- **Bare `SET` instead of `SET LOCAL`/`set_config(..., true)`:** This codebase has already shipped this bug once (the AGE `search_path` pollution documented in `server/db/workflow/001_workflow_schema.sql:14-21`). Any RLS GUC-setting code must use the transaction-scoped form, never plain `SET`.
- **Copying `parseContext.ts`'s fail-open idioms onto a boundary column:** `list_thoughts`'s current filter shape, `(${project}::text IS NULL OR project = ${project})` [VERIFIED: server/index.ts:639], is a correct pattern for a *ranking/optionality* filter but is the wrong shape for a security boundary — `IS NULL OR` means "absent filter = show everything," which is exactly the default-allow gap POLICY-02 and STATE.md's binding constraint forbid. Do not reuse this idiom for `policy_scope`.
- **Enabling `FORCE ROW LEVEL SECURITY` on the production `thoughts` table as part of this phase's migration:** see Pitfall 1 (Common Pitfalls) — this is the single highest-severity risk this research identified.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Closed-vocabulary validation | A custom string-matching validator | `z.enum(POLICY_SCOPES)` (Zod, already a pinned dependency) | Already the platform's validation library; `tagGrammar.ts` uses hand-rolled regex only because tags are an *open* namespaced grammar, not a closed set — `policyScope.ts` doesn't need that machinery |
| Scoped access control | A general policy engine (OPA/Cedar/Casbin) | Postgres `CHECK` constraint + (RLS or WHERE, per DECISION-01) | Explicitly rejected in REQUIREMENTS.md's Out of Scope table; one subject × 4 closed values does not warrant a policy DSL |
| Per-request session variable scoping | A custom connection-affinity/sticky-session layer | `postgres.js`'s built-in `sql.begin()` (transaction-scoped reserved connection) or `sql.reserve()` (manually-scoped reserved connection) | Already provided by the pinned driver; hand-rolling connection affinity is exactly the class of bug (`server/db/workflow/001_workflow_schema.sql:14-21`) this codebase has already been burned by once |

**Key insight:** Every piece of new infrastructure this phase needs — closed-vocabulary validation, transaction-scoped session variables, boolean-predicate access control — already exists in a dependency this project has pinned for over a year. The engineering risk in this phase is entirely in *correct composition* (fail-closed predicate shape, `set_config()` not bare `SET LOCAL` templating, migration-surface synchronization), not in missing tooling.

## Common Pitfalls

### Pitfall 1: Enabling `FORCE ROW LEVEL SECURITY` on production `thoughts` as part of this phase would break every other tool immediately

**What goes wrong:** If the D-04 spike concludes "RLS wins" and the phase's migration includes `ALTER TABLE thoughts ENABLE ROW LEVEL SECURITY; ALTER TABLE thoughts FORCE ROW LEVEL SECURITY; CREATE POLICY ...`, then from that moment forward **every** query the pooled `ai_memory` role issues against `thoughts` is filtered by the policy — including `search_thoughts`, `capture_thought`'s read-back, `thought_stats`, `fetch`, `search`, and all three background workers (`entityWorker`, `consolidationWorker`, `embeddingBackfill`), none of which call `withPolicyScope()` yet (that wiring is Phase 6's `RETRIEVAL-01`..`04` and Phase 8's `EGRESS-01`). With no session GUC set, the fail-closed predicate (Pattern 3) returns **zero rows for every one of those paths**, and background workers reading `thoughts` for consolidation/entity-extraction/embedding sweeps would appear to silently stop finding work.

**Why it happens:** DECISION-01's phrasing ("chosen and documented") and D-04's spike-against-`list_thoughts` framing can be read as "build the real thing and leave it on," when the phase boundary explicitly states retrieval filtering is Phase 6's job, not this phase's.

**How to avoid:** Ship the `007_policy_scope.sql` migration as **column + CHECK constraint only** (POLICY-01/POLICY-02) — no `ENABLE`/`FORCE ROW LEVEL SECURITY`, no `CREATE POLICY`, on the real production table. Do the D-04 spike (whichever mechanism it proves) against `db-test` only (see Pitfall 2), and if RLS wins, hand Phase 6 the *proven design* (helper function, policy SQL, test evidence) as a reviewed artifact — Phase 6 is the phase that actually flips the switch on `thoughts`, once every read/write path has been migrated onto `withPolicyScope()` in the same change.

**Warning signs:** Any Phase 5 migration file or task description containing `FORCE ROW LEVEL SECURITY` targeting `public.thoughts` (as opposed to a scratch/test table or `db-test`-only spike code) should be treated as a blocking review finding.

### Pitfall 2: The obvious "wrap the spike in `sql.begin()` and throw to roll back" pattern proves nothing

**What goes wrong:** `migrations.test.ts` already uses exactly this pattern for migration 006 — apply DDL inside `sql.begin(async (tx) => {...; throw new Error("rollback fixture");}).catch(...)` [VERIFIED: server/tests/migrations.test.ts:127-194, see exact quote below] — and it is tempting to reuse it verbatim for the D-04 RLS spike. It will not work as evidence for D-04: `withPolicyScope()`'s production shape calls `sql.begin()` on the **pool** (`server/src/db.ts`'s exported `sql`), which checks out **a different physical connection** than whatever connection the outer test's own `sql.begin()` reserved. Any RLS/`FORCE`/`CREATE POLICY` DDL applied on the outer (uncommitted) transaction's connection is invisible to a query issued on the inner, separately-checked-out connection — it only sees already-committed database state. The inner call would see RLS off and return every row regardless of scope, and the spike would "pass" (or fail) for reasons that have nothing to do with whether RLS or `SET LOCAL` actually works.

**Why it happens:** The migrations.test.ts precedent is designed to test DDL *content* (does this SQL text produce the right final shape?), which only ever needs one connection. D-04's spike needs to test *pooling behavior itself* — the one thing that requires two independently-checked-out connections to be meaningfully exercised.

**How to avoid:** Use one of two honest designs, and name the choice in the plan:
- **Commit-and-teardown against `db-test` (recommended):** Actually `COMMIT` the RLS DDL against `db-test` (guarded by `requireTestDatabase()` [VERIFIED: server/tests/_helpers/testDatabaseGuard.ts:126-167]), run the real `withPolicyScope()` helper against the real pool, assert the visibility matrix and the fail-closed case, then tear down reliably in a `try/finally` (`DROP POLICY`, `ALTER TABLE thoughts NO FORCE ROW LEVEL SECURITY`, `ALTER TABLE thoughts DISABLE ROW LEVEL SECURITY`). Teardown must be unconditional — `db-test` accumulates across runs within a session per CLAUDE.md, so a spike that leaves RLS enabled on `db-test` would break every subsequent test run in that session, not just its own.
- **Savepoint-scoped, single-connection emulation:** Stay inside one reserved connection and one outer rollback, proving the *predicate logic* is correct in isolation — but this cannot exercise the real pool-checkout behavior `withPolicyScope()` depends on, so it answers "is the SQL correct?" not "does this survive `postgres.js`'s connection pooling?" (D-04's actual question).

**Verbatim precedent this pitfall is refining, not just referencing** [VERIFIED: server/tests/migrations.test.ts:127, 151, 191-194]:
```
await sql.begin(async (tx) => {
  await tx`ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS profile text`;
  ...
  await tx.unsafe(migration);
  ...
  throw new Error("rollback migration 006 fixture");
}).catch((err) => {
  if ((err as Error).message !== "rollback migration 006 fixture") throw err;
});
```

**Warning signs:** A spike test file that calls `sql.begin()` exactly once and asserts RLS behavior entirely inside that one block/one connection has not actually exercised pooling — it has proven the predicate is syntactically valid, nothing more.

### Pitfall 3: Two existing `INSERT INTO thoughts` sites will hard-fail the moment the column goes `NOT NULL`

**What goes wrong:** `capture_thought`'s insert (`server/index.ts:524-546`) and `consolidationWorker.ts`'s wiki-promotion insert (`server/src/consolidationWorker.ts:120-134`) both currently omit any `policy_scope` value. Once the migration lands, both statements violate the `NOT NULL` constraint on their very next execution — `capture_thought` becomes uncallable, and the consolidation worker's promote step throws on every promotion — a self-inflicted production outage, not a security gap.

**Why it happens:** POLICY-02's "no default-allow gap during or after migration" wording is usually read as being about pre-existing rows (D-02's backfill), but "after migration" also covers every row inserted from that point forward, and CAPTURE-01 (letting a caller declare `policy_scope` at write time) is explicitly deferred to v2 in `.planning/REQUIREMENTS.md`.

**How to avoid:** In the same phase, add `policy_scope` to both `INSERT` column lists with a hardcoded interim value (recommend `'corporate'`, matching D-02's rationale — see Assumption A1 below, this needs explicit confirmation since CONTEXT.md doesn't decide it) — **not** a table-level `DEFAULT`, to preserve the "forgetting fails loudly" property the no-default design intentionally buys. For `consolidationWorker.ts`'s promote specifically, the more correct fix is to **carry the source shard's `policy_scope` forward** into the promoted wiki row (`SELECT ..., policy_scope, ... FROM thoughts WHERE id = ${shardId}`) rather than hardcoding a literal, since a wiki promoted from a `personal`-scoped shard should not silently become `corporate`.

**Also close the loop CONTEXT.md's upstream research flagged but didn't land in a decision:** `capture_thought`'s `ON CONFLICT (content_fingerprint) DO UPDATE` clause (`server/index.ts:547-558`) must **not** touch `policy_scope` in its `SET` list — SUMMARY.md's one point of unanimous agreement across all four research passes is "`capture_thought`'s `ON CONFLICT` merge must never union `policy_scope` across two closed values," matching the global content-fingerprint dedup design (`schema.sql:45-48`: the same normalized text can only exist as one row, at one scope). This is silent/inert in v1.1 (every new row is the same hardcoded interim value), but becomes load-bearing the moment CAPTURE-01 (v2) lets two different callers race to capture the same text at two different scopes — the existing row's scope must win, not merge.

**Warning signs:** Any `INSERT INTO thoughts (...)` column list that doesn't include `policy_scope` after this migration lands is broken; a code-review grep for `INSERT INTO thoughts` should return exactly two matches in `server/`, both updated.

### Pitfall 4: Three additional schema-definition surfaces must move in lockstep with the migration file, or a fresh database silently diverges from an upgraded one

**What goes wrong:** This repo has already needed exactly this kind of synchronized update for migrations 003–006 [VERIFIED: `docker/postgres-age/Dockerfile:19-27`, `server/src/migrate.ts:108-197`], and it is easy to miss for a new migration:

1. **`docker/postgres-age/Dockerfile:24-27`** bakes `server/db/schema.sql`, `graph.sql`, and (oddly, historically) `002_needs_embedding.sql` directly into `/docker-entrypoint-initdb.d/`, meaning every freshly-built `db`/`db-test` Postgres container gets its schema from `schema.sql` verbatim, **not** from replaying `003_*.sql` through `006_*.sql` — yet `schema.sql` (as currently written) already contains the columns/tables those four migrations introduce (`search_text`, `tags`, `recall_queries`, `worker_runs`, `feedback_events`) [VERIFIED: server/db/schema.sql:16-30, 148-157, 209-238], confirming `schema.sql` is manually kept in sync with the *cumulative* end state.
2. **`server/src/migrate.ts`'s `detectBootstrapVersions()` (lines 108-196)** reconciles this: on a fresh, `schema_migrations`-empty database it probes `information_schema` for each migration's tell-tale column/table and marks that version "applied" **without re-running its SQL content**, specifically so a fresh Docker build (which already has the column from `schema.sql`) doesn't try to re-run `ADD COLUMN`/backfill logic that would be a no-op or, worse, re-touch already-correct data.
3. **`server/tests/migrations.test.ts:27-35`** hardcodes the expected `[1,2,3,4,5,6]` version list and filename array as a test assertion [VERIFIED: server/tests/migrations.test.ts:27-35, exact quote: `assertEquals(afterBootstrap.map((row) => row.version), [1, 2, 3, 4, 5, 6]); assertEquals(afterBootstrap.map((row) => row.filename), ["001_initial.sql", "002_needs_embedding.sql", "003_search_text_and_recall_queries.sql", "004_worker_runs.sql", "005_feedback_events.sql", "006_tags_replace_profile.sql"]);`] — adding `007_policy_scope.sql` without updating this list turns the migration-framework test red on every run, per ST-084 §6.2's own recorded finding that this file "hardcoded the migration version list in four places, so adding *any* migration to the shared chain reds the suite until updated."

**Why it happens:** The numbered-migration file is the visible, obvious deliverable; the other three surfaces are easy to forget because nothing fails loudly until a fresh `db-test` build and an upgraded `db` diverge, or until the test suite runs.

**How to avoid:** Treat this as one task cluster with four files, not one: (a) `server/db/007_policy_scope.sql` (the delta migration), (b) `server/db/schema.sql` (add `policy_scope` directly to the `CREATE TABLE public.thoughts` block, matching the migration's final column shape), (c) `server/src/migrate.ts`'s `detectBootstrapVersions()` (add a v7 branch checking for the `policy_scope` column's existence, mirroring the existing v6 branch's `tagsColumn`/`profileColumn` pattern), (d) `server/tests/migrations.test.ts:27-35` (extend both arrays to include `7`/`"007_policy_scope.sql"`).

**Warning signs:** A fresh `docker compose --profile test up -d --build` producing a `db-test` where `\d thoughts` does not show `policy_scope`, while `docker compose up -d` (long-running `db`) does — that divergence is exactly this pitfall.

## Code Examples

### `withPolicyScope()` helper (D-04 spike centerpiece)
```typescript
// New file, e.g. server/src/policyScope.ts — design recommendation, not a verified quote
import { sql } from "./db.ts";
import type { PolicyScope } from "../../shared/policyScope.ts";

export async function withPolicyScope<T>(
  scope: PolicyScope,
  fn: (tx: Parameters<Parameters<typeof sql.begin>[0]>[0]) => Promise<T>,
): Promise<T> {
  return await sql.begin(async (tx) => {
    // set_config(), NOT a templated `SET LOCAL app.policy_scope = ${scope}` —
    // SET/SET LOCAL cannot take a bind parameter under the extended query protocol.
    await tx`SELECT set_config('app.policy_scope', ${scope}, true)`;
    return await fn(tx);
  });
}
```

### Fail-closed RLS policy (Pattern 3, repeated here as the literal DDL the spike applies)
```sql
-- Source: PostgreSQL Row Security Policies docs, https://www.postgresql.org/docs/current/ddl-rowsecurity.html
-- [CITED: postgresql.org/docs/current/ddl-rowsecurity.html]
ALTER TABLE thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE thoughts FORCE ROW LEVEL SECURITY; -- required: table owner otherwise bypasses RLS entirely
CREATE POLICY policy_scope_isolation ON thoughts
  USING (
    current_setting('app.policy_scope', true) IS NOT NULL
    AND (
      policy_scope = 'public'
      OR policy_scope = current_setting('app.policy_scope', true)
    )
  );
```

### Migration file shape (`007_policy_scope.sql`), single transaction per `migrate.ts`'s `sql.begin()` wrapper
```sql
-- Design recommendation mirroring server/db/006_tags_replace_profile.sql's shape
-- [VERIFIED: server/db/006_tags_replace_profile.sql:1-6 for the "standalone idempotent delta" convention]
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
This backfill `UPDATE` fires **no** trigger on `thoughts`: `trg_queue_consolidation` is `AFTER INSERT ON public.thoughts` only [VERIFIED: server/db/schema.sql:123-124, exact quote: `CREATE TRIGGER trg_queue_consolidation AFTER INSERT ON public.thoughts`], and `trg_queue_entity_extraction` is `AFTER INSERT OR UPDATE OF content ON public.thoughts` [VERIFIED: server/db/graph.sql:82-83, exact quote: `CREATE TRIGGER trg_queue_entity_extraction AFTER INSERT OR UPDATE OF content ON public.thoughts`] — a column-scoped `UPDATE OF content` trigger only fires when `content` appears in the `UPDATE`'s `SET` list, which this backfill does not touch. So the backfill will not flood the consolidation queue or the entity-extraction queue.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `profile: professional \| personal` binary scoping | `tags: string[]` free-form namespaced tags | ADR-012, migration `006_tags_replace_profile.sql` | `policy_scope` is deliberately **additive and separate** from tags — POLICY-01 explicitly says "distinct from free-form descriptive tags," and this phase must not resurrect a `profile`-like binary column |

**Deprecated/outdated:** None specific to this phase — this is new surface, not a replacement of an existing mechanism.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | New `capture_thought` (and `consolidationWorker` promote) writes should get a hardcoded interim `policy_scope` of `'corporate'` until CAPTURE-01 (v2) lets callers declare it | Pitfall 3 | If the actual desired interim value differs (e.g., `'mixed'`, or per-project inference), every thought captured during v1.1 is misclassified and needs a later data migration — REQUIREMENTS.md's Out of Scope table explicitly excludes "legacy-row backfill tooling beyond the interim default," so this would be a one-way mistake, same reversibility class as D-02 |
| A2 | A caller declaring `scope: 'public'` (once retrieval enforcement exists, Phase 6+) sees only `public` rows, not `{public, corporate}` or any wider set | Pattern 3 | D-03 only states what `personal`/`corporate`/`mixed` see; `public`'s own "what does it see" case is not explicitly stated. The natural behavior of the recommended single-predicate implementation is "public sees only public," which is the conservative reading, but this should be confirmed as an explicit row in the visibility matrix deliverable rather than left implicit |
| A3 | Postgres treats `ALTER TABLE ... ENABLE\|FORCE ROW LEVEL SECURITY` and `CREATE POLICY` as fully transactional DDL (rollback-safe) | Pitfall 2 | General, very well-established PostgreSQL behavior (unlike MySQL, virtually all DDL in Postgres is transactional) but not independently re-verified against the current docs in this session; the spike's own commit-and-teardown design (Pitfall 2) does not depend on this assumption being true, so the risk is contained to the (not-recommended) savepoint-emulation alternative |

**Note:** Every other claim in this document is `[VERIFIED: <file>:<lines>]` (in-repo, read this session with an accompanying verbatim quote) or `[CITED: <url>]` (official docs / Context7 / a specific third-party discussion). Package versions are `[VERIFIED: npm registry]` via direct `npm view` calls this session.

## Open Questions

1. **Do `recall_events`/`recall_queries` gain a `policy_scope` column in this phase, or in Phase 6/9?**
   - What we know: SUMMARY.md's Phase-1 sketch mentions adding scope columns to both tables "at the same migration as `thoughts.policy_scope`" [CITED: `.planning/research/SUMMARY.md:66`], reasoning that these tables are an "exports/introspection surface" that would otherwise leak cross-scope query text to any future dashboard/admin tool.
   - What's unclear: CONTEXT.md's REQUIREMENTS.md scope for this phase is POLICY-01/POLICY-02/DECISION-01 only — `recall_events`/`recall_queries` are not named requirements here, and VERIFY-03 (Phase 9) is where scope-denial logging is formally required.
   - Recommendation: Leave the column addition to whichever phase actually starts writing scope-aware query text to these tables (Phase 6, since `search_thoughts`/`list_thoughts` are the callers of `logRecall`/`logRecallQuery`) rather than adding an unused column now — CONTEXT.md already flags this explicitly as left to planning, and adding it here would be scope creep against this phase's three named requirements.

2. **Is the D-04 spike's `withPolicyScope()` helper and RLS policy SQL kept as a committed, unwired artifact for Phase 6 to build on, or fully torn down?**
   - What we know: CONTEXT.md leaves "exact spike scaffolding/teardown shape" to planning discretion. Pitfall 1 establishes that the policy **cannot** be live on production `thoughts` after this phase.
   - What's unclear: whether "not live" means "the helper function and policy SQL exist in the repo, reviewed and tested, just not applied to the real table yet" (recommended — Phase 6 has a proven starting point) vs. "the spike's code is deleted after the decision is made" (CONTEXT.md's SC #2 wording, "validated by a technical spike," is satisfied by either).
   - Recommendation: Keep the helper (`withPolicyScope()`) and the policy SQL as committed, reviewed, but **unwired** artifacts (no production call site references them yet) — this matches the pattern the codebase already uses for the workflow module's own staged rollout (`server/db/workflow/001_workflow_schema.sql`'s header: "Stage 1 DEFINES this column; enforcement across retrieval paths is Stage 2" [VERIFIED: server/db/workflow/001_workflow_schema.sql:37]) and avoids Phase 6 re-deriving the same design from scratch.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 15 + pgvector + AGE (Docker image) | All of POLICY-01/02/DECISION-01 | ✓ (already the platform, `docker/postgres-age/Dockerfile`) | 15 | — |
| `mcp-test`/`db-test` Docker test profile | Running the D-04 spike safely (Pitfall 2) | ✓ (already the platform's test isolation mechanism) | — | — |
| `postgres` npm package (postgres.js) | `withPolicyScope()`, `sql.begin()`/`sql.reserve()` | ✓ pinned `3.4.4`, current on registry `3.4.9` [VERIFIED: npm registry] | 3.4.4 | — |
| `zod` npm package | `shared/policyScope.ts`'s `z.enum` | ✓ pinned `4.1.13`, current on registry `4.4.3` [VERIFIED: npm registry] | 4.1.13 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — this phase needs no environment beyond what is already running.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Deno's built-in test runner (`Deno.test`), no separate test framework config file |
| Config file | none — test discovery is by file convention (`server/tests/*.test.ts`), run explicitly per CLAUDE.md's documented commands |
| Quick run command | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/<new-file>.test.ts` |
| Full suite command | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read --allow-write=/tmp --allow-run=deno,git tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POLICY-01 | `shared/policyScope.ts` accepts exactly the four closed values and rejects everything else | unit | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/policy-scope-vocabulary.test.ts` | ❌ Wave 0 |
| POLICY-01 | `thoughts.policy_scope` `CHECK` constraint rejects an out-of-vocabulary value at the DB layer | integration | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/policy-scope-migration.test.ts` | ❌ Wave 0 |
| POLICY-02 | Migration backfills every pre-existing NULL row to `'corporate'`; post-migration, `INSERT`ing without `policy_scope` fails; `capture_thought`/`consolidationWorker` inserts (as updated) succeed with the interim value | integration | same file as above | ❌ Wave 0 |
| POLICY-02 | Migration framework's version-list assertions include `7`/`"007_policy_scope.sql"` | regression | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/migrations.test.ts` | ✅ (extend existing) |
| DECISION-01 | Spike proves the visibility matrix (each scope sees `{itself, public}`), the absent-GUC fail-closed case, and — if RLS is chosen — that `SET LOCAL`/`set_config` scoping survives a real pool checkout under concurrent scope values | integration (`db-test`, committed-and-torn-down per Pitfall 2) | `docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env --allow-read tests/policy-scope-rls-spike.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** run the specific new/changed test file via the quick-run command above.
- **Per wave merge:** full suite (`tests/` with all four grants) — this phase touches shared migration infrastructure (`migrate.ts`, `migrations.test.ts`) that other suites depend on, so a full-suite run before merge is not optional.
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `server/tests/policy-scope-vocabulary.test.ts` — covers POLICY-01 (closed-vocabulary validation)
- [ ] `server/tests/policy-scope-migration.test.ts` — covers POLICY-01/POLICY-02 (column, CHECK, backfill, updated INSERT sites), styled on the existing `migration 006` test pattern (`server/tests/migrations.test.ts:120-194`)
- [ ] `server/tests/policy-scope-rls-spike.test.ts` — covers DECISION-01's technical spike; must use the commit-and-teardown design (Pitfall 2), not the in-transaction-rollback pattern
- [ ] `server/tests/migrations.test.ts` — extend, not new: version-list arrays at lines 27-35 must include migration 7

## Security Domain

### Applicable ASVS Categories

*(Using ASVS 4.0.3's chapter numbering, which matches this template's V-numbers; `.planning/config.json` does not pin an ASVS version.)*

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V1 Architecture, Design and Threat Modeling | yes | This phase's own SC #2 deliverable IS a written threat-model/trust-boundary statement — the phase satisfies this category by definition, not by adopting an external control |
| V2 Authentication | no | Unchanged this phase — D-01 explicitly keeps the existing single `MEMORY_API_KEY` model |
| V3 Session Management | no | No session concept beyond the existing Bearer-auth request boundary |
| V4 Access Control | yes | The core subject of DECISION-01 — either Postgres RLS (`FORCE ROW LEVEL SECURITY` + `CREATE POLICY`) or explicit per-path `WHERE` predicates, both of which are standard, recognized ASVS V4 controls (row-level access control) |
| V5 Validation, Sanitization and Encoding | yes | The `CHECK` constraint + `z.enum` closed-vocabulary validation is exactly this category's concern — reject any `policy_scope` value outside the enumerated set, at both the application boundary and the database boundary |
| V6 Cryptography | no | Not touched this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Default-allow gap on a new boundary column (a row exists with no scope, or an invalid scope, during/after migration) | Information Disclosure | `NOT NULL` + `CHECK` constraint with **no** `DEFAULT` (Pattern 1); explicit backfill before the constraint is added, not after |
| Session-variable leakage across a pooled connection (bare `SET` instead of `SET LOCAL`) | Information Disclosure (cross-request scope bleed) | `set_config(name, value, true)` inside `sql.begin()`'s reserved-connection transaction, never a bare `SET` — this codebase has already shipped and documented this exact bug once for AGE's `search_path` (`server/db/workflow/001_workflow_schema.sql:14-21`) |
| RLS silently bypassed because the connecting role owns the table | Elevation of Privilege (RLS believed active, isn't) | `ALTER TABLE ... FORCE ROW LEVEL SECURITY` — required because the single `ai_memory` role owns every table in this deployment [CITED: postgresql.org/docs/current/ddl-rowsecurity.html — "Table owners normally bypass row security... unless FORCE ROW LEVEL SECURITY"] |
| Fail-open predicate on the absent-GUC/absent-scope case | Elevation of Privilege / Information Disclosure | Explicit `current_setting(..., true) IS NOT NULL` guard as the leading conjunct of any RLS `USING` clause (Pattern 3) |
| `ON CONFLICT` merge widening a security-relevant column (mirrors the existing `tags` merge behavior, applied to the wrong column) | Elevation of Privilege | `policy_scope` must be absent from the `DO UPDATE SET` list entirely — the existing row's scope always wins, never merged (Pitfall 3) |

## Sources

### Primary (HIGH confidence)
- `server/db/workflow/001_workflow_schema.sql` (this session, lines 1-175) — shipped `policy_scope` column precedent, the documented AGE `search_path` pooling bug, and the Stage-1/Stage-2 staged-rollout pattern
- `shared/tagGrammar.ts` (this session, full file) — closed-vocabulary module precedent
- `server/src/db.ts`, `server/src/migrate.ts`, `server/src/parseContext.ts` (this session, full files) — pool definition, migration runner internals, existing (fail-open) context-parsing idiom
- `server/db/schema.sql`, `server/db/006_tags_replace_profile.sql`, `server/db/graph.sql` (this session) — current table shape, prior migration precedent, trigger definitions
- `server/index.ts` (this session, lines 486-1103) — `capture_thought`, `list_thoughts`, `thought_stats`, `graph_traverse`, `graph_search` tool implementations
- `server/src/consolidationWorker.ts` (this session, lines 100-155) — the second unguarded `INSERT INTO thoughts` site
- `server/tests/migrations.test.ts` (this session, lines 1-234) — existing migration-test pattern, its limits for D-04
- `server/tests/_helpers/testDatabaseGuard.ts` (this session, full file) — `requireTestDatabase()` guard required for any `db-test`-mutating spike
- `docker/postgres-age/Dockerfile` (this session, full file) — fresh-build init-script chain, confirming the `schema.sql`-vs-numbered-migration divergence
- Context7 `/porsager/postgres` — `sql.begin()` transaction/reserved-connection semantics
- [PostgreSQL 17 Row Security Policies (current docs)](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — `ENABLE`/`FORCE ROW LEVEL SECURITY` syntax, owner-bypass semantics
- [PostgreSQL current docs — Configuration Settings Functions (`set_config`)](https://www.postgresql.org/docs/current/functions-admin.html) — `set_config()` signature and transaction-scoping semantics
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/phases/05-policy-scope-foundation/05-CONTEXT.md` (this session) — locked decisions and binding constraints
- `docs/investigations/ST-084-awcp-host-spike-findings.md` §6.1, §6.3, §13.1-13.6 (this session) — the original 15-path pricing table and the "no single chokepoint" finding

### Secondary (MEDIUM confidence)
- [SET LOCAL isolation under transaction-mode pooling — Supabase GitHub Discussion #47946](https://github.com/orgs/supabase/discussions/47946) — corroborates that `SET LOCAL`/`set_config(..., true)` inside an explicit transaction is isolated between clients on a pooled connection, and that a bare session-level `SET` is the actual leak vector (matches this codebase's own documented AGE bug)
- `.planning/research/SUMMARY.md`, `STACK.md`, `ARCHITECTURE.md` (read this session) — the two disagreeing HIGH-confidence research passes that fed CONTEXT.md's D-04

### Tertiary (LOW confidence)
- General WebSearch results on `SET LOCAL`/bind-parameter limitations and `current_setting(..., true)` RLS idioms — used only to corroborate the official-docs-derived claims above, not as a standalone source

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, both pinned libraries directly verified against the npm registry this session
- Architecture (migration touch-points, insert-site gaps): HIGH — every claim is a direct file read with a verbatim quote and line range, not inference
- DECISION-01 mechanism tradeoffs: HIGH for the technical facts (pooling behavior, RLS syntax, bind-parameter limitation), by design MEDIUM for "which mechanism wins" — that is exactly what the spike this research designs is for, not something research can settle from a desk
- Pitfalls: HIGH — three of four pitfalls are grounded in exact, quoted, currently-shipping code; the fourth (RLS-vs-pooling correctness) is grounded in official docs plus a directly analogous third-party discussion of the identical hazard class

**Research date:** 2026-08-28
**Valid until:** 30 days (stable PostgreSQL/postgres.js APIs; the in-repo findings are current as of this commit and should be re-verified if `server/index.ts`, `migrate.ts`, or `schema.sql` change materially before planning executes)
