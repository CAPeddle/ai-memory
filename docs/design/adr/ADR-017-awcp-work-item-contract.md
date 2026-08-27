---
name: "ADR-017 — The AWCP WorkItem contract"
asset_type: "adr"
status: "accepted"
owners:
  - "ai-memory-maintainers"
source_path: "docs/design/adr/ADR-017-awcp-work-item-contract.md"
created: "2026-08-24"
relates_to:
  - "docs/design/adr/ADR-013-platform-product-definitions.md"
  - "docs/design/adr/ADR-016-awcp-consolidation-host-topology.md"
  - "docs/investigations/awcp-spec-evaluation.md"
  - "docs/investigations/awcp-strategy-baseline-2026-08.md"
---

# ADR-017 — The AWCP WorkItem contract

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Christopher
**Relates to:** [ADR-013](ADR-013-platform-product-definitions.md) §4(b) (Storyboard disposition — amended by supersession here), [ADR-016](ADR-016-awcp-consolidation-host-topology.md) §1/§3 (host and storage layout), [`docs/investigations/awcp-spec-evaluation.md`](../../investigations/awcp-spec-evaluation.md) §7 and `:159-167` (authority matrix), [`docs/investigations/awcp-strategy-baseline-2026-08.md`](../../investigations/awcp-strategy-baseline-2026-08.md), [CONCEPTS.md](../../../CONCEPTS.md)

---

## Context

AWCP's persistence has a packet at its root. `workflow.work_packets` is the unit of supervised
agent work — one objective, its scope and constraints, an optional repository/branch binding, a
Policy Scope, and a completion gate (`server/db/workflow/001_workflow_schema.sql:38`;
`CONCEPTS.md:11-14`). `work_packets → agent_runs` is already 0..n, so **the packet already owns
"a unit of work with many executions."**

**What has no owner is the layer above it.** One unit of *requested* work may need zero, one, or
several packets — a Jira issue whose implementation splits across two supervised objectives, a
development story observed before any packet exists at all — and requested work also arrives
carrying an identity that AWCP did not mint and must not overwrite. Neither the 0..n
requested-work-to-packet relation nor that external identity has anywhere to live: `work_packets`
carries no parent and no external reference, and `CreatePacketInput`
(`server/src/workflow/store.ts:45-53`) accepts neither.

**This ADR restores a layer above the packet on that need, and on nothing else.** It would be easy
to argue from lineage — `WorkItems → WorkPackets → AgentRuns` is the AWCP source spec's own model —
but that argument is not available and is not used here. The layer above packets was narrowed away
**deliberately**: `awcp-spec-evaluation.md:199` records the answer *"Confirmed —
absorbed/superseded. Recorded in ADR-013 §4(b)"*, which is the record of the narrowing, not
evidence of an accident. No decision of record contains the layer. Restoring it is therefore a
re-expansion, and it is justified by the 0..n-plus-external-identity gap above.

**Every primary key in the `workflow` schema is `uuid DEFAULT gen_random_uuid()`, and no table
carries a human-readable or external identifier.** The identity decision below matches that
existing convention rather than introducing one.

---

## Decision

### 1. Identity — an immutable UUID, and nothing else is the primary identity

A WorkItem is identified by `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, matching every other
table in the `workflow` schema. The UUID is immutable and is the only primary identity. Neither the
provenance pair (§2) nor the human-facing `AW-NNN` label (§4) is a primary key; both are secondary
identities that resolve *to* the UUID, and either may be absent.

### 2. Provenance — `(source_system, source_ref)`, recording external identity rather than replacing it

External identity is a **pair**, not a string:

| Column | Meaning |
|---|---|
| `source_system text` | a closed set: `jira`, `github`, `story-board`, `awcp-native` |
| `source_ref text` | the identifier in **their** namespace — `PROJ-1234`, `#57`, `ST-097` |

with `UNIQUE (source_system, source_ref)` where both are present. AWCP-native items carry
`source_system = 'awcp-native'` and a null `source_ref`.

**This is the provenance reading, and it is a restatement of an already-decided position, not a new
one.** `awcp-spec-evaluation.md:159-167` is an explicit authority matrix: *requested work,
hierarchy, status, priority, labels, fix versions* → **Jira (unchanged)**; *commits, branches, pull
requests, builds* → **Azure DevOps (unchanged)**; *agent-operational execution state — packets,
runs, checkpoints, approvals, verification mapping, transactional decisions* → the consolidated
workflow product, which holds *"authority over agent-operational execution state, **not a database
that supersedes external authorities**"* (`:159`).

**Stated here so it is not re-litigated at implementation time:** no reading of this ADR makes an
AWCP WorkItem the authority over requested work. The pair is a reference. A WorkItem never becomes
the place where a Jira issue's title, hierarchy, priority or status is decided, and no AWCP surface
may present itself as that authority.

### 3. Relation to packet, run, provider session, checkpoint — and what a WorkItem is not

**What it is.** A WorkItem is one unit of *requested* work with external provenance. It is the
parent of zero or more Work Packets: `work_packets.work_item_id` is a nullable foreign key, so
every existing packet remains valid unparented and the containment statement at `CONCEPTS.md:7`
gains a parent rather than losing its meaning. Beneath the packet nothing changes — a packet still
owns its Agent Runs, its Checkpoints under those runs, its Operational Decisions and its
Verification Criteria, and none of those acquire a WorkItem reference. A Checkpoint's relation to a
WorkItem is therefore transitive through run → packet, never direct.

**Observed sessions, and how they attach.** An *observed* provider session lives on the
`run_events` node lane and is reachable only through `execution_nodes`; an *authoritative* execution
is an `agent_runs` row under a packet. Nothing converts one into the other implicitly. Association
between an observed session and a WorkItem is an **explicit claim, never an inference**, and it
lives in its own association table — the only shape that permits many sessions to one WorkItem,
re-claiming, and unclaiming, and the only one that leaves `run_events` structurally incapable of
implying supervised work (it carries no run, no packet, and no scope).

Because this ADR says *explicit*, it names the artifact and the operation, as
[`a-credential-format-gate-is-not-an-authorization-gate.md`](../../solutions/conventions/a-credential-format-gate-is-not-an-authorization-gate.md)
requires: the
**operator credential** authorises a claim, and the claim route is **operator-only**, listed in
`OPERATOR_ONLY_ROUTES` (`server/src/workflow/policy.ts:65`) rather than in the reporting class.
The `POST /packets/:packetId/runs` precedent does not carry here — it attaches execution to
*already supervised* work, whereas a packet-less WorkItem is not supervised at all, and only the
operator knows which requested work an observed session belongs to. Uniqueness of a claim is a
**database invariant**: a UNIQUE constraint on the canonical `(node_id, session_id, work_item_id)`
triple. A `SELECT`-derived acknowledgement reports a duplicate but cannot prevent two inserts
racing; the ack pattern is borrowed from `004_run_events.sql` for its *reporting* property, not for
exclusion.

**What it is not.**

- **It is not a Policy Scope holder.** `CONCEPTS.md:51-54` — a Work Packet is the only authority for
  its own Policy Scope, the set is fixed, enforced at the database, and has no default. A WorkItem
  carries **no** scope column, so nothing can fabricate one on it. **A scope-gated operation reached
  through a WorkItem names the specific packet whose scope governs it — no WorkItem-level scope is
  ever derived, defaulted, or inferred from the set of a WorkItem's packets.** A WorkItem may own
  several packets with different scopes; choosing among them implicitly would be choosing the
  boundary, which is the silent widening that rule exists to bar. A consequence worth stating rather
  than discovering: a WorkItem with no packet cannot promote anything to memory.
  Removing the field closes the *capture* path; it does not by itself close the binding path, which
  is why the `work_item_id` binding write is operator-only and is never settable through
  `POST /packets`.
- **It is not an authority over requested work.** See §2.
- **It is not an attention surface.** A WorkItem defines no attention semantics, no attention
  reasons, and no attention rendering. Attention remains a derived, packet-level concept
  (`CONCEPTS.md:46-49`) and its extension is deferred to a later milestone by PO decision.
- **It is not a development-planning artifact.** It does not replace, mirror, or synchronise the
  story board or any GSD planning file. A Story is a development ledger entry; a WorkItem is product
  data. When AWCP dogfoods this repository's own development the Story becomes *provenance* on a
  WorkItem (§4), which is the only relation between the two.
- **It is not a status aggregator.** See §6.

### 4. Human-facing identity — the `AW-NNN` namespace, allocated from AWCP's own persistence

AWCP-native work gets its own human-facing identifier namespace, **`AW-NNN`**. `ST-NNN` stays the
development-story identity and becomes *provenance* when AWCP dogfoods its own development.

Concretely: a WorkItem carries `source_system` + `source_ref` for external identity, and an
`AW-NNN` label for AWCP-native work. A dogfooded WorkItem for this repository's own development
carries `source_system = 'story-board'`, `source_ref = 'ST-097'` **and** its own `AW-NNN` — the
`ST-NNN` is the provenance reference, not the identity.

**The allocation boundary, which is the load-bearing half.** `AW-NNN` is allocated by **AWCP's own
persistence**, where a database can enforce uniqueness directly. It is **not** allocated from the
development-story id registry (`story-ids.md`) that governs `ST-NNN`. That registry is a markdown
artifact whose concurrency control is a merge conflict; AWCP's is a constraint. **They are two
allocators by design, and that duplication is the cost this decision accepts** — the alternative
was one allocator serving two masters with different concurrency properties.

**Rejected alternatives, recorded so the decision is not reopened as if it were still open:**

| Option | Verdict | Why |
|---|---|---|
| **`AW-NNN`, allocated from AWCP persistence** | **Adopted** (PO-settled, 2026-08-24) | Keeps product data and the development ledger separate; uniqueness is a database constraint |
| Reuse `ST-NNN` as the human-facing id for AWCP-native work | Rejected | Couples product data to a development-ledger allocator with different concurrency properties — recreating inside AWCP exactly the coupling the surrounding restructure removes from the board |
| UUID only, no human-facing id | Rejected | Leaves AWCP-native work with nothing an operator can say aloud, and nothing to put in a commit or a conversation |

**This ADR allocates nothing.** It describes the namespace; no `AW-NNN` value may be minted until
the allocator that governs minting exists.

### 5. Storage layout — the same `workflow` schema, WorkItem as the packet's parent in one aggregate

WorkItem, observed sessions, and the association table live in the **existing `workflow` schema**.
WorkItem is the parent of WorkPacket in the same aggregate. **No second schema is introduced.**

This is the decision that [ADR-016](ADR-016-awcp-consolidation-host-topology.md) §3 defers — its
own heading reads *"Storage layout: open — a module-design decision, **not a host decision**"*, and
its body defers it to *"a concrete design pass, not a further PO decision round"*.
`awcp-spec-evaluation.md:177` fixes the manner: the layout is *"not to be silently resolved by the
first migration author without revisiting ADR-016 §3."* Writing it down here **is** that revisit;
ADR-016's Revision History records it alongside the separately-granted §1 override for the first
migration, which is a different act and is recorded there rather than here.

Three reasons, in order of weight:

1. **Teardown stays one statement.** `DROP SCHEMA workflow CASCADE` is the property the repo's
   *contract-first, storage-disposable* rule actually depends on. A second schema would give the
   module two teardown paths and two migration ledgers.
2. **The aggregate is already contained.** `CONCEPTS.md:7` states a Work Packet owns everything
   beneath it and nothing under it points into the Memory Domain. Adding a parent *above* the packet
   extends that containment rather than crossing it, so the boundary ADR-016's criteria 1–4 were
   assessed against is unchanged.
3. **`work_packets.work_item_id` is a foreign key.** A cross-schema split would either complicate it
   or force it into an application-level join.

**This narrows the host question rather than widening it.** ADR-016 §1's bar exists to stop schema
work presuming the host. This decision commits to nothing about *where the `workflow` schema lives*
— only that a WorkItem lives beside its packets, wherever that is. It is **not** evidence that the
ST-084/ST-088 host gate has been discharged; it has not been.

**Superseded 2026-08-26 — the gate is now discharged, and it went against the host.** ADR-016 is
**Accepted** (rev 1.5): Candidate A is **rejected** and AWCP becomes a standalone peer service.
Two consequences for a migration planner reading this section, since the sentence above would
otherwise send them back for a per-migration host decision that no longer exists:

- **ADR-016 §1's bar is lifted.** Schema and migration work no longer returns for its own host
  decision, and the narrow migration-`005` override is moot.
- **The bar inverted rather than simply lifting.** Schema work must now assume the **standalone
  AWCP service**, not this host — and must not assume the peer-service topology's *scoring*
  outcome, which is still outstanding (ST-100).

**This section's own decision is unchanged**: a WorkItem still lives beside its packets in the
existing `workflow` schema, and that schema now travels with the extraction rather than settling
where it lives. The paragraph above is retained as the record of the constraint this decision was
taken under.

**Rejected alternative:** a logically separate schema, or tables behind their own module interface.
Rejected on all three reasons above.

### 6. Status — a WorkItem has no aggregate authoritative status

**A WorkItem has no aggregate status field, no derived status, and no status projection. Its
components are presented separately, and neither client synthesises one.** There is nothing here to
design later; this is the settled contract.

- **External requested-work status stays authoritative at its source.** This is `:163` of the
  authority matrix restated: *"Requested work, hierarchy, status, priority, labels, fix versions |
  **Jira** (unchanged)."* A WorkItem-level status would be AWCP asserting authority over exactly the
  column that matrix assigns elsewhere — contradicting §2 of this ADR.
- **AWCP exposes what it does own, separately.** Packet operational state, and observed-session
  state, each presented under the WorkItem and each labelled as itself.
- **Both clients consume the same read model and render the components.** The web UI and the CLI
  cannot disagree, because neither computes anything — a stronger guarantee than agreeing on a
  shared precedence rule.
- **Nothing synthesises `in_progress` or `blocked`.** `PacketStatus` declares both
  (`server/src/workflow/types.ts:40`) and no code path can write either — `setPacketStatus` was
  deliberately deleted rather than exposed (`server/src/workflow/api.ts:6-10`). Deriving a WorkItem
  status from packets whose own status is stuck at `open` would manufacture a signal the server does
  not hold.

**The cost, stated:** *"what is the state of ST-097?"* is answered by a small structured set rather
than by one word. That is the honest shape of the data; a single word would have been a claim.

**Rejected alternative:** a WorkItem-level status projection with precedence rules across packets,
observed sessions, and external source status.

### 7. Supersession of ADR-013 §4(b)'s layering — and the instruction to its readers

[ADR-013](ADR-013-platform-product-definitions.md) is **Accepted**. Its §4(b) (Storyboard
disposition) says, at `ADR-013:116`:

> (b) **Storyboard (SRS §5.6, FR-B-001..009, UC-3).** Reassigned to the product layer, and
> **confirmed absorbed/superseded** by the WorkPacket model (PO decision, AWCP §8 Q4, 2026-07-29)
> now that the host decision places AWCP in the same codebase as the Storyboard it replaces
> ([ADR-016](ADR-016-awcp-consolidation-host-topology.md)). The platform no longer claims it;
> retirement is sequenced with the WorkPacket model's arrival, not before.

**What this ADR supersedes:** the *layering* in that sentence — "the WorkPacket model" as the whole
of what absorbs the Storyboard. The absorbing model is a **two-level** one: WorkItem above
WorkPacket, per §1–§3 above. The reassignment to the product layer, the supersession of the
Storyboard itself, and the sequencing of its retirement are **unchanged and still binding**.

**ADR-013 is deliberately not edited.** This follows the discipline
[`awcp-strategy-baseline-2026-08.md`](../../investigations/awcp-strategy-baseline-2026-08.md)
already applies to the same line: ST-088 Phase 4 may give that sentence its final wording within
weeks, and editing it now risks writing the answer twice. **The binding instruction is on readers,
not on the file.**

> **Reader instruction — for anyone reading ADR-013 §4(b) (`ADR-013:116`).** That sentence is
> amended by ADR-017. Where it names *"the WorkPacket model"* as the model absorbing the Storyboard,
> read *"the WorkItem/WorkPacket model"*. Do not treat the sentence's placement clause as a settled
> host decision either — that half is stale relative to [ADR-016](ADR-016-awcp-consolidation-host-topology.md),
> which remains Proposed/Conditional, and carries no authority on the host question.
>
> **DISCHARGED 2026-08-26 — this instruction's second half is spent, and its first half moved.** The
> §7 revisit trigger below fired: ST-088 Phase 4 rewrote that sentence. ADR-013 rev 1.3 **deleted the
> placement clause** and replaced it with a dated Correction (§4(b) now begins at `ADR-013:118`, the
> Correction at `:120`), so there is no longer a stale clause to warn readers away from. The host
> question is no longer merely unsettled but **decided against co-location**: ADR-016 reached
> **Accepted** (rev 1.5) with **Candidate A rejected** and a standalone AWCP peer service directed —
> a *direction*, not a scored selection, with the topology's scoring still outstanding. The
> *"WorkItem/WorkPacket model"* amendment **still stands** and should be folded into ADR-013's
> Correction when either document is next revised.

The same instruction applies to `ADR-016:187`, which carries the same *"the WorkPacket model"*
phrasing in its Consequences list.

---

## Consequences

- `CONCEPTS.md` gains a **Work Item** entry; its containment root at `:7` is no longer the Work
  Packet, and the **Work Packet** entry names its optional parent. The Work Item ↔ Story relation
  becomes explicit vocabulary rather than two adjacent unlinked terms.
- The versioned TypeScript contract in `server/src/workflow/types.ts` and `schema.ts` gains WorkItem
  types and zod schemas. **Types and zod only — this ADR authorises no DDL.**
- ~~Any migration that creates these tables still needs its own decision against
  [ADR-016](ADR-016-awcp-consolidation-host-topology.md) §1, whose bar — *"no schema or migration
  work may assume the host"* — is discharged only by the ST-084/ST-088 spike. §5 above settles
  layout, which is §3's question, and has no power over §1.~~ **Superseded 2026-08-26 — the spike
  concluded, so this per-migration gate no longer exists.** ADR-016 is **Accepted** (rev 1.5) and
  §1's bar is lifted; a migration creating these tables does **not** return for its own host
  decision. But the gate did not simply lift — **it inverted**: the spike **rejected Candidate A**,
  so such a migration must assume the **standalone AWCP service** rather than this host, and must
  not assume the peer-service topology's *scoring* outcome, which is still open (ST-100). §5's
  layout decision stands and now travels with the extraction. See §5's own supersession note.
- `work_packets` gains a nullable `work_item_id` foreign key when that migration lands. It is
  nullable so every existing packet stays valid, and its write path is **operator-only** — it is
  never settable through `POST /packets`, which an agent key may call.
- A WorkItem with no packet can be created, observed against, and read — and can promote nothing to
  memory, because promotion is scope-gated and no scope exists until a packet is attached (§3).
- Attention is untouched. Packet-level attention rendering is unchanged and nothing is added.
- `ST-NNN` and `AW-NNN` are two namespaces with two allocators. Neither allocates from the other,
  and this ADR allocates from neither.

---

## Revisit Triggers

- ~~**ST-088 Phase 4 rewrites `ADR-013:116`**~~ — **FIRED and closed 2026-08-26.** ADR-013 rev 1.3
  deleted the placement clause and added a dated Correction (§4(b) at `:118`, Correction at `:120`);
  ADR-016 reached Accepted (rev 1.5) with Candidate A rejected. §7's reader instruction is marked
  discharged in place. The *"WorkItem/WorkPacket model"* half of it is **not** discharged and still
  wants folding into ADR-013's Correction at that document's next revision.
- **A second `source_system` value is needed** beyond the closed set in §2 — amend the set here
  rather than widening it at a call site.
- **Anything asks for a single-word WorkItem state** — §6 is the answer, and a request to relax it
  is a request to assert authority over a column the authority matrix assigns elsewhere.
- **A WorkItem-level scope is proposed** for any reason — §3 bars it, and the reason it is barred is
  a security boundary, not a modelling preference.

---

## Revision History

| Version | Date | Summary |
|---------|------|---------|
| 1.1 | 2026-08-26 | **The ADR-016 host gate this ADR was written under is discharged, and it went against the host.** ADR-016 reached **Accepted** (rev 1.5) with **Candidate A rejected**; AWCP becomes a standalone peer service. Every statement in this ADR that treats the gate as open is superseded in place rather than rewritten — §5's *"it has not been"* discharge sentence, §7's reader instruction on `ADR-013:116`, the Revisit Trigger that fired on that rewrite, and Consequences' per-migration host-decision requirement. **The consistent correction across all four: the bar did not lift, it inverted** — schema work no longer returns for a host decision, but must assume the standalone AWCP service rather than this host, and must not assume the peer-service topology's scoring outcome (still open, ST-100). **This ADR's own decisions are unchanged**: WorkItem remains the layer above WorkPacket, in the existing `workflow` schema, which now travels with the extraction rather than settling where it lives. Status stays Accepted |
| 1.0 | 2026-08-24 | Initial — WorkItem restored as the layer above WorkPacket on the 0..n requested-work-to-packet need: UUID identity (§1), the `(source_system, source_ref)` provenance pair recording external identity rather than replacing it (§2), relation to packet/run/observed session/checkpoint and the four "what it is not" clauses including the packet-names-the-scope rule (§3), the settled `AW-NNN` namespace with its allocation boundary in AWCP's own persistence rather than the `ST-NNN` registry (§4), storage layout settled in the existing `workflow` schema as ADR-016 §3's module-design revisit (§5), **no aggregate WorkItem status** (§6), and the supersession of ADR-013 §4(b)'s layering with a reader instruction on `ADR-013:116`, which is deliberately left unedited (§7) |
