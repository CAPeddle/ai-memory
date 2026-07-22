# AGE Platform Divergence — Impact on Other Products

**Type:** Investigation / architecture-impact analysis (Tier 2 reference)
**Date:** 2026-07-21
**Question posed:** Given that other products (Developer Memory, "Life Memory") benefit from Apache AGE, and that the graph lives in the platform, how are those products impacted by the implicit move away from AGE?
**Verdict:** There is **no platform-level move away from AGE** — it is reaffirmed as core and runs live today. But the question correctly senses **two real, currently-unmanaged risks**: an unacknowledged deployment divergence (Risk A) and a frozen, feature-limited AGE version (Risk B). A hypothetical Life/Personal Memory product would be the single most-exposed consumer of both.

---

## TL;DR

- The literal premise is off in three ways (see §2): **"Life Memory" is not a defined product**, **Developer Memory has no documented AGE dependency**, and **the platform has not moved away from AGE**.
- AGE is a **platform-shared capability** that products *inherit* if they build on the Docker/Postgres Platform MCP (§3). Developer Memory, built that way, inherits a working graph — it is **not** harmed.
- Contact Memory's Supabase-without-AGE choice is **explicitly product-scoped** ("for Contact Memory deployment only", `CLAUDE.md:32`), not a new default.
- The genuine exposure is two latent risks:
  - **Risk A — governance gap (§5):** nobody has analyzed the Postgres+AGE (platform) vs Supabase-no-AGE (Contact) split as a risk. Developer Memory's deployment target is *undecided*; cloning Contact's Supabase stack for convenience would silently drop the graph tier that ADR-003/011 treat as first-class. This is the actual vector by which an "implicit move away" could happen.
  - **Risk B — capability ceiling (§6):** the platform's AGE is pinned at `PG15/v1.6.0-rc0`, which lacks the `|` multi-relationship-type variable-length selector. This most bites **personal-preference inference** — the Life Memory pattern.
- **Recommendation (§7):** add a small governance guardrail (a short ADR) making explicit that platform-built products inherit AGE and that moving a product off it is a per-product decision which must account for losing graph. Keep the version-ceiling upgrade (ST-024) deferred until a concrete multi-type-traversal use case appears.

---

## 1. Why this analysis exists

ST-078 reconciled the platform's AGE version (docs said `v1.7.0`; the image ships `PG15/v1.6.0-rc0`). During that work, the TurboPuffer evaluation noted Contact Memory as the one track where a graph-less vector store fits cleanly "because there's no graph to strand." That naturally raises the question the user asked: if the graph is a *platform* asset, do the *other* products suffer from Contact's move off it? The answer requires separating what the docs actually mandate from what they merely permit.

---

## 2. Premise corrections (grounded)

### 2a. "Life Memory" is not a defined product
The product family is exactly **Contact Memory + Developer Memory**, both on the **AI Memory Platform** (`docs/architecture/ai_memory_architecture_decisions.md:20-39, 64-66`). A repo-wide search for "life memory" / "life-memory" / a distinct personal-memory product returns nothing; "personal memory" appears only as a generic label for the whole service. This analysis therefore treats **Life Memory as a hypothetical future product** — useful precisely because it stress-tests the platform's graph story (see §4).

### 2b. Developer Memory has no *documented* AGE dependency
No binding document makes Developer Memory depend on AGE/openCypher. The graph is a **platform-level capability** a product inherits if built on the Docker/Postgres Platform MCP. Developer Memory itself is **planned, not implemented**, and its consolidation pipeline is explicitly deferred "Before Developer Memory implementation" (`ai_memory_architecture_decisions.md:104`; `CLAUDE.md:31`). ADR-007 consolidation touches the graph only via *shared queue infrastructure* with the entity worker — not a direct openCypher dependency.

### 2c. The platform has **not** moved away from AGE
ST-078 corrected only the version string; AGE remains core:
- ADR-011 co-locates relational + pgvector + tsvector + **AGE** in one Postgres (`:37, :39, :116`); Supabase managed is still rejected *for the platform* precisely because it lacks AGE (`:130`).
- ADR-009 deployment must still "Host PostgreSQL 15 + pgvector + Apache AGE" (`:25`).
- ADR-003 keeps graph traversal "first-class, not a deferred capability" (`:129`).
- A live pipeline runs today: an `AFTER INSERT` trigger enqueues thoughts → the entity-extraction worker (`server/src/entityWorker.ts`) extracts entities/relationships via OpenRouter and writes them into `memory_graph` with idempotent `MERGE` → two read-only tools `graph_traverse` / `graph_search` query it (`server/index.ts:880-1008`, `server/db/graph.sql`).

---

## 3. The platform capability-inheritance model

The architecture is **one platform, many product MCPs**:

- Products expose "their own domain-specific MCP toolset **on top of platform primitives**" (`ai_memory_architecture_decisions.md:60`). The per-product MCP table (`:64-66`):

| MCP | Owner | Tools |
|---|---|---|
| Platform MCP | AI Memory platform | `capture_shard`, `search_shards`, `soft_delete`, `supersede` |
| Contact MCP | Contact Memory product | `get_contact_profile`, `search_commitments`, `add_fact`, `get_upcoming_dates` |
| Developer MCP | Developer Memory product | `search_decisions`, `log_constraint`, `get_project_context` |

- Platform (shared): append-only versioned shard store, hybrid search (BM25 + pgvector RRF/MMR), tags, and — in the active Docker/Postgres stack — the **AGE graph + entity worker**.
- Products (per-domain): MCP tools + curation logic. Storage is **logically shared** (separated by tags/context per ADR-012), not per-product isolated (`CLAUDE.md:28`).

**Key consequence:** a product that builds on the Platform MCP inherits AGE for free. A product that stands up its *own* storage stack (as Contact Memory did with Supabase) inherits whatever *that* stack has — and Supabase has no AGE.

---

## 4. Per-product impact

| Product | Built on | Graph today | Impact of the AGE situation |
|---|---|---|---|
| **Developer Memory** (planned) | Platform MCP (default) | Inherits live AGE | **Not harmed.** Its debugging cluster (`Error`/`Function`/`CAUSED_BY`, single-type `CAUSED_BY*1..5`) works on `v1.6.0-rc0`. Only exposure is Risk A *if* it were built on Contact's Supabase pattern instead of the platform. |
| **Contact Memory** (active) | Own Supabase stack | None, by choice | Graph-less by design; a parser + human-review gate replace graph/consolidation. This is the *intended* trade, explicitly scoped to Contact. |
| **Life Memory** (hypothetical) | Undecided | — | **Most exposed.** As a personal/life-events product it is the biggest AGE beneficiary (people, preferences, interests, relationships) *and* the one whose signature query — multi-type preference traversal `[:LIKES\|INTERESTED_IN*1..3]` — hits Risk B's `|` ceiling, *and* it faces Risk A's deployment fork on day one. |

The entity model already leans this way: node labels `Person/Function/Error/Topic/Project` and relationships `CAUSED_BY/LIKES/WORKS_ON/USES/RELATED_TO` (`server/src/entityWorker.ts:12-13`). `Error`+`Function`+`CAUSED_BY` is the developer/debugging cluster; `Person`+`LIKES`+interest-style edges is the personal/life cluster — exactly the half that needs the missing operator.

---

## 5. Risk A — the unacknowledged two-database divergence

Two storage stacks now coexist: **self-hosted Postgres+AGE** (platform, ADR-009/011) and **Supabase-no-AGE** (Contact, `ai_memory_architecture_decisions.md` Decision 7). **No document analyzes this split as a risk.** `CLAUDE.md`'s "Two stacks coexist" section is about *language/runtime* (Deno vs C#), not this database divergence.

The danger is not the divergence itself — Contact's trade is deliberate and fenced. The danger is **drift by convenience**: Developer Memory's deployment target is undecided, and Supabase (managed, less ops, Edge Functions) is an attractive default. If a future product-scoped "let's just use Supabase like Contact did" decision is made without anyone re-stating that this **strips the graph tier ADR-003/011 call first-class**, the platform's graph capability is lost silently for that product. There is currently no guardrail that forces this cost to be weighed.

---

## 6. Risk B — the frozen AGE capability ceiling

The platform's AGE is pinned at `PG15/v1.6.0-rc0`, the latest release AGE cut for PG15 (`ADR-011:55`; per-Postgres-major tag namespaces mean `PG15/v1.7.0` never existed). That build **lacks the `|` relationship-type selector** in variable-length patterns — `[:LIKES|INTERESTED_IN*1..3]` produces a parse error; it was introduced in v1.7.0/PG17+ (`docs/investigations/ST-021-findings/07-opencypher-fact-inference.md:7`; `/10-6b-surprises-discoveries.md:17`).

- **What still works:** single-relationship variable-length traversal (`CAUSED_BY*1..5` validated in ST-021). So the developer/debugging graph is unaffected.
- **Workaround:** explicit chained MATCH clauses per relationship type — "production-viable in the interim" (`07-…:31`).
- **Who it bites:** compact multi-type preference/interest inference — the Life Memory pattern.
- **Upgrade path:** already tracked and **deferred** as **ST-024** ("Upgrade to AGE v1.7.0 + PG17"), whose notes state it is "Only triggered if a use case requires the `|` selector." Unlocking it is a PostgreSQL **major** upgrade, evaluated and rejected for now absent a demonstrated requirement (`ADR-011:55`; `turbopuffer-storage-evaluation.md`).

This analysis does **not** duplicate ST-024 — Risk B is delegated to it. The point here is only that a real Life/personal product is the concrete use case that would finally *trigger* ST-024.

---

## 7. Recommendation

1. **Add a lightweight governance guardrail** (a short ADR, e.g. ADR-013 "Products inherit the platform graph tier by default"): products built on the Platform MCP inherit its storage capabilities including the AGE graph; moving a product onto a stack that omits AGE (as Contact→Supabase) is a **per-product decision that must explicitly account for losing graph-based retrieval (ADR-003 Mode 2 / entity traversal)** — it does not become the platform default. Cross-reference ADR-003/009/011, the Contact supersession note (`CLAUDE.md:32`), and ST-024 for the version ceiling. This closes Risk A by forcing the cost to be weighed each time, rather than banning divergence.
2. **Keep ST-024 deferred** — do not upgrade AGE/Postgres speculatively. The trigger is a concrete multi-type-traversal use case, most likely a real Life/personal product. When that product is scoped, ST-024's cost/benefit flips and it should be pulled.
3. **When Life Memory is actually defined**, make its deployment target (platform-AGE vs Supabase) and its graph requirements (does it need `|`?) explicit *up front* — it is the product where both risks converge.

This work is tracked by **ST-079** (governance guardrail). The version-ceiling upgrade remains **ST-024** (deferred).

---

## Sources

- `docs/architecture/ai_memory_architecture_decisions.md` (`:20-39` system model, `:59-68` per-product MCP, `:86-92` Contact Supabase decision, `:104` Developer Memory deferral)
- `CLAUDE.md` (`:28` MCP boundaries, `:31` Developer Memory deferred, `:32` "for Contact Memory deployment only")
- `docs/design/adr/ADR-003-hybrid-search.md` (`:35, :129` graph first-class), `ADR-009-deployment-model.md` (`:25, :130`), `ADR-011-storage-strategy.md` (`:37, :39, :55, :116, :130`)
- `docs/investigations/ST-021-findings/07-opencypher-fact-inference.md`, `10-6b-surprises-discoveries.md` (the `|` limitation + workaround)
- `server/src/entityWorker.ts` (`:12-13` label/rel allow-lists), `server/index.ts:880-1008` (`graph_traverse`/`graph_search`), `server/db/graph.sql` (graph DDL + entity queue)
- `docs/investigations/turbopuffer-storage-evaluation.md` (origin of ST-078; PG18 upgrade cost/benefit)
- `.github/planning/story-board.md` — ST-024 (deferred upgrade), ST-034 (graph-expanded retrieval)
