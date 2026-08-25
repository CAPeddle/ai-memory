---
name: "AWCP dogfooding — ST-097 as the first WorkItem"
summary: "Records the first WorkItem AWCP holds about its own development: ST-097 as provenance rather than identity, resolved over HTTP by a caller holding no UUID, with the story-board reference stated as hand-maintained and carrying no sync guarantee."
asset_type: "investigation"
status: "observed"
created: "2026-08-25"
owners:
  - "ai-memory-maintainers"
source_path: "docs/investigations/awcp-dogfooding-st-097-2026-08.md"
---

# AWCP dogfooding — ST-097 as the first WorkItem

AWCP now holds one WorkItem about its own development. That item exists to demonstrate
one distinction on one real piece of work: **`ST-097` is the reference, not the
identity.**

## What the item is

| Field | Value |
|---|---|
| `id` | an immutable UUID, allocated by the database |
| `source_system` | `story-board` |
| `source_ref` | `ST-097` |
| `aw_label` | **null** — see below |

The UUID is the identity. `story-board` / `ST-097` is *provenance*: it records where the
work was requested, and claims no authority over it. The story board remains the
authoritative record of ST-097's development status; AWCP does not mirror it, does not
own it, and does not decide it.

## The `AW-NNN` label is null, and that is the outcome rather than a gap

[ADR-017](../design/adr/ADR-017-awcp-work-item-contract.md) §4 establishes the `AW-NNN`
namespace and closes by allocating nothing from it: *"no `AW-NNN` value may be minted
until the allocator that governs minting exists."* No such allocator exists. `AW-NNN` is
deliberately **not** allocated from [`story-ids.md`](../../.github/planning/story-ids.md),
which governs `ST-NNN` only — §4 makes them two allocators by design.

So the dogfooding item carries a null label, and the end-to-end test asserts that null
rather than working around it. `uq_work_items_aw_label` is already in place, waiting for
the allocator that will fill it. Hand-picking a value here would have produced an
identifier that looked allocated and was not — which is the failure this whole
restructure exists to remove, reintroduced at the first opportunity.

## The reference is hand-maintained and carries no sync guarantee

**Nothing synchronises `source_ref` with the story board.** If ST-097's board entry is
renumbered, retired, or removed, this WorkItem's `source_ref` still reads `ST-097` and no
mechanism notices. The reference is written once, by hand, and drifts silently.

That is acceptable for **one** item created to demonstrate a distinction. It is not
acceptable as a practice, and the bar for expanding it is already set elsewhere in this
same transition: [ST-097's plan](../plans/2026-08-23-2245-chore-st097-gsd-pivot-board-split-awcp-status-slice-plan.md)
holds unit A6 to an **enforced** boundary-sync check — a hook or CI check with an observed
failing case — precisely because discretionary bookkeeping is this repository's documented
failure mode, not a hypothetical one.

**So: dogfooding beyond a single item needs an enforced sync first.** Adding a second
hand-written `source_ref` without one is not a small increment; it is the point at which
a demonstration becomes an unmaintained index.

## What was actually observed

One item travels the whole chain, in `server/tests/workflow-work-item-dogfooding.test.ts`:

1. **create** — the operator creates it through `POST /work-items` (operator-only)
2. **observe** — a session is observed on the node lane, with no packet and no scope
3. **claim** — the operator claims that session for the item through `POST /work-items/:id/sessions`
4. **read** — an agent holding **no UUID** resolves it via `GET /work-items/by-ref?source=story-board&ref=ST-097`
5. **render** — the item and its observed session appear on the operator's page

`awcp status --source story-board --ref ST-097` answers the same question from the same
read model. Nothing in the chain fabricated a packet or a policy scope, which the test
asserts directly.

The chain is what makes this a slice rather than eight parts that each pass alone.
