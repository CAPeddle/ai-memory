# Architecture Research: Policy-Scope Enforcement (v1.1)

**Domain:** Brownfield integration — default-deny retrieval boundary for an existing Deno/PostgreSQL MCP memory server
**Researched:** 2026-08-28
**Confidence:** HIGH (grounded directly in this repo's code and its own prior pricing investigation; MEDIUM on the two external-library claims, cross-checked against current docs)

## Framing

This is not a greenfield "pick a stack" question. `docs/investigations/ST-084-awcp-host-spike-findings.md` §6.1/§13 already enumerated 15 memory-side read paths and priced enforcing each with a hand-written `WHERE` predicate at 64+ hours. That pricing stands as the record of *surface size*. What it did not evaluate — because Stage 2 Unit 1 was pricing, not designing — is whether a per-path predicate is the right *mechanism*. It is not. The mechanism recommended here is **four enforcement layers, one per egress class**, not fifteen hand-edited queries:

| Egress class | Mechanism | Where it lives |
|---|---|---|
| SQL retrieval (lexical, vector, hydration, list, stats, fetch, capture read-back) | **Postgres Row-Level Security**, forced, keyed on a per-transaction session GUC | New RLS policies on `thoughts`; one shared helper wraps every handler |
| Graph traversal (`graph_traverse`, `graph_search`) | **Gate now, tag-and-WHERE-filter later** — RLS cannot reach AGE's internal `ag_catalog` tables | Tool-level deny in `index.ts`; Stage 3 extraction-time property tagging |
| Provider egress (embeddings, entity extraction, consolidation) | **Pre-call scope gate** reading the source row's `policy_scope` before any `fetch()` to OpenRouter | `embeddings.ts` call sites, `entityWorker.ts`, `consolidationWorker.ts`/`consolidationLLM.ts`, `embeddingBackfill.ts` |
| AWCP adapter contract (`KnowledgeSearchPort`) | **Typed parameter threaded through the port signature**, satisfied by whichever mechanism above the real adapter delegates to | `server/src/workflow/ports.ts`, `service.ts` |

Answering the question directly: enforcement does **not** belong primarily in `searchQuality.ts`. It belongs primarily in the database, as RLS policies that make every current and future `SELECT ... FROM thoughts` safe by construction — which is the only design that closes finding §13.3.5 ("no single chokepoint exists ... a single mistake in any path silently opens the boundary"). `searchQuality.ts` and the SQL call sites in `index.ts` still change, but as *callers who set a session variable once*, not as *the security boundary itself*.

## Why not a `searchQuality.ts` filter or scattered `WHERE` clauses

The story board's own acceptance criteria (`ST-082`) and the pricing table converge on the same objection: there are 15+ hand-written tagged-template queries across `index.ts` and `searchQuality.ts`, no query builder, no repository layer. A predicate added to 14 of 15 is the same outcome as a predicate added to none — the 15th is the breach. That is a maintenance-shaped risk, not an implementation-shaped one; it recurs every time a new tool or lane is added (this milestone period alone added `search`/`fetch` after the original design, and `graph_search` after `graph_traverse`). A filter function in `searchQuality.ts` has exactly the same shape as the `WHERE` clauses it would replace — it's still one call site per lane that a future contributor can forget to invoke. It doesn't move the correctness burden into something the database enforces unconditionally.

RLS does move it. Once `FORCE ROW LEVEL SECURITY` is enabled on `thoughts` with a `USING` policy against a session GUC, **every** query the pooled `ai_memory` role issues against that table — including one written next year in a tool nobody has designed yet — is filtered, with no per-call opt-in. This directly answers finding §13.3.5's "no chokepoint" risk: the chokepoint becomes "set the session GUC once per request," which is a single wrapper function, not fifteen edits.

## Mechanism 1 — Postgres RLS for SQL retrieval

### Two preconditions the findings doc didn't need to name (because it never proposed RLS)

1. **RLS policies do not apply to a table's owner**, and `docs/investigations/ST-084-awcp-host-spike-findings.md` §6.3 already recorded that the single `ai_memory` role reads and writes every schema. `ALTER TABLE thoughts ENABLE ROW LEVEL SECURITY` alone is a no-op against that role. It must be paired with `ALTER TABLE thoughts FORCE ROW LEVEL SECURITY`, or the app must connect as a non-owner role. `FORCE` is the cheaper of the two and matches "single role, single connection string" as currently deployed — no new role/grant surface to design in this milestone.

2. **The pooled client (`server/src/db.ts`, `npm:postgres@3.4.4`, max 10 connections) reuses connections across requests.** A bare `SET app.policy_scope = …` on a reused connection leaks into the next unrelated request. The session variable must be scoped with `SET LOCAL`, which only takes effect inside a transaction and resets at `COMMIT`/`ROLLBACK`. Concretely: every tool handler's database work moves inside `sql.begin(async (tx) => { await tx\`SET LOCAL app.policy_scope = ${scope}\`; … })`. That transaction wrapper *is* the chokepoint — name it once (e.g. `withPolicyScope(scope, fn)` in a new `server/src/policyScope.ts`) and every handler calls it instead of the bare `sql` template tag it currently imports from `db.ts`.

### What this changes at each SQL call site

| Current call site | Change |
|---|---|
| `search_thoughts` BM25 lane, vector lane, hydration `SELECT ... WHERE id = ANY(...)` (`index.ts` — RRF/MMR block) | Move inside `withPolicyScope`; no `WHERE` edit needed once RLS is forced — the planner rewrites the query. |
| `search_thoughts`'s RRF fusion and MMR re-rank in `searchQuality.ts` | No SQL of their own (`rrfFuse`/`mmrRerank` are pure functions over already-fetched rows) — they inherit correctness for free once the row set they receive is already scope-filtered at the query layer. This is why "filter in `searchQuality.ts`" is the wrong layer: by the time rows reach these functions it's too late to *decide* visibility, only to re-filter redundantly. |
| `list_thoughts` | Same wrapper. |
| `thought_stats` (3 aggregate queries) | Same wrapper — counts become scope-correct automatically. |
| `capture_thought`'s post-INSERT read-back / `RETURNING` | INSERT and the same-statement `RETURNING` happen inside one transaction already; add the GUC `SET LOCAL` at the top of that transaction so the row the caller gets back is scope-consistent with what they're allowed to read (it will be, since they just wrote it — but this closes finding §13.1 item 10 explicitly rather than leaving it implicit). |
| ChatGPT-compatible `search` (`aboveFloorRows`/`lexicalFallbackRows`/`nearestNeighborFallbackRows`) and `fetch` | **Not currently enumerated in §13.1's 15-path table** (that table predates the current `index.ts`) but are exactly the two tools finding §6.1 calls out by name: `fetch` is "a one-call bypass of every search-lane filter" and takes **no context parameter at all**. Both need a `context` (or dedicated `scope`) input added before RLS can do anything for them — RLS filters *rows*, it cannot invent a scope value a caller never supplied. Under default-deny, absent scope on these two tools means the query returns nothing post-RLS, which is the correct behavior, not a bug to route around. |
| `recall_events` / `recall_queries` (raw query text logging, `searchQuality.ts: logRecall`/`logRecallQuery`) | Named directly in findings §7.2 as carrying "raw query text and have no scope column." These are write-only from the tool's perspective but are a plausible **export/introspection surface** (anything that later reads them — a dashboard, an admin tool — reads across every scope at once, because the tables have no `policy_scope` column to filter by). Add the column at the same migration as `thoughts.policy_scope`, populate it from the request's session GUC at insert time, and apply the same RLS policy. Treat this as the "exports" row the milestone's acceptance criteria name. |
| Workflow dashboard/API JSON surfaces (`server/src/workflow/dashboard.ts`, `server/src/workflow/api.ts` — `/overview`, `/packets/:id`, `/work-items`, `/work-items/:id`) | These are **the second "exports" surface**: any endpoint that embeds `gatherAdvisoryContext`'s `KnowledgeSearchPort.search()` results (see Mechanism 4) is re-exporting whatever that port call returned. If the port enforces scope correctly, these inherit it; if it doesn't, this is where an unscoped leak becomes externally visible over HTTP. No RLS involvement here — these read workflow-schema tables, not `thoughts` — the dependency is entirely on the port contract in Mechanism 4. |

### Conflict-merge hazard to close in the same migration

`capture_thought`'s `ON CONFLICT (content_fingerprint) DO UPDATE` currently merges `tags` via `ARRAY(SELECT DISTINCT ... FROM unnest(thoughts.tags || EXCLUDED.tags))` (`index.ts`, `capture_thought`). Finding §6.1 already flags this as a widening rule if copied to a security column: **do not merge `policy_scope` on conflict.** The conflict clause for the new column must either keep the existing row's scope unconditionally, or reject the write when the incoming scope differs from the stored one — never take the union of two closed-vocabulary values.

## Mechanism 2 — Graph traversal: gate, then tag (not RLS)

AGE's vertex/edge storage lives in its own catalog structures (`ag_catalog`, per-graph `_ag_label_vertex`/`_ag_label_edge` tables) reached through the `cypher(...)` SQL function, not through ordinary row access on `public.thoughts`. RLS policies on `thoughts` have no reach into that path — confirmed against current AGE documentation, openCypher's `WHERE` clause filters on **vertex/edge properties within the pattern** (e.g. `MATCH (n) WHERE n.policy_scope = 'personal' RETURN n`), and property-indexed filtering is the documented, performant way to constrain a match. That means graph-side enforcement requires the property to exist on the vertex in the first place, which it does not today — AGE nodes here carry only `(label, name)` (finding §13.1 items 11–12).

Recommended sequencing, matching the findings doc's own Stage 2/Stage 3 split:

- **Now (this milestone):** deny both `graph_traverse` and `graph_search` outright whenever a request carries an active policy scope, and pass through unscoped only if the deployment truly has none configured (single-user, no scope in play). This is reversible — a denial is not a schema commitment.
- **`graph_search` first, once scope tagging lands:** it is the parameterized builder (`index.ts`, `GRAPH_SEARCH_ALLOWED_RELS`), so a `WHERE connected.policy_scope = $scope` fragment is a bounded, injectable-safe addition once `entityWorker.ts` starts writing `policy_scope` onto extracted nodes (tag-at-extraction-time, sourced from the originating thought's scope).
- **`graph_traverse` likely stays denied under an active scope even after tagging lands.** It accepts arbitrary caller-supplied openCypher (guarded only by the `MATCH`-only / mutation-keyword denylist in `index.ts`). Splicing a scope predicate into arbitrary user Cypher safely is a much harder correctness problem than adding one clause to a builder the server itself constructs — don't take it on inside this milestone; document the tool as scope-gated rather than scope-filtered.

## Mechanism 3 — Provider-egress gates (before any OpenRouter `fetch`)

Three call sites ship content to OpenRouter today, none scope-aware:

- `server/src/embeddings.ts` — `getEmbedding()`, called from `search_thoughts`/`search` (query text) and `capture_thought` (content, fire-and-forget)
- `server/src/entityWorker.ts` — `callLLM(thought.content)` per queued thought
- `server/src/consolidationLLM.ts` / `consolidationWorker.ts` — shard-to-wiki normalization
- `server/src/embeddingBackfill.ts` — sweep over rows missing embeddings

The default-deny requirement in `docs/architecture` / the story-board acceptance criteria applies here too: *"content is never returned to, or sent through a provider for, a scope it wasn't granted."* Each site needs a gate **before** the `fetch()` call, not a post-hoc log:

- For worker sweeps (`entityWorker`, `consolidationWorker`, `embeddingBackfill`): these run outside any request's transaction and outside any caller-supplied scope — they iterate the whole table on a schedule. Under a naive default-deny RLS session (no GUC set), they would see **zero rows** and the enrichment pipeline would silently stop, which is a correctness regression the milestone must not introduce as a side effect. Workers need an explicit, separate posture: they run in a **trusted session** (their own connection/transaction that reads `policy_scope` per row, precisely because their job is to decide whether *that row's* scope permits sending it to the provider) rather than inheriting a caller's GUC. This is a distinct component from the request-scoped RLS wrapper in Mechanism 1, and should be named as such in any implementation plan — not folded into the same helper.
- For inline request-time calls (`search_thoughts`/`search`'s query-text embedding): the current code calls `getEmbedding(normalizedQuery)` **before** any scope check runs (`index.ts`, `search_thoughts` — the `getEmbedding` call precedes the `bm25`/`vector` lane queries entirely). Under default-deny, an unscoped or scope-denied request must be rejected before that call, not after — otherwise the query text has already left the process for OpenRouter regardless of what the retrieval layer later withholds. This is a small reordering with an outsized correctness consequence, and is the natural place for a red/green negative test: "unscoped search never calls `getEmbedding`."

Each egress site additionally needs a PO-decided scope→behavior map (finding §13.4's "egress policy ambiguity" risk is unresolved, not this milestone's decision to invent): can an entity extracted from a `corporate`-scoped thought be written back with a wider scope? Can a `mixed`-scope shard be consolidated with `personal` shards into one wiki row? Treat these as open questions to carry into planning, not settle unilaterally in research.

## Mechanism 4 — `KnowledgeSearchPort` and the AWCP adapter contract

`server/src/workflow/ports.ts` defines:

```typescript
export interface KnowledgeSearchPort {
  /** Advisory retrieval. May throw or return []. Never gates operational writes. */
  search(query: string, limit: number): Promise<KnowledgeSearchResult[]>;
}
```

with **no scope parameter**, while the sibling `PromotionInput.policyScope: PolicyScope` (write side) is already typed to the closed union. This asymmetry is called out explicitly in the story board's ST-082 note: *"threading `PolicyScope` through the read side ... is additionally a precondition of the AWCP adapter contract."* Concretely, the port's only real caller today is `gatherAdvisoryContext()` in `server/src/workflow/service.ts`, which builds a work packet's advisory context — this **is** the "context assembly" egress path the milestone's acceptance criteria name, and it is currently wired to five in-process fakes (`NoopMemoryAdapter`, `FailingMemoryAdapter`, `CommitThenRejectMemoryAdapter`, `HangingMemoryAdapter`, `LateSuccessMemoryAdapter`) — **no real adapter exists yet** that calls into `search_thoughts`/`search` over MCP or HTTP. That means this milestone's job on the port is contract-shape work, not integration work: change the signature so that whenever a real adapter is built, it is structurally required to receive and honor a scope.

Recommended shape:

```typescript
// shared/policyScope.ts — NOT imported from workflow/types.ts.
// workflow is an extraction donor (see ST-084 findings §18.8): a real cross-boundary type
// used by both memory and workflow belongs in shared/, matching the existing tagGrammar.ts
// precedent, not in the module that is scheduled to be extracted out from under it.
export type PolicyScope = "personal" | "corporate" | "mixed" | "public";
export const POLICY_SCOPES: readonly PolicyScope[] = ["personal", "corporate", "mixed", "public"] as const;
```

```typescript
// workflow/ports.ts
export interface KnowledgeSearchPort {
  search(query: string, limit: number, policyScope: PolicyScope): Promise<KnowledgeSearchResult[]>;
}
```

`gatherAdvisoryContext()` already receives the work packet context that carries a `policy_scope` (it's the packet's own `PolicyScope` field, per §7.2 — "a Work Packet is the only authority for its scope"); it passes that value through to `searchPort.search(...)`. All five fake adapters in `ports.ts` update their signatures to match (mechanical — none currently branch on scope, so no fake's *behavior* needs to change, only its type). This is the cheapest part of the whole milestone and should land early, since nothing downstream depends on a real adapter existing yet — it only has to be impossible to *build* a conforming real adapter that ignores scope.

## Data flow — request-scoped path (Mechanism 1 + 3 combined)

```
MCP tool call (search_thoughts / list_thoughts / capture_thought / fetch / search)
    │
    ├─ parseContext(context) ── parses scope.tags (existing) AND new policy_scope key
    │                            (closed-vocabulary, validated against POLICY_SCOPES;
    │                             absence ⇒ explicit deny, never inferred)
    │
    ├─ [egress-eligible tools only] deny BEFORE getEmbedding() if scope missing/denied
    │
    └─ withPolicyScope(scope, async (tx) => {
           tx`SET LOCAL app.policy_scope = ${scope}`;
           … existing SQL, unmodified WHERE clauses …
       })
           │
           └─ Postgres planner rewrites every SELECT against `thoughts`
              (and `recall_events`/`recall_queries`) to add the RLS predicate
              transparently — FORCE ROW LEVEL SECURITY makes this apply even
              though the connecting role owns the table.
```

## Data flow — background worker path (Mechanism 3, distinct from the request path)

```
entityWorker / consolidationWorker / embeddingBackfill (scheduled, no caller scope)
    │
    ├─ read thoughts.policy_scope for the row under consideration
    │   (workers run in their own trusted session — NOT under the request-scoped
    │    RLS GUC, since their job is exactly to inspect a row's scope and decide)
    │
    ├─ scope-gate: does this row's scope permit LLM/embedding egress under the
    │   PO-decided provider-routing policy?
    │
    ├─ deny ⇒ skip (needs_embedding / queue row stays pending; no fetch() to OpenRouter)
    └─ allow ⇒ fetch() to OpenRouter, tag any extracted entity/consolidated row
                with the source's policy_scope on write
```

## Suggested build order

Ordered so each step is independently testable and later steps depend only on earlier ones landing, not on the whole milestone shipping atomically:

1. **Shared type + migration.** `shared/policyScope.ts` (closed union, matching `tagGrammar.ts`'s pattern of a validated-type module outside both `server/src` and `workflow/`). New migration `server/db/007_policy_scope.sql`: `ALTER TABLE thoughts ADD COLUMN policy_scope text NOT NULL CHECK (policy_scope IN (...))` — **no `DEFAULT`**, per the workflow module's own precedent (`001_workflow_schema.sql`) and finding §7.2's explicit rationale ("a permissive default silently mints permissive rows"). Because `NOT NULL` with no default cannot land on a table with existing rows via a single statement, and because write-side capture-time scoping is explicitly deferred to ST-101 in this milestone's scope, the migration needs an interim backfill value for existing rows (recommend `personal`, the conservative choice for a currently single-user store) plus an explicit, non-defaulted value supplied at every INSERT site going forward (`capture_thought` sets it explicitly, not via column default, so "forgetting fails loudly" still holds for any *future* writer). Also add `policy_scope` to `recall_events`/`recall_queries` in the same migration (the "exports" correlation-artifact gap from §7.2).
2. **`withPolicyScope` helper + RLS policies + `FORCE`.** New `server/src/policyScope.ts` (or fold into `db.ts`): the `sql.begin()` wrapper, plus `ENABLE ROW LEVEL SECURITY` / `FORCE ROW LEVEL SECURITY` / `CREATE POLICY` on `thoughts` (and the two recall tables) keyed on `current_setting('app.policy_scope', true)`. Land and test this against a **known, already-scoped** path first (e.g. `list_thoughts`, the simplest handler) as the sanity check the pricing doc itself recommended before committing to the full surface.
3. **Thread `parseContext.ts`.** Add a closed-vocabulary `policy_scope` (or reuse a reserved `scope:` key, distinct from `tags:` per the acceptance criteria's "ordinary tags are not the sole policy boundary") with default-deny validation — invalid or absent must be a hard error / explicit deny, not fall through to `null` the way `projects?.[0]` does today (finding §13.4's named anti-pattern to avoid copying).
4. **Migrate every SQL handler onto `withPolicyScope`.** `search_thoughts`, `list_thoughts`, `thought_stats`, `capture_thought`'s read-back — mechanical once step 2 exists, since the `WHERE` clauses themselves don't change.
5. **Add the missing parameter to `fetch` and `search`.** Both currently take no `context` input at all; this is schema-breaking for existing callers by design under default-deny (finding §13.4's risk #1) — needs an explicit versioning decision (optional param, deny-when-absent) carried into planning, not invented here.
6. **Provider-egress gates.** Reorder `search_thoughts`'s `getEmbedding` call behind the scope check; add pre-`fetch()` gates to `entityWorker.ts`, `consolidationLLM.ts`/`consolidationWorker.ts`, `embeddingBackfill.ts`, each reading the source row's `policy_scope` in its own trusted session per the worker path above. Requires the PO scope→provider-routing decisions the pricing doc flagged as unresolved.
7. **Graph gating.** Deny `graph_traverse`/`graph_search` under an active scope now; defer extraction-time vertex tagging to a follow-on story.
8. **`KnowledgeSearchPort` signature.** Add `policyScope: PolicyScope` to `search()`, update the five fakes, thread the work packet's scope through `gatherAdvisoryContext()`. Can land any time after step 1 (it only needs the shared type) — doesn't block or get blocked by steps 2–7, so it's a good parallel-track candidate.
9. **Negative isolation tests, one red/green pair per egress class** (not per hand-written path — RLS collapses most of the 15 into "prove RLS is on," but `fetch`/`search`'s param addition, both graph tools, and each provider-egress site still need their own pair): lexical, vector, hydration/list/stats (one RLS proof suffices for all three once step 2 is verified), `fetch`, `search`, `graph_traverse`, `graph_search`, entity-worker egress, consolidation egress, embedding-backfill egress, `KnowledgeSearchPort.search`, and the dashboard/API JSON surfaces that embed advisory context.

## Open decisions this research surfaces but does not settle

- **Cross-scope visibility matrix.** Does a `personal`-scoped request see `public`-scoped content? What does `mixed` grant or receive? Recommend **exact-match-only** as the conservative default for this milestone (no implicit widening), with the matrix itself flagged as a PO decision rather than invented in research.
- **Provider-routing policy per scope** (Mechanism 3) — can extracted entities or consolidated wikis cross the scope boundary of their source shards? Finding §13.4 names this explicitly as unresolved and blocking for the egress-gate implementation.
- **`fetch`/`search` versioning strategy** — optional-param-with-deny-on-absence vs. a new versioned tool. Both are viable; this research doesn't pick one, since it's a caller-compatibility trade-off for planning, not an architecture-mechanism question.
- **Whether AGE tagging is worth doing in this milestone at all**, given `graph_traverse` likely stays denied regardless (arbitrary Cypher is not safely filterable) and `graph_search`'s tagging depends on `entityWorker.ts` already being scope-gated (step 6) — sequencing suggests graph tagging is naturally a *follow-on* story, not part of v1.1's critical path.

## Sources

- `docs/investigations/ST-084-awcp-host-spike-findings.md` §6.1, §7.2, §13, §16 — HIGH confidence, primary source, this repo's own prior investigation of every path enumerated here
- `.github/planning/story-board.md` ST-082 entry — HIGH confidence, current acceptance criteria and PO framing
- `server/src/parseContext.ts`, `server/src/searchQuality.ts`, `server/src/db.ts`, `server/index.ts`, `server/src/workflow/ports.ts`, `server/src/workflow/service.ts`, `server/src/workflow/types.ts`, `server/db/schema.sql`, `server/db/workflow/001_workflow_schema.sql`, `shared/tagGrammar.ts` — HIGH confidence, direct code inspection, 2026-08-28
- [PostgreSQL 5.9 Row Security Policies (current docs)](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — HIGH confidence, official docs; confirms default-deny-with-no-policy, table-owner exemption, and `FORCE` semantics
- [Row Level Security for Tenants in Postgres — Crunchy Data](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) — MEDIUM confidence, vendor blog corroborating the RLS-vs-WHERE-clause chokepoint argument
- [Apache AGE MATCH clause documentation](https://age.apache.org/age-manual/master/clauses/match.html) — MEDIUM confidence, official docs; confirms `WHERE` filters on vertex/edge properties and that property indexes are the supported performance path, which grounds the "tag at extraction time, then filter" recommendation for `graph_search`

---
*Architecture research for: ai-memory v1.1 Policy-Scope Isolation*
*Researched: 2026-08-28*
