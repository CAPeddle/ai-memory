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
  execution/session → status → web UI → actionable attention.

**Authority hierarchy.** [`awcp-strategy-baseline-2026-08.md`](../investigations/awcp-strategy-baseline-2026-08.md)
and its six decisions bind. [`ADR-016`](../design/adr/ADR-016-awcp-consolidation-host-topology.md)
outranks everything on the host question, and **D0-4 exists specifically to satisfy its §3 revisit
requirement rather than to route around it.** [`ADR-013`](../design/adr/ADR-013-platform-product-definitions.md)
is Accepted and D0 amends its §4(b) layering by supersession, not by edit.
[CLAUDE.md](../../CLAUDE.md) governs conventions and merge rules.
[ST-096's plan](2026-08-23-2210-chore-st096-gsd-milestone-realignment-plan.md) is **coordinated
with, not superseded** — see KTD-A4.

**Stop conditions:**

1. **Stop if D0-4 does not return a PO decision on storage.** B's persistence is gated on an
   explicit ADR-016 §3 revisit. Proceeding without it is precisely the *"silently resolved by
   whoever writes the first migration"* failure `awcp-spec-evaluation.md:177` names.
2. **Stop if the allocator (A2) is not in place before any new `ST-NNN` is minted.** This plan mints
   none, and neither may anything downstream of it until A2 lands.
3. **Stop if the runtime flip (A1) does not produce an *observed* CE-skill execution inside a GSD
   agent.** A config diff is not the proof; a skipped-with-warning line means the mechanism is
   absent.
4. **Stop if B's zero-attention requirement is met by suppression.** The healthy-session zero is
   only evidence when its Red/Green Control shows the abandoned case producing exactly one item.

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
- **The WorkItem layer was dropped between the Tier-2 evaluation and the Tier-1 record.**
  `SRS.md:268` and `awcp-spec-evaluation.md:92`, `:199` all say *"the WorkItem/WorkPacket model"* —
  but `ADR-013:116` (**Accepted**) and `ADR-016:120`, the decisions of record, say only *"the
  **WorkPacket** model."* That divergence is the whole answer: the layer above packets exists in
  prose and in no decision.
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

**KTD-D2 — Whether `ST-NNN` is the human-facing identifier for AWCP-native work is an OPEN DECISION
reserved to the PO, with a recommendation, not a settled matter.**
*(session-settled: user-directed — that it stays open. The PO instructed it must not be inferred from
the development ledger. Rejected alternative: settling it inside this plan.)*

The PO instructed explicitly: *"Determine explicitly whether ST-NNN is the intended human-facing
identifier for AWCP-native work. Do not infer this from the current development ledger."* This plan
therefore **does not settle it**. D0-1 records the decision with its two options and their
consequences:

- **Option 1 — AWCP-native work gets its own human-facing id** (e.g. `AW-NNN`), allocated by AWCP's
  own persistence. `ST-NNN` stays a *provenance reference* on dogfooded items
  (`source_system = 'story-board'`). Keeps the two concerns fully separable; costs a second
  vocabulary.
- **Option 2 — `ST-NNN` is reused as the human-facing id for AWCP-native work.** One vocabulary, but
  it couples product data to a development-ledger allocator, and A2's allocator would have to serve
  two masters with different concurrency properties.

**Recommendation: Option 1.** The PO's own framing — "two different ticket/work-item concerns … do
not assume these are the same persistence or lifecycle mechanism" — argues for it, and Option 2
recreates inside AWCP the coupling this plan exists to remove. **Recorded as a recommendation; the
decision is the PO's and B's dogfooding unit (B9) is written to work under either.**

**KTD-D3 — Storage is gated on an explicit ADR-016 §3 revisit, which is the mechanism the repository
already defines.**

`ADR-016:57` bars schema work that *assumes the host*. `awcp-spec-evaluation.md:177` says storage
layout is *"a module-design decision, not a further PO decision"* but must not be *"silently
resolved by the first migration author without revisiting ADR-016 §3."* **D0-4 performs that
revisit.** The recommendation it carries: an additive migration `005` inside the existing `workflow`
schema, which does not assume Candidate A permanently because teardown remains the single
`DROP SCHEMA workflow CASCADE` — this is the repo's own *contract-first, storage-disposable* rule
(`awcp-spec-evaluation.md:113`, baseline decision 1) applied as written.

**This is a PO gate, not a decision this plan takes.** If the PO declines, B1 (contract) and B5–B7
(read model, UI, CLI shape) still proceed against an in-memory/contract-only substrate, and B2–B4
sequence behind ST-088 Phase 4.

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

**Its real product cost, stated rather than discovered later:** a dogfooding WorkItem for ST-097
cannot promote anything to memory until a packet is attached to it.

**KTD-D5 — Association between an observed session and a WorkItem is an explicit claim, never an
inference, and it lives in its own table.**

Three candidate homes were considered: a column on `run_events`, a column on WorkItem, or an
association table. **Association table**, because it is the only one that permits many sessions to
one WorkItem, re-claiming, and unclaiming — and because `run_events` must stay structurally
incapable of implying supervised work (it carries no run, no packet, and no scope, which is exactly
what makes it the honest home for *observed* state).

**Observed vs authoritative becomes a schema fact, not a naming convention:** an observed session
lives on the `run_events` node lane and is reachable only through `execution_nodes`; an authoritative
execution is an `agent_runs` row under a packet. Nothing converts one into the other implicitly.
This is the two-axis capability contract from
[`awcp-external-evidence-import-2026-08.md:261-262`](../investigations/awcp-external-evidence-import-2026-08.md)
applied to persistence.

### D0 Implementation Units

| Unit | Deliverable | Depends on |
|---|---|---|
| **D0-1** | `ADR-017 — The AWCP WorkItem contract`: identity, provenance pair, relation to packet/run/session, the ADR-013 §4(b) layering supersession with its reader instruction, and KTD-D2's open decision recorded with both options | — |
| **D0-2** | `CONCEPTS.md`: new **Work Item** entry; amend `:7` (the containment root is no longer the packet); amend **Work Packet** `:11-14` to name its optional parent; state the Work Item ↔ Story relation explicitly so the two vocabularies stop being adjacent-but-unlinked | D0-1 |
| **D0-3** | Versioned TypeScript contract in `server/src/workflow/types.ts` + `schema.ts` — **types and zod only, no DDL** | D0-1 |
| **D0-4** | **PO gate.** An ADR-016 §3 revisit recording the storage-layout decision, per `awcp-spec-evaluation.md:177`. Returns permit-or-defer for B2 | D0-1 |

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

Allocation is: append the next unused line, commit **that file alone**, then read back. A concurrent
allocator on another branch produces a *merge conflict on adjacent appended lines* — which is a
loud, resolvable failure, and is exactly the property the four-way `## Backlog` conflict already
demonstrated the board can produce. Deriving from history produces a *silent duplicate* instead.

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
schedulable-work semantics are used". Rejected alternative: 33 Backlog entries migrated as `999.x`.)*

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
*(NOT settled — this is my narrowing of the PO's 2026-08-23 decision, on new evidence, and it is the
one decision in this plan awaiting confirmation rather than recording one.)*

*(This narrows a prior PO decision, and the change is flagged rather than made quietly.)* The
previous round settled *"ST-097 supersedes ST-096; land its branches first."* That rested on the
belief that A required rewriting live milestone artifacts, which the milestone-scoping finding
above removes. ST-096 is a pure **sequencing** plan (`execution: docs`) that authors no requirement
and no ROADMAP content, and schedules the ST-088 → Horizon B–D boundary. That boundary is now
precisely where A6 hands authority over. **ST-096 therefore becomes the boundary gate A6 consumes.**
The branch-landing half of the prior decision stands unchanged.

### A Implementation Units

| Unit | Deliverable | Depends on |
|---|---|---|
| **A1** | **Runtime flip.** `.planning/config.json` → `"runtime": "claude"`; resolve `claude_md_path` (it points at `./.github/copilot-instructions.md`, which `CLAUDE.md` itself records as architecturally stale, so repo governance is currently invisible to every GSD agent); populate `agent_skills`. **Measure the ~118 `runtime` references in `bin/lib/` before flipping**, not after — it decides config home, skills base, command materialisation, agent install, and model resolution | — |
| **A2** | **The allocator.** Create `.github/planning/story-ids.md` seeded with every currently-allocated ID (`ST-001`…`ST-097`, including `ST-095` which lives on `docs/gsd-ce-drive-direction`); write the mint procedure into `CLAUDE.md`; add a mechanical check | — |
| **A3** | **Land or lift the two open branches.** `docs/gsd-ce-drive-direction` (4 commits) and `docs/awcp-strategy-baseline` (7 commits, this plan's home). Resolve the **four-way** `## Backlog` conflict by keeping all four entries (ST-094 from `main`, ST-095, ST-096, ST-097). **Do not merge `docs/st-093-entity-queue-isolation`** — merge-base 3 commits behind `main`, diff sums to 175 additions / 7,860 deletions; lift content, never merge | A2 |
| **A4** | **Freeze the archive.** The 48 `## Done` + 6 `## Archived` entries are relabelled an append-only delivery ledger and stop being edited. **It no longer mints** — that moved to A2. Strip frozen pass-counts per `verify-worktree-change-against-docker-test-stack.md` §4, which names this file by line as carrying the anti-pattern | A3 |
| **A5** | **Stage forward work.** The 35 `## Backlog` entries → `.planning/backlog-candidates.md` as requirement candidates, each verified against the tree with `git log --grep` before staging (`verify-claimed-work-before-rebuild-cross-clone-2026-07-03.md`: *"a written claim about it is a hypothesis to test"*). **Do not stage ST-088** — it *is* the live milestone. Acceptance criteria that cannot survive `gsd-roadmapper`'s 3–5-criteria compression route to per-phase `SPEC.md` | A3 |
| **A6** | **Boundary handover** *(gated on ST-088 close; consumes ST-096's sequencing)*. Amend `PROJECT.md:59`, `:60`, `:77` through its own Evolution mechanism; add a `.planning/` tier to `CLAUDE.md`'s source-of-truth precedence; rewrite the Workflow gate's minting clause to name A2's allocator and drop the WIP limit in favour of sequential drive; decide squash-vs-merge deliberately for milestone-scoped GSD work | A2, A4, A5, ST-088 |
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

**Shape:** WorkItem → associated execution/session → status → **web UI** → actionable attention.

### B Key Technical Decisions

**KTD-B1 — The web UI is the primary product surface; `awcp status` is a secondary diagnostic that
consumes the same read model.**
*(session-settled: user-directed — baseline decision 4, reaffirmed 2026-08-24. Rejected alternative:
a CLI-first slice with the UI deferred, which is what the previous version built.)*

Baseline decision 4 made the web UI primary, superseding `awcp-spec-evaluation.md`'s increment-7
deferral. The first version of this plan built a CLI-first slice and never addressed that — a
product-lens finding. Corrected here. `server/src/workflow/dashboard.ts` already renders attention,
runs, checkpoints, decisions and criteria (405 lines, single-file HTML), so the UI unit **extends an
existing surface** rather than creating one. The CLI is "secondary" only if it is literally a second
client of one read model, not a parallel implementation.

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
route is agent-callable the moment it lands. The claim route is **reporting-class** on the
`POST /packets/:packetId/runs` precedent — attaching execution to already-supervised work is
reporting, not supervision. The four operator-only routes stay operator-only for every
WorkItem-shaped successor.

**KTD-B4 — Per-session identity enters the event contract now, not later.** `client_seq` is
per-*node*. Two concurrent sessions on one machine share one `node_id` and one counter, so their
events interleave indistinguishably — which directly contradicts the product contract's operator
*"running several concurrent AI-assisted development sessions."* A client-generated, opaque,
non-authoritative `session_id` belongs in the event payload from the first slice; retrofitting it
after events exist is a migration plus a reconciliation.

**KTD-B5 — Provenance lookup is a first-class route, and it is the single largest reason the module
is unusable today.** `api.ts` exposes exactly two GETs — `/overview` and `/packets/:packetId`. Every
read therefore requires a UUID the caller has no way to obtain. An agent or operator holding only
`ST-097`, a Jira key, or `repo`+`branch` must be able to resolve it.

### B Implementation Units

| Unit | Deliverable | Depends on |
|---|---|---|
| **B1** | WorkItem contract types + zod schema, versioned. **No DDL** | D0-3 |
| **B2** | **Migration `005_work_items.sql`** — `workflow.work_items`; nullable `work_packets.work_item_id` FK; `workflow.observed_sessions` + the session↔WorkItem association table. Additive only; no `IF NOT EXISTS` (the ledger owns idempotency, and 002–004 headers state raw re-execution *should* fail loudly); every object schema-qualified `workflow.*` | **D0-4 PO gate** |
| **B3** | **Observed-session lane** — typed `session_start` / `session_end` events carrying `session_id`, emitted on the existing node bearer. No packet, no scope, no run | B2, KTD-B4 |
| **B4** | **Claim route** — `POST /api/workflow/work-items/:id/sessions` associating an observed session with an existing WorkItem. Classified reporting-class in `policy.ts`. Idempotent on the `EVENT-01` precedent: a replayed claim yields one association, and the acknowledgement is derived by `SELECT`, not from the insert's result | B2, B3 |
| **B5** | **Read model + provenance lookup** — extend `OverviewView`/`buildOverview` (`readModel.ts:54-80`); add `GET /work-items`, `GET /work-items/:id`, `GET /work-items/by-ref/:source/:ref` | B2 |
| **B6** | **Web UI** *(primary surface)* — extend `dashboard.ts` with a WorkItem view: its packets, its observed sessions, and its attention | B5 |
| **B7** | **`awcp status`** *(secondary)* — a `get()` helper beside the existing `post()` (`awcp.ts:167`) consuming the same read model. Credential resolution unchanged (`resolveApiKey()`, `:159`). Record beside the CLI's docblock (`:373-387`) why a *read* does not breach the supervision boundary those absent subcommands protect | B5 |
| **B8** | **Attention rules for observed sessions**, with their controls — see Verification | B3, B5 |
| **B9** | **Dogfooding** — a WorkItem with `source_system='story-board'`, `source_ref='ST-097'`, answerable over HTTP by a caller holding no UUID. Written to work under either KTD-D2 option | B5, A2 |

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
| B8 | **Zero-attention + Red/Green Control** | A healthy observed session (start → heartbeats → clean close, unclaimed) yields **zero** attention items; the *same* session abandoned mid-flight yields **exactly one** |
| B8 | **Non-vacuity guard** | The evaluator asserts it inspected a non-empty set, so a wiring break cannot render as a clean queue |
| B8 | **Discrimination on rules 3/4/5** | An observed session positively does **not** trip `stale` (idle > 30 min — `DEFAULT_STALE_AFTER_MS`, `attention.ts:26`), `ended-without-checkpoint`, or `ready-for-review` (zero required criteria counts as satisfied **deliberately**, `attention.ts:105-126`) |
| B — all | **Fabrication guard** | An observed session never claimed leaves `work_packets` row-count unchanged and creates no `policy_scope` value anywhere |
| B — all | **Credential parity matrix** | Per added route, agent key → expected status. Operator-only routes return **403** (authenticated, not authorised), distinct from 401 |
| B6 | **UI/agent read parity** | Every field the UI renders for a WorkItem is retrievable by an agent-key GET. Assert on the field set, not a sample response |
| All | `git log -1 --format='%(trailers:key=Story,valueonly)'` | Returns `ST-097` |

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

D0 has a recorded contract and a PO decision on storage; `CONCEPTS.md` defines Work Item and no
longer roots containment at the packet. A's three responsibilities are three artifacts, the
allocator conflicts loudly rather than duplicating silently, and authority hands over at the
milestone boundary rather than by rewriting a live milestone. B answers *"what is the state of
ST-097?"* over HTTP to a caller holding no UUID, renders it in the web UI, produces zero attention
for a healthy session and exactly one for an abandoned one — and creates no packet and no policy
scope anywhere along the way.

## Scope Boundaries

- **No `ST-NNN` is minted by this plan.** Provisional names only, until A2 lands.
- **`.planning/STATE.md` is not touched.** Concurrent session's.
- **Nothing is pushed.** No remote branch for either local branch.
- **`999.x` is not used.** KTD-A3.
- **`ADR-013` is not edited.** KTD-D1; the supersession is recorded in ADR-017.
- **Horizon B–D milestone *content* is not authored.** Baseline decision 3; A5 stages candidates, it
  does not write requirements.
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
| **Migration `005` becomes byte-frozen the moment any database applies it** — checksum is over raw bytes, drift aborts the run and exits the server before the port opens, and CI/`db-test` stay green regardless | Write its comments with symbol anchors and invariants, never line numbers or counts. Get them right before it lands: correcting an applied migration is an operational change on every database, and never re-runs statements |
| The runtime flip breaks the Copilot path this repo still documents | Measure the ~118 references first; A6 documents which path is supported |
| A5 stages stale claims into a fresh record | Per-entry `git log --grep` before staging; strip frozen pass-counts |
| **The GSD replacement inherits the board's own failure mode** — `story-board-stale-updates-2026-06-19.md` records staleness recurring 3+ times because nothing tied a merge event to a board update | A6 must produce an **enforced** sync, not a remembered step, or the migration reproduces what it was meant to fix |
| A fifth story-number collision | A2 is a hard prerequisite for any mint; this plan mints nothing |
| Deleting the board's queue role breaks something silently | Nothing mechanical depends on it — which is the danger. A7 ships with A6 |
| WorkItem duplicates existing columns (`work_packets.repository`/`branch`, `evidence_items.detail`, `checkpoints.repo_commit`) | D0-1 states which is authoritative for what; the packet keeps its repo binding, the WorkItem carries external identity |

## Open Questions

**OQ1 — KTD-D2: is `ST-NNN` the human-facing id for AWCP-native work?** Reserved to the PO by
instruction. Recommendation recorded (Option 1, a separate `AW-NNN`); B9 works under either.

**OQ2 — What is the abandonment threshold, and does it differ from run staleness?**
`DEFAULT_STALE_AFTER_MS` is 30 minutes for supervised runs. An observed dev session idle 30 minutes
is normal; an observed session with **no heartbeat** for 30 minutes is not the same claim.
Conflating them re-imports the noise B8 exists to prevent.

**OQ3 — Is `session_id` client-generated or hub-assigned?** Client-generated matches the spool's
offline-first design and needs no round-trip; hub-assigned gives uniqueness the client cannot.
Decides the event contract, which is expensive to change once events exist. **Recommendation:
client-generated, opaque, explicitly non-authoritative.**

**OQ4 — Clean close vs crash.** The node client encodes lifecycle as `event_type: "checkpoint"` with
`payload.phase`, and its own docblock concedes clean shutdown may fail to *report* — a `SIGKILL`
never writes the stop record. So "closed cleanly" is currently decided by grepping a jsonb field the
abandonment case is most likely to omit. B3 needs a typed close signal **plus** a heartbeat-gap
threshold, or B8 cannot tell crashed from stopped.

**OQ5 — Where do the non-AWCP staged entries go?** Several Backlog entries are memory-platform work
(ST-019 Obsidian, ST-077 Qwen, ST-091 .NET SDK) with no AWCP alignment. A roadmap sequenced toward a
working AWCP product will never promote them. Decide at A5 whether the staging artifact is
acceptable parking or needs a second destination.

---

## Review disposition

Every finding from the 2026-08-23 five-reviewer pass, dispositioned.

| # | Finding | Disposition |
|---|---|---|
| **P0-1** | KTD3's mint returns already-allocated `ST-093` | **Resolved by restructure.** KTD-A2 replaces derivation with an append-only record-at-mint registry (A2). The reviewer's own `max()`-over-history fix is also rejected — it is still a derivation, which the PO barred |
| **P0-2** | U1/U4 rewrite live-milestone artifacts the origin bars | **Resolved.** `REQUIREMENTS.md:66` and the three ROADMAP pointers are ST-088-milestone-scoped and expire at the boundary. U1 deleted. Project-level restatements in `PROJECT.md` handled at A6 through the document's own Evolution mechanism |
| **P1** | Packet provenance makes R2 unimplementable | **Resolved.** R2 reworded to observed session + explicit claim (KTD-B2, B3, B4). Nothing fabricates a packet or a scope; KTD-D4 removes the field |
| **P1** | Attention queue is near-total noise on day one | **Resolved.** B8 plus a Red/Green Control, a non-vacuity guard, and positive discrimination on rules 3/4/5 |
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
