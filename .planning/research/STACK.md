# Stack Research

**Domain:** Default-deny policy-scope enforcement for a single-user Deno/PostgreSQL memory service
**Researched:** 2026-08-28
**Confidence:** HIGH (grounded in the existing codebase and the ST-084 Stage 1 pricing findings, which already piloted this exact column); LOW-confidence external corroboration noted separately

## Framing

This is not a green-field ecosystem choice. The v1.1 milestone adds one capability to an
already-decided stack (Deno 2.0 / TypeScript / Hono / `postgres.js` / pgvector / Apache AGE — ADR-009,
ADR-011). The right question is not "what library implements policy scope" but "what is the
smallest addition, consistent with patterns this codebase already uses in three other columns,
that gets a closed 4-value vocabulary enforced as default-deny across every read and every
provider-egress call." **The codebase has already answered most of this question for itself**:
`server/db/workflow/001_workflow_schema.sql` defines a `policy_scope text NOT NULL CHECK
(policy_scope IN ('personal','corporate','mixed','public'))` column, and
`server/src/workflow/types.ts` / `api.ts` mirror it in TypeScript with a `PolicyScope` union,
a `POLICY_SCOPES` const array, and a `z.enum(POLICY_SCOPES)` Zod schema. The ST-084 findings
(`docs/investigations/ST-084-awcp-host-spike-findings.md` §7.2, §13) call this vocabulary
"already shipped as a CHECK-constrained column and proven DB-enforced in Stage 1" and price
enforcing it — as a filter, not just a column — across the 15 memory-domain read/egress paths at
64+ hours. This milestone (ST-082) is the first real consumer of that pricing table. The stack
recommendation below is: **reuse that exact pattern for the memory domain (`public.thoughts`),
do not introduce anything new for the vocabulary or the constraint, and extend the one gating
pattern (`ModelProviderDisabledError` in `server/src/embeddings.ts`) that already proves
zero-network-on-deny for egress.**

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| PostgreSQL `CHECK` constraint on a `text NOT NULL` column, no `DEFAULT` | PG15 (already the pinned major) | Closed-vocabulary storage for `policy_scope` on `public.thoughts` (and any other scoped table) | Matches the pattern already used four times in `schema.sql` (`memory_type`, `status` on `consolidation_queue`/`workflow.work_packets`, `source`, `verdict`) and exactly matches the `policy_scope` column already shipped in `server/db/workflow/001_workflow_schema.sql:48-49`. `NOT NULL` with **no default** is deliberate precedent from that same file: a permissive default silently mints permissive rows on any INSERT that forgets the column; omitting it fails loudly at write time instead. Adding/removing an allowed value later is `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ...` — no catalog/type change, no `ALTER TYPE ... ADD VALUE` lock/transaction restrictions. |
| Zod (`npm:zod@4.1.13`, already vendored) | 4.1.13 | Mirror the closed vocabulary at the MCP tool-input boundary, with TS type inference | Already a project dependency, already used for exactly this purpose: `server/src/workflow/api.ts:59-61` builds `policyScopeSchema = z.enum(POLICY_SCOPES as unknown as [PolicyScope, ...PolicyScope[]])`, and `server/src/workflow/schema.ts:427-430` documents the intent explicitly — "`z.enum` over the identical vocabulary the eventual CHECK constraint will hold." Reuse this construction for the memory-domain `PolicyScope`; do not hand-roll a second string-union validator. |
| TypeScript closed union type + `const` array (`PolicyScope`, `POLICY_SCOPES`) | n/a (language feature) | Single source of truth for the vocabulary shared by DB CHECK, Zod schema, and application code | Already defined at `server/src/workflow/types.ts:37-45`. Because this milestone treats policy scope as **ai-memory's own isolation obligation** (PROJECT.md), not a workflow-module concern, this type should move to (or be re-exported from) a shared location such as `shared/policyScope.ts` — the same place `shared/tagGrammar.ts` already lives, imported today by `server/src/parseContext.ts` via a relative path from `server/src/`. That gives the memory-domain `thoughts.policy_scope` column and the existing `workflow.work_packets.policy_scope` column one canonical vocabulary instead of two copies that can drift. |
| `postgres` (`npm:postgres@3.4.4`, already the DB client) | 3.4.4 | Parameterized `WHERE policy_scope = ANY($allowedScopes)` predicates added directly to existing hand-written queries | This is the client already used everywhere (`server/src/db.ts`); it has no query-builder or ORM layer to route around. The ST-084 pricing table's own methodology for the "Straightforward" paths is literally "add `AND scope = $scope` to existing WHERE clause; no structural change required" (§13.1) — that is a one-line edit to an existing `sql\`...\`` tagged template, not a new abstraction. |
| `fetch` + `AbortController` guard, extended (`server/src/embeddings.ts` pattern) | n/a (Deno runtime built-ins, already in use) | Default-deny gating of provider egress (OpenRouter) by policy scope | `getEmbedding()` already demonstrates the exact shape needed: check a condition **before** constructing the `Request` and throw a named, `instanceof`-checkable error (`ModelProviderDisabledError`) so a caller whose contract requires the provider fails loudly. `server/tests/provider-egress.test.ts` already proves this pattern produces zero network hits when the switch is off, via a "provider sentinel" test server, and proves the same code path DOES reach the sentinel when the switch is on (the discrimination control). Add a sibling `PolicyScopeViolationError` and a scope check with the same shape at the three real egress call sites — `entityWorker.ts` (`fetch` to `.../chat/completions`), `consolidationLLM.ts` (`fetch` to the same endpoint), and `embeddings.ts` itself (embedding backfill) — rather than introducing a new HTTP-gateway or interceptor layer. |

### Supporting Libraries

No new runtime dependencies are needed. Everything above is either a SQL-level constraint or
already-vendored (Zod, `postgres`, Deno's native `fetch`). The only "new" artifact this milestone
adds is application code: a shared scope-vocabulary module, one or two new WHERE-clause
predicates per read path, one gating function reused at the egress call sites, and — per the
ST-084 risk table (§13.4) — a small shared validation helper that requires **explicit deny-on-null**
for scope columns, so `parseContext.ts`'s existing fail-open idioms (`projects?.[0]`, bare
`strict` no-op, `IS NULL OR` patterns used for `project`) are never copied onto a boundary column.
That helper is a ~10-line pure function, not a package.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Existing Deno test runner + `mcp-test`/`db-test` Docker profile | Red/green control tests per enforced path | ST-084 §13.4 sizes this at "15 paths × 2 assertions = 30 test cases minimum" — a red control (enforcement removed → cross-scope read should fail but doesn't) and a green control (enforcement present → in-scope read passes) per path. Use the same integration-test shape as `server/tests/provider-egress.test.ts` (full MCP call stack, not isolated SQL) so the test proves the actual tool boundary, not just the query. |
| `server/tests/_helpers/serverProcess.ts`'s `startProviderSentinel` | Egress-gating discrimination control | Already built for ST-086's `MODEL_PROVIDER_ENABLED` gate; reusable as-is to prove a scope-denied call makes zero requests to OpenRouter, and that an in-scope call still reaches the sentinel. |

## Installation

```bash
# No new packages required — this milestone reuses:
#   npm:postgres@3.4.4   (server/src/db.ts, already vendored)
#   npm:zod@4.1.13        (server/deno.json import map, already vendored)
#   Deno native fetch/AbortController (no import needed)
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|--------------|-------------|--------------------------|
| `text NOT NULL CHECK (policy_scope IN (...))` | Native `CREATE TYPE policy_scope AS ENUM (...)` | Only if the vocabulary needs to be a first-class reusable type across many tables with value-ordering guarantees, or if enum-typed columns' smaller on-disk representation matters at a scale this single-user store does not have. Native enums also carry a real operational cost this codebase has not paid elsewhere: `ALTER TYPE ... ADD VALUE` cannot run inside the same transaction that uses the new value (pre-PG12 restriction, still a common footgun) and removing a value requires dropping and recreating the type against every dependent column. A CHECK constraint is `DROP CONSTRAINT` / `ADD CONSTRAINT` — the same low-ceremony DDL already used for `memory_type`, `status`, `source`, and `verdict` in `schema.sql`. |
| App-level `WHERE policy_scope = ANY(...)` predicate per read path | PostgreSQL Row-Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) | Reconsider if/when the deployment becomes multi-role or multi-tenant. RLS needs a second DB role plus session-scoped `SET`/GUC wiring across a **pooled** connection (the `postgres.js` pool in `server/src/db.ts` has `max: 10`, and AGE queries already leave sticky, session-scoped `search_path` state on pooled connections per the workflow schema's own migration-file warning) — that pooling interaction is exactly the kind of hazard this codebase has already been burned by once. ST-084 §6.3 states this precisely for schemas and it generalizes to RLS: a single shared `ai_memory` role reading/writing everything is namespacing, not access control, and RLS without a second role does not change that. For a single-user, default-deny, closed-vocabulary field, explicit WHERE clauses per the ST-084 pricing table are the correct scope for this milestone; RLS is a heavier, later escalation, not a substitute now. |
| `z.enum(POLICY_SCOPES)` (Zod, already vendored) | Hand-rolled `if (!["personal","corporate","mixed","public"].includes(v))` checks | Never for this project — Zod is already a dependency and already used for the identical purpose on the workflow module's `policyScopeSchema`. A hand-rolled check would be a second, divergent implementation of the same guard. |
| Gate `graph_traverse`/`graph_search` entirely when a scope filter is active (deny the call) | Tag every AGE graph node with a `scope` property and filter inside openCypher `MATCH` | Node-tagging is a genuine schema/extraction-worker change (ST-084 §13.1 rows 11-12, classified **Structurally blocked / L-effort**) — it requires the entity-extraction worker to write scope onto every node and a backfill for existing graph data. The findings explicitly recommend deferring this to a later phase/milestone and gating the tools for now ("reversible; schema tagging is deferred"). Do not build node-tagging in this milestone. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| A general-purpose policy/authorization engine — Open Policy Agent (Rego), Casbin, CASL, node-abac, or any ABAC/RBAC framework | These are built for many subjects × many resources × evolving rules, typically with a separate policy DSL and (for OPA) a sidecar/service to evaluate it. This system has **one subject** (the single user), **one boundary axis** (a 4-value closed vocabulary), and the enforcement points are a fixed, enumerable set of 15 SQL/MCP call sites already catalogued in ST-084 §13.1. Introducing a policy engine would add a runtime dependency, a new DSL to learn and audit, and (for OPA) a network hop or embedded evaluator — none of which this vocabulary needs, and none of which any other part of this codebase uses (there is no existing authz abstraction layer to plug into; auth today is a single `requireApiKey` Bearer check in `server/src/auth.ts`). | Plain parameterized SQL `WHERE`/`AND` predicates at each read path, and a small shared TypeScript guard function for default-deny/egress checks — exactly the shape ST-084 already priced and the shape `ModelProviderDisabledError` already proves out for egress. |
| Postgres native `ENUM` type for `policy_scope` | Inconsistent with every other closed-vocabulary column in this schema (`memory_type`, `status`, `source`, `verdict` are all `text` + `CHECK`), and it reintroduces `ALTER TYPE ADD VALUE` lock/transaction friction this codebase has never had to deal with elsewhere. | `text NOT NULL CHECK (policy_scope IN (...))`, matching `server/db/workflow/001_workflow_schema.sql:48-49` exactly. |
| An ORM or SQL query builder (Drizzle, Kysely, Prisma) introduced specifically to add scope filtering | Would be a wholesale architecture change to route one new predicate through — every existing query in `index.ts` and `searchQuality.ts` is a hand-written `sql\`...\`` tagged template via `postgres.js`, and ADR-009/ADR-011 never contemplated an ORM. Adding one now, for this milestone, would touch far more surface than the enforcement work itself and contradicts "smallest addition consistent with existing patterns." | Continue hand-editing the existing tagged-template queries, per path, exactly as ST-084 §13.1 classifies each of the 15. |
| Row-Level Security as this milestone's enforcement mechanism | Needs a second Postgres role and per-connection session state (`SET app.policy_scope = ...` or `SET ROLE`) correctly re-applied on every checkout from a **pooled** connection — the same pooling class of hazard the workflow migration file already flags for AGE's sticky `search_path`. That is materially more infrastructure than a closed 4-value default-deny filter needs for a single-user deployment. | Explicit `WHERE policy_scope = ANY($allowed)` predicates at each of the 15 catalogued paths (see Alternatives Considered above for when to revisit). |
| A separate `fetch_v2` / versioned duplicate tool to add scope enforcement to `fetch` | Doubles maintenance of an MCP tool surface for what ST-084's own risk table (§13.4) frames as choosable between "new optional `context` param, ignore if absent" (forward-compatible) and a versioned tool (backward-compatible but doubles maintenance) — and explicitly defers the choice to a PO decision before implementation, not a library choice. | Add an optional `context` parameter to the existing `fetch`/`capture_thought` read-back tool inputs (Option A from ST-084 §13.4), decided and recorded before implementation — this is a product/API-contract decision, not a stack addition. |

## Stack Patterns by Variant

**If enforcing a path that already accepts a `context` parameter** (`search_thoughts`, `list_thoughts`, `thought_stats`, the RRF fusion query and MMR re-rank query inside `searchQuality.ts`):
- Add `AND policy_scope = ANY($allowedScopes)` to the existing `sql\`...\`` tagged-template query.
- No new parameter, no schema change — this is ST-084's "Straightforward" tier (8 of 15 paths, ~1 day total), and should be implemented and tested first as the sanity check the findings recommend (§13.6 point 1) before the harder tiers.

**If enforcing `fetch` or `capture_thought`'s read-back** (no `context` parameter accepted today):
- Add an optional `context`/scope-bearing parameter to the tool's input schema (Zod), validated the same way `policyScopeSchema` already validates workflow input, then thread it into the existing WHERE clause.
- This is ST-084's "Requires new parameter" tier (M-effort) — the added cost is parameter plumbing and caller-contract versioning discipline, not a new library.

**If gating `graph_traverse` / `graph_search`:**
- Deny the tool call outright when a scope filter is active (return an MCP tool error), rather than attempting a predicate — AGE nodes carry only `(label, name)`, no scope property, and openCypher `MATCH` cannot join back to `public.thoughts` to recover one.
- Defer node-level scope tagging (extraction-worker change + graph backfill) to a later milestone; it is a real schema commitment this milestone should not make as a side effect of enforcement.

**If gating provider egress** (`entityWorker.ts`, `consolidationLLM.ts`, embedding backfill in `embeddings.ts`):
- Reuse the `ModelProviderDisabledError` shape: check the scope condition before constructing any `Request`, throw a named `instanceof`-checkable error, and prove zero-network-on-deny with the same `startProviderSentinel` test helper `provider-egress.test.ts` already uses.
- Per ST-084 §13.3/§13.4, each of these three call sites additionally needs a **product decision**, not an engineering one, before implementation: can extracted entities cross scope boundaries, can consolidated wiki output span scopes, can embeddings be generated for a cross-scope shard. Resolve these in ADR/plan form before writing the gating code — the stack pattern is identical across all three call sites regardless of the answer.

**For default-deny semantics specifically:**
- No scope recorded must deny, never allow. This is already the standing convention for the sibling `workflow.work_packets.policy_scope` column — `NOT NULL` with **no `DEFAULT`**, so an INSERT that forgets to state a scope fails at write time instead of silently minting a permissive (or worse, invisible-but-readable) row.
- For the memory-domain `public.thoughts` table specifically, existing rows have no scope value today, so the migration path needs an explicit decision recorded in the phase plan (not resolved here): either backfill every existing row with an explicit scope before adding `NOT NULL`, or add the column nullable and treat `NULL` as an unconditional exclusion in every enforced WHERE clause until backfill completes. Either choice keeps default-deny intact; picking neither (a permissive default, or `NULL` silently passing filters) reproduces the exact failure mode the workflow column's own comment warns against.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-------------------|-------|
| `npm:postgres@3.4.4` | PostgreSQL 15 (pinned, `docker/postgres-age`) | Already proven — parameterized `= ANY($array)` predicates are standard `postgres.js` usage, no version constraint introduced. |
| `npm:zod@4.1.13` | Existing `POLICY_SCOPES`/`PolicyScope` pattern in `server/src/workflow/types.ts` and `api.ts` | Already proven in-repo; reusing the identical `z.enum(...)` construction for the memory-domain vocabulary introduces no new compatibility surface. |
| `text NOT NULL CHECK (...)` column | Apache AGE graph (no interaction) | The AGE graph has no equivalent column and cannot enforce this constraint; that gap is exactly why `graph_traverse`/`graph_search` must be gated rather than filtered (see Stack Patterns above), not a compatibility issue between technologies. |

## Sources

- `server/db/schema.sql` (repo, read directly) — existing CHECK-constraint precedent for `memory_type`, `status`, `source`, `verdict`. HIGH confidence (primary source).
- `server/db/workflow/001_workflow_schema.sql` (repo, read directly) — the `policy_scope text NOT NULL CHECK (policy_scope IN ('personal','corporate','mixed','public'))` column already shipped, with its NOT-NULL-no-DEFAULT rationale in comments. HIGH confidence (primary source).
- `server/src/workflow/types.ts`, `server/src/workflow/api.ts`, `server/src/workflow/schema.ts` (repo, read directly) — existing `PolicyScope`/`POLICY_SCOPES`/`policyScopeSchema` TypeScript+Zod pattern. HIGH confidence (primary source).
- `server/src/embeddings.ts`, `server/tests/provider-egress.test.ts` (repo, read directly) — existing `ModelProviderDisabledError` gate-before-fetch pattern and its sentinel-based zero-network-on-deny test proof. HIGH confidence (primary source).
- `server/src/parseContext.ts`, `shared/tagGrammar.ts` (repo, read directly) — existing `scope.tags` parsing (not yet enforced) and the precedent for where shared vocabulary/grammar modules live in this repo. HIGH confidence (primary source).
- `docs/investigations/ST-084-awcp-host-spike-findings.md` §6.1, §7.2, §13.1–13.7 (repo, read directly) — the 15-path enforcement pricing table (64+ hours), per-path classification methodology, and the risk/mitigation table this STACK.md's "Stack Patterns by Variant" section builds on directly. HIGH confidence (primary source, already-accepted project artifact per PROJECT.md's Key Decisions table).
- `.planning/PROJECT.md` — current milestone framing (default-deny, controlled vocabulary distinct from ADR-012 tags, scope belongs to observations/sources not identities). HIGH confidence (primary source).
- ["Enums vs Check Constraints in Postgres" — Crunchy Data Blog](https://www.crunchydata.com/blog/enums-vs-check-constraints-in-postgres), ["Native enums or CHECK constraints in PostgreSQL?" — Close](https://making.close.com/posts/native-enums-or-check-constraints-in-postgresql/), ["We need to talk about ENUMs" — boringSQL](https://boringsql.com/posts/postgresql-enums/) — external corroboration that CHECK constraints are commonly preferred over native ENUM for exactly the flexibility/lock-risk reasons cited above. LOW confidence (single web-search pass, not independently cross-verified) — used only as corroboration; the binding rationale is the in-repo precedent above.
- ["Top Open-Source Authorization Tools for Enterprises in 2026" — Permit.io](https://www.permit.io/blog/top-open-source-authorization-tools-for-enterprises-in-2026), ["Open source authorization: Comparing Casbin and SpiceDB" — AuthZed](https://authzed.com/blog/casbin) — external corroboration that OPA/Casbin target multi-service, multi-role authorization surfaces, not a single fixed small vocabulary. LOW confidence (single web-search pass) — used only as corroboration for the "What NOT to Use" entry.

---
*Stack research for: default-deny policy-scope enforcement, ai-memory v1.1*
*Researched: 2026-08-28*
