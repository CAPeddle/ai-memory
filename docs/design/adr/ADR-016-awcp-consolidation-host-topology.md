---
name: "ADR-016: AWCP Consolidation — Host, Topology, and Source-Lineage Placement"
asset_type: "adr"
status: "accepted"
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

**Status:** Accepted
**Date:** 2026-07-29
**Deciders:** Christopher
**Relates to:** ADR-013 (Platform and Product Definitions), `docs/investigations/awcp-spec-evaluation.md` §7 (host candidates), `docs/investigations/prism-ground-truth-inventory.md` §4 (Candidate B scoring)

---

## Context

`docs/investigations/awcp-spec-evaluation.md` §7 named four open architecture axes for the AWCP consolidation, deliberately left undecided pending the Prism ground-truth inventory (§8 Q1): process topology/deployment count, host codebase, storage layout, and source-of-truth placement for source/wiki data. The inventory (2026-07-28) answered Q1 and ruled out Candidate B ("extend Prism") — no platform beneath it, JSON-in-git persistence, and hosting AWCP there would immediately violate the product-hosts-product boundary ADR-013 exists to prevent.

This ADR records the PO decision on the remaining axes, made 2026-07-29 in a single sitting rather than the evaluation doc's own suggested step-3 sequencing (after source-of-truth placement/Q3). That's noted, not hedged: §6.1's capability ladder makes increments 0–4 host-independent by design (contract-first, storage-disposable), so a host decision made now doesn't unblock or block near-term work — it buys sequencing clarity, and is revisitable before increment 5 at low cost if wrong.

**Caveat carried forward:** this decision was taken with AWCP §8 Q3's write-auth half still unproven — read access to Confluence/Jira/ADO is proven in production (via Prism), write access has never been attempted anywhere. The sandboxed write test is approved (§8 Q3) but not yet executed — no write-capable Jira/Confluence/ADO MCP tooling exists in the ai-memory session; it requires the `prism-llm-wiki`/VS Code Copilot environment (see `FollowUpSessionLog.txt`). If that test comes back "denied," re-examine this ADR's increment 5/6 scope, not the host/topology/lineage decisions themselves — Q3 gates auth-dependent AWCP scope, not where the code lives.

## Decision

### 1. Host: Candidate A — extend ai-memory

Scored on §7's six criteria (domain fit, security model, code maturity, migration effort, operational simplicity, retirement path) — the same frame the Prism inventory used to score and reject Candidate B:

| Criterion | Candidate A — ai-memory | Candidate C — new umbrella codebase |
|---|---|---|
| Domain fit | Poor-to-moderate: AWCP's operational half (packets/runs/approvals) has no ai-memory analog; the knowledge half (§9.11, §9.4) is a real fit | Best: purpose-built, no memory-schema baggage |
| Security model | Bearer-gated MCP and tag scoping exist but aren't built for approval workflows or corporate-write gating — foundation, not fit | Scoped exactly to AWCP's needs, but none of it exists yet |
| Code maturity | High for storage/search (Postgres+pgvector+AGE, RRF/MMR, versioned shards, MCP, WSL2-ready); zero for AWCP's actual hard risks (session instrumentation, attention precision, corporate integration, approval semantics, multi-repo evidence freshness) | Zero, but can import donor code (ai-memory's search engine, Prism's registry/drift harness) rather than reinventing it |
| Migration effort | Low-to-moderate — absorbs the WorkPacket model, retires Storyboard in the same table/domain | Highest up-front assembly cost — new repo, deploy, auth, schema |
| Operational simplicity | Good — one runtime, one Postgres, no new infra | Worst short-term; potentially best long-term if it cleanly retires both donors' overlapping bits |
| Retirement path | N/A (survivor) — risk of conceptual coupling: memory schema absorbing unrelated execution-state concerns | Is the retirement path for the other two — defensible only with a dated supersession plan for both donors |

**Decided: Candidate A.** Lower migration effort and immediate operational simplicity outweigh the domain-fit and conceptual-coupling risk, given increments 0–4 don't depend on this choice and it is revisitable before increment 5.

### 2. Process topology: single deployment

One ai-memory instance hosts both corporate AWCP operational state and personal memory. The alternative (split work/personal deployments — corporate on this laptop, personal on the Ubuntu/Z2 homeserver) was considered and rejected for now: it would require an explicit invariant (single codebase + versioned event/API contracts + one release train) to avoid re-opening the three-systems problem via version drift (carried forward from `FollowUpSessionLog.txt`'s un-folded rev-1.4 candidate (a)). Not needed under single deployment. Revisit if/when a genuine work/personal infrastructure split is required.

### 3. Storage layout: open — a module-design decision, not a host decision

Whether AWCP's operational tables (packets, runs, checkpoints, approvals) live in the same schema as ai-memory's memory tables, or a logically separate schema/tables in the same Postgres instance, is **explicitly deferred** to whoever designs the operational-state schema and module boundaries (evaluation doc §9 step 3, items 2–3). This is not an oversight: it is waiting on a concrete design pass, not a further PO decision round. A future reader should not read this silence as "undecided by omission" — it is decided to be decided later, at module-design time.

### 4. Source-of-truth placement: build local source-lineage tracking

ai-memory (as AWCP host) will build its own Confluence/Jira/ADO source-lineage tracker — identity, version, content hash, scrape time — following the Prism registry pattern the ground-truth inventory validated in production (350 pages, SHA-256 hashing, staleness queries). It will **not** copy page bodies into local storage, matching the `prism-llm-wiki` boundary plan's R11/R12 philosophy (upstream stays upstream; comprehension is query-time via Rovo/Atlassian MCP) — but unlike Prism's own now-frozen registry, this tracker is being built new, for a different purpose: FR-VER-009 evidence-freshness and point-in-time citation ("what did this page say when the packet was scoped") that live query-time access cannot provide retroactively.

## Consequences

- ADR-013 §2 (product register) and §4(b) (Storyboard disposition) updated to reference this decision (see ADR-013 revision 1.2).
- Storyboard (SRS §5.6) is confirmed superseded by the WorkPacket model (AWCP §8 Q4) — retirement sequenced with the WorkPacket model's arrival, not before.
- `awcp-spec-evaluation.md` §7's "no host lean expressed" framing is superseded — a decision is now on record, not merely candidate inputs.
- Storage layout remains a real open item for the eventual module-design pass; it must not be silently resolved by whoever writes the first migration without revisiting this ADR's §3.

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-07-29 | Initial — host (Candidate A), topology (single deployment), storage (deferred to module design), source-lineage placement (build local tracker) decided |
