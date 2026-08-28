---
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-plan-bootstrap
execution: code
story: ST-103
title: "AWCP Standalone Service Requirements - Plan"
type: chore
date: "2026-08-28"
---

# AWCP Standalone Service Requirements - Plan

## Goal Capsule

**Objective:** the requirements for the standalone AWCP service are stated, traceable, and usable by whoever plans its build — with each one marked as holding whatever ST-100 returns, or as depending on that answer.

**Means:** state requirements against capabilities and contracts rather than against a topology, using the contract-first, storage-disposable rule as the invariance mechanism (Key Decision KD3).

**Authority hierarchy.** [ADR-016](../design/adr/ADR-016-awcp-consolidation-host-topology.md) §1 governs the host question. [ADR-017](../design/adr/ADR-017-awcp-work-item-contract.md) governs the Work Item contract. [CONCEPTS.md](../../CONCEPTS.md) is the vocabulary of record and this document uses its terms rather than synonyms. [`docs/investigations/awcp-strategy-baseline-2026-08.md`](../investigations/awcp-strategy-baseline-2026-08.md) supplies the six standing decisions. [CLAUDE.md](../../CLAUDE.md) governs conventions.

**Readiness.** This artifact is `requirements-only` because a blocking architecture question is open: ST-100 has not scored the peer-service topology, and ADR-016 §1(b) is a direction rather than a scored selection. Sections marked `[ST-100]` state a requirement shape and name that dependency; everything else is marked `[INV]` and holds whatever the verdict is.

**Stop conditions:**

1. Stop if a requirement here is read as scoring the topology. ST-100 owns that and must stay able to return CONTRADICT.
2. Stop if this document is used to authorise extraction. ADR-016 §1 says nothing moves under it; nothing moves under this either.
3. Stop if a day-count appears. Effort is not an input to this work.
4. Stop if a capability is named by the product currently supplying it (KD4).
5. Stop if an external write is treated as available. The write half of the integration auth question is unproven and no write is pre-approved.

---

## Product Contract

### Summary

AWCP is a local-first, single-user control plane over coding agents. It models Work Items, Work Packets, Agent Runs and Checkpoints; ingests agent lifecycle events; assembles bounded context; gates Work Packet completion on Evidence Items through the Completion Gate; gates every external issue-tracker write behind an approval ledger; and projects resolved Operational Decisions outward through Promotion.

ADR-016 §1(a) rejected co-tenancy inside ai-memory. That half is settled. §1(b) then directs a standalone peer service with its own codebase and runtime, and labels itself a direction rather than a scored selection — so the shape of the deployable unit is not settled, only its exclusion from ai-memory is. This document states what the service must do. It states no implementation units, because two inputs are open: the topology is unscored (ST-100) and the read-side scope gap is unbuilt (ST-082).

The requirements are drawn from three sources: the existing `server/src/workflow/` implementation, which ADR-016 designates an extraction donor that is stable and supported in place; the repository's own recorded incidents under `docs/solutions/`; and the settled decisions listed below. Several requirements exist because the donor's current behaviour is a recorded defect rather than a pattern to carry.

### Problem Frame

AWCP's operational domain proved cleanly separable from ai-memory's: it functions with the Memory Domain absent, degraded or unreachable, and the memory engine went entirely unused. What co-tenancy cost was a shared failure blast radius, a shared Postgres role with no access-control isolation, and coupling flagged as harmful to extend. Independently, AWCP coordinates work across three domains — Household, Dev projects, Trading R&D — whose operational state should not live inside a memory product's schema and role.

The requirements have nowhere to live today. They are distributed across an ADR's prose, a strategy baseline's decision list, a capability ladder, a glossary, and the donor implementation's docblocks. A build planned from that spread would re-derive them unevenly and would inherit the donor's known defects silently, because none of those defects fails a current test.

### Key Decisions

Product-level choices constraining the requirements below. Each is settled; none is taken here.

- KD1. Candidate A is rejected — AWCP does not live inside ai-memory. *ADR-016 §1(a), settled on the full spike evidence. The service's own codebase and runtime come from §1(b), which is unscored — see KD2.* Governs R1, R21.
- KD2. The peer-service topology is a direction, not a scored selection. *ADR-016 §1(b); ST-100 owns the scoring and may return CONTRADICT.* Governs R54, R55, R56.
- KD3. Contract-first, storage-disposable — packet, checkpoint and event contracts are versioned and durable; storage carries no migration promise until placement settles. Governs R7, R8.
- KD4. Capability providers are replaceable slots, named by what AWCP needs from them rather than by the product supplying them. The port interface is the contract; the wire protocol stays open. Governs R9, R10, R11, R63.
- KD5. Manual is a feature, not a gap — each capability's manual path is retained permanently as the degraded mode, which is also the integration-outage fallback. Governs R13, R52.
- KD6. The web UI is the primary interaction surface, superseding the capability ladder's deferral of it, as to primacy only. Horizon order is unchanged. Governs R35, R59.
- KD7. AWCP holds no model surface of its own for comprehension work; decomposition is performed by the coding agents as tasks, with AWCP storing structured results. Governs R60.
- KD8. This artifact stays at requirements altitude and states no implementation units. *(session-settled: user-directed — chosen over implementation-ready and over narrowing to the first horizon group: ADR-016 §1 bars extraction and ST-100 has not scored the topology, so build-ready units would plan work no governance gate has cleared.)* Constrains the artifact's shape rather than any individual requirement.
- KD9. The donor implementation (`server/src/workflow/`) is a source of recorded defects to require against, never a justification for a requirement's soundness. A requirement here stands on its own architectural merit for AWCP as a new, standalone service — that the donor code, its comments, or CONCEPTS.md already say something the same way is not evidence a requirement is correct, only that ai-memory chose it that way. Constrains how every requirement in this document is justified, not any individual R#.

### Actors

- A1. Operator — the single human supervising the work. Holds supervision authority: authoring verification contracts, adjudicating Operational Decisions, accepting Evidence Items, binding Work Packets to Work Items, claiming observed sessions, and approving external writes.
- A2. Agent — a coding agent working under supervision. Reports, proposes, and reads; never adjudicates.
- A3. Execution node — a machine hosting agent work, holding an identity it can prove and a Spool of undelivered events.
- A4. Capability provider — an external service occupying one of the three slots: knowledge, agent routing, verification.

### Requirements

**Horizon mapping.** Event delivery carries Horizon B (provider-neutral session awareness); Evidence and verification carries Horizon C (continuity across machines and sessions); Attention and the operator surface carry Horizon D (attention-first working product). Domain and durable contracts, capability slots, policy scope and isolation, credentials, and operability are cross-horizon foundations that precede all three rather than belonging to one. Horizon A is the ST-088 milestone already delivered; horizons E through I are outside this document.

#### Domain and durable contracts

- R1. [INV] The service runs outside ai-memory's codebase, schema and database role. This is the half ADR-016 §1(a) settles; the shape of the deployable unit is R54.
- R2. [INV] The service implements the Work Item contract as [ADR-017](../design/adr/ADR-017-awcp-work-item-contract.md) defines it, without amendment. Its closed `source_system` set is amended at that ADR and never widened at a call site.
- R3. [INV] A Work Item carries no Policy Scope and no aggregate status, derived or stored. Both absences are settled decisions rather than unbuilt features.
- R4. [INV] A Work Packet is the only authority for its own Policy Scope, and reaches complete only through the Completion Gate.
- R5. [INV] The Completion Gate is a refusal that names the unmet required Verification Criteria, with no override, force, or skip path.
- R6. [INV] Attention is derived on demand by fixed rules and never stored, so it cannot drift from the state it describes.
- R7. [INV] Packet, Checkpoint and event contracts are versioned from the first increment and are the durable artefacts; storage carries no migration promise until placement settles.
- R8. [INV] No content whose truth can drift lives inside a checksummed migration file — no line-number citations, no counts, no status claims about other documents, no self-describing stamps with a shelf life. An applied migration's body cannot be corrected cheaply.

#### Capability slots

- R9. [INV] The service consumes three capability slots — knowledge, agent routing, verification — through contracts that survive the provider behind them being replaced.
- R10. [INV] No provider is assumed singular or permanent. ai-memory occupies the knowledge slot; it does not define it.
- R11. [INV] The wire protocol for each slot is an adapter concern and is not selected by these requirements.
- R63. [INV] The agent-routing slot names its verbs, and each carries its evidence status: session observation is confirmed; turn dispatch is unresolved, its only measured pass withdrawn by its own authors; in-flight steering and interruption are measured-negative and excluded from the slot until re-measured. Naming a verb is not selecting its wire form (R11), and R15's per-verb obligations quantify over this set rather than over an unnamed one. *(session-settled: user-directed — external review asked for a seven-verb taxonomy; two of those verbs are measured-negative and one is unresolved, so the set is stated with its evidence rather than adopted whole.)*
- R12. [INV] The knowledge slot is advisory: it may fail or return nothing, and never gates an operational write.
- R13. [INV] With any slot's provider absent, core operational adjudication and completion remain available in an observable degraded mode — proven by a no-op provider passing the full core suite for every slot.
- R14. [INV] Promotion is optional, one-way and non-authoritative, resolves to four outcomes rather than success or failure, and carries the Operational Decision's own identity as the idempotency key so repeated attempts yield at most one projection.
- R15. [INV] A provider contract distinguishes accepted from delivered per verb, and authoritative from observed per state read, with an observability obligation on each. A capability an adapter cannot verify it performed is not a capability.
- R16. [INV] A bounded wait on a provider bounds the caller, not the work, so an elapsed wait resolves as indeterminate rather than as failure. A provider must opt in to declaring that nothing was committed.

- R60. [INV] The service holds no model or comprehension surface of its own. Decomposition and comprehension work are issued to coding agents as tasks, and the service stores only their structured results.

#### Policy scope and isolation

- R17. [INV] Policy Scope is threaded through the read side of every capability port, default-deny, with absence of scope meaning refusal rather than permission.
- R18. [INV] Default-deny covers model-provider routing as well as retrieval: content is never sent through a provider for a scope it was not granted.
- R19. [INV] Anything derived from a Work Packet carries that Packet's real Policy Scope; where the governing Packet cannot be read, the derived operation is refused rather than proceeding on a default.
- R61. [INV] Content arriving on the node lane carries a Policy Scope from the moment it is stored, taken from the scope its execution node declared at enrolment. Nothing is stored unscoped.
- R20. [INV] Every read is authorised per object. An authenticated caller sees only the Work Items and Work Packets it is party to.
- R21. [INV] AWCP and any co-located service hold separate database roles, so sharing one instance for operational convenience does not become a shared trust boundary. A schema is namespacing, not access control.
- R22. [INV] The single-chokepoint benefit of the adapter boundary is prospective, not banked: collapsing many enforcement points to one helps only if the one enforces.

#### Credentials and the supervision boundary

- R23. [INV] Three credential classes — operator, agent, node — are non-interchangeable, and no class may authenticate another's surface in either direction.
- R24. [INV] Every domain action carries an explicit, enumerated supervision classification, and an unclassified action is refused. The classification is derived from the real surface of each inbound transport rather than from a hand-kept parallel list, and this holds for every surface the service exposes, not only the HTTP route lane.
- R25. [INV] The supervision boundary is a property of the service contract. No requirement is discharged by a client omitting a verb.
- R26. [INV] Each credential class — operator, agent and node — names the artifact holding its provisioned set and the operation that writes to it. A first registration additionally carries an operator enrolment secret; later registrations need only the node's own credential.
- R27. [INV] An unset enrolment secret means enrolment is closed, and the service still starts. An optional capability is never the reason a service fails to boot. The operator-facing side records that a registration was refused for want of a configured secret, while the client-facing refusal stays indistinguishable per R28.
- R28. [INV] Validating a credential's format is not authorising it. A well-formed credential that no issuing authority ever minted is refused, and refusals do not reveal which credentials the service knows.
- R58. [INV] Every credential class supports withdrawal. A withdrawn credential is refused on its next use without rotating any other principal's credential, and a withdrawn node cannot re-enrol on the strength of the enrolment secret alone.
- R62. [INV] The service admits only execution nodes whose identity an operator seeded in advance. Holding the enrolment secret is not by itself grounds for admission.
- R29. [INV] Every event records who reported it in which capacity, and the service verifies that the proved identity owns the node a batch names.

#### Agent-surface parity

- R30. [INV] Any question an agent raises through the contract has its adjudication retrievable through the same contract, without human relay.
- R31. [INV] Everything the primary human surface renders for a Work Item or Work Packet is reachable by an agent credential for the same subject. This is parity of reachability, not of permission.
- R32. [INV] An agent submits an Evidence Item and proposes Verification Criteria; only the operator accepts Evidence an agent submitted against a Criterion, and only the operator adopts the verification contract. Depositing a result is not judging it. R64 carves the one exception, and it is not an agent-facing one.
- R33. [INV] Agent-authored judgement enters as a proposal awaiting operator disposition, distinguishable by provenance from service-derived fact, never as accepted state.
- R34. [INV] Every external issue-tracker write passes a draft, preview, approve, execute ledger. The approval is permanently manual, non-delegable and non-replayable, and no agent may carry an instruction not to re-ask. An approval binds to the exact previewed payload: any change between preview and execution voids it and returns the item to draft.
- R35. [INV] The human interface is a client of the same contract as every other caller: no interface-only endpoint and no interface-only computation.

- R59. [INV] A web interface is the primary operator surface. Other surfaces follow it rather than substituting for it, and none of them is the only route to a capability.

#### Event delivery

- R36. [INV] The Spool is bounded and evicts after appending, so the newest event is never the one dropped, and each drop is counted and announced rather than lost. Eviction consumes coalescible entries first — those a later entry of the same type supersedes — and reaches a non-coalescible entry only when no coalescible one remains. Whether a type is coalescible is declared with the type, so the classification cannot drift from the events it governs. *(session-settled: user-directed — plain oldest-first eviction contradicted this document's own AE16 and AE17, which make heartbeats coalescible by design while F5 puts them on a fixed cadence, so the highest-volume class would survive at the expense of every causally significant one.)*
- R37. [INV] An entry leaves the Spool only when the far side names it and it was in the batch just sent. A response that cannot be verified to name an entry is not a confirmation of it.
- R38. [INV] An acknowledgement is derived by reading back what is stored, so a replayed batch is acknowledged in full and the sender can finally clear it.
- R39. [INV] Every delivery response maps to exactly one dispatch, and the fall-through case is failure. A Terminal Outcome stops the retry loop, leaves the Spool intact, and is never reported as success; a deferred outcome is retried under a bounded budget counting consecutive non-progress attempts.
- R40. [INV] Ingestion is idempotent: a replayed event neither duplicates state nor errors.
- R41. [INV] The delivery contract above is stated once and applied to any remote lane, not treated as a peculiarity of the node lane.

#### Evidence and verification

- R42. [INV] An Evidence Item records the base commit it was verified against, a content identifier distinguishing pre-commit state from that commit when the check ran before one existed, its Verified Surface as paths, and its verifier's identity — so freshness is computed rather than asserted, and evidence produced before a commit exists remains replayable and fresh-checkable. Evidence that cannot name its surface in paths is evidence whose expiry cannot be detected.
- R64. [INV] Evidence the service itself retrieved from the verification slot is accepted against an already-adopted Criterion without operator disposition, because the service authenticated the source rather than trusting a report of it. R44's validity criteria still gate acceptance, and adopting the verification contract remains operator-only under R32. This is a distinction of provenance, not of trust level: the same result relayed through an Agent Run's report stays a claim under R45, so the exception cannot be reached by an agent presenting itself as a verifier. *(session-settled: user-directed — external review showed operator-only acceptance turns deterministic verification into a manual queue; the retrieval path was chosen over an inbound verifier credential, which would have reopened R23's closed class set.)*
- R43. [INV] Expiry means unobserved, not false, and has two modes that are reported distinctly: the surface moved, so the result no longer describes it; and the surface grew, so the result still holds but under-covers.
- R44. [INV] An Evidence Item is accepted only where the check that produced it inspected something, discriminated between compliant and non-compliant states, and did not fail for a reason other than the one it exists to detect. A green result is not evidence until those hold.
- R45. [INV] An Agent Run's own report is a claim rather than evidence. The service distinguishes an agent having produced output from an agent having done the work, and output from a lane that answered something other than what was asked never satisfies a Verification Criterion.
- R46. [INV] The context package assembled for an Agent Run is durable, addressable and replayable, attached to that Run, so what the agent was given remains answerable afterwards.
- R47. [INV] Once-and-final adjudication is uniform across Operational Decision resolution and Agent Run closure: a repeat of the same answer returns the stored record with its original timestamp intact, and a different answer is refused as a conflict naming the stored one.

#### Operability

- R48. [INV] The service emits structured logs carrying no Policy-Scoped content and no credential material; a log field derived from a scoped object is limited to identifiers. The donor module emits none, so this is specified rather than inherited.
- R49. [INV] An Agent Run declares which signal classes are available for it, so absence of signal is never read as absence of problem.
- R50. [INV] A destructive test establishes a property of the database it is connected to, stored where the destructive operation cannot reach it, and fails closed by throwing rather than skipping.
- R51. [INV] Every artifact the documentation names as runnable sits inside the enforced build and CI path.
- R52. [INV] The completion and adjudication loop runs with every capability provider unreachable. Nothing on that path calls a provider.
- R53. [INV] Facts derived on the machine where work happened — repository, branch, commit — are recorded as reported facts and never re-derived by the service, which has no working tree.

#### Runtime and boundary

- R54. [ST-100] The service runs as its own deployable unit with its own persistence, in the shape the scored topology settles. What is not open: it is not inside ai-memory's codebase, schema or role (R1, KD1).
- R55. [ST-100] The knowledge adapter derives from the existing port boundary; which wire form is built first may turn on the scoring outcome (R11).
- R56. [ST-100] ai-memory is not retired and remains a supported optional provider. This is explicitly not Candidate C, whose defining condition is donor retirement.
- R57. [INV] Load and concurrency characteristics for the service standalone are unmeasured. ST-100 re-declares this gap rather than resolving it, so it carries forward as infrastructure-sizing work whatever the verdict.

### Key Flows

- F1. Supervised delivery loop
  - **Trigger:** the operator opens a Work Packet.
  - **Actors:** A1, A2
  - **Steps:** operator states the Packet's Policy Scope explicitly; operator authors the Verification Criteria; agent registers an Agent Run and narrates Checkpoints; agent may raise an Operational Decision; operator adjudicates and accepts Evidence; the Completion Gate evaluates.
  - **Outcome:** the Packet completes through the Gate or the request is refused naming what is unmet.
  - **Covered by:** R4, R5, R24, R32, R47

- F2. Resolve, then Promote
  - **Trigger:** the operator answers an open Operational Decision.
  - **Actors:** A1, A4
  - **Steps:** the resolution commits alone and is authoritative at that point; the governing Policy Scope is read from the Work Packet; Promotion is attempted outside the operational transaction, bounded in time, carrying the Decision's identity; the attempt resolves to one of four outcomes; recording a returned reference is a separate write whose failure is reported as reference-lost, never as promotion failure.
  - **Outcome:** the Decision is resolved and authoritative in all four cases, and only one of the four is safe to simply repeat.
  - **Covered by:** R14, R16, R19, R52

- F3. Node enrolment
  - **Trigger:** an execution node must speak to the service for the first time.
  - **Actors:** A1, A3
  - **Steps:** the operator provisions the node credential out of band and holds an enrolment secret; the first registration presents both; later registrations present only the node credential; a platform credential is refused as a node credential and the reverse; no response returns a raw credential.
  - **Outcome:** the node holds a provable identity, or enrolment is closed because no secret is configured — with the service still running.
  - **Covered by:** R23, R26, R27, R28

- F4. Event delivery from a node
  - **Trigger:** a node produces an event.
  - **Actors:** A3
  - **Steps:** append to the Spool; evict past the bound, coalescible entries first, and count the drop; flush a bounded batch oldest-first; the service refuses malformed or oversized payloads naming the offenders, verifies node ownership, ingests idempotently, and acknowledges by reading back; the node removes only entries named and sent; the response maps to exactly one dispatch.
  - **Outcome:** every event is delivered, still queued, or counted as dropped — never merely absent.
  - **Covered by:** R29, R36, R37, R38, R39, R40

- F5. Observed session
  - **Trigger:** a coding session announces itself on the node lane.
  - **Actors:** A1, A3
  - **Steps:** typed start, heartbeats on a fixed cadence, typed close; the event type alone decides that an event is a session event; the record is a monotone function of the set of events observed, so arrival order does not change it; abandonment is derived from a heartbeat gap, never from an absent close; the operator may explicitly claim the session for a Work Item.
  - **Outcome:** an unclaimed session stays observed, which is a legitimate terminal state. A claimed session is still an observation — no Agent Run and no Work Packet comes into existence, and no Work Packet scope attaches to it; the session keeps the node-declared scope it was stored with (R61).
  - **Covered by:** R6, R24, R33

- F6. Work Item provenance and binding
  - **Trigger:** work is requested externally or raised natively.
  - **Actors:** A1, A2
  - **Steps:** the operator creates the Work Item with a provenance pair from the closed set, or records it as native; the Work Item carries no scope and no status; Work Packets are created independently, each stating its own scope; the operator binds a Packet to the Work Item.
  - **Outcome:** requested work is recorded with an outward reference that is never an authority.
  - **Covered by:** R2, R3, R4, R24

### Acceptance Examples

- AE1. **Covers R5, R47.** Given a Work Packet with two required Verification Criteria, one carrying an Evidence Item and one carrying none; When completion is requested; Then it is refused, the refusal names the unmet Criterion, and the Packet's status is unchanged.
- AE2. **Covers R5.** Given a Work Packet with an unresolved blocking Operational Decision and every required Criterion carrying Evidence; When completion is requested; Then the Packet completes and the Decision continues to raise Attention. Blocking drives notice; the Gate turns on Evidence alone.
- AE3. **Covers R5.** Given a required Criterion is added while completion is requested for the same Packet; Then exactly one of two results holds — completion observes the new Criterion and refuses, or the addition observes the completed Packet and is refused. A completed Packet holding an unmet required Criterion is never permitted.
- AE4. **Covers R47.** Given an Operational Decision resolved with one answer; When it is resolved again with the same answer; Then the stored record is returned unchanged with its original timestamp intact. When resolved with a different answer; Then it is refused as a conflict naming the stored answer.
- AE5. **Covers R14, R16.** Given the projection succeeded but recording its reference failed; Then the outcome is reference-lost and the reference is returned as the only handle on a projection the Decision does not know about. It is never reported as failure, because that invites a retry that duplicates the projection.
- AE6. **Covers R16.** Given the bounded wait elapsed with the request still in flight, or the provider rejected without declaring whether anything was committed; Then the outcome is unknown, and a projection may still come into existence after the caller gave up.
- AE7. **Covers R14.** Given a provider that explicitly declares nothing was committed; Then the outcome is failed, and this is the only outcome on which repeating the projection is safe.
- AE8. **Covers R19.** Given an Operational Decision under a Work Packet whose Policy Scope is restrictive; When it is promoted; Then the projection carries that Packet's real scope, and where the Packet cannot be read the promotion is refused rather than defaulting.
- AE9. **Covers R37.** Given a Spool holding five entries and a batch of all five sent; When the response names three of them; Then exactly those three are removed. Nothing is removed on send, on a retry, or on a response that cannot be verified to name entries.
- AE10. **Covers R37.** Given a Spool of many entries and a batch of the first few sent; When the response names an entry outside that batch; Then nothing is removed.
- AE11. **Covers R36.** Given a Spool at its bound holding both coalescible and non-coalescible entries; When a new event is produced; Then the event is appended, a superseded coalescible entry is evicted ahead of any non-coalescible one, the drop counter increases, and the drop is announced.
- AE23. **Covers R36.** Given a Spool at its bound holding only non-coalescible entries; When a new event is produced; Then the oldest is still evicted and the drop counted and announced. The bound holds unconditionally — no class is exempt from a bounded queue, and the ordering rule buys precedence, not immunity.
- AE24. **Covers R64, R45.** Given a Criterion the operator already adopted and a result the service retrieved itself from the verification slot; Then it is accepted without operator disposition. Given the identical result presented instead through an Agent Run's report; Then it remains a claim and is refused as acceptance — the discriminator is who fetched it, not what it says.
- AE12. **Covers R38, R40.** Given a batch already ingested is sent again; Then no state is duplicated, no error is raised, and the acknowledgement still names every entry so the sender can clear them.
- AE13. **Covers R39.** Given a response that will fail identically next time; Then the retry loop stops, the Spool is left intact, the reason is named, and the result is not reported as success. A caller can distinguish a rejected credential from every other Terminal Outcome from the result alone.
- AE14. **Covers R39.** Given transient unreachability; Then the same batch is retried under a budget counting consecutive non-progress attempts, which any progress resets; on exhaustion the outcome is deferred with the Spool intact.
- AE15. **Covers R6.** Given a session whose last heartbeat is older than the abandonment threshold and which emitted no close; Then it reads as abandoned — because the abandonment case, a killed process, is exactly the one that never writes a close.
- AE16. **Covers R6.** Given a node that was disconnected and then delivers a backlog of heartbeats carrying their own instants; Then last-liveness advances and the session is no longer abandoned. Abandonment describes what is true now from what has been observed, never a permanent verdict.
- AE17. **Covers R6.** Given the same set of session events delivered in any order across any number of batches; Then the resulting record is identical, and a late heartbeat never reopens a closed session.
- AE18. **Covers R6.** Given a Work Packet with a Run recording a blocker whose activity is also past the staleness threshold; Then Attention returns both reasons. Reasons are additive and evaluated over the full Checkpoint history, never a truncated tail.
- AE19. **Covers R24, R28.** Given a well-formed credential that no issuing authority minted; When it is presented; Then it is refused, and the refusal is indistinguishable from that given to a wrong credential.
- AE20. **Covers R24.** Given a new write action added without a supervision classification; Then it is refused rather than reachable, and the omission is reported.
- AE21. **Covers R30, R32.** Given an agent raises a blocking Operational Decision and the operator resolves it; Then the agent observes the resolution through the same contract without human relay. Given the same agent submits an Evidence Item; Then the submission succeeds and the agent's attempt to accept it against a Criterion is refused.
- AE22. **Covers R13, R52.** Given every capability provider is absent, failing or hanging; Then every operational action still completes, and the completion and adjudication loop is unaffected.

### Success Criteria

- SC1. A build planner can derive the service's scope from this document without re-reading ADR-016, the strategy baseline and the capability ladder to reconstruct it.
- SC2. Each requirement is traceable to a source: a settled decision, a governing ADR, the glossary, or a recorded incident.
- SC3. Each ST-100 verdict has a stated disposition, and it takes effect on the ADR-016 revision the PO accepts rather than on the verdict alone: CONFIRM leaves both groups standing; QUALIFY re-opens the `[ST-100]` group for restatement against the qualified direction and triggers the `[INV]` re-audit; CONTRADICT invalidates the `[ST-100]` group and leaves the `[INV]` requirements standing.
- SC4. Every donor defect listed under Donor defects below has a requirement stating the corrected behaviour, rather than being inherited by silence.

### Donor defects

The closed list SC4 quantifies over. Each is a recorded defect in `server/src/workflow/`, not a hypothetical.

| Donor defect | Corrected by |
|---|---|
| Supervision classification defaults to permissive, so an unclassified write route is agent-reachable and nothing reports it | R24 |
| An agent can raise an Operational Decision but has no path to read its resolution | R30 |
| Evidence attachment is operator-only, so the agent that ran the check cannot hand over the artefact | R32, R64 |
| The module emits no logs of any kind | R48 |
| Enrolment is a capability rather than an allowlist — any number of nodes under any hostname | R62 |
| The enrolment secret does not expire and there is no revocation; decommissioning one machine means rotating for all | R58 |
| Reads carry no object-level authorisation — every authenticated caller sees every active Work Packet | R20 |
| Promotion's four-outcome contract is unproven against any real adapter | R14 |

### Scope Boundaries

**In scope:** stating requirements; marking each invariant or topology-dependent; naming the open dependencies and their owners.

**Deferred for later, with owners:**

- Topology scoring — ST-100.
- Policy Scope enforcement across retrieval paths — ST-082.
- The unauthenticated dashboard shell exposure on the donor — ST-102.
- Horizons E through I. Only B, C and D are within the first milestone group, and the later horizons' definitions are not reproduced here.
- The extraction-authorisation gate. A build may start only once a PO-accepted ADR-016 revision or successor clears extraction; ADR-016 §1 currently bars it. The owning story is not yet minted.

**Outside this document's identity:**

- Extraction, file moves, and standing up the new codebase. ADR-016 §1 states nothing moves under it, and the extraction roadmap in [`docs/investigations/ST-084-awcp-host-spike-findings.md`](../investigations/ST-084-awcp-host-spike-findings.md) §18.8 is headed *sketch only, not started* — an untested hypothesis, not a measurement.
- Editing ADR-016. ST-100 may propose a revision; none is proposed here.
- Selecting a wire protocol for any capability slot.
- Scoring agent routing or verification as products rather than as slots.
- Speculative capabilities demoted to future strategy by the fifth baseline decision: architecture-analysis integration, local-model capability routing, autoresearch loops, provider selection, autonomous continuation, and the detailed provider-normalization lifecycle. A later reader must not promote one of these into a requirement by citing silence here. Architecture analysis additionally cannot apply to ai-memory's existing `server/`, since the available tool analyses C++ and C# only; whether it could apply to the standalone service turns on a stack choice this document does not make.

### Risks and Dependencies

**Dependencies:**

- ST-100 — scores the topology. Blocking for the `[ST-100]` group.
- ST-082 — owns Policy Scope enforcement, which R17 and R18 depend on and which is neutral between topologies.
- ADR-017 — owns the Work Item contract that R2 binds.
- ST-096 — realigns the milestone structure onto the capability horizons.

**Risks:**

| Risk | Consequence | Treatment |
|---|---|---|
| This document is read as settling the topology | ST-100's verdict is prejudged, repeating an overclaim the spike findings already had to correct | The `[INV]`/`[ST-100]` split, stop condition 1, and R54 through R56 stated as shapes rather than answers |
| An `[INV]` requirement proves topology-dependent after ST-100 reports | Requirements assumed stable need revision | Each tag is a checkable claim. Re-audit the tagging when ST-100 reports and treat a mis-tag as a finding, not a footnote |
| A builder copies the donor rather than reading this document | The donor's recorded defects — the fail-open supervision default, the missing agent return path, the absent logging — are inherited silently, because none of them fails a current test | SC4 makes corrected behaviour a requirement in every such case; R24, R30 and R48 are the named instances |
| Promotion's four-outcome contract stays unproven | No retry can honestly be described as safe, and `indeterminate` becomes the common outcome across a network rather than the exceptional one it is in-process | R14 makes the Decision's identity the provider-side idempotency key a contract obligation rather than a comment; reconciling a reference-lost projection needs an operator surface of its own |
| Citations move underneath a later reader | Requirements rest on text that has changed | Every citation here is by section anchor or identifier, never by line number — the practice this repository adopted after a conditional decision's resolution invalidated citations across twenty-five files |
| The extraction sketch is treated as a measurement | Planning rests on an untested hypothesis | The sketch is cited only with its own *not started* heading attached, and extraction is named outside this document's identity |
| Storage-disposable meets byte-frozen migrations | A migration's body cannot be corrected cheaply once applied, so "disposable" holds for the schema but not for the migration files | R8 makes the discipline a day-one requirement rather than a lesson learned later; the donor already carries the cost of not having done this |

### Open Questions

- Q1. **Blocking.** Does ST-100 confirm, qualify or contradict the peer-service topology? Everything marked `[ST-100]` is provisional until it answers, and this question is why the artifact is `requirements-only`.
- Q2. **Deferred.** Is the agent surface scope-aware, or scope-blind with enforcement elsewhere? This changes the port contract rather than only its implementation.
- Q3. **Deferred.** For R32, is an agent's submission an Evidence Item awaiting assignment, or a proposed pairing of Evidence to a named Criterion? The choice determines whether an agent may name the Criterion it believes it satisfied.
- Q4. **Deferred.** May an agent see Work Packets other than its own? Today every authenticated caller sees every active Packet; under a control plane spanning three domains that default is unlikely to survive, and it interacts with Q2.
- Q5. **Deferred.** Is claiming an observed session for a Work Item one-to-one or many-to-many? The donor's uniqueness rule permits the same session to be claimed for several Work Items with no refusal, and offers no unclaim — so a mistaken claim is currently permanent.
- Q6. **Deferred.** Which repository holds the AWCP codebase, and does this document move with it? It is filed here because AWCP's governance record is here.
- Q7. **Deferred.** Does the write half of the integration auth question ever resolve positively? A denial re-examines the approval-ledger scope, not the host direction.
- Q8. **Open.** Should capability declaration and negotiation be an invariant in their own right — AWCP issuing only controls the adapter declares, distinguishing unsupported from accepted and delivered, and never silently emulating a missing capability? R63 names the agent-routing verbs and R15 covers accepted-versus-delivered, but neither states an unsupported outcome nor bars emulation. Raised by external review after R63 was settled; not folded into it.
- Q9. **Open.** Does R47's once-and-final adjudication admit supersession — an accepted Operational Decision or Agent Run closure staying immutable while an authorised operator records a new adjudication referencing the superseded one, with consumers following the active chain? Without it an erroneous closure cannot enter bounded rework except by violating R47. Raised by external review; unaddressed here.
- Q10. **Open.** Should durable domain events live in an outbox or event ledger with the Spool as a delivery index over them, rather than being held in the Spool itself? R36 now orders eviction so coalescible entries go first, which bounds the harm but does not preserve causal integrity under sustained backpressure. This is the stronger form of the same external-review finding R36 partially answers.

### Sources

- [ADR-016](../design/adr/ADR-016-awcp-consolidation-host-topology.md) §1 and §2 — §1 carries the two-part host decision, the interface requirement, the tenancy ground, criterion 5's non-discharge, and the extraction non-scoping; §2 records node admission and its known limits (enrolment as a capability rather than an allowlist, a non-expiring secret, and no revocation), which R58, R62 and three rows of the Donor defects table correct.
- [ADR-017](../design/adr/ADR-017-awcp-work-item-contract.md) — the Work Item contract, and rev 1.1's record that the host bar *inverted* rather than lifted: schema work must assume the standalone service but must not assume the topology's scoring outcome.
- [CONCEPTS.md](../../CONCEPTS.md) — Workflow Operations, Boundaries, Event Delivery, and Verification Practice. The vocabulary of record.
- [`docs/investigations/awcp-spec-evaluation.md`](../investigations/awcp-spec-evaluation.md) §1, §6.1, §7 — what AWCP is, the capability ladder and its two rules, and the six host criteria.
- [`docs/investigations/awcp-strategy-baseline-2026-08.md`](../investigations/awcp-strategy-baseline-2026-08.md) — the six standing decisions.
- [`docs/investigations/awcp-external-evidence-import-2026-08.md`](../investigations/awcp-external-evidence-import-2026-08.md) — the accepted-versus-delivered contract behind R15, and the exact scope of the agent-routing stop: in-flight injection and steering are measured-negative and stopped, while the synchronous-turn path is unresolved, its only pass withdrawn by its own authors. Neither "halted" nor "works" survives that document.
- [`docs/investigations/ST-084-awcp-host-spike-findings.md`](../investigations/ST-084-awcp-host-spike-findings.md) §18.3, §18.5, §18.6, §18.8, §18.9 — the ports seam and its read-side gap, the ownership inventory, the one-chokepoint caveat, the extraction sketch (*not started*), and the named missing evidence. §18.8 also carries the separate-roles guidance behind R21.
- `docs/investigations/Product stack.txt` — the target stack: three coordinating domains above AWCP, three capability providers below it.
- `server/src/workflow/` — the extraction donor. `ports.ts` carries the capability seam and its five failure-shape adapters; `policy.ts` records the fail-open classification default behind R24 as observed rather than theorised; `attention.ts` is the derived-Attention pure function; `schema.ts` carries the Migration Ledger behind R8. The knowledge slot has no production wiring — `service.ts` and `ports.ts` are imported only by tests — so R14's four-outcome vocabulary is specification proven against in-process fakes, and no retry may yet be described as safe.
- `docs/solutions/conventions/` — `a-credential-format-gate-is-not-an-authorization-gate.md` (R28), `a-returned-outcome-is-not-a-thrown-exception.md` (R39), `an-applied-migrations-body-is-byte-frozen.md` (R8), `prevention-and-detection-must-cover-the-same-scope.md` (R24), `verification-mechanisms-need-adversarial-review.md` and `a-control-that-fails-for-the-wrong-reason-is-not-a-control.md` (R44), `delegate-the-doing-keep-the-checking.md` (R45).
- `docs/solutions/workflow-issues/` — `verification-expires-when-the-verified-surface-changes.md` (R42, R43), `a-documented-inner-loop-command-can-destroy-real-state.md` (R50), `documented-command-excluded-from-build-and-ci.md` (R51), `cross-ai-review-lane-silent-prompt-loss.md` (R45), `resolving-a-conditional-decision-has-a-blast-radius.md` — which is why every citation above is by section anchor or identifier rather than by line number.
