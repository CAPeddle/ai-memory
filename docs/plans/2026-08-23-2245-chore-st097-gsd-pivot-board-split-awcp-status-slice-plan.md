---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
story: ST-097
title: "ST-097 — Transition: the WorkItem contract (D0), the GSD/CE workflow migration (A), and the first AWCP slice (B) - Plan"
type: chore
date: "2026-08-23"
revised: "2026-08-24"
origin: "docs/investigations/awcp-strategy-baseline-2026-08.md"
coordinates: "docs/plans/2026-08-23-2210-chore-st096-gsd-milestone-realignment-plan.md"
---

# ST-097 — Transition: the WorkItem contract (D0), the GSD/CE workflow migration (A), and the first AWCP slice (B) - Plan

> **This plan was rewritten on 2026-08-24** after a five-reviewer pass returned two P0s and ~40
> lesser findings against its first version, and after the PO identified a missing design boundary
> that the first version had silently collapsed. Every prior finding is dispositioned in
> [Review disposition](#review-disposition). The file path is unchanged so the board cross-link and
> `story:` frontmatter stay intact; the title and structure are not.

## Goal Capsule

**Objective:** complete the transition that is already half-taken — GSD becomes the long-horizon
planning workflow with Compound Engineering invoked from inside it, *and* AWCP becomes a thing that
can actually be used — by first resolving the boundary that makes both coherent: **what a work item
is, who owns it, and what identifies it.**

**The boundary, stated once.** There are two ticket concerns and they are not the same mechanism:

| | Concern | Today | Owner after this transition |
|---|---|---|---|
| **A** | The `ST-NNN` stories used to *develop* ai-memory/AWCP | Hand-edited markdown board, 90 entries | Split three ways: a frozen archive, a forward-planning input to GSD, and a **separate** ID allocator |
| **B** | The work items a *running* AWCP creates and monitors — Jira, GitHub, and eventually its own development work by dogfooding | **Does not exist** | A persisted AWCP `WorkItem`, UUID-identified, recording external provenance rather than replacing it |

Concern A is a planning artifact. Concern B is product data. The first version of this plan
migrated A into GSD's `ROADMAP.md` *and* proposed to dogfood AWCP against `ST-NNN` — which only
works if the two are the same store, and they are not.

**Means:** one prerequisite and two workstreams that may proceed independently once it lands.

- **D0** — establish the WorkItem contract as a decision of record. Blocks B entirely; blocks A only
  where A's allocator must not contradict it.
- **Workstream A** — the GSD/CE development-workflow migration, restructured so that archive,
  forward planning, and ID allocation are three separate responsibilities, and so that the new
  structure becomes authoritative **at the next-milestone boundary already chosen** rather than by
  rewriting a live milestone's artifacts.
- **Workstream B** — the smallest end-to-end AWCP product slice: WorkItem → associated
  execution/session → status → web UI. **Attention is deliberately *not* in this slice** — see
  KTD-B1.

**Authority hierarchy.** [`awcp-strategy-baseline-2026-08.md`](../investigations/awcp-strategy-baseline-2026-08.md)
and its six decisions bind. [`ADR-016`](../design/adr/ADR-016-awcp-consolidation-host-topology.md)
outranks everything on the host question, and **D0-4 exists specifically to satisfy its §3 revisit
requirement rather than to route around it.** [`ADR-013`](../design/adr/ADR-013-platform-product-definitions.md)
is Accepted and D0 amends its §4(b) layering by supersession, not by edit.
[CLAUDE.md](../../CLAUDE.md) governs conventions and merge rules.
[ST-096's plan](2026-08-23-2210-chore-st096-gsd-milestone-realignment-plan.md) is **coordinated
with, not superseded** (KTD-A4, confirmed by the PO 2026-08-24).

**Stop conditions:**

1. **Stop if D0-4 does not return a PO decision on storage.** B's persistence needs *two* things
   and they are not the same: an ADR-016 **§3** revisit (which storage layout) and an explicit PO
   **override of ADR-016 §1**'s bar on schema work that assumes the host. See KTD-D3 — an earlier
   draft of this plan claimed §3 alone discharged §1, and it does not.
2. **Stop if the allocator (A2) is not in place before any new `ST-NNN` is minted.** This plan mints
   none, and neither may anything downstream of it until A2 lands.
3. **Stop if the runtime flip (A1) does not produce an *observed* CE-skill execution inside a GSD
   agent.** A config diff is not the proof; a skipped-with-warning line means the mechanism is
   absent.
4. **Stop if attention creeps back into this slice.** Attention rules and attention rendering are
   out by PO decision (KTD-B1). A "just show the reasons we already compute" addition is the exact
   creep this condition exists to catch, because the existing `evaluateAttention` cannot represent a
   packet-less observed session at all — see KTD-B6.
5. **Stop if session capture expands past dogfooding without a retention decision.** KTD-B7 fixes
   the boundary; crossing it without the decision is what turns a minimal event lane into an
   unbounded store.
6. **Stop if any new `ST-NNN` or `AW-NNN` is minted before A2 lands.** This plan mints none.

---

## D0 — The work-item / ticket contract

### Verdict: PARTIALLY SPECIFIED

The user asked whether D0 is already specified or genuinely new. It is neither, cleanly. The concept
has a documented lineage here — **it was named in the source spec, then dropped before any decision
of record, and nothing was ever built.** Three buckets, each with different authority:

**Settled by prior decision — binding, do not re-litigate:**

- **The authority split is already decided, and it is the provenance reading, not the replacement
  reading.** `awcp-spec-evaluation.md:159-167` is an explicit authority matrix. *Requested work,
  hierarchy, status, priority, labels, fix versions* → **Jira (unchanged)**. *Commits, branches,
  pull requests, builds* → **Azure DevOps (unchanged)**. *Agent-operational execution state:
  packets, runs, checkpoints, attention, approvals, verification mapping, transactional decisions*
  → **the consolidated workflow product**, described at `:159` as *"authority over agent-operational
  execution state, **not a database that supersedes external authorities**."* The proposed
  direction's "record provenance/reference rather than replacing it" half is therefore **already
  the decided position**, not a new one.
- **One authoritative work-state model** — `awcp-spec-evaluation.md:21`, `:157`. No second product
  may own a competing authoritative copy of packets, runs, or approvals.
- **Storage layout is deliberately open, with a named process for closing it** —
  `awcp-spec-evaluation.md:177`: *"a module-design decision, not a further PO decision … not to be
  silently resolved by the first migration author without revisiting ADR-016 §3."*

**Presumed everywhere, defined nowhere — the important negative finding:**

- **`WorkItems → WorkPackets → AgentRuns` is the AWCP source spec's own model**
  (`awcp-spec-evaluation.md` §1, *"It models WorkItems → WorkPackets → AgentRuns"*). The
  three-level layering the PO proposes is not new vocabulary; it is the **original** vocabulary.
- **The layer above packets was narrowed away deliberately, not lost by accident — and restoring
  it is therefore a re-expansion, which is a stronger thing to have to justify.** An earlier draft
  of this plan cited `awcp-spec-evaluation.md:92` and `:199` as evidence of an accidental drop.
  **Neither supports that.** `:92` is a cell in an overlap table describing the *external* AWCP
  spec's own domain model, inside a document whose verdict is that the spec is over-scoped by
  roughly 3×; `:199` carries the phrase only inside struck-through question text whose recorded
  answer is *"Confirmed — absorbed/superseded. Recorded in ADR-013 §4(b)"* — that is the record of
  the narrowing, not evidence against it. What remains true and sufficient: `ADR-013:116`
  (**Accepted**) and `ADR-016:120` say only *"the **WorkPacket** model"*, so **no decision of record
  contains the layer**, and D0-1 must justify restoring it on the 0..n requested-work-to-packet need
  rather than on lineage.
- **`CONCEPTS.md` already separates the two concerns as vocabulary and bridges nothing.** *Work
  Packet* sits under **Workflow Operations** (`:11-14`); *Story* sits under **Delivery Workflow**
  (`:70-75`, *"identified by a stable label that appears in its board entry, in its Plan, and in the
  trailer of every commit"*). There is no WorkItem entry and no relation between the two.
- **`awcp-external-evidence-import-2026-08.md:282`** carries *"`turn/completed` must not mean work
  item completed"* as a semantic separation worth keeping — which **presumes** a work-item concept
  outliving a provider turn, and defines none.

**Genuinely new — zero occurrences anywhere in schema, types, `CONCEPTS.md`, or `.planning/`:** a
persisted WorkItem entity; its UUID identity; any external-reference or provenance column; any
packet→work-item relation; any `ProviderSession` record.

### Repository evidence that contradicts the proposed direction

The PO asked for this explicitly. Six items, in descending force:

1. **A persisted WorkItem table is currently barred.** `ADR-016:57` — *"Until the spike concludes,
   this ADR stays Proposed and no schema or migration work may assume the host."* ST-088 Phase 4 is
   unstarted. **D0-4 is the compliant route through this, not around it** — see KTD-D3.
2. **The Jira authority row refuses any reading in which AWCP's WorkItem is the authority over
   requested work** (`awcp-spec-evaluation.md:163`). It supports reference/provenance and nothing
   more. State this in the contract so it is not re-litigated at implementation time.
3. **ADR-013 §4(b) is Accepted and supersedes the Storyboard into the *WorkPacket* model**, not into
   a WorkItem/WorkPacket split (`ADR-013:116`). Restoring the layer above packets amends an accepted
   decision and requires a written supersession.
4. **`CONCEPTS.md:7` — *"A Work Packet owns everything beneath it"*** — is the current containment
   root. A WorkItem changes the glossary's root definition.
5. **Policy Scope is a packet-level security invariant with no default and a database `CHECK`**
   (`CONCEPTS.md:51-54`; `001_workflow_schema.sql:48-49`). A WorkItem that carried an inheritable
   scope would relocate a boundary control.
6. **Provider-session/work-item association is Horizon B material, sequenced behind ST-088**
   (baseline decision 3).

### The current model, precisely — and the gap

All tables live in schema `workflow` (`server/db/workflow/001_workflow_schema.sql:27`). **Every
primary key is `uuid DEFAULT gen_random_uuid()`, and no table carries a human-readable or external
identifier.** D0's UUID direction therefore matches existing convention exactly rather than
introducing one.

| Table | PK | FK edges | Identity / provenance |
|---|---|---|---|
| `work_packets` (`001:38`) | `id uuid` | — | `repository`, `branch` free text nullable; `policy_scope` NOT NULL, **no default**, `CHECK` |
| `agent_runs` (`001:65`) | `id uuid` | `packet_id → work_packets(id)` CASCADE | **`node_id text`, nullable, NO foreign key** |
| `checkpoints` (`001:87`) | `id uuid` | `run_id → agent_runs(id)` CASCADE | `repo_commit text` |
| `operational_decisions` (`001:126`) | `id uuid` | composite `(run_id, packet_id)` | `promoted_memory_ref text` — outbound, deliberately not a FK |
| `verification_criteria` (`001:150`) | `id uuid` | `packet_id → work_packets(id)` | — |
| `evidence_items` (`001:163`) | `id uuid` | `criterion_id → verification_criteria(id)` | `kind`, free-text `detail`, `recorded_commit` |
| `execution_nodes` (`003:51`) | `node_id uuid` | — | `bearer_token_hash` UNIQUE; hostname/platform self-reported, advisory |
| `run_events` (`004:35`) | `event_id uuid` | `node_id → execution_nodes(node_id)` CASCADE | `UNIQUE (node_id, client_seq)`; `event_type`; `payload jsonb`. **No `run_id`, no `packet_id`** |

**What a WorkPacket actually is, in evidence:** one supervised objective with scope, constraints, an
optional repo/branch binding, a policy scope, and a completion gate. `CreatePacketInput`
(`server/src/workflow/store.ts:45-53`) accepts no external reference and no parent. `work_packets →
agent_runs` is already 0..n, so **the packet already owns "a unit of work with many executions."**
What has no owner is the layer *above*: one unit of **requested** work that may have 0..n packets,
plus external identity.

**Correction to the prior plan, stated plainly:** its Scope Boundaries claimed a read-time join
could surface `run_events` against runs without DDL. **That is false, and worse than the review
found.** `agent_runs.node_id` is `text` with no foreign key while `execution_nodes.node_id` is
`uuid` — the two columns are not type-compatible, so no join exists at any level, loose or
otherwise. `001:63-64` promised *"Stage 2 populates node_id from the remote execution node"*; Stage
2 landed (migrations 003/004) and never wired it. **Observed-to-authoritative association is
unavoidably new DDL.**

### D0 Key Technical Decisions

**KTD-D1 — WorkItem is restored as the layer above WorkPacket, by supersession of ADR-013 §4(b)'s
layering, and it is provenance-bearing rather than authoritative over requested work.**
*(session-settled: user-directed — the PO supplied this direction to be used unless repository evidence
contradicts it; the evidence corroborates rather than contradicts. Rejected alternative: AWCP-created
work stored in GSD's `ROADMAP.md`, and WorkItem replacing external source identity.)*

Identity: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, matching every other table. External
identity is a **pair**, not a string: `source_system text` (a closed set — `jira`, `github`,
`story-board`, `awcp-native`) and `source_ref text` (the foreign key in *their* namespace: `ST-097`,
`PROJ-1234`, `#57`), with `UNIQUE (source_system, source_ref)` where both are present. AWCP-native
items carry `source_system = 'awcp-native'` and a null `source_ref` until D0-2 settles their
human-facing id.

**ADR-013 §4(b) is not edited.** `awcp-strategy-baseline-2026-08.md:140-152` deliberately leaves
`ADR-013:116` unedited because ST-088 Phase 4 may rewrite that sentence within weeks, and it binds
readers instead of the file. D0-1 follows the same discipline: the supersession is recorded in the
new ADR with a reader instruction, and `ADR-013` is left alone.

**KTD-D2 — AWCP-native work gets its own human-facing identifier namespace, `AW-NNN`. `ST-NNN`
stays the development-story identity and becomes *provenance* when AWCP dogfoods its own
development.**
*(session-settled: user-directed, 2026-08-24. The PO instructed that this must not be inferred from
the development ledger, and settled it explicitly. Rejected alternatives: reusing `ST-NNN` as the
human-facing id for AWCP-native work; deferring to a UUID-only WorkItem.)*

This preserves the distinction the whole restructure exists to recover. Reusing `ST-NNN` would have
coupled product data to a development-ledger allocator with different concurrency properties —
recreating inside AWCP exactly the coupling this plan removes from the board.

**What it means concretely.** A WorkItem carries `source_system` + `source_ref` for *external*
identity, and an `AW-NNN` human-facing label for AWCP-native work. A dogfooded WorkItem for this
repository's own development carries `source_system='story-board'`, `source_ref='ST-097'` **and** its
own `AW-NNN` — the `ST-NNN` is the provenance reference, not the identity.

**`AW-NNN` allocation is AWCP's own, and it is not A2's allocator.** A2 allocates development story
ids from a markdown registry because the board is a markdown artifact; `AW-NNN` is allocated by
AWCP's persistence, where a database can enforce uniqueness directly. **They are two allocators by
design, which is the cost this decision accepts** — the alternative was one allocator serving two
masters with different concurrency properties, which is what made Option 2 worse.

**KTD-D3 — B2's storage needs a PO *override* of ADR-016 §1, plus a §3 revisit. They are two
different things and only one of them is a mechanism the repository already provides.**

*(session-settled: user-directed, 2026-08-24 — **narrow**. The override covers migration `005`
only; ADR-016 §1 is not broadly lifted and ST-088 still settles the general host/storage question.
Rejected alternatives: a broad override for AWCP workflow migrations generally; no override, with
B2 onward waiting on ST-088 Phase 4. The PO's reasoning: another premature migration needing its own
explicit decision is **desirable pressure rather than bureaucracy** at this stage.)*

An earlier draft claimed D0-4 was *"the compliant route through this, not around it."* **That was
wrong, and the error is worth keeping visible so it is not re-derived.** ADR-016 §3's own heading
reads *"Storage layout: open — a module-design decision, **not a host decision**"*. A §3 revisit
therefore settles **same-schema versus separate-schema** and nothing else. It has no power over §1's
*"Until the spike concludes, this ADR stays Proposed and no schema or migration work may assume the
host"*, which is discharged by the ST-084 Stage 2 spike — tracked as **ST-088**, Phase 4 unstarted.

So D0-4 asks for two things:

1. **An explicit PO override of ADR-016 §1 for migration `005` and nothing else**, recorded as a
   dated amendment in ADR-016's Revision History so it is legible as an override rather than as
   compliance. **Any later AWCP migration returns for its own decision** — the gate keeps working;
   and
2. **the §3 storage-layout revisit** that `awcp-spec-evaluation.md:177` requires so the decision is
   not *"silently resolved by the first migration author"*.

**Price the override honestly, because an earlier draft did not.** It is tempting to justify `005`
as cheap under the repo's *contract-first, storage-disposable* rule, since teardown is one
`DROP SCHEMA workflow CASCADE`. But the same rule is what baseline decision 1 relies on, and this
plan's own Risks table states the countervailing fact: **an applied migration is byte-frozen**, its
checksum is over raw bytes, drift aborts the run and exits the server before the port opens, and
correcting it is an operational change on every database that never re-runs statements. Dropping the
whole schema is cheap; *changing* `005` after it applies is not. Decide the override against that
cost, not against the disposability framing.

**If the PO declines, say what actually remains: not much.** An earlier draft claimed B5–B7 would
proceed *"against an in-memory/contract-only substrate."* No such substrate exists anywhere in
`server/src/workflow/`, and building one means building the read model twice. **The honest decline
branch is that Workstream B ships no operator-visible deliverable**: D0-1..D0-3 and B1 (contract and
types) complete, and everything from B2 onward sequences behind ST-088 Phase 4.

**KTD-D4 — WorkItem is deliberately scope-free; Policy Scope stays on the packet.**
*(my call, derived from the PO's "do not fabricate policy scope" prohibition plus `CONCEPTS.md:51-54`.
Rejected alternative: WorkItem carries an inheritable scope that packets default from.)*

`CONCEPTS.md:51-54` — *"A Work Packet is the only authority for its own Policy Scope … the set is
fixed, enforced at the database, and has no default, so every write must state a scope rather than
inherit a permissive one."* Giving WorkItem an inheritable scope would relocate a security boundary.
Instead: WorkItem carries **no** scope, and anything scope-gated — promotion, provider egress —
requires an *associated packet*. This converts the PO's "do not fabricate a policy scope"
prohibition from a rule someone must remember into a **structural impossibility**: there is no field
to fabricate.

**But do not overstate what this buys — an earlier draft called it a structural impossibility and
that is false.** Removing the field closes the *capture* path: nothing in B3/B4 can invent a scope,
because there is no scope column on a WorkItem or an observed session. It does **not** close every
path. `POST /packets` is not in `OPERATOR_ONLY_ROUTES`, so an agent key can still mint a packet with
any of the four `policy_scope` values, and B2 adds a nullable `work_packets.work_item_id` FK — so an
agent-authored packet could be bound to a WorkItem and become the scope authority for anything
reached through it. **B2 therefore also makes the binding write operator-only** (see B2a): the
column is never settable through `POST /packets`.

**Two further consequences, stated rather than discovered later.** A dogfooding WorkItem for ST-097
cannot promote anything to memory until a packet is attached to it. And because a WorkItem may own
several packets with *different* scopes, **ADR-017 must state that a scope-gated operation reached
through a WorkItem names the specific packet whose scope governs it** — no WorkItem-level scope is
ever derived, defaulted, or inferred from the set. Choosing the packet would otherwise be choosing
the boundary, which is the silent widening `CONCEPTS.md:51-54` exists to bar.

**KTD-D5 — Association between an observed session and a WorkItem is an explicit claim, never an
inference, and it lives in its own table.**

Three candidate homes were considered: a column on `run_events`, a column on WorkItem, or an
association table. **Association table**, because it is the only one that permits many sessions to
one WorkItem, re-claiming, and unclaiming — and because `run_events` must stay structurally
incapable of implying supervised work (it carries no run, no packet, and no scope, which is exactly
what makes it the honest home for *observed* state).

**Who may claim, and what makes the claim unique — both named here, because the rule this plan
cites against itself demands it.** `a-credential-format-gate-is-not-an-authorization-gate.md`
requires any design saying *explicit* or *authoritative* to name the artifact holding the set **and
the operation that writes to it**. So: the **operator credential** authorises a claim, and the claim
route is **operator-only** in `OPERATOR_ONLY_ROUTES` — not reporting-class. The
`POST /packets/:packetId/runs` precedent does not carry here: it attaches execution to *already
supervised* work, whereas a packet-less WorkItem is by KTD-D4 not supervised at all, and only the
operator knows which requested work an observed session belongs to. The node lane already enforces
cross-node ownership (`remoteNodeHub.ts:414-432`) precisely because a valid bearer proves you are *a*
node, not *this* node; the claim route inherits no equivalent proof, which is the second reason it
cannot be agent-callable.

**Uniqueness is a database invariant, not a read.** The association table carries a UNIQUE
constraint on the canonical `(node_id, session_id, work_item_id)` triple. A `SELECT`-derived
acknowledgement reports a duplicate but cannot prevent two inserts racing — the ack pattern is
copied from `004_run_events.sql` for its *reporting* property, not for exclusion.

**Observed vs authoritative becomes a schema fact, not a naming convention:** an observed session
lives on the `run_events` node lane and is reachable only through `execution_nodes`; an authoritative
execution is an `agent_runs` row under a packet. Nothing converts one into the other implicitly.
This is the two-axis capability contract from
[`awcp-external-evidence-import-2026-08.md:261-262`](../investigations/awcp-external-evidence-import-2026-08.md)
applied to persistence.

### D0 Implementation Units

| Unit | Deliverable | Depends on |
|---|---|---|
| **D0-1** | `ADR-017 — The AWCP WorkItem contract`: identity, provenance pair, relation to packet/run/session, the ADR-013 §4(b) layering supersession with its reader instruction, and KTD-D2's settled `AW-NNN` namespace with its allocation boundary (AWCP's persistence, not A2's registry) | — |
| **D0-2** | `CONCEPTS.md`: new **Work Item** entry; amend `:7` (the containment root is no longer the packet); amend **Work Packet** `:11-14` to name its optional parent; state the Work Item ↔ Story relation explicitly so the two vocabularies stop being adjacent-but-unlinked | D0-1 |
| **D0-3** | Versioned TypeScript contract in `server/src/workflow/types.ts` + `schema.ts` — **types and zod only, no DDL** | D0-1 |
| **D0-4** | **PO gate — two asks.** (a) An explicit override of ADR-016 **§1**'s host bar for migration `005`, recorded as an amendment in ADR-016's Revision History; (b) the **§3** storage-layout revisit `awcp-spec-evaluation.md:177` requires. Returns permit-or-defer for B2 | D0-1 |
| **D0-5** | **The WorkItem status contract.** A WorkItem owns 0..n packets; `PacketStatus` renders `open` for everything in flight (`types.ts:40`, `api.ts:6-10`). Define the WorkItem-level status projection and its precedence across packets, observed sessions, and external source status — or state explicitly that a WorkItem has no status and both clients render its packets' statuses individually. **Without this the web UI and `awcp status` can disagree** | D0-1 |

---

## Workstream A — GSD/CE development-workflow migration

### What is preserved from the existing direction

Unchanged and not reopened: **GSD drives** `discuss → plan → execute → verify → review`; **CE is
invoked from inside it via `agent_skills`**; **CE retains `commit → PR`**.

### The finding that dissolves the P0

The first version proposed to *supersede* `.planning/REQUIREMENTS.md:66` — the row forbidding
*"Replacing the existing story board or `docs/plans/`"* — by editing it and three `ROADMAP.md`
pointers. Two reviewers independently flagged this as rewriting live-milestone artifacts the origin
document bars.

**It is not a project rule. It is milestone-scoped and it expires on its own.**
`.planning/REQUIREMENTS.md:1` reads *"Requirements: ai-memory **ST-088 Host Viability Milestone**"*,
and line 66 sits in *that milestone's* Out of Scope table. All three `ROADMAP.md` references
(`:7`, `:17`, `:175`) are inside the ST-088 milestone roadmap. **The next milestone writes its own
REQUIREMENTS and ROADMAP and simply does not carry the row.** No supersession edit is required, and
the unit that proposed one is deleted.

**What does not expire, and how it is handled honestly.** The same posture is restated at *project*
level in `.planning/PROJECT.md` — `:59` (*"Existing story-board WIP limits remain authoritative"*),
`:60` (*"Existing `docs/plans/*.md` and story links remain canonical; GSD artifacts summarize and
route work rather than silently replacing them"*), and the Key Decisions row at `:77`. Those are not
milestone-scoped. But `PROJECT.md:81-94` — its own **Evolution** section — prescribes a full review
of all sections **at each milestone boundary**. Amending them there is the document's own sanctioned
mechanism, not a violation of it. That is A6.

### A Key Technical Decisions

**KTD-A1 — Archive, forward planning, and ID allocation are three separate responsibilities with
three separate artifacts.**
*(session-settled: user-directed. Rejected alternative: the frozen ledger keeps minting, which is what
produced P0-1.)* The first version fused them into "the frozen ledger keeps minting" —
which is what produced P0-1.

**KTD-A2 — The allocator is an append-only registry that records an ID at mint time. It does not
derive identity from history, completed or otherwise.**
*(session-settled: user-directed — "must not derive identity from completed/historical tickets".
Rejected alternatives: highest-in-ledger + 1; `max()` over ledger ∪ migrated ∪ git trailers.)*

The PO's constraint is explicit: *"must not derive identity from completed/historical tickets."*
This rules out both the original algorithm (*highest in ledger + 1*) and the adversarial reviewer's
proposed fix (`max()` over ledger ∪ migrated ∪ git trailers) — both are derivations.

The artifact is **`.github/planning/story-ids.md`**, append-only, one line per allocation:

```
ST-098  2026-08-24  branch:docs/awcp-strategy-baseline  D0-1 ADR-017
```

Allocation is: append the next unused line, commit **that file alone**, then read back.

**A merge conflict alone is not enough, and the reason matters.** A conflict fires at *integration*
time, not at allocation time — so two branches can both mint `ST-098` and work under it for days,
by which point the duplicate has propagated into commit trailers, plan filenames, and board entries
that a one-line file conflict cannot undo. Retaining both lines duplicates; renumbering the loser
strands every reference. This repository is the worst case for that: nothing is pushed, and `ST-095`
already exists only on `docs/gsd-ce-drive-direction` — an allocation `main` has never seen, which is
the failure A2 exists to prevent, already realised.

**So allocation is provisional until its line lands on `main`.** An `ST-NNN` may not be used on a
branch — not in a trailer, a filename, or a board entry — until the allocator commit carrying it is
merged. Conflict resolution reallocates the *losing* branch and updates its references before that
branch is accepted. Deriving from history, by contrast, produces a *silent* duplicate with no
detection point at all — which is why the barred alternative is still worse than this one.

**Why this is not itself a derivation.** "Append the next unused line" scans the registry, so it
resembles the barred rule. It differs in what it scans: the registry is an **allocation record**
written at mint time, not a **delivery ledger** written at completion. An ID reserved and never
shipped is present in the first and absent from the second, which is exactly the case the barred
rule gets wrong.

**Naming the authoritative set and its writer is mandatory here, not stylistic.**
`docs/solutions/conventions/a-credential-format-gate-is-not-an-authorization-gate.md` records this
exact failure in this repository: ADR-016 said a node credential was *"pre-provisioned"* without
naming where the provisioned set lived, and a format check passed for an authorization check through
three reviews. The rule extracted there — any design saying *canonical*, *authoritative*, or *source
of truth* must name the artifact holding the set **and the operation that writes to it** — is
discharged by the two paragraphs above and must survive into the implementation.

**No new `ST-NNN` is minted by this plan, and none may be minted downstream of it until A2 lands.**
The workstreams in this document use provisional names (`D0-1`, `A3`, `B7`) precisely so that no
allocation is required to write it.

**KTD-A3 — `999.x` is not used, because it is GSD's icebox rather than a queue.**
*(session-settled: user-directed — "999.x is not treated as a schedulable queue" and "actual GSD
schedulable-work semantics are used". Rejected alternative: 35 Backlog entries migrated as `999.x`.)*

`roadmap-parser.cjs:486` excludes the 999 range; `phase.cjs:2653` excludes sentinel-range ids from
phase candidacy. The first version's R3 — *"the forward queue lives in `.planning/ROADMAP.md`; GSD
sequences it"* — was therefore false: it proposed retiring a queue the workflow gate at least
required consulting, and replacing it with one nothing consults.

**Actual GSD schedulable semantics:** phases in `ROADMAP.md` are derived from requirements in
`REQUIREMENTS.md` by `gsd-roadmapper`, at 4–6 phases for `granularity: standard`, with 100% coverage
mandatory. So forward work becomes schedulable only by being **a requirement of a milestone**. The
35 Backlog entries therefore stage as **requirement candidates** in a holding artifact and are
converted at the boundary by `gsd-new-milestone`, not written into a live ROADMAP as icebox rows.

**KTD-A4 — ST-096 is coordinated with, not superseded.**
*(session-settled: user-directed. Raised as the plan author's narrowing of the PO's 2026-08-23
decision on new evidence, and **confirmed by the PO 2026-08-24**: ST-096 is useful as the
milestone-boundary sequencing gate the GSD transition consumes. Rejected alternative: ST-097
supersedes ST-096 as originally decided.)*

*(This narrows a prior PO decision, and the change is flagged rather than made quietly.)* The
previous round settled *"ST-097 supersedes ST-096; land its branches first."* That rested on the
belief that A required rewriting live milestone artifacts, which the milestone-scoping finding
above removes. ST-096 is a pure **sequencing** plan (`execution: docs`) that authors no requirement
and no ROADMAP content, and schedules the ST-088 → Horizon B–D boundary. That boundary is now
precisely where A6 hands authority over. **ST-096 therefore becomes the boundary gate A6 consumes.**
The branch-landing half of the prior decision stands unchanged.

**KTD-A5 — ST-097 stays the transition/bootstrap story only until A2 makes safe allocation
possible; then the remaining GSD-boundary work and the AWCP product slice separate.**
*(session-settled: user-directed, 2026-08-24. Rejected alternatives: one `ST-097` for the whole
transition; splitting D0+A from B only.)*

The PO's reasoning, which is also the finding that prompted it: **one story must not occupy the
development slot through both an ST-088 boundary wait and an independent AWCP product slice.** As
written, one story number and one trailer covered everything, so the board's single In-Progress slot
was held across a PO gate and an undated wait — while A6, the unit that *removes* the WIP limit, is
itself gated on ST-088. That is circular, and the split breaks it.

**The sequence, and why this order:**

1. **ST-097 carries D0 and A1–A3 only** — the WorkItem contract, the runtime flip, the allocator, and
   landing the branches. This is the bootstrap: it is the work that makes safe allocation exist.
2. **When A2 lands, allocate.** The remaining GSD-boundary work (A4–A7) and the AWCP product slice
   (B) each get their own `ST-NNN`, minted through A2 under the provisional-until-merged rule.
3. **B then proceeds independently of A's ST-088 gate**, which is the point — B depends on D0, never
   on A, and there is no reason for the product slice to wait on a milestone boundary.

**This is also the allocator's first real proof.** A2's verification allocates a test id; minting the
two successor stories exercises it on work that matters, which is a better check than a synthetic
one — and if it fails there, it fails before anything depends on the id.

**Nothing is minted by this plan.** The successor ids do not exist until A2 does; until then the
workstreams keep their provisional names.

### A Implementation Units

| Unit | Deliverable | Depends on |
|---|---|---|
| **A1** | **Runtime flip.** `.planning/config.json` → `"runtime": "claude"`; resolve `claude_md_path` (it points at `./.github/copilot-instructions.md`, which `CLAUDE.md` itself records as architecturally stale, so repo governance is currently invisible to every GSD agent); populate `agent_skills`. **Record a pre/post compatibility matrix**, not a reference count: one row per runtime-dependent path — global config home, skills base (`getGlobalSkillsBase`), command materialisation, agent-install location, model resolution — stating the resolved value before and after, plus the governance file actually loaded and the CE skill actually materialised for each supported agent. *(`runtime` appears in ~118 **files** under `bin/lib/`, ~2,587 occurrences — counting is not the gate; the matrix is.)* | — |
| **A2** | **The allocator.** Create `.github/planning/story-ids.md` seeded with the contiguous range `ST-001`…`ST-097` — contiguous deliberately, since `ST-025`, `ST-027` and `ST-069` are absent from the board while `ST-069` was demonstrably a real allocation with its own plan and merged PR, so a board-derived seed would under-reserve. Write the mint procedure into `CLAUDE.md`, including the provisional-until-merged rule (KTD-A2), and add a mechanical check | — |
| **A3** | **Land or lift the two open branches.** `docs/gsd-ce-drive-direction` (4 commits) and `docs/awcp-strategy-baseline` (7 commits, this plan's home). Resolve the **four-way** `## Backlog` conflict by keeping all four entries (ST-094 from `main`, ST-095, ST-096, ST-097). **Do not merge `docs/st-093-entity-queue-isolation`** — merge-base 3 commits behind `main`, diff sums to 175 additions / 7,860 deletions; lift content, never merge | A2 |
| **A4** | **Freeze the archive** *(gated on ST-088 close)*. The 48 `## Done` + 6 `## Archived` entries are relabelled an append-only delivery ledger and stop being edited. **It no longer mints** — that moved to A2. Strip frozen pass-counts per `verify-worktree-change-against-docker-test-stack.md` §4, which names this file by line as carrying the anti-pattern. **The ST-088 In Progress entry is not part of the freeze** while the milestone is live — `.planning/ROADMAP.md:7` names it authoritative for that milestone's WIP limits and acceptance criteria | A3, ST-088 |
| **A5** | **Stage forward work** *(gated on ST-088 close)*. The 35 `## Backlog` entries → `.planning/backlog-candidates.md` as requirement candidates. **Do not stage ST-088** — it *is* the live milestone. Three disciplines, each of which the previous draft got wrong or omitted: **(a) verify against the tree, not the log.** `git log --grep` searches commit *messages*, so a reverted commit still matches and a differently-worded real change is missed — which contradicts the rule this plan cites. History locates candidate commits; a tree-level check with recorded evidence per entry is the gate. **(b) Classify before staging.** Several entries are memory-platform work (ST-019 Obsidian, ST-077 Qwen, ST-091 .NET SDK) that an AWCP-sequenced roadmap will never promote; each gets an authoritative destination or an explicit out-of-scope disposition, so nothing is silently orphaned. **(c) Name the ingestion path.** `.planning/backlog-candidates.md` is a dead file unless something consumes it: A5 delivers the conversion step that feeds `gsd-new-milestone`, and "every staged candidate is represented in the generated `REQUIREMENTS.md`" is a pass condition, not an assumption. Acceptance criteria that cannot survive `gsd-roadmapper`'s 3–5-criteria compression route to per-phase `SPEC.md` | A3, ST-088 |
| **A6** | **Boundary handover** *(gated on ST-088 close; consumes ST-096's sequencing)*. Amend `PROJECT.md:59`, `:60`, `:77` through its own Evolution mechanism; add a `.planning/` tier to `CLAUDE.md`'s source-of-truth precedence; rewrite the Workflow gate's minting clause to name A2's allocator; decide squash-vs-merge deliberately for milestone-scoped GSD work. **Two things this unit must produce rather than assert.** (a) **A replacement for the WIP limit, not just its removal.** "Sequential drive" is a phrase, not an invariant — dropping one-In-Progress/one-in-Review without a concrete active-work policy lets the workflow permit parallelism the old guardrail prevented. State the policy and prove it at the boundary. (b) **An executable boundary-sync check.** The Risks table demands an *enforced* sync because the board's documented failure was discretionary bookkeeping; prose and precedence edits do not enforce anything. Deliver a hook or CI check that rejects a handover when the authoritative planning artifacts are not updated together, and include its failing case | A2, A4, A5, ST-088 |
| **A7** | **Reference sweep, partitioned.** `grep -rl 'story-board'` returns 77 files. **Partition first:** the *edit set* (README, `.github/copilot-instructions.md`, the four `.github/prompts/*`, `governance-review.prompt.md`, `.planning/PROJECT.md`) versus the *frozen record* (historical plans, ExecPlans, solution docs) which A4's freeze principle says must not be edited. **Ships in the same change as A6** — the ST-066 precedent is that the last workflow migration stranded four prompt files pointing at a dead format, and they have sat in Backlog since 2026-07-02 | A6 |

**`.planning/STATE.md` is untouched throughout.** It is dirty in the working tree and belongs to a
concurrent session.

**GSD's commit helper omits the `Story:` trailer** (`gsd_run query commit` uses a repo-agnostic
template, and its `--amend` silently discards the new message while reporting success —
`docs/solutions/workflow-issues/gsd-commit-helper-omits-story-trailer.md`). Every GSD-driven commit
in this workstream states the trailer inline in the message and is verified mechanically. **Carry
this in the dispatch brief itself, not by reference** — `delegate-the-doing-keep-the-checking.md`,
and reinforced by A1's finding that the referenced governance file is currently the wrong file.

---

## Workstream B — the first AWCP working slice

**Shape:** WorkItem → associated execution/session → status → **web UI**. Attention rules and
attention rendering are **deferred to the post-continuity boundary** (KTD-B1).

### B Key Technical Decisions

**KTD-B1 — The web UI is the primary product surface, and attention is deliberately deferred to the
post-continuity boundary.**
*(session-settled: user-directed, 2026-08-24. Rejected alternatives: keeping observed-session
attention in this slice as originally planned; taking the contract change now but rendering nothing.)*

**Primary surface.** Baseline decision 4 made the web UI primary, superseding
`awcp-spec-evaluation.md`'s increment-7 deferral. `server/src/workflow/dashboard.ts` already renders
runs, checkpoints, decisions, criteria and a packet view (405 lines, single-file HTML), so B6
**extends an existing surface** rather than creating one. `awcp status` is "secondary" only if it is
literally a second client of one read model, not a parallel implementation.

**And attention is out — which restores an ordering this plan previously departed from.** Baseline
decision 4 also says the web UI is *"not the first horizon"*, and that *"Horizon order is unchanged
— provider/session truth (B) and continuity (C) still precede the attention UI (D)."* An earlier
draft of this plan built observed-session attention in the first slice and recorded the departure as
deliberate. **The PO reversed that**, on the reasoning the cross-model product lens supplied:
defining attention semantics over a *provisional* session signal turns the later attention milestone
into a migration of an adopted contract rather than a projection of validated runtime truth.

**So this slice ships WorkItem, provenance, observed-session truth, status and the web UI — and
stops there.** What that costs, stated plainly rather than discovered: the slice answers *"what is
the state of this work?"* and **not** *"which one needs me?"* — the second question was the original
motivation, and it now waits for Horizons B and C to validate session truth first. The requirement
is deferred, not dropped: **a healthy captured session producing zero attention items remains a
binding requirement of the attention milestone**, with the Red/Green Control and non-vacuity guard
this plan specified for it (KTD-B6) carried forward intact.

**KTD-B2 — Nothing in the capture path fabricates a packet id or a policy scope. It cannot, by
construction.**
*(session-settled: user-directed — "do not fabricate packet UUID or policy scope for automatic session
capture". Rejected alternative: a SessionStart hook shelling out to `awcp run` with a hardcoded scope.)*

The first version's R2 — *"a coding session opens and closes its own AWCP **run** without the
operator typing a command"* — is unimplementable as written and was the review's most-corroborated
finding. `awcp run` hard-requires `--packet <uuid>` (`server/scripts/awcp.ts:307`); creating a
packet requires `--policy-scope`, which the CLI deliberately gives no default because *"a boundary
value inherited by accident is the failure the column exists to prevent."*

**R2 is reworded to name an observed session, not a run.** A session announces itself on the
`run_events` node lane using the node bearer it already holds; a WorkItem association happens later,
by explicit claim. An unclaimed session stays observed forever, which is a legitimate terminal
state.

**Correction to a comfortable misreading, since the plan must not inherit one:** it is tempting to
record "an agent may not create a packet" as an existing server-enforced boundary. It is not.
`OPERATOR_ONLY_ROUTES` (`server/src/workflow/policy.ts:65-70`) lists exactly four routes — resolve
decision, attach evidence, complete packet, author criteria — and `POST /packets` is **not** among
them, so an agent key can create a packet today. The prohibition here is a rule about the capture
flow, enforced by KTD-D4 removing the field rather than by the route classifier.

**KTD-B3 — Every new route is classified in `requiresOperator` explicitly, because silence is a
decision.** `requiresOperator` returns `false` for anything not in the allowlist, so an unlisted
route is agent-callable the moment it lands. The classification for this slice:

| Route | Class | Why |
|---|---|---|
| `POST /work-items` (B2a) | **operator** | Creating requested work is not reporting |
| `POST /work-items/:id/sessions` (B4, claim) | **operator** | KTD-D5 — only the operator knows which requested work a session belongs to, and the caller holds no ownership proof over the session |
| `PATCH /packets/:id/work-item` (B2a, binding) | **operator** | KTD-D4 — this write decides which packet's scope governs |
| `GET /work-items`, `/work-items/:id`, `/work-items/by-ref` (B5) | agent-callable | Reads, matching `/overview`'s existing posture |

The four existing operator-only routes stay operator-only for every WorkItem-shaped successor.

**A read-authorization limit this slice does not close, stated so it is not mistaken for closed.**
Every authenticated caller of `/api/workflow` already sees every active packet through `/overview`
(`readModel.ts:74-83`), because retrieval-time scope enforcement was deferred by
`001_workflow_schema.sql` to Stage 2. The WorkItem reads inherit that posture and add no new
exposure — but they also add no object-level authorization, so an agent key reads the whole
WorkItem surface. Closing it is ST-082's job, not this slice's; recording it here keeps the
credential-parity test from reading as an authorization proof.

**KTD-B4 — The observed-session lifecycle contract, settled here rather than left open.**

*(These were OQ2/OQ3/OQ4 in the previous draft. They are promoted to decisions because the event
contract cannot be implemented deterministically without them, and leaving them open guaranteed the
implementer would invent three answers to a contract this plan itself calls expensive to change
once events exist. They remain settled here even though attention left the slice — the *events* are
contract, and retrofitting them later is a migration plus a reconciliation.)*

1. **Per-session identity enters the event contract now.** `client_seq` is per-*node*, so two
   concurrent sessions on one machine share one counter and interleave indistinguishably — which
   contradicts the product contract's operator *"running several concurrent AI-assisted development
   sessions."*
2. **`session_id` is client-generated, opaque, and explicitly non-authoritative** — matching the
   spool's offline-first design and needing no round-trip.
3. **`session_id` is not a security boundary, so identity is node-bound.** `observed_sessions`, the
   association table, and every session lookup and claim key on **`(node_id, session_id)`**,
   mirroring `UNIQUE (node_id, client_seq)` in `004_run_events.sql`. Without this a misbehaving node
   can collide with, impersonate, or close another machine's session — and the hub's existing
   forgery defence (`remoteNodeHub.ts:414-432`) covers `node_id`, not a payload field.
4. **Lifecycle events are typed, and a clean close is distinguishable from a crash.** B3 emits
   `session_start`, periodic `session_heartbeat`, and a typed `session_end`. A `SIGKILL` never
   writes the stop record — the node client's own docblock concedes this — so **abandonment is
   decided by a heartbeat gap, not by the absence of `session_end`.**
5. **The abandonment threshold is distinct from `DEFAULT_STALE_AFTER_MS`.** 30 minutes idle is
   normal for a supervised run and normal for a human's dev session; 30 minutes with **no
   heartbeat** is not. **B3 emits the heartbeats; the concrete gap *value* travels with the
   deferred attention package (KTD-B6)**, because a threshold is evaluation policy and this slice
   has no evaluator left to consume it. Emitting the signal now is what keeps the later decision
   from being a migration.
6. **Payload contents are a closed set** — `session_id`, event timestamp, `node_id`, and nothing
   else. `server/scripts/awcp-node-client.mjs:1477-1485` keeps payloads synthetic deliberately,
   because payload content is unresolved under permanent event retention; B3 adds the first new
   event types since that decision and must not quietly widen it. Repository and branch belong on
   the WorkItem's provenance, not on the node lane.

**KTD-B5 — Provenance lookup is a first-class route.** `api.ts` exposes exactly two GETs —
`/overview` and `/packets/:packetId`. **State the gap precisely, because an earlier draft
overstated it:** `/overview` takes no UUID and returns a full `PacketView` per *active* packet, so a
caller can already enumerate active work. What is genuinely missing is (a) resolution by an
**external reference** — `ST-097`, a Jira key, `repo`+`branch` — and (b) any reach into **completed**
packets, which `buildOverview` excludes via `store.listActivePackets()`.

**`source_ref` travels as an encoded query parameter, not a path segment.** KTD-D1's own example
values include `#57`, which a path segment cannot carry (`#` opens a fragment), and Jira-style keys
with slashes would split into segments. The route is `GET /work-items/by-ref?source=<s>&ref=<r>`.

**KTD-B6 — The attention contract change is *specified here and executed later*, so the attention
milestone inherits a decision rather than rediscovering a blocker.**

Attention is out of this slice (KTD-B1), but the analysis that made it implementable is worth
keeping, because it is what would otherwise be rediscovered as a blocker mid-milestone:

`AttentionItem` declares `packet_id: string` **non-nullable** (`types.ts:130-135`), `AttentionReason`
is a **closed five-value union** (`:123-128`), `evaluateAttention` takes a **required**
`packet: WorkPacket` (`attention.ts:44`), and `buildOverview` iterates only
`store.listActivePackets()` (`readModel.ts:73-81`). An unclaimed observed session has no packet by
KTD-D5's design — **so an observed-session attention item cannot be represented at all**, and any
discrimination check written against the current evaluator would pass vacuously.

**Recorded for the attention milestone, not for this slice:** widen the existing contract rather
than fork it — `packet_id` nullable, a nullable `session_id`, one new `AttentionReason` value
(`abandoned`), a sibling `evaluateSessionAttention`, and a `buildOverview` union. The rejected
alternative — a parallel session-attention type with its own queue — would give the operator two
queues to watch and defeat the single attention surface the product is built around. **Every
existing `AttentionItem` consumer changes** (`dashboard.ts`, `readModel.ts`, the CLI), and that cost
belongs to the attention milestone.

**Carried forward with it:** the healthy-session **zero** attention items, its Red/Green Control
(the same session abandoned yields **exactly one**), the non-vacuity guard, and positive
discrimination against `stale` / `ended-without-checkpoint` / `ready-for-review`. Those were the
requirement; deferring the unit does not weaken them.

**KTD-B7 — Observed-session events inherit the existing run-event retention posture; expanding
capture past dogfooding is gated on an explicit retention decision.**
*(session-settled: user-directed, 2026-08-24. Rejected alternatives: designing a retention subsystem
inside this slice; treating retention as out of scope with no boundary recorded.)*

No new retention subsystem is built here. Session events live on the same lane as `run_events` and
inherit its posture, and the payload stays deliberately minimal (KTD-B4 item 6) — which is what
keeps the inherited posture defensible rather than merely convenient. **The boundary is recorded
now: expanding session capture beyond dogfooding — more nodes, continuous capture, or richer
payloads — requires an explicit retention and compaction decision first.** Recording it is the
point: this is a deliberate deferral with a named trigger, not a gap discovered once the store has
already grown.


### B Implementation Units

| Unit | Deliverable | Depends on |
|---|---|---|
| **B1** | WorkItem contract types + zod schema, versioned. **No DDL** | D0-3 |
| **B2** | **Migration `005_work_items.sql`** — `workflow.work_items`; nullable `work_packets.work_item_id` FK; `workflow.observed_sessions` keyed `(node_id, session_id)`; the session↔WorkItem association table with a **UNIQUE constraint on `(node_id, session_id, work_item_id)`** (KTD-D5 — the ack is a report, not an exclusion mechanism). Additive only; no `IF NOT EXISTS` (the ledger owns idempotency, and 002–004 headers state raw re-execution *should* fail loudly); every object schema-qualified `workflow.*`. **Comments carry symbol anchors and invariants, never line numbers or counts** — the file is byte-frozen from its first application | **D0-4 PO gate** |
| **B2a** | **The write paths B2's columns need, because a column with no producer is the defect this plan diagnoses.** `001:63-64` promised *"Stage 2 populates node_id from the remote execution node"*; Stage 2 landed and never wired it, and `work_packets.work_item_id` would repeat it exactly. Deliver: **(a)** `POST /work-items` creating a WorkItem from a `(source_system, source_ref)` pair — **operator-only**; without it nothing in B can bring a WorkItem into existence and B9 would require hand-written SQL. **(b)** `PATCH /packets/:id/work-item` binding a packet to a WorkItem — **operator-only**, and `work_item_id` is *never* settable through `POST /packets` (KTD-D4). **(c)** The hub materialises `workflow.observed_sessions` from `session_start`/`session_heartbeat`/`session_end` **inside the existing ingest transaction** (`store.ts:830,858`), preserving its replay-idempotency contract — a jsonb-grep view over `run_events` is rejected, because it would make B4's claim — and, later, any abandonment evaluation — depend on a payload field the abandonment case is most likely to omit | B2 |
| **B3** | **Observed-session lane** — typed `session_start`, periodic `session_heartbeat`, and typed `session_end` events carrying `session_id`, emitted on the existing node bearer, with the closed payload field set and the concrete heartbeat-gap abandonment threshold fixed here (KTD-B4 items 4–6). No packet, no scope, no run | B1, B2, B2a |
| **B4** | **Claim route** — `POST /api/workflow/work-items/:id/sessions` associating an observed session with an existing WorkItem. **Operator-only** in `OPERATOR_ONLY_ROUTES` (KTD-D5). Uniqueness is enforced by B2's constraint; the `SELECT`-derived acknowledgement follows the `EVENT-01` precedent for *reporting* the duplicate, because a duplicate insert returns no row. **An unclaim counterpart is out of this slice** — KTD-D5's table shape permits it, but its authorization is unspecified and it is not needed for B9 | B2, B2a, B3 |
| **B5** | **Read model + provenance lookup** — extend `OverviewView`/`buildOverview` (`readModel.ts:54-80`) with the WorkItem projection D0-5 defines; add `GET /work-items`, `GET /work-items/:id`, and `GET /work-items/by-ref?source=&ref=` (query parameters, not path segments — KTD-B5). `PacketView` already carries per-packet `policyScope` (`readModel.ts:43`) and the WorkItem projection keeps it per-packet rather than aggregating it | B2, B2a, D0-5 |
| **B6** | **Web UI** *(primary surface)* — extend `dashboard.ts` with a WorkItem view. **Three things it must specify rather than leave to the implementer, because this is now the primary surface and one line is not a specification.** (a) **Hierarchy:** a WorkItem may own 0..n packets and 0..n sessions — state whether packets nest inside the WorkItem card and whether sessions render per-packet or as a flat WorkItem-level list, and what the reader sees first when a WorkItem owns several packets. (b) **Observed versus authoritative must be visible**, not merely true in the schema: an unclaimed session read as a supervised run at the one place a human looks defeats KTD-D5 entirely. Use the existing state-tag convention (`.tag.scope`, `.tag.done`, `.reason.stale`). (c) **Empty states** follow the existing `.empty` convention per subsection — B9's dogfooding WorkItem starts packet-less and session-less, so this is day-one behaviour, not an edge case. **The WorkItem view renders no attention** (KTD-B1); the existing packet-level attention rendering is untouched | B5 |
| **B7** | **`awcp status`** *(secondary)* — a `get()` helper beside the existing `post()` (`awcp.ts:167`) consuming the same read model. Credential resolution unchanged (`resolveApiKey()`, `:159`). Record beside the CLI's docblock (`:373-387`) why a *read* does not breach the supervision boundary those absent subcommands protect | B5 |
| ~~**B8**~~ | **Deferred to the attention milestone** by PO decision (KTD-B1). Its contract change, its Red/Green Control, and its non-vacuity and discrimination guards are specified in KTD-B6 so the milestone inherits them | — |
| **B9** | **Dogfooding** — a WorkItem created through B2a carrying its own `AW-NNN` (KTD-D2) plus `source_system='story-board'`, `source_ref='ST-097'` as **provenance**, answerable over HTTP by a caller holding no UUID. The `ST-NNN` is the reference, not the identity — which is the distinction this whole restructure exists to draw, demonstrated on one real item. **State in the artifact that the story-board reference is hand-maintained and carries no sync guarantee** — A6 is held to an *enforced* sync precisely because discretionary bookkeeping is this repo's documented failure, and dogfooding beyond a single item needs the same bar before it expands | B2a, B5, A2 |

**Known wart, left alone and said so:** `PacketStatus` declares `in_progress` and `blocked`
(`types.ts:40`) and no code path can write either — `setPacketStatus` was deliberately deleted
(`api.ts:6-10`). Status renders `open` for everything in flight. Render honestly rather than
inferring a status the server does not hold.

---

## Verification Contract

**Local proof only. Nothing is pushed, and the Definition of Done contains no PR.** The first
version defined its proof loop as ending in "commit and PR under CE" while its own Scope Boundaries
barred pushing — an unreachable DoD (coherence finding). Standing instruction is that branches stay
local, so verification is defined against the local tree.

**Every verification record is anchored to a commit SHA, not a date.** `.github/workflows/ci.yml`
triggers only on `main` and PRs targeting `main`, so a PR into a feature branch runs **no CI at
all** and the local run is the only gate. A Point-in-Time Result expires silently when its surface
changes by any hand (`verification-expires-when-the-verified-surface-changes.md`), and D0/A/B may
land out of order.

| Unit | Check | Passes when |
|---|---|---|
| D0-1 | ADR-017 exists, status recorded | Carries the layering supersession, the reader instruction on `ADR-013:116`, and KTD-D2's open decision with both options |
| D0-4 | ADR-016 §3 revisit recorded | Returns an explicit permit-or-defer for B2 |
| A1 | `node ~/.claude/gsd-core/bin/gsd-tools.cjs query agent-skills <agent>` | Emits a **directive**, not a skip warning — **plus one observed CE-skill execution inside a GSD agent** |
| A2 | Allocate a test ID; then allocate the same from a second branch | First succeeds; second produces a **merge conflict**, not a silent duplicate |
| A2 | Every ID in the board appears in `story-ids.md` | Including `ST-095`, which lives only on `docs/gsd-ce-drive-direction` |
| A5 | `git log --grep` per staged entry | Each verified against the tree before staging |
| A7 | `grep -rl 'story-board'` partitioned | No file in the **edit set** describes the board as the forward queue; no file in the **frozen record** is modified |
| B2 | Migration applies; `DROP SCHEMA workflow CASCADE` leaves nothing | Teardown remains one statement |
| B4 | Replay a claim | One association, and the ack is `SELECT`-derived |
| B5 | `GET /work-items/by-ref/story-board/ST-097` | Resolves without a UUID |
| B — attention | **No attention row here, deliberately.** The zero/one control and its guards move to the attention milestone (KTD-B6). A slice-level attention assertion would be the creep **stop condition 4** exists to catch |
| B6 | The WorkItem view renders no attention | Packet-level attention rendering is unchanged; nothing new is added |
| B — all | **Fabrication guard** | An observed session never claimed leaves `work_packets` row-count unchanged and creates no `policy_scope` value anywhere |
| B — all | **Credential parity matrix** | Per added route, agent key → expected status. Operator-only routes return **403** (authenticated, not authorised), distinct from 401 |
| B6 | **UI/agent read parity** | Every field the UI renders for a WorkItem is retrievable by an agent-key GET. Assert on the field set, not a sample response |
| A2 | Mint on branch X, then attempt the same id on branch Y **before** X's allocator line reaches `main` | Y is rejected at **mint** time, not at merge — the provisional rule (KTD-A2) is what makes this pass |
| A5 | Per staged candidate: a **tree-level** check with recorded evidence | `git log --grep` alone does not pass — it matches reverted commits and misses differently-worded real ones |
| A5 | Run the conversion step into a scratch milestone | Every staged candidate appears in the generated `REQUIREMENTS.md`; a candidate that does not is a failed staging, not a deferred one |
| A6 | Break the boundary-sync check deliberately | It **fails**. A check never observed failing is not known to work (`CONCEPTS.md` — Red/Green Control) |
| B2a | Create a packet through `POST /packets` with a `workItemId` in the body | Rejected or ignored — the binding is operator-only (KTD-D4) |
| B4 | Two concurrent identical claims | One association row. The **UNIQUE constraint** is what passes this, not the `SELECT` ack |
| B5 | `GET /work-items/by-ref?source=github&ref=%2357` | Resolves — `#57` survives the round trip. Also test `PROJ-1234` and `ST-097` |
| **End-to-end** | Create a WorkItem (B2a) → observe a session (B3) → claim it (B4) → read it (B5) → see it in the UI (B6) | **One item travels the whole chain.** Without this row every link is proven in isolation and the slice can pass while not being end-to-end |
| All | `git log --format='%H %(trailers:key=Story,valueonly)' main..HEAD` | **Every** commit on the branch returns `ST-097`. `git log -1` inspects one commit and would pass against the ~34-commit population the original finding was about |

**Scope the test run to the deliverable.** D0-1/D0-2/D0-4 and all of A change no server code and run
no Deno suite. B runs the workflow-touching files only:

```
docker compose --profile test exec mcp-test deno test --frozen --allow-net --allow-env \
  --allow-read --allow-write=/tmp --allow-run=deno,git tests/workflow-*.ts tests/awcp-cli.test.ts
```

**Confirm the bind mount before trusting any `exec` run.** This work is being done from a worktree,
and `docker compose exec mcp-test` reaches whichever checkout ran `up` — a green suite that never
executed the edited code is the documented failure mode
(`verify-worktree-change-against-docker-test-stack.md`). **Any new test that spawns a process must
be added to `CLAUDE.md`'s hand-maintained `--allow-run` inventory in the same change** — that
comment block is the inventory; its grep is explicitly "a starting point."

## Definition of Done

**If D0-4 is declined, "done" means D0-1..D0-3 and B1 only** — the contract, the glossary, and the
types. Workstream B ships nothing operator-visible, and B2 onward sequences behind ST-088 Phase 4.
The criteria below describe the **granted** branch.

D0 has a recorded contract and a PO decision on storage; `CONCEPTS.md` defines Work Item and no
longer roots containment at the packet. A's three responsibilities are three artifacts, the
allocator rejects a duplicate at mint time rather than at merge, and authority hands over at the
milestone boundary rather than by rewriting a live milestone. B answers *"what is the state of
ST-097?"* over HTTP to a caller holding no UUID and renders it in the web UI — creating no packet
and no policy scope anywhere along the way.

**It does not answer *"which one needs me?"***. Attention is deferred to the post-continuity
milestone by PO decision (KTD-B1), so this slice is neither done by producing attention nor undone
by lacking it. That question was the original motivation, and the deferral is the trade the PO took
to avoid defining attention semantics over a provisional session signal.

## Scope Boundaries

- **No `ST-NNN` is minted by this plan.** Provisional names only, until A2 lands.
- **`.planning/STATE.md` is not touched.** Concurrent session's.
- **Nothing is pushed.** No remote branch for either local branch.
- **`999.x` is not used.** KTD-A3.
- **`ADR-013` is not edited.** KTD-D1; the supersession is recorded in ADR-017.
- **Horizon B–D milestone *content* is not authored.** Baseline decision 3; A5 stages candidates, it
  does not write requirements.
- **Observed-session attention rules and attention rendering** — deferred to the post-continuity
  milestone by PO decision (KTD-B1), with the contract change and every control specified in KTD-B6
  so nothing is rediscovered. **The requirement is deferred, not dropped.**
- **A session-data retention subsystem** — session events inherit the run-event posture; expanding
  capture past dogfooding is gated on an explicit retention and compaction decision (KTD-B7).
- **Arming the completion gate** — real (criteria are curl-only, so zero required criteria means a
  packet completes unconditionally) and deliberately not this slice.
- **Workflow MCP tools** — deferred, and **the blocker is auth, not taste**: `requireApiKey`
  validates `MEMORY_API_KEY` only and is applied to `/mcp`, so `AWCP_AGENT_API_KEY` does not
  authenticate there at all. Mounting workflow writes on `/mcp` today would run every agent as
  *operator*. `server/tests/workflow-boundary.test.ts` also allow-lists workflow imports and
  deliberately excludes `../auth.ts`. Record the blocker, not just the deferral.
- **Agent creates a WorkItem** — Later, and must never be reached by inference from an observed
  session.
- **Retiring `docs/plans/`** — the milestone row named it alongside the board; only the board half is
  in scope.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| **D0-4 is declined** and B2 cannot land | B1 and B5–B7 proceed against a contract-only substrate; B2–B4 sequence behind ST-088 Phase 4. Stated as stop condition 1 rather than discovered mid-build |
| **Migration `005` becomes byte-frozen the moment any database applies it** — checksum is over raw bytes, drift aborts the run and exits the server before the port opens, and CI/`db-test` stay green regardless, so only the dev database and live hubs show it | Write its comments with symbol anchors and invariants, never line numbers or counts. Get them right before it lands: correcting an applied migration is an operational change on every database, and never re-runs statements. **This is also the reversal cost D0-4 must be priced against** (KTD-D3) — dropping the whole schema is cheap, changing `005` afterwards is not |
| **The attention milestone will change every existing `AttentionItem` consumer** — `dashboard.ts`, `readModel.ts`, the CLI | KTD-B6 records that cost and takes it deliberately, rather than forking a second attention queue the operator would have to watch separately. Deferring the unit does not defer the cost; it defers paying it |
| The runtime flip breaks the Copilot path this repo still documents | Measure the ~118 references first; A6 documents which path is supported |
| A5 stages stale claims into a fresh record | Per-entry `git log --grep` before staging; strip frozen pass-counts |
| **The GSD replacement inherits the board's own failure mode** — `story-board-stale-updates-2026-06-19.md` records staleness recurring 3+ times because nothing tied a merge event to a board update | A6 must produce an **enforced** sync, not a remembered step, or the migration reproduces what it was meant to fix |
| A fifth story-number collision | A2 is a hard prerequisite for any mint; this plan mints nothing |
| Deleting the board's queue role breaks something silently | Nothing mechanical depends on it — which is the danger. A7 ships with A6 |
| WorkItem duplicates existing columns (`work_packets.repository`/`branch`, `evidence_items.detail`, `checkpoints.repo_commit`) | D0-1 states which is authoritative for what; the packet keeps its repo binding, the WorkItem carries external identity |

## Open Questions — all settled 2026-08-24

*(All six open questions from the 2026-08-24 review round were settled by the PO the same day. They
are recorded in their KTDs — **OQ1** → KTD-D2 (`AW-NNN`, a separate AWCP-native namespace);
**OQ2** → KTD-D3 (narrow override, migration `005` only); **OQ3** → KTD-A5 (split once A2 makes safe
allocation possible); **OQ4** → KTD-B1 (attention deferred to the post-continuity boundary);
**OQ5** → KTD-B7 (inherit the run-event retention posture, with the expansion boundary recorded);
**OQ6** → KTD-A4 (ST-096 coordinated, confirmed). Nothing in this plan is now waiting on a decision
except the D0-4 gate itself, which is a unit rather than a question.)*

**The one thing still open, and it is a unit not a question:** D0-4. The PO has settled *how broad*
the override should be; granting it is the gate B2 waits on.

---

## Review disposition

### Round 2 — 2026-08-24 (seven in-process reviewers + three cross-model legs)

| Finding | Source | Disposition |
|---|---|---|
| **P0 — an ADR-016 §3 revisit cannot lift §1's host bar** (§3 is *"not a host decision"*) | adversarial | **Applied.** KTD-D3 rewritten: D0-4 is an explicit **override** of §1 plus the §3 revisit, and the error is left visible so it is not re-derived |
| **A4/A5 drain the board inside the live milestone** — P0-2 surviving under new unit names | adversarial | **Applied.** Both gated on ST-088; only A1–A3 run inside the live milestone |
| **B8 is unimplementable — `AttentionItem.packet_id` non-nullable, closed reason union** | feasibility (100) | **Applied**, then **superseded by the PO's OQ4 decision.** KTD-B6 named the contract change and its cost; attention then left the slice entirely, so KTD-B6 now carries the analysis forward to the attention milestone rather than gating a unit here |
| **No path creates a WorkItem** | product-lens, feasibility (100), product-lens-codex — **triple** | **Applied.** New unit B2a |
| **`work_packets.work_item_id` written by no unit** — the `node_id` defect repeated | feasibility (100) | **Applied.** B2a(b), operator-only |
| **`observed_sessions` has no named writer** | feasibility (100), adversarial-codex | **Applied.** B2a(c), materialised inside the existing ingest transaction |
| **Claim route names no authorized claimant** | security-lens, security-lens-codex | **Applied.** Operator-only; KTD-D5 names the credential and the reason the runs precedent does not carry |
| **Claim idempotency has no database invariant** | adversarial-codex | **Applied.** UNIQUE on `(node_id, session_id, work_item_id)`; the `SELECT` ack reports, it does not exclude |
| **`session_id` is forgeable across nodes** | security-lens, security-lens-codex | **Applied.** Everything keys on `(node_id, session_id)` |
| **KTD-D4's "structural impossibility" is overstated** | security-lens | **Applied.** Corrected; the agent-packet route is named and the binding write made operator-only |
| **Allocator conflicts only at merge, after the id is used** | adversarial, adversarial-codex | **Applied.** Allocation is provisional until its line reaches `main` |
| **A5's `git log --grep` is not tree verification** | adversarial-codex | **Applied.** Tree-level check with recorded evidence per candidate |
| **Staged backlog has no ingestion path** | adversarial-codex | **Applied.** A5(c) delivers the conversion step and makes it a pass condition |
| **B5→B2 dependency contradicts the declined branch** | coherence (100), product-lens | **Applied.** The declined branch is restated honestly: B ships nothing operator-visible |
| **D0 lineage claim overstates `:92` and `:199`** | adversarial | **Applied.** Restated as a deliberate re-expansion justified by the 0..n need |
| **KTD-B5 overstates the read gap** (`/overview` needs no UUID) | feasibility | **Applied.** Corrected to external-reference resolution plus completed-packet reach |
| **OQ2/3/4 gate B3/B8 with no stop condition** | feasibility, adversarial-codex, product-lens-codex | **Applied.** Settled in KTD-B4. They stay settled after the OQ4 decision because the *events* are contract; only the threshold *value* moved to KTD-B6 |
| **`#57` cannot travel in a path segment** | adversarial-codex, feasibility | **Applied.** `by-ref` takes query parameters |
| **`git log -1` verifies one commit, not the population** | adversarial | **Applied.** Branch-range assertion |
| **WorkItem status has no aggregation rule** | product-lens-codex | **Applied.** New unit D0-5 |
| **Removing the WIP limit leaves no replacement policy** | product-lens-codex | **Applied.** A6(a) |
| **A6 promises enforced sync with no mechanism** | adversarial-codex | **Applied.** A6(b), with a deliberate failing case |
| **A1's gate is a reference count, not a compatibility result** | adversarial-codex | **Applied.** Pre/post compatibility matrix |
| **B6 under-specifies the primary surface** (hierarchy, observed-vs-authoritative, actionability, empty states) | design-lens ×4 | **Applied.** B6 expanded |
| **KTD-B1 omits decision 4's "not the first horizon" clause** | adversarial | **Applied.** Departure recorded with its reason; OQ4 puts the alternative to the PO |
| **No end-to-end verification row** | product-lens | **Applied.** One item travels the whole chain |
| **DoD has no declined branch** | scope-guardian | **Applied.** Stated before the criteria |
| **KTD-A4 absent from the OQ rollup** | scope-guardian | **Applied.** OQ6 |
| **33 vs 35 Backlog count** | coherence (100) | **Applied.** |
| **B9's story-board mirror has no sync guarantee** | product-lens | **Applied.** Stated in B9 |
| Narrow the slice — move attention past the continuity boundary | product-lens-codex | **PO decision — OQ4.** A scope fork against a stated requirement, not an error |
| One story number vs three | scope-guardian | **PO decision — OQ3.** |
| Data lifecycle / retention policy | security-lens-codex | **PO decision — OQ5.** |
| B5 reads lack object-level authorization | security-lens-codex | **Recorded, not fixed.** Pre-existing: `/overview` already returns every active packet to any authenticated caller, deferred to Stage 2 by `001_workflow_schema.sql`. Named in KTD-B3 so the parity test is not misread as an authorization proof |

**Note on this table's stop-condition references.** Round 2 added stop conditions numbered 5 and 6;
the PO's 2026-08-24 decisions then replaced conditions 4–6 wholesale (attention creep, retention
boundary, minting). The dispositions above are unchanged in substance — only the slot numbers moved.

**Coverage.** Seven in-process reviewers returned (coherence, feasibility, product-lens,
scope-guardian, adversarial, security-lens, design-lens). Three cross-model legs returned through
Codex/GPT-5.6-luna with `independence_verified: true` (adversarial, product-lens, security-lens).
**The `whole-doc` cross-model sweep failed** — output-idle at 480 s and reaped — so the broad
different-model read of the whole document did not happen, for the second consecutive round. Every
finding above is either in-process or from a lens-scoped peer; none has whole-document cross-model
coverage.

### Round 1 — 2026-08-23 (five reviewers)

Every finding from that pass, dispositioned.

| # | Finding | Disposition |
|---|---|---|
| **P0-1** | KTD3's mint returns already-allocated `ST-093` | **Resolved by restructure.** KTD-A2 replaces derivation with an append-only record-at-mint registry (A2). The reviewer's own `max()`-over-history fix is also rejected — it is still a derivation, which the PO barred |
| **P0-2** | U1/U4 rewrite live-milestone artifacts the origin bars | **Resolved.** `REQUIREMENTS.md:66` and the three ROADMAP pointers are ST-088-milestone-scoped and expire at the boundary. U1 deleted. Project-level restatements in `PROJECT.md` handled at A6 through the document's own Evolution mechanism |
| **P1** | Packet provenance makes R2 unimplementable | **Resolved.** R2 reworded to observed session + explicit claim (KTD-B2, B3, B4). Nothing fabricates a packet or a scope; KTD-D4 removes the field |
| **P1** | Attention queue is near-total noise on day one | **Resolved twice over.** Round 2 specified B8's Red/Green Control, non-vacuity guard, and positive discrimination on rules 3/4/5; the PO's OQ4 decision then removed attention from the slice altogether, so the noise cannot occur here at all. The controls survive in KTD-B6 for the milestone that does ship it |
| **P1** | `999.x` is GSD's icebox, so R3's "GSD sequences it" is false | **Resolved.** KTD-A3; forward work stages as requirement candidates and converts at the boundary |
| **P1** | ~34 migration commits omit the `Story:` trailer | **Resolved.** Trailer stated inline and verified mechanically; carried in the dispatch brief, not by reference |
| **P1** | No `awcp` on PATH; SessionEnd never fires on a crash | **Re-scoped.** No hook shells out to `awcp`. Capture is on the node lane with the node bearer. The crash case is OQ4 |
| **P1** | Plan bars pushing while its proof needs a PR | **Resolved.** Verification Contract defines local, commit-anchored proof; DoD contains no PR |
| **P1** | ST-097 could never legally enter In Progress | **Resolved.** D0 and A1–A2 are doc/config work; the WIP question is settled at A6, and the transition no longer depends on a slot ST-088 holds |
| **P1** | Seven units span three separable stories | **Resolved.** That is now the structure: D0 / A / B, independent after D0 |
| **P1** | U5's 77-file sweep has no edit/frozen partition | **Resolved.** A7 partitions before editing |
| **P1** | Baseline decision 4 (web UI primary) never addressed | **Resolved.** KTD-B1; B6 is the primary surface and B7 is explicitly secondary |
| **Error** | "read-time join without DDL" is false | **Corrected, and it was worse than found.** `agent_runs.node_id` is `text` with no FK; `execution_nodes.node_id` is `uuid`. Not type-compatible, so no join exists at all. B2 owns the association |

## Sources & Research

- [`awcp-spec-evaluation.md`](../investigations/awcp-spec-evaluation.md) §1 (*"models WorkItems → WorkPackets → AgentRuns"*), `:159-167` (the authority matrix), `:177` (storage layout open, and the ADR-016 §3 revisit requirement), `:113` (contract-first, storage-disposable), `:138-147` (the increment ladder, climbed inverted)
- [`awcp-strategy-baseline-2026-08.md`](../investigations/awcp-strategy-baseline-2026-08.md) — the six decisions; *"What is blocked, and on what"*; `:140-152` (the `ADR-013:116` reader instruction)
- [`awcp-external-evidence-import-2026-08.md`](../investigations/awcp-external-evidence-import-2026-08.md) `:261-262` (authoritative vs observed), `:282` (`turn/completed` ≠ work item completed), `:230-241` (managed-runtime-or-nothing for live state)
- [`ADR-016`](../design/adr/ADR-016-awcp-consolidation-host-topology.md) `:57` (the host gate), §3 (storage layout)
- [`ADR-013`](../design/adr/ADR-013-platform-product-definitions.md) `:116` (§4(b), *"the WorkPacket model"*)
- [`CONCEPTS.md`](../../CONCEPTS.md) `:7` (containment root), `:11-14` (Work Packet), `:51-54` (Policy Scope), `:70-75` (Story), Verification Practice (Red/Green Control, Non-Vacuity Guard, Discrimination, Point-in-Time Result)
- `server/db/workflow/001_workflow_schema.sql`, `003_execution_nodes.sql`, `004_run_events.sql`; `server/src/workflow/policy.ts:65-70`, `readModel.ts:54-80`, `attention.ts:26,44,105-126`, `dashboard.ts`, `api.ts:6-10,557`; `server/scripts/awcp.ts:159,167,307,373-387`
- `docs/solutions/conventions/a-credential-format-gate-is-not-an-authorization-gate.md` — name the authoritative set **and its writer**
- `docs/solutions/conventions/an-applied-migrations-body-is-byte-frozen.md` — migration 005's comment discipline
- `docs/solutions/workflow-issues/gsd-commit-helper-omits-story-trailer.md`, `story-board-stale-updates-2026-06-19.md`, `verify-claimed-work-before-rebuild-cross-clone-2026-07-03.md`, `verify-worktree-change-against-docker-test-stack.md`, `verification-expires-when-the-verified-surface-changes.md`, `delegate-the-doing-keep-the-checking.md`
