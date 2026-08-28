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

**Status:** **Accepted** 2026-08-26 — the ST-084/ST-088 spike concluded and the PO signed off: **Candidate A is rejected** and AWCP becomes a standalone peer service consuming ai-memory as an optional context provider (see §1). Criterion 5 (policy-scope enforcement) is **not** discharged by that decision and remains ST-082's obligation.
**Date:** 2026-07-29 (recorded as Accepted in error; corrected to Proposed/Conditional the same day — governance round on PR #31: the host is a preferred hypothesis, not yet an explicitly accepted decision in this form)
**Deciders:** Christopher
**Relates to:** ADR-013 (Platform and Product Definitions), `docs/investigations/awcp-spec-evaluation.md` §7 (host candidates), `docs/investigations/prism-ground-truth-inventory.md` §4 (Candidate B scoring)

---

## Context

`docs/investigations/awcp-spec-evaluation.md` §7 named four open architecture axes for the AWCP consolidation, deliberately left undecided pending the Prism ground-truth inventory (§8 Q1): process topology/deployment count, host codebase, storage layout, and source-of-truth placement for source/wiki data. The inventory (2026-07-28) answered Q1 and ruled out Candidate B ("extend Prism") — no platform beneath it, JSON-in-git persistence, and hosting AWCP there would immediately violate the product-hosts-product boundary ADR-013 exists to prevent.

This ADR records the PO **direction** on the remaining axes, set 2026-07-29 — distinguishing what is decided (hub-and-client topology direction, source-lineage placement approach) from what is a **preferred hypothesis pending its acceptance gate** (the host, §1). It was set in a single sitting rather than the evaluation doc's suggested step-3 sequencing; that's workable because §6.1's capability ladder makes increments 0–4 host-independent by design (contract-first, storage-disposable), so nothing near-term is blocked or prejudiced while the spike runs.

**Caveat carried forward:** this direction was set with AWCP §8 Q3's write-auth half still unproven — read access to Confluence/Jira/ADO is proven in production (via Prism); **write capability remains unverified, and no write is pre-approved**. Any future write test requires explicit PO confirmation **at execution time**, with the exact sandbox target and a before/after preview of the mutation; no review discussion, ADR, session log, or handoff constitutes execution approval. If such a test eventually comes back "denied," re-examine this ADR's increment 5/6 scope, not the host/topology/lineage direction itself — Q3 gates auth-dependent AWCP scope, not where the code lives.

## Decision

### 1. Host: Candidate A rejected — AWCP becomes a standalone peer service (decided 2026-08-26)

**Decision, in two parts of unequal weight.**

**(a) Reject Candidate A** — AWCP co-tenancy within ai-memory. This half is settled on the ST-084 spike's full evidence (Stages 1–2, [`docs/investigations/ST-084-awcp-host-spike-findings.md`](../../investigations/ST-084-awcp-host-spike-findings.md) §18).

**(b) Direct a standalone AWCP peer service** — its own codebase and runtime, consuming ai-memory as an *optional* context provider through an adapter derived from the existing `ports.ts` boundary (`KnowledgeSearchPort` / `KnowledgePromotionPort`), with `PolicyScope` threaded through its read side. **This is a direction, not a scored selection.**

**This is explicitly NOT Candidate C.** Candidate C is defined by donor retirement — *"importing selected packages/data from both donors and retiring them on a dated plan… defensible only with an explicit retirement path for both donors"* (`awcp-spec-evaluation.md:185`; the retirement-path row of the table below says the same). ai-memory is **not** retired here; it stays a live product and a supported optional provider. The peer-service topology was never scored against the six criteria that A, B and C each went through, and this decision does not pretend otherwise: **scoring it is the next step, and part (b) is read as directing that work rather than concluding it.** One instruction for that scoring, so it does not inherit a contradiction: score all six criteria for comparability, but **"migration effort" is recorded, not weighed** — per the standing direction below, effort does not decide this. Score it structurally (what must be stood up, what relocates, which boundaries change), never in day-counts.

**The interface is a first-class requirement, and it must be replaceable (PO direction, 2026-08-26).** AWCP consumes capability services — ai-memory for knowledge, and in the target stack alongside it an agent-routing service and a verification service — through an explicit contract that survives the provider behind it being swapped. The **contract** is AWCP's port interface; the **wire protocol** (in-process today, MCP or A2A later) is an adapter implementation detail and is deliberately not fixed by this decision. Two constraints follow:

- **No provider may be assumed singular or permanent.** A capability is named by what AWCP needs from it, not by the product currently supplying it. ai-memory is *a* knowledge provider, not *the* knowledge layer.
- **The read side must not be frozen as it stands.** `KnowledgeSearchPort.search(query, limit)` carries no `PolicyScope` while `PromotionInput.policyScope` is typed (findings §18.3). Publishing that asymmetry as the adapter contract would bake a scope-blind hole into the boundary this decision relies on. Threading scope through the read side, **default-deny**, is a precondition of the contract, not follow-on work.

**Why the evidence supports (a).** Stage 1 (criteria 1–4) and Phases 2–3 (criterion 6) proved AWCP's operational domain is cleanly separable and functions correctly with the memory subsystem absent, degraded or unreachable — evidence *for* standalone operation, not merely for safe co-tenancy. Criterion 7 asked whether ai-memory's engine reuse justified Candidate A's domain-fit cost; it does not. The domain-specific memory engine (semantic search, graph, hybrid retrieval, consolidation) went **entirely unused**; the reuse that did materialise is generic infrastructure — connection pooling, a migration idiom, logging conventions, container topology — which any competent Deno+Postgres service scaffolds for itself and which is not ai-memory's to lend. Co-tenancy's ongoing costs — a shared failure blast radius, a shared Postgres role with no real access-control isolation, and coupling flagged as actively harmful to extend (findings §5) — are not offset by anything AWCP actually gained from sharing a codebase.

**Effort is not an input to this decision (PO direction, 2026-08-26):** *"always discount time in evaluation… good design and functional fit over effort."* The cross-topology day-count comparison earlier drafts leaned on is withdrawn at findings §13.5, and the answer above is a design-fit answer rather than a cost one.

**A further ground, recorded 2026-08-26 and not from the spike.** AWCP coordinates work across multiple independent domains — household, development projects, and trading R&D. Under Candidate A the operational state of all three would live inside a *memory product's* codebase, schema and Postgres role. That is a tenancy argument against co-tenancy, independent of the coupling and reuse findings.

**Criterion 5 is NOT discharged by this decision and must not be read as discharged by it.** Stage 2 priced the policy-scope enforcement surface at 64+ hours / 8+ days, but `scope.tags` remains enforced in zero retrieval paths and the read-side port carries no `PolicyScope` at all. **That work is not a cost separation avoids** — it is ai-memory's own personal/corporate isolation obligation, owned by **ST-082**, required whether or not AWCP ever shared the codebase. Separation narrows the surface AWCP must trust from fifteen hand-written enforcement points to one adapter boundary; it does not discharge the obligation or reduce the work.

**This is not a verdict that the ai-memory integration attempt failed.** It is the result the spike was built to produce: memory is an optional capability AWCP consumes through an explicit port, not the architectural container it must live inside. ai-memory remains a supported context provider. Infrastructural patterns may still be copied into a standalone AWCP codebase as patterns; nothing here characterises that code as wasted.

**Extraction is not scoped by this decision.** Findings §18.8 sketches a bounded, non-big-bang path (freeze the boundary and close its scope gap → stand up standalone persistence → move AWCP-owned modules → replace the in-process port with a real adapter → verify isolation) for whoever plans it. Nothing moves under this ADR.

---

#### The candidate scoring, retained as the decision record

The table and gate below are the evidence base this decision was taken against. They are **retained as written** — including the July preference this decision reverses — rather than rewritten to agree with the outcome.

Scored on §7's six criteria (domain fit, security model, code maturity, migration effort, operational simplicity, retirement path) — the same frame the Prism inventory used to score and reject Candidate B:

| Criterion | Candidate A — ai-memory | Candidate C — new umbrella codebase |
|---|---|---|
| Domain fit | Poor-to-moderate: AWCP's operational half (packets/runs/approvals) has no ai-memory analog; the knowledge half (§9.11, §9.4) is a real fit | Best: purpose-built, no memory-schema baggage |
| Security model | Bearer-gated MCP and tag scoping exist but aren't built for approval workflows or corporate-write gating — foundation, not fit | Scoped exactly to AWCP's needs, but none of it exists yet |
| Code maturity | **Revised on ST-084 Stage 1 evidence (2026-08-03).** The reuse that materialised is *infrastructural* — Postgres connection pooling, transactions, a migration pattern, logging conventions, container and test topology. The memory engine itself (pgvector/AGE storage, RRF/MMR hybrid search, append-only versioned shards, tag grammar) was found **unnecessary for AWCP and went unused** by the spike; the original wording claimed it as the reuse case and overstated the benefit against Candidate C. Still zero for AWCP's actual hard risks (session instrumentation, attention precision, corporate integration, approval semantics, multi-repo evidence freshness) | Zero, but can import donor code (ai-memory's search engine, Prism's registry/drift harness) rather than reinventing it |
| Migration effort | Low-to-moderate — absorbs the WorkPacket model, retires Storyboard in the same table/domain | Highest up-front assembly cost — new repo, deploy, auth, schema |
| Operational simplicity | Good — one runtime, one Postgres, no new infra | Worst short-term; potentially best long-term if it cleanly retires both donors' overlapping bits |
| Retirement path | N/A (survivor) — risk of conceptual coupling: memory schema absorbing unrelated execution-state concerns | Is the retirement path for the other two — defensible only with a dated supersession plan for both donors |

**Preferred at the time: Candidate A — conditionally (2026-07-29; superseded by the decision above).** Lower migration effort and immediate operational simplicity appear to outweigh the domain-fit and conceptual-coupling risk, given increments 0–4 don't depend on this choice. But this is a **hypothesis, not an accepted host decision**: acceptance is gated on a **bounded architecture spike (ST-084)** that must prove, in ai-memory's actual codebase:

1. **Operational-domain separation** — WorkPackets, runs, checkpoints, decisions, and approvals remain a separate operational domain (own types, own state machines, own API surface), not generic memory records;
2. **Memory-disabled operation** — the operational module functions with the memory/search subsystem absent or down;
3. **Separate workflow persistence/API boundaries** — operational state does not leak into memory tables or the platform MCP surface;
4. **Failure isolation** — a fault in embedding/entity/consolidation workers cannot corrupt or block operational state;
5. **Policy-scope enforcement** — the Q9 isolation controls (policy-scope field, default-deny retrieval/provider routing) are implementable at this boundary;
6. **Remote-client control** — the hub-and-client topology (§2) works against this host: authenticated remote event ingestion with spooled replay;
7. **Reuse actually reduces complexity** — the spike must weigh whether inheriting ai-memory's engine costs less than it saves.

**Spike outcomes:** accept Candidate A; accept A with required changes; or recommend a clean umbrella application (Candidate C). Until the spike concludes, this ADR stays Proposed and no schema or migration work may assume the host.

**Discharged 2026-08-26.** The spike concluded and this ADR is Accepted, so the bar in the sentence above is lifted: AWCP schema and migration work no longer returns for a per-item host decision. The outcome was **none of the three listed** — the spike rejected A and directed a topology that was not on the original ballot, which is why part (b) above is a direction pending its own scoring rather than a scored selection.

**Narrow override — migration `005` only, granted by the PO 2026-08-24.** The bar in the sentence above was overridden for `005_work_items.sql` and for nothing else. It is an override rather than a lifting of the bar: the gate is not discharged, no later migration inherits it, and each one returns for its own explicit decision. See Revision History 1.4. *(Moot as of 2026-08-26 — the bar it overrode is discharged above. Retained as the record of how migration `005` was authorised at the time.)*

#### Gate progress — ST-084 Stage 1, reviewed by the PO 2026-08-03

**Criteria 1–4 are met on evidence; criteria 5, 6 and 7 remain outstanding.** *(As of Stage 1, 2026-08-03. **Superseded by the final gate-progress table below** — criterion 6 is now met and criterion 7 answered; only criterion 5 is still outstanding.)* Stage 1's verdict is **PROMISING WITH CONCERNS** — the deliberately weaker Stage 1 vocabulary, not the final accept/reject, which is a Stage 2 deliverable. The architectural claim this ADR rests on is supported so far: Workflow Operations demonstrably runs as a separate operational domain with its own transactional persistence, its own failure boundary, and no dependency on any semantic-memory capability. **This ADR therefore stays Proposed / Conditional.** Full evidence: [`docs/investigations/ST-084-awcp-host-spike-findings.md`](../../investigations/ST-084-awcp-host-spike-findings.md).

**Acceptance pre-condition — the policy-scope enforcement surface must be priced before Candidate A may be accepted.** Stage 1 found that `scope.tags` is enforced in **zero** retrieval paths (findings §6.1): 15 hand-written read paths with no chokepoint or row-level security, a one-call `fetch` bypass that accepts no context parameter at all, two structurally unfilterable graph tools, unscoped provider egress, and a content-fingerprint dedup whose `ON CONFLICT` *merges* tags — a widening rule applied to what would become a boundary column. Getting 14 of 15 right is the same as getting it wrong.

This is not an orthogonal backlog item. It is a cost **Candidate A carries and Candidate C does not** — a greenfield operational store has no legacy read paths to retrofit — so it belongs in the host comparison rather than beside it. Stage 1 explicitly could not price it. **Stage 2 must produce that estimate before recommending acceptance**, and this ADR does not move to Accepted on a recommendation that leaves it unquantified. Recorded as a gate rather than a trade-off by PO decision, 2026-08-03.

*(Pre-condition discharged 2026-08-05 — U1 priced the surface at 64+ hours / 8+ days, defended per path, findings §13. **Pricing was the gate; enforcement was never claimed**, and criterion 5 remains outstanding below.)*

#### Gate progress — final, ST-084 Stage 2 (ST-088), signed off by the PO 2026-08-26

| Criterion | Verdict |
|---|---|
| 1. Operational-domain separation | **Met** — Stage 1 |
| 2. Memory-disabled operation | **Met** — Stage 1 |
| 3. Separate workflow persistence/API boundaries | **Met** — Stage 1 |
| 4. Failure isolation | **Met** — Stage 1 |
| 5. Policy-scope enforcement | **NOT met, and not discharged by this decision.** Priced (64+ hrs) but not enforced: `scope.tags` is enforced in zero retrieval paths and `KnowledgeSearchPort.search` carries no `PolicyScope`. **Neutral between topologies** — the obligation is ai-memory's own, owned by **ST-082** |
| 6. Remote-client control | **Met** — authenticated remote event ingestion with spooled replay, proven against a real enrolled node (findings §16, §19). Repo-state is **not** part of this criterion's wording; the story-board paraphrase that had widened it was corrected 2026-08-26, and repo-rescan is carried forward as a real capability gap (findings §19.2) rather than retired |
| 7. Reuse actually reduces complexity | **Answered NO** — findings §18 |

**Criteria 1–4 and 6 are met; criterion 5 is outstanding and neutral between topologies; criterion 7 is answered no. The gate is discharged and this ADR moves to Accepted**, recording the rejection of Candidate A and the direction in §1. Full evidence: [`docs/investigations/ST-084-awcp-host-spike-findings.md`](../../investigations/ST-084-awcp-host-spike-findings.md) §17–§19.

---

> **§2–§4 survive the host decision, but they stop being ai-memory's to own (recorded 2026-08-26).** Topology, storage layout and source-lineage placement are **AWCP-internal** design decisions. They were recorded here because AWCP was expected to live here; under §1 it will not. Their **decisions** remain in force and unchanged — nothing in the host decision invalidates them — **but "in force" does not mean "already swept"**: §2's Phase-2 *gate-relevance* paragraph still stated criterion 6 undischarged after §1's final table recorded it met, and §3's heading still called the storage layout open after ADR-017 §5 settled it. Both carry dated markers. Read each of §2–§4's *status* claims against §1's final gate table and against any ADR that has since answered them, which govern. But once the standalone codebase exists they belong in an **AWCP-owned ADR**, and this ADR's §2–§4 become the historical source for it. Not actioned here; noted as an implication for whoever plans the extraction (findings §18.7). Read "the host" in §2–§4 as "the AWCP service", not "ai-memory".

### 2. Process topology: single central deployment, hub-and-client

One central deployment owns all authoritative state and is where the operator reviews activity. Remote agents are supervised through a **hub-and-client** model: the Ubuntu/Z2 server runs a **lightweight authenticated client/collector** — it reports Claude sessions, repository state, and checkpoints to the hub, spools events locally when disconnected, and replays them on reconnect. It holds no authoritative workflow state and is **not a second authoritative AWCP deployment**.

The alternative (two authoritative work/personal deployments) was considered and rejected for now: it would require an explicit invariant (single codebase + versioned event/API contracts + one release train) to avoid re-opening the three-systems problem via version drift (carried forward from the rev-1.4 candidate (a)). The hub-and-client split gets remote coverage without that risk, because clients are stateless-by-design apart from their spool. Revisit only if a genuine authoritative work/personal split becomes necessary.

**Node admission and its known limits (ST-088 Phase 2 — recorded here 2026-08-11 so the topology decision carries its own security constraints rather than leaving them in a module docblock):**

Because a client holds no authoritative state, the hub's `workflow.execution_nodes` table is the *only* record anywhere of which machines are legitimate. There is no peer copy to reconcile against, so that table's write path is the entire admission boundary — a sharper consequence of "not a second authoritative deployment" than it first appears, and worth stating where the topology is decided.

The credential is split so that no secret is ever held twice:

| Party | Holds | Kind |
|---|---|---|
| Client (Z2) | its own bearer, generated locally (`openssl rand -hex 32`) | the secret |
| Hub | `AWCP_NODE_ENROLMENT_SECRET` | the authority to admit |
| Hub | `execution_nodes.bearer_token_hash` | a verifier — SHA-256 only |

A client's **first** registration must also present the enrolment secret; every later one needs only the bearer, so a rebooting client keeps its own credential and nothing else. This is the ssh-key split, and it is also why the hub must never mint or return a bearer: doing so would put the secret on the wire and in two places at once.

**What this model does NOT provide, and what would need to change before it should be relied on at more than one node:**

- **Enrolment is a capability, not an allowlist.** Anyone holding the enrolment secret may enrol any number of clients under any hostname. The hub does not decide *which* machines may join; it admits whoever presents the secret. Per-machine admission needs a separate operator-seeded set of authorised digests — a design deliberately not built at one node.
- **The enrolment secret does not expire.** Comparable systems (GitHub Actions self-hosted runners) issue short-lived registration tokens. This one is static until an operator rotates it.
- **There is no revocation.** The secret is shared and static, and `execution_nodes.status` has no `revoked` value; deleting a client's row lets the same secret re-enrol it. Decommissioning a machine therefore means rotating the secret for every machine.
- **Unset means closed.** An absent `AWCP_NODE_ENROLMENT_SECRET` refuses all enrolment. The secret is read per request and never at startup, so an optional module can never prevent the host from booting — but the failure is quiet: a hub missing the variable answers 401 to every registration, indistinguishable from a wrong bearer. It must therefore be declared in `.env.example` and named explicitly in `docker-compose.yml`, which enumerates the container's environment.

These limits are proportionate to one client and become material at several, or as soon as a machine must be decommissioned and *stay* out. Revisit alongside any change that raises client count — the same trigger that would make a message broker worth its operational cost, and for the same reason: both are fan-out properties, not one-node properties.

**Gate relevance, stated conservatively.** ST-088 Phase 2 delivers the hub half of criterion 6 (§1) — authenticated remote event ingestion, with idempotent at-least-once delivery keyed on `UNIQUE(node_id, client_seq)` and acknowledgement re-derived by read-back so a replayed batch is absorbed and still fully acknowledged. **Criterion 6 is not discharged**: it also requires spooled replay from a real client, which is Phase 3. Nothing here moves this ADR's status. *(Historical as of 2026-08-26 — this paragraph records Phase 2's conservative position. **Criterion 6 is now met**: Phase 3 delivered spooled replay against a real enrolled node, and §1's final gate-progress table records it. Read this paragraph as the Phase 2 record, not as current status.)*

### 3. Storage layout: open — a module-design decision, not a host decision

> **Answered 2026-08-24 — this section's heading records the question, not the current status.** The module-design pass this section deferred to has happened: [ADR-017](ADR-017-awcp-work-item-contract.md) §5 settles the layout as **the existing `workflow` schema**, explicitly as the revisit this section invited rather than as a first migration author resolving it silently. What remains unplanned is the **extraction** of that settled schema into the standalone peer service (§1), which is a relocation question, not a layout one. Read the paragraph below as the record of the open question; read ADR-017 §5 for the answer. The shared-runtime trade-offs that follow it are unaffected — they informed the answer and still describe the co-tenancy this ADR's §1 now ends.

Whether AWCP's operational tables (packets, runs, checkpoints, approvals) live in the same schema as ai-memory's memory tables, or a logically separate schema/tables in the same Postgres instance, is **explicitly deferred** to whoever designs the operational-state schema and module boundaries (evaluation doc §9 step 3, items 2–3). This is not an oversight: it is waiting on a concrete design pass, not a further PO decision round. A future reader should not read this silence as "undecided by omission" — it is decided to be decided later, at module-design time.

**Shared-runtime trade-offs the spike surfaced (ST-084 §6.2, §6.3 — recorded here 2026-08-03 so they inform the layout decision rather than sitting only in the findings doc):**

- **A Postgres schema is namespacing, not access control.** `CREATE SCHEMA workflow` buys clean teardown and a real migration boundary. It does **not** buy isolation — the single `ai_memory` role reads and writes both schemas freely. Genuine enforcement needs a second role plus `REVOKE`. Nothing in Stage 1 depends on the stronger claim, and the layout decision must not assume it.
- **Migration failure in the shared chain is fatal to the whole server** (`migrate.ts` calls `Deno.exit(1)`, awaited before `Deno.serve`). The spike avoided that tax by keeping workflow DDL out of the shared chain, with its own ordered runner and checksummed ledger inside the workflow schema. **But co-tenancy still costs a shared blast radius**: ST-086 wired the module into the composition root with a deliberate fail-startup policy, so a failed workflow migration under `FEATURE_WORKFLOW=true` now stops the memory MCP from opening its port. The module still never exits on its own — it reports an outcome and the composition root decides — which is the property worth preserving, but "separate schema" does not mean "separate failure domain" for a shared process.
- **Registering MCP tools costs two out-of-module edits** — the hand-maintained `toolNames` array in `server/index.ts` and a compat test that regex-scans that one file and asserts a two-way match against `tools/list`. Stage 1 avoided this by registering no tools; a production workflow surface would pay it.

None of these blocks the host decision. All three belong in the trade-off ledger a future reader weighs against Candidate C.

**Revisited 2026-08-24 — this deferral is now discharged, on this section's own terms.** The layout was settled at module-design time: the existing `workflow` schema, with WorkItem as the packet's parent in one aggregate and no second schema introduced. The reasons and the rejected alternative are in [ADR-017](ADR-017-awcp-work-item-contract.md) §5; the record of the revisit is Revision History 1.4. The heading's *"open"* wording is left as written, as the record of the state this section was in when the deferral was made.

### 4. Source-of-truth placement: build local source-lineage tracking

The AWCP host will provide Confluence/Jira/ADO source-lineage tracking — identity, version, content hash, scrape time — based on the Prism registry mechanism the ground-truth inventory validated in production (350 pages, SHA-256 hashing, staleness queries). Two constraints on how:

- **Extract before rebuild.** Prefer **extracting, migrating, or wrapping Prism's proven registry and drift-detection mechanisms** (the PowerShell/Node harnesses and their data shapes) over rebuilding them from their pattern. Rebuild-from-pattern is the fallback if extraction proves impractical, and that finding must be recorded, not assumed.
- **Honest scope for hash-only lineage.** Hashes and version metadata answer *"has this changed since we scoped the packet?"* — **change detection**. They cannot answer *"what did this page say when the packet was scoped?"* To support point-in-time citation, the tracker must either (a) retain the relevant **immutable content excerpts** at scoping time, or (b) reliably retrieve the historical upstream version (e.g. Confluence page-version API) on demand; otherwise the promise is **narrowed to change detection** and FR-VER-009 staleness marking, and point-in-time reconstruction is explicitly out of scope. Which of (a)/(b)/narrowed applies is decided in the same module-design pass as §3 — with the R11 no-page-bodies philosophy weighed against (a) rather than assumed to permit it.

## Consequences

**Of the 2026-08-26 acceptance (§1):**

- **ADR-013 must be re-opened, and one of its statements is now false.** Its §4(b) reasons from *"the host decision places AWCP in the same codebase as the Storyboard it replaces"* — that premise is reversed. The product register's Workflow/Operations row and the "AWCP host/topology decision" revisit trigger both need updating. See ADR-013 revision 1.3.
- **The peer-service topology is unscored, and scoring it is the named next step** — against the same six criteria A, B and C received (findings §18.9). Filed as **ST-100**, not an ST-088 extension.
- **ST-082 does not disappear; its framing changes.** From "a co-tenancy tax AWCP forces" to "an ai-memory product-security item on its own merits, unconnected to AWCP." Its urgency and scope should be reassessed on that basis rather than inherited as an ADR-016 side effect.
- **The B–D milestone is ~~half-unblocked — do not generate it yet~~ fully unblocked as of 2026-08-27.** `awcp-strategy-baseline-2026-08.md` decisions 1 and 3 gate it on two things, not one: the host decision being taken, **and** ST-088 closing. This decision discharges the first, so *"nothing is planned on the wrong side of the host decision"* is satisfied. ~~The second is outstanding — **ST-088 is in Review, not Done** — and the baseline's own "What is blocked" section says so. No further decision is owed; only that transition.~~ **That transition happened**: ST-088 moved Review → Done on 2026-08-27 when this ADR's own sign-off PR ([#60](https://github.com/CAPeddle/ai-memory/pull/60)) merged as `86473ac`. Both conditions are now met and `/gsd-new-milestone` may generate B–D. *(The struck text is retained rather than deleted: it was the correct instruction on the day this revision was written, and it is what the rev 1.5 revision row points at as governing. What made it stale was the transition it itself named as the only thing owed — so it is superseded by its own success, not corrected for error.)* **The constraint that survives, and that B–D must carry**: it must **not** assume ST-100's scoring outcome, because part (b) of §1 is a direction, not a scored selection.
- **Nothing moves in the tree.** No file, module, schema or runtime behaviour changes under this ADR. Extraction is sketched (findings §18.8) and unscheduled; `FEATURE_WORKFLOW`, the shared-schema wiring and the workflow-boundary test all stay until an extraction plan retires them.

**Carried forward from the original 2026-07-29 record:**

- ADR-013 §2 (product register) and §4(b) (Storyboard disposition) updated to reference this decision (see ADR-013 revision 1.2).
- Storyboard (SRS §5.6) is confirmed superseded by the WorkPacket model (AWCP §8 Q4) — retirement sequenced with the WorkPacket model's arrival, not before. *(Unaffected by the 2026-08-26 reversal: supersession was a product-model decision, not a co-location one — but the WorkPacket model now arrives in a different codebase, so the retirement sequencing follows the extraction rather than this repo's roadmap.)*
- `awcp-spec-evaluation.md` §7's "no host lean expressed" framing is superseded — a **preferred hypothesis with an explicit acceptance gate** was put on record. *(That hypothesis was tested and rejected 2026-08-26; §7's host table is now the record of a decided question, and its "Preferred, conditionally: Candidate A" conclusion is superseded by §1 above.)*
- Storage layout remains a real open item for the eventual module-design pass; it must not be silently resolved by whoever writes the first migration without revisiting this ADR's §3. *(Discharged 2026-08-24 — the revisit happened before the first migration was written; see §3 and Revision History 1.4.)*
- **ST-084** (architecture spike) is the acceptance gate for §1; this ADR moves to Accepted only on a spike outcome of "accept" or "accept with changes" (with the changes recorded here). **Stage 1 reported 2026-08-03: criteria 1–4 met, 5–7 outstanding, verdict PROMISING WITH CONCERNS — supporting the hypothesis without discharging the gate.** ST-084 Stage 2 (criteria 5–7) is tracked as **ST-088**, and §1's acceptance pre-condition binds it: no acceptance on an unpriced policy-scope obligation.

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.5 | 2026-08-26 | **Status: Proposed/Conditional → Accepted. The gate is discharged and the host hypothesis is rejected.** ST-084 Stage 2 (ST-088) concluded: criteria 1–4 and 6 met, criterion 5 outstanding and **neutral between topologies**, criterion 7 answered **no** — the domain-specific memory engine went entirely unused and what was reused is generic infrastructure not ai-memory's to lend. §1 records a **two-part decision of unequal weight**: **(a) reject Candidate A**, settled on the spike's full evidence; **(b) direct a standalone AWCP peer service** consuming ai-memory as an optional context provider through an adapter derived from `ports.ts` — a **direction, not a scored selection**, and explicitly **not Candidate C**, whose defining donor-retirement condition it does not meet. §1 gains the PO's **interface-replaceability requirement**: capability providers are named by what AWCP needs from them, the port interface is the contract, the wire protocol (in-process / MCP / A2A) is an adapter detail, and the scope-blind read side must not be frozen as the contract. §1 also records a tenancy ground the spike did not produce — AWCP coordinates household, development and trading-R&D work, all of which would otherwise live inside a memory product's schema and role — and the standing PO direction that **effort is not an input** to architecture evaluation. The July candidate table, the seven criteria, the spike-outcome bar and the Stage 1 gate progress are **retained as written**; the bar on schema/migration work is discharged and the migration-`005` override is noted moot. §2–§4's **decisions** remain in force, but are marked as **AWCP-internal decisions that belong in an AWCP-owned ADR** once that codebase exists, and their *status* claims carry dated markers where later work overtook them — §2's gate-relevance paragraph (criterion 6 since met) and §3's "open" heading (layout since settled by ADR-017 §5). Consequences record ADR-013's re-open (its §4(b) premise is now false), ST-082's reframing, that the B–D milestone is **half-unblocked — this decision discharges the host condition, and ST-088 moving Review → Done is the second, still outstanding** (see the Consequences bullet, which governs), and that **nothing moves in the tree**. Evidence: findings §17–§19 |
| 1.4 | 2026-08-24 | **Two distinct acts, recorded together. Status unchanged — still Proposed/Conditional.** **(a) A narrow PO override of §1**, granted 2026-08-24, of its bar *"Until the spike concludes, this ADR stays Proposed and no schema or migration work may assume the host"* — scoped to **migration `005` (`005_work_items.sql`) and nothing else**. **Migration `005` is therefore permitted to proceed under this override.** It is recorded as an **override, not as compliance**: §1's bar is not lifted generally; it is **not** evidence that ST-088 (ST-084 Stage 2, criteria 5–7) has discharged the host decision, and §1's acceptance pre-condition on the policy-scope enforcement surface stands unchanged; and it sets **no precedent** — every later AWCP migration returns for its own explicit decision, which the PO treats as desirable pressure rather than bureaucracy. **(b) The §3 storage-layout revisit** that `awcp-spec-evaluation.md:177` requires so the layout is not *"silently resolved by the first migration author"*: settled at module-design time — WorkItem, observed sessions and the session↔WorkItem association live in the **existing `workflow` schema**, WorkItem is the parent of WorkPacket in one aggregate, and **no second schema is introduced**. Reasons and the rejected alternative are in [ADR-017](ADR-017-awcp-work-item-contract.md) §5, whose forward reference to this entry this row answers; restating them here would duplicate them. §3 is a module-design decision and not a host decision, so it neither lifts nor weakens §1 — it commits to nothing about *where* the `workflow` schema lives. §2 and §4 unchanged |
| 1.3 | 2026-08-11 | ST-088 Phase 2 (hub half of the remote-node surface). **Status unchanged — still Proposed/Conditional.** §2 gains the node-admission model and its limits: the credential split (client holds the bearer, hub holds only a digest plus the enrolment secret), and the four constraints that follow — enrolment is a capability rather than an allowlist, the secret does not expire, there is no revocation, and unset means closed with a quiet failure mode. Recorded in §2 rather than left in a module docblock because "clients hold no authoritative state" makes `execution_nodes` the sole record of legitimacy, which is a topology consequence. Criterion 6 explicitly **not** discharged — the hub half exists; spooled replay from a real client is Phase 3. §1, §3, §4 unchanged |
| 1.0 | 2026-07-29 | Initial — recorded host (Candidate A), topology (single deployment), storage (deferred), source-lineage placement as decided; status Accepted |
| 1.2 | 2026-08-03 | ST-084 Stage 1 review (PO). **Status unchanged — still Proposed/Conditional; the gate is not discharged.** §1 records gate progress (criteria 1–4 met, 5–7 outstanding, verdict PROMISING WITH CONCERNS) and gains an **acceptance pre-condition**: the policy-scope enforcement surface must be priced before Candidate A may be accepted, because it is a cost Candidate A carries and Candidate C does not (findings §6.1 — `scope.tags` enforced in zero retrieval paths). §1's Candidate A code-maturity row narrowed to the *infrastructural* reuse the spike actually observed; the memory-engine reuse it previously claimed was found unnecessary and went unused. §3 gains the shared-runtime trade-offs (schema ≠ access control; shared blast radius, restored deliberately by ST-086's fail-startup wiring; MCP registration cost). §2 and §4 unchanged — Stage 1 produced no evidence bearing on either |
| 1.1 | 2026-07-29 | Governance round (PR #31): status corrected to Proposed/Conditional — host is a preferred hypothesis gated on the ST-084 spike; topology restated as hub-and-client (central hub + lightweight remote collector, no second authoritative deployment); sandboxed-write "approved" claim removed (execution-time approval required, nothing pre-approved); §4 revised — extract/wrap Prism mechanisms before rebuild, hash-only lineage honest-scoped to change detection unless excerpts or historical retrieval are added |
