---
name: "ADR-013: Platform and Product Definitions"
asset_type: "adr"
status: "proposed"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-013-platform-product-definitions.md"
created: "2026-07-28"
relates_to:
  - "docs/architecture/ai_memory_architecture_decisions.md"
  - "docs/design/adr/ADR-007-consolidation-pipeline.md"
  - "docs/design/adr/ADR-012-tags-replace-binary-profile.md"
  - "docs/requirements/SRS.md"
---

# ADR-013: Platform and Product Definitions

**Status:** Proposed
**Date:** 2026-07-28
**Deciders:** Christopher
**Relates to:** Architecture Decisions Record (2026-06-26), ADR-007 (Consolidation Pipeline), ADR-012 (Tags), SRS §4.3/§5.4–§5.6

---

## Context

The layered model — a domain-agnostic **platform** with persona-scoped **products** built on top — was established by the Architecture Decisions Record (2026-06-26): "AI Memory is a personal knowledge platform. Products are built on top of it." Decision 1 of that record made the platform single-tier ("there is no wiki tier at the platform level"); Decision 3 gave each product its own MCP server; Decision 5 placed curation policy (Contact Memory's human review gate) at the product layer.

Three gaps make that model worth formalising now:

1. **The SRS still describes the pre-split world.** SRS v1.1 specifies the three-tier Brain (Shards / Wiki / Views), the consolidation pipeline (§5.4), view synthesis (§5.5), and the Storyboard (§5.6) as *platform* requirements. The CLAUDE.md supersession map only demotes these "for Contact Memory-specific work" — platform-wide, the SRS's wiki tier and Decision 1's "no wiki tier" coexist with no document saying which governs.
2. **Shipping code contradicts Decision 1.** `server/src/consolidationWorker.ts` (ST-008, per ADR-007) runs in the platform server at startup and promotes `shard → wiki` rows in the platform database. The decision record says consolidation "elevates to Developer Memory as a product-layer component," but it has not been moved or fenced.
3. **There are examples, but no criteria.** Nothing states *what qualifies* something as a product versus a platform capability. Each new requirement re-litigates the boundary — most recently the AWCP evaluation (`docs/investigations/awcp-spec-evaluation.md`, PR #31), which proposes a third product and simultaneously a consolidation-first deployment, and needs the boundary to be stated to proceed.

---

## Options Considered

### Option 1: Status quo — examples only
Keep the Architecture Decisions Record's product examples as the implicit definition; resolve boundary questions case by case.

| Pros | Cons |
|------|------|
| No work now | Every new requirement re-litigates the boundary |
| | SRS/code contradictions stay unresolved and compound |
| | AWCP host decision has no stated frame to land in |

### Option 2: Definitional ADR + targeted SRS supersession banners (chosen)
One ADR defining platform and product by criteria, registering the products, resolving the known violations by explicit disposition, and separating logical layering from deployment topology. SRS sections that describe product-layer concerns get supersession banners, not rewrites.

| Pros | Cons |
|------|------|
| Single citable source for the boundary | SRS remains historically layered (banners, not clean text) |
| Resolves the code/doc contradiction without forcing immediate code moves | Grandfathering tolerates a known violation for a while |
| Cheap; consistent with the repo's supersession-map culture | |

### Option 3: Full SRS rewrite to platform-only scope
Rewrite the SRS so it specifies only the platform; extract product requirements to per-product specs.

| Pros | Cons |
|------|------|
| Cleanest end state | Large effort now, ahead of the AWCP host decision that may restructure product specs anyway |
| | Destroys the SRS as historical record |

---

## Decision

**Adopt Option 2.** The following definitions, register, and dispositions are binding.

### 1. Definitions

**Platform** — the domain-agnostic capability layer that every product consumes. A capability belongs to the platform when it treats all knowledge identically, regardless of domain, persona, or meaning.

Current platform capabilities:

- Append-only, versioned shard storage (single-tier, per Architecture Decisions Record Decision 1)
- Tags as the scoping mechanism (ADR-012), including the reserved-tag and namespace conventions
- Hybrid search: BM25 + vector, RRF fusion, MMR re-rank (ADR-003)
- The AGE graph tier and entity extraction infrastructure (ADR-003, ADR-011)
- Provenance and versioning fields; soft-delete/supersede semantics
- Platform MCP primitives (`capture_thought`/`capture_shard`, `search_thoughts`/`search_shards`, `list_thoughts`, `fetch`, graph tools)
- Cross-cutting runtime infrastructure: queues, workers *as infrastructure*, migrations, auth, health

The platform **must not** contain: curation or promotion *policy*, persona semantics, domain vocabularies (contact, commitment, work packet…), or domain-specific MCP toolsets.

**Product** — a persona- or domain-scoped layer built on platform primitives. Something is a product (or belongs to one) when it has **any** of:

- a **persona** (who is the user acting as?),
- a **domain vocabulary** (its own entities and their meaning),
- a **curation/promotion policy** (rules for when knowledge becomes true, reviewed, or promoted),
- a **domain MCP toolset or UI** (tools whose names mean something only in that domain).

**Litmus test:** *does it decide what knowledge means or when it is trusted?* → product. *Does it store, index, or retrieve any knowledge the same way?* → platform.

### 2. Product register

| Product | Status | Curation model | MCP surface |
|---|---|---|---|
| **Contact Memory** | Active | Human review gate before commit (Decision 5) | Contact MCP (planned tools per Decision 3) |
| **Developer Memory** | Deferred | Confidence-scored consolidation (ADR-007) — see disposition (a) | Developer MCP (planned) |
| **Workflow / Operations Memory** (AWCP) | Proposed | Verification contracts, evidence gates, approval ledger | Per `docs/investigations/awcp-spec-evaluation.md`; host decision pending (PR #31 Q1–Q4) |

The platform itself is not a product and never acquires persona semantics.

### 3. Layering is not deployment

Logical layering (who owns schemas, curation policy, MCP surfaces) is independent of deployment topology (how many runtimes are operated). Products **may be co-deployed in a single runtime** with the platform engine — this is the expected shape for the AWCP consolidation-first direction (PR #31 review) — without collapsing their logical boundaries. Conversely, operating a product on separate infrastructure (Contact Memory on Supabase, Decision 7) is a per-product decision, not a platform default. A "one deployable product" decision therefore does not violate, and is not violated by, this ADR.

### 4. Disposition of known boundary violations

(a) **Consolidation worker (shard → wiki) in the platform server.** Owned, as *logic*, by the Developer Memory product per Decision 1. It is **grandfathered in place**: it may keep running inside the platform runtime (layering ≠ deployment, §3) until Developer Memory is designed, at which point it becomes that product's module and its promotion policy is re-examined. ADR-007 remains valid as Developer Memory product logic. No platform capability may grow a new dependency on the wiki tier in the interim.

(b) **Storyboard (SRS §5.6, FR-B-001..009, UC-3).** Reassigned to the product layer. It is the embryonic form of the proposed Workflow/Operations product's work-state model; its fate (absorption or retirement) is settled by the AWCP host decision. The platform no longer claims it.

(c) **Three-tier Brain and view synthesis (SRS §4.3, §5.4, §5.5).** Product-layer concerns. The platform is single-tier; wikis and views are product projections over shards.

Each of these carries a supersession banner in the SRS (v1.2) pointing here.

---

## Accepted Trade-offs

| Trade-off | Mitigation |
|-----------|------------|
| Grandfathering tolerates a running Decision-1 violation | Explicit ownership + "no new dependencies" rule; relocation is tied to the Developer Memory design milestone |
| SRS stays banner-annotated rather than clean | Option 3 (extraction to per-product specs) remains available after the AWCP host decision |
| Criteria-based definitions can still leave edge cases | The litmus test plus the product register give a default answer; genuinely new cases amend the register here |

---

## Revisit Triggers

- The AWCP host decision (PR #31 Q1–Q4) is made — the product register and disposition (b) must be updated to match.
- Developer Memory design begins — disposition (a) converts from grandfathered to relocated/fenced.
- A capability request cannot be classified by the criteria above — amend the definitions, don't special-case silently.
- A second human user or shared deployment appears — persona definitions need revisiting alongside ADR-011's multi-user clause.
