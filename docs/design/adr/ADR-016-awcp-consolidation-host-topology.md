---
name: "ADR-016: AWCP Consolidation — Host, Topology, and Source-Lineage Placement"
asset_type: "adr"
status: "proposed"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-016-awcp-consolidation-host-topology.md"
created: "2026-07-29"
relates_to:
  - "docs/design/adr/ADR-013-platform-product-definitions.md"
  - "docs/investigations/awcp-spec-evaluation.md"
  - "docs/investigations/prism-ground-truth-inventory.md"
---

# ADR-016: AWCP Consolidation — Host, Topology, and Source-Lineage Placement

**Status:** Proposed — **Conditional** (host acceptance gated on the ST-084 architecture spike; **Stage 1 reported and reviewed 2026-08-03 — criteria 1–4 met, 5–7 outstanding; Stage 2 is ST-088**; see §1)
**Date:** 2026-07-29 (recorded as Accepted in error; corrected to Proposed/Conditional the same day — governance round on PR #31: the host is a preferred hypothesis, not yet an explicitly accepted decision in this form)
**Deciders:** Christopher
**Relates to:** ADR-013 (Platform and Product Definitions), `docs/investigations/awcp-spec-evaluation.md` §7 (host candidates), `docs/investigations/prism-ground-truth-inventory.md` §4 (Candidate B scoring)

---

## Context

`docs/investigations/awcp-spec-evaluation.md` §7 named four open architecture axes for the AWCP consolidation, deliberately left undecided pending the Prism ground-truth inventory (§8 Q1): process topology/deployment count, host codebase, storage layout, and source-of-truth placement for source/wiki data. The inventory (2026-07-28) answered Q1 and ruled out Candidate B ("extend Prism") — no platform beneath it, JSON-in-git persistence, and hosting AWCP there would immediately violate the product-hosts-product boundary ADR-013 exists to prevent.

This ADR records the PO **direction** on the remaining axes, set 2026-07-29 — distinguishing what is decided (hub-and-client topology direction, source-lineage placement approach) from what is a **preferred hypothesis pending its acceptance gate** (the host, §1). It was set in a single sitting rather than the evaluation doc's suggested step-3 sequencing; that's workable because §6.1's capability ladder makes increments 0–4 host-independent by design (contract-first, storage-disposable), so nothing near-term is blocked or prejudiced while the spike runs.

**Caveat carried forward:** this direction was set with AWCP §8 Q3's write-auth half still unproven — read access to Confluence/Jira/ADO is proven in production (via Prism); **write capability remains unverified, and no write is pre-approved**. Any future write test requires explicit PO confirmation **at execution time**, with the exact sandbox target and a before/after preview of the mutation; no review discussion, ADR, session log, or handoff constitutes execution approval. If such a test eventually comes back "denied," re-examine this ADR's increment 5/6 scope, not the host/topology/lineage direction itself — Q3 gates auth-dependent AWCP scope, not where the code lives.

## Decision

### 1. Host: Candidate A (extend ai-memory) — preferred hypothesis, acceptance spike-gated

Scored on §7's six criteria (domain fit, security model, code maturity, migration effort, operational simplicity, retirement path) — the same frame the Prism inventory used to score and reject Candidate B:

| Criterion | Candidate A — ai-memory | Candidate C — new umbrella codebase |
|---|---|---|
| Domain fit | Poor-to-moderate: AWCP's operational half (packets/runs/approvals) has no ai-memory analog; the knowledge half (§9.11, §9.4) is a real fit | Best: purpose-built, no memory-schema baggage |
| Security model | Bearer-gated MCP and tag scoping exist but aren't built for approval workflows or corporate-write gating — foundation, not fit | Scoped exactly to AWCP's needs, but none of it exists yet |
| Code maturity | **Revised on ST-084 Stage 1 evidence (2026-08-03).** The reuse that materialised is *infrastructural* — Postgres connection pooling, transactions, a migration pattern, logging conventions, container and test topology. The memory engine itself (pgvector/AGE storage, RRF/MMR hybrid search, append-only versioned shards, tag grammar) was found **unnecessary for AWCP and went unused** by the spike; the original wording claimed it as the reuse case and overstated the benefit against Candidate C. Still zero for AWCP's actual hard risks (session instrumentation, attention precision, corporate integration, approval semantics, multi-repo evidence freshness) | Zero, but can import donor code (ai-memory's search engine, Prism's registry/drift harness) rather than reinventing it |
| Migration effort | Low-to-moderate — absorbs the WorkPacket model, retires Storyboard in the same table/domain | Highest up-front assembly cost — new repo, deploy, auth, schema |
| Operational simplicity | Good — one runtime, one Postgres, no new infra | Worst short-term; potentially best long-term if it cleanly retires both donors' overlapping bits |
| Retirement path | N/A (survivor) — risk of conceptual coupling: memory schema absorbing unrelated execution-state concerns | Is the retirement path for the other two — defensible only with a dated supersession plan for both donors |

**Preferred: Candidate A — conditionally.** Lower migration effort and immediate operational simplicity appear to outweigh the domain-fit and conceptual-coupling risk, given increments 0–4 don't depend on this choice. But this is a **hypothesis, not an accepted host decision**: acceptance is gated on a **bounded architecture spike (ST-084)** that must prove, in ai-memory's actual codebase:

1. **Operational-domain separation** — WorkPackets, runs, checkpoints, decisions, and approvals remain a separate operational domain (own types, own state machines, own API surface), not generic memory records;
2. **Memory-disabled operation** — the operational module functions with the memory/search subsystem absent or down;
3. **Separate workflow persistence/API boundaries** — operational state does not leak into memory tables or the platform MCP surface;
4. **Failure isolation** — a fault in embedding/entity/consolidation workers cannot corrupt or block operational state;
5. **Policy-scope enforcement** — the Q9 isolation controls (policy-scope field, default-deny retrieval/provider routing) are implementable at this boundary;
6. **Remote-client control** — the hub-and-client topology (§2) works against this host: authenticated remote event ingestion with spooled replay;
7. **Reuse actually reduces complexity** — the spike must weigh whether inheriting ai-memory's engine costs less than it saves.

**Spike outcomes:** accept Candidate A; accept A with required changes; or recommend a clean umbrella application (Candidate C). Until the spike concludes, this ADR stays Proposed and no schema or migration work may assume the host.

#### Gate progress — ST-084 Stage 1, reviewed by the PO 2026-08-03

**Criteria 1–4 are met on evidence; criteria 5, 6 and 7 remain outstanding.** Stage 1's verdict is **PROMISING WITH CONCERNS** — the deliberately weaker Stage 1 vocabulary, not the final accept/reject, which is a Stage 2 deliverable. The architectural claim this ADR rests on is supported so far: Workflow Operations demonstrably runs as a separate operational domain with its own transactional persistence, its own failure boundary, and no dependency on any semantic-memory capability. **This ADR therefore stays Proposed / Conditional.** Full evidence: [`docs/investigations/ST-084-awcp-host-spike-findings.md`](../../investigations/ST-084-awcp-host-spike-findings.md).

**Acceptance pre-condition — the policy-scope enforcement surface must be priced before Candidate A may be accepted.** Stage 1 found that `scope.tags` is enforced in **zero** retrieval paths (findings §6.1): 15 hand-written read paths with no chokepoint or row-level security, a one-call `fetch` bypass that accepts no context parameter at all, two structurally unfilterable graph tools, unscoped provider egress, and a content-fingerprint dedup whose `ON CONFLICT` *merges* tags — a widening rule applied to what would become a boundary column. Getting 14 of 15 right is the same as getting it wrong.

This is not an orthogonal backlog item. It is a cost **Candidate A carries and Candidate C does not** — a greenfield operational store has no legacy read paths to retrofit — so it belongs in the host comparison rather than beside it. Stage 1 explicitly could not price it. **Stage 2 must produce that estimate before recommending acceptance**, and this ADR does not move to Accepted on a recommendation that leaves it unquantified. Recorded as a gate rather than a trade-off by PO decision, 2026-08-03.

### 2. Process topology: single central deployment, hub-and-client

One central deployment owns all authoritative state and is where the operator reviews activity. Remote agents are supervised through a **hub-and-client** model: the Ubuntu/Z2 server runs a **lightweight authenticated client/collector** — it reports Claude sessions, repository state, and checkpoints to the hub, spools events locally when disconnected, and replays them on reconnect. It holds no authoritative workflow state and is **not a second authoritative AWCP deployment**.

The alternative (two authoritative work/personal deployments) was considered and rejected for now: it would require an explicit invariant (single codebase + versioned event/API contracts + one release train) to avoid re-opening the three-systems problem via version drift (carried forward from the rev-1.4 candidate (a)). The hub-and-client split gets remote coverage without that risk, because clients are stateless-by-design apart from their spool. Revisit only if a genuine authoritative work/personal split becomes necessary.

### 3. Storage layout: open — a module-design decision, not a host decision

Whether AWCP's operational tables (packets, runs, checkpoints, approvals) live in the same schema as ai-memory's memory tables, or a logically separate schema/tables in the same Postgres instance, is **explicitly deferred** to whoever designs the operational-state schema and module boundaries (evaluation doc §9 step 3, items 2–3). This is not an oversight: it is waiting on a concrete design pass, not a further PO decision round. A future reader should not read this silence as "undecided by omission" — it is decided to be decided later, at module-design time.

**Shared-runtime trade-offs the spike surfaced (ST-084 §6.2, §6.3 — recorded here 2026-08-03 so they inform the layout decision rather than sitting only in the findings doc):**

- **A Postgres schema is namespacing, not access control.** `CREATE SCHEMA workflow` buys clean teardown and a real migration boundary. It does **not** buy isolation — the single `ai_memory` role reads and writes both schemas freely. Genuine enforcement needs a second role plus `REVOKE`. Nothing in Stage 1 depends on the stronger claim, and the layout decision must not assume it.
- **Migration failure in the shared chain is fatal to the whole server** (`migrate.ts` calls `Deno.exit(1)`, awaited before `Deno.serve`). The spike avoided that tax by keeping workflow DDL out of the shared chain, with its own ordered runner and checksummed ledger inside the workflow schema. **But co-tenancy still costs a shared blast radius**: ST-086 wired the module into the composition root with a deliberate fail-startup policy, so a failed workflow migration under `FEATURE_WORKFLOW=true` now stops the memory MCP from opening its port. The module still never exits on its own — it reports an outcome and the composition root decides — which is the property worth preserving, but "separate schema" does not mean "separate failure domain" for a shared process.
- **Registering MCP tools costs two out-of-module edits** — the hand-maintained `toolNames` array in `server/index.ts` and a compat test that regex-scans that one file and asserts a two-way match against `tools/list`. Stage 1 avoided this by registering no tools; a production workflow surface would pay it.

None of these blocks the host decision. All three belong in the trade-off ledger a future reader weighs against Candidate C.

### 4. Source-of-truth placement: build local source-lineage tracking

The AWCP host will provide Confluence/Jira/ADO source-lineage tracking — identity, version, content hash, scrape time — based on the Prism registry mechanism the ground-truth inventory validated in production (350 pages, SHA-256 hashing, staleness queries). Two constraints on how:

- **Extract before rebuild.** Prefer **extracting, migrating, or wrapping Prism's proven registry and drift-detection mechanisms** (the PowerShell/Node harnesses and their data shapes) over rebuilding them from their pattern. Rebuild-from-pattern is the fallback if extraction proves impractical, and that finding must be recorded, not assumed.
- **Honest scope for hash-only lineage.** Hashes and version metadata answer *"has this changed since we scoped the packet?"* — **change detection**. They cannot answer *"what did this page say when the packet was scoped?"* To support point-in-time citation, the tracker must either (a) retain the relevant **immutable content excerpts** at scoping time, or (b) reliably retrieve the historical upstream version (e.g. Confluence page-version API) on demand; otherwise the promise is **narrowed to change detection** and FR-VER-009 staleness marking, and point-in-time reconstruction is explicitly out of scope. Which of (a)/(b)/narrowed applies is decided in the same module-design pass as §3 — with the R11 no-page-bodies philosophy weighed against (a) rather than assumed to permit it.

## Consequences

- ADR-013 §2 (product register) and §4(b) (Storyboard disposition) updated to reference this decision (see ADR-013 revision 1.2).
- Storyboard (SRS §5.6) is confirmed superseded by the WorkPacket model (AWCP §8 Q4) — retirement sequenced with the WorkPacket model's arrival, not before.
- `awcp-spec-evaluation.md` §7's "no host lean expressed" framing is superseded — a **preferred hypothesis with an explicit acceptance gate** is now on record, not merely candidate inputs (and not yet an accepted host).
- Storage layout remains a real open item for the eventual module-design pass; it must not be silently resolved by whoever writes the first migration without revisiting this ADR's §3.
- **ST-084** (architecture spike) is the acceptance gate for §1; this ADR moves to Accepted only on a spike outcome of "accept" or "accept with changes" (with the changes recorded here). **Stage 1 reported 2026-08-03: criteria 1–4 met, 5–7 outstanding, verdict PROMISING WITH CONCERNS — supporting the hypothesis without discharging the gate.** ST-084 Stage 2 (criteria 5–7) is tracked as **ST-088**, and §1's acceptance pre-condition binds it: no acceptance on an unpriced policy-scope obligation.

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-07-29 | Initial — recorded host (Candidate A), topology (single deployment), storage (deferred), source-lineage placement as decided; status Accepted |
| 1.2 | 2026-08-03 | ST-084 Stage 1 review (PO). **Status unchanged — still Proposed/Conditional; the gate is not discharged.** §1 records gate progress (criteria 1–4 met, 5–7 outstanding, verdict PROMISING WITH CONCERNS) and gains an **acceptance pre-condition**: the policy-scope enforcement surface must be priced before Candidate A may be accepted, because it is a cost Candidate A carries and Candidate C does not (findings §6.1 — `scope.tags` enforced in zero retrieval paths). §1's Candidate A code-maturity row narrowed to the *infrastructural* reuse the spike actually observed; the memory-engine reuse it previously claimed was found unnecessary and went unused. §3 gains the shared-runtime trade-offs (schema ≠ access control; shared blast radius, restored deliberately by ST-086's fail-startup wiring; MCP registration cost). §2 and §4 unchanged — Stage 1 produced no evidence bearing on either |
| 1.1 | 2026-07-29 | Governance round (PR #31): status corrected to Proposed/Conditional — host is a preferred hypothesis gated on the ST-084 spike; topology restated as hub-and-client (central hub + lightweight remote collector, no second authoritative deployment); sandboxed-write "approved" claim removed (execution-time approval required, nothing pre-approved); §4 revised — extract/wrap Prism mechanisms before rebuild, hash-only lineage honest-scoped to change detection unless excerpts or historical retrieval are added |
