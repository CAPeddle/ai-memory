---
name: "ADR-013: Platform and Product Definitions"
asset_type: "adr"
status: "accepted"
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

**Status:** Accepted
**Date:** 2026-07-28 (accepted 2026-07-29)
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
| **Workflow / Operations Memory** (AWCP) | Proposed — **and no longer hosted here** | Verification contracts, evidence gates, approval ledger | **Updated 2026-08-26 on [ADR-016](ADR-016-awcp-consolidation-host-topology.md) reaching Accepted.** The ST-084/ST-088 spike **rejected Candidate A**: AWCP does not remain a co-tenant of ai-memory. It becomes a **standalone peer service** with its own codebase and runtime, consuming ai-memory as an *optional* context provider through a replaceable adapter derived from `server/src/workflow/ports.ts` — a **direction, not a scored selection** ([ADR-016](ADR-016-awcp-consolidation-host-topology.md) §1(b)): the peer-service topology has not been scored against the six criteria A, B and C each received, and that scoring is carried as its own story, not yet filed. Hub-and-client topology and source lineage via extracted/wrapped Prism mechanisms are unchanged, but are now **AWCP-internal** decisions that belong in an AWCP-owned ADR (ADR-016 §2–§4). Storage layout was settled in the existing `workflow` schema ([ADR-017](ADR-017-awcp-work-item-contract.md) §5) and travels with the extraction. **This row stays in the register**: AWCP is still one of this account's products, and ai-memory is still its knowledge provider — what changed is that it is no longer *co-located*, which §3 already says is a deployment question, not a layering one |

The platform itself is not a product and never acquires persona semantics.

`prism-llm-wiki` is not a fourth register row. Its cross-boundary correlation capability (Confluence/Jira/git drift detection and Jira↔git evidence correlation) is recorded as an early, partial implementation of the **Workflow / Operations Memory** row above, per the `prism-llm-wiki` boundary plan (`2026-07-28-001-docs-developer-memory-prism-boundary-plan.md`, R3/R4) and `docs/investigations/prism-ground-truth-inventory.md` §3. Under the criteria in §1, Prism itself classifies as a product (persona, domain vocabulary, curation/promotion policy, and a domain MCP/UI surface — see the inventory §3) but holds none of the platform capabilities in the list above; it registers as a donor to Workflow/Operations Memory, not as a peer entry.

**Wiki content, decided 2026-08-26 — a reversal, recorded as one.** `prism-ground-truth-inventory.md` §5 records the 60-page wiki as **"frozen, not donated"**. The PO has now directed that its *knowledge* be migrated into ai-memory, injected through ai-memory's own capture tooling and **driven from the `prism-llm-wiki` side**. This reverses the frozen disposition for the wiki **content** only; the *mechanisms* (Confluence source lineage, hash-baseline drift detection, Jira↔git correlation) are unaffected and stay assigned to Workflow/Operations Memory's evidence layer as recorded above. The migrated content lands as ordinary platform shards with provenance — it does **not** create a register row, and whether it seeds the Deferred **Developer Memory** product or stands alone as tagged knowledge is left to that story. **To be tracked as its own story on the board** — not yet filed, and its `ST-NNN` not yet minted.

### 3. Layering is not deployment

Logical layering (who owns schemas, curation policy, MCP surfaces) is independent of deployment topology (how many runtimes are operated). Products **may be co-deployed in a single runtime** with the platform engine — a topology *permitted, not mandated*, under the AWCP consolidation direction (PR #31 review), whose process/deployment count remains an open architecture decision *(settled 2026-08-26 by [ADR-016](ADR-016-awcp-consolidation-host-topology.md) rev 1.5: AWCP runs in its own runtime, so it is no longer co-deployed with the platform. The clause's principle is unaffected — co-deployment stays permitted for products generally, and it was never mandated for AWCP)* — without collapsing their logical boundaries. A single user-facing product may equally be composed of separately deployed components, including split work/personal deployments. Conversely, operating a product on separate infrastructure (Contact Memory on Supabase, Decision 7) is a per-product decision, not a platform default. A "one deployable product" decision therefore does not violate, and is not violated by, this ADR.

### 4. Disposition of known boundary violations

(a) **Consolidation worker (shard → wiki) in the platform server.** Owned, as *logic*, by the Developer Memory product per Decision 1. It is **grandfathered in place**: it may keep running inside the platform runtime (layering ≠ deployment, §3) until Developer Memory is designed, at which point it becomes that product's module and its promotion policy is re-examined. ADR-007 remains valid as Developer Memory product logic. No platform capability may grow a new dependency on the wiki tier in the interim.

(b) **Storyboard (SRS §5.6, FR-B-001..009, UC-3).** Reassigned to the product layer, and **confirmed absorbed/superseded** by the WorkPacket model (PO decision, AWCP §8 Q4, 2026-07-29). The platform no longer claims it; retirement is sequenced with the WorkPacket model's arrival, not before.

**Correction, 2026-08-26.** This disposition previously reasoned *"now that the host decision places AWCP in the same codebase as the Storyboard it replaces."* **That premise is false as of [ADR-016](ADR-016-awcp-consolidation-host-topology.md) revision 1.5** — Candidate A is rejected and AWCP becomes a standalone peer service. The supersession itself **stands**: it was a product-model decision (one authoritative work-state model, AWCP §8 Q4), never a co-location one, so removing the co-location does not revive the Storyboard. What changes is the *sequencing*: the WorkPacket model now arrives in a different codebase, so Storyboard retirement follows the AWCP extraction rather than this repo's own roadmap, and the platform must not re-grow a Storyboard in the interim on the grounds that its replacement moved out.

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

- ~~The AWCP host/topology decision (PR #31 §7 open axes) is made — the product register and disposition (b) must be updated to match.~~ **Fired and closed 2026-07-29** — see [ADR-016](ADR-016-awcp-consolidation-host-topology.md); register and disposition (b) updated above. Storage layout (schema boundary within the host) remains open — a future module-design pass, not a further revisit of this trigger. **Re-fired and re-closed 2026-08-26**: the 2026-07-29 close recorded a *conditional* host, and its acceptance gate then rejected it. ADR-016 is Accepted with Candidate A **rejected**; the register row and disposition (b) are updated again above, and disposition (b)'s reasoning carried a premise this reversal falsified. Storage layout was separately discharged 2026-08-24 ([ADR-017](ADR-017-awcp-work-item-contract.md) §5) and now travels with the extraction.
- **A capability provider named in the register is replaced or supplemented.** ADR-016 §1 (rev 1.5) makes provider replaceability a requirement rather than an assumption — ai-memory is *a* knowledge provider to AWCP, not *the* knowledge layer. If a second provider appears behind the same port, the register describes products, not the sole implementations of a capability.
- Developer Memory design begins — disposition (a) converts from grandfathered to relocated/fenced. **Now scheduled**, not hypothetical: AWCP §8 Q10 (2026-07-29) commits Developer Memory's design as a follow-on story rather than deferring indefinitely — see the story board.
- A capability request cannot be classified by the criteria above — amend the definitions, don't special-case silently.
- A second human user or shared deployment appears — persona definitions need revisiting alongside ADR-011's multi-user clause.

---

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-07-28 | Initial — Option 2 adopted: platform/product criteria, litmus test, product register (Contact Memory, Developer Memory, proposed Workflow/Operations Memory), layering-vs-deployment clause, disposition of three known boundary violations |
| 1.1 | 2026-07-28 | Added `prism-llm-wiki` attribution to the product register: correlation capability recorded as an early partial implementation of Workflow/Operations Memory, not a fourth register row, per the `prism-llm-wiki` boundary plan (R3/R4) and `docs/investigations/prism-ground-truth-inventory.md` §3 |
| 1.2 | 2026-07-29 | **Accepted** (status: proposed → accepted). AWCP host/topology revisit trigger fired and closed: product register and Storyboard disposition (b) updated to reflect [ADR-016](ADR-016-awcp-consolidation-host-topology.md)'s host/topology/source-lineage decision; Storyboard confirmed superseded (AWCP §8 Q4); Developer Memory design committed as a scheduled follow-on story (AWCP §8 Q10), converting the "Developer Memory design begins" trigger from hypothetical to scheduled |
| 1.3 | 2026-08-26 | **The AWCP host revisit trigger re-fired, and closing it corrected a false premise.** [ADR-016](ADR-016-awcp-consolidation-host-topology.md) reached Accepted with **Candidate A rejected**: AWCP leaves this codebase and becomes a standalone peer service consuming ai-memory as an optional, **replaceable** context provider — a direction, not a scored selection. Product register's Workflow/Operations row updated — the row **stays** (AWCP is still a product and ai-memory still its knowledge provider); what changed is co-location, which §3 already classes as deployment rather than layering. Disposition (b) corrected: its *"same codebase as the Storyboard it replaces"* reasoning is now false, though the supersession itself stands as a product-model decision and Storyboard retirement re-sequences behind the extraction. Revisit triggers gain a provider-replacement trigger, per ADR-016 §1's interface requirement. Recorded a **reversal** of `prism-ground-truth-inventory.md` §5's *"frozen, not donated"* wiki disposition: the wiki **content** migrates into ai-memory via its own capture tooling, driven from `prism-llm-wiki`; the Prism **mechanisms** are unaffected and stay with Workflow/Operations Memory's evidence layer. §1 definitions, litmus test and §3 unchanged; status stays Accepted |
