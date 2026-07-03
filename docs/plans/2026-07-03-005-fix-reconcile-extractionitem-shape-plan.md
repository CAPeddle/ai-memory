---
title: "fix: Reconcile ExtractionItem shape drift via provenance accessors (Opt 3)"
type: fix
status: in-progress
date: 2026-07-03
story: ST-074
---

# fix: Reconcile ExtractionItem shape drift via provenance accessors

## Summary

The `ce-doc-review` of [compass_artifact_wf.md](../investigations/compass_artifact_wf.md)
surfaced a real drift (residual concern #3): the doc's illustrative extraction contract
shows `{ kind, payload, quote, source_ids, char_span }` with a top-level `source_ids[]`,
while the implemented [`ExtractionItem`](../../contact-memory/parser/types.ts) is a
**flattened discriminated union** whose provenance lives in `evidence: EvidenceReference[]`
— there is no `payload`, `char_span`, or top-level `source_ids`. The commit adapter
canonically consumes `evidence[0]` ([captureThoughtAdapter.ts](../../contact-memory/commit/captureThoughtAdapter.ts)).

PO chose **Option 3** (Agent D's reconciliation proposal): keep the code's union shape as-is,
and close the drift by (a) adding pure accessor helpers that centralize the two access
patterns the doc's flat shape implied — the primary quote and the full source-id set — and
(b) documenting the `evidence[0]` primary-reference convention where the adapter relies on it.
No restructuring of the union; no storage/schema change.

---

## Problem Frame

The doc note already flags the drift and points at ST-074. Left unaddressed, downstream
consumers hardcode `evidence[0]` (as the adapter already does) and hand-roll the
cross-evidence source-id union, so the "top-level `source_ids`" concept from the doc has no
single home in code. Two small pure functions remove that ambiguity and give future
dedup/validation code (the doc's `source_ids` use) one canonical accessor.

---

## Requirements

- R1. `getPrimaryQuote(item)` returns the primary reference's quote (`evidence[0].quote`),
  encoding the documented "primary = highest-confidence = `evidence[0]`" convention.
- R2. `getAllSourceIds(item)` returns the order-preserving, de-duplicated union of
  `message_ids` across all `evidence[]` entries — the code home for the doc's `source_ids[]`.
- R3. Both helpers are pure, side-effect-free, and typed to accept any
  `{ evidence: readonly EvidenceReference[] }` (so `ExtractionItem` and
  `ContactShardCandidate` both qualify structurally).
- R4. The commit adapter's provenance rendering routes its quote through `getPrimaryQuote`
  (behavior-preserving) and carries a comment documenting the `evidence[0]` convention.
- R5. The doc's ST-074 shape note is updated to reflect that reconciliation is **done**
  (accessors added, convention documented) — no illustrative-shape restructuring.
- R6. All existing `contact-memory` tests pass; new unit tests cover both accessors
  (single/multi evidence, missing quote, duplicate message_ids).

## Scope Boundaries

- No change to the `ExtractionItem` union, `EvidenceReference`, storage, or MCP wire format.
- No behavior change to what the adapter emits (quote value is identical to the prior
  `evidence[0]?.quote`); `getAllSourceIds` is exposed for consumers but the adapter's
  metadata line keeps its existing `evidence[0]` message-id semantics.

---

## Implementation Units

- IU1 — `contact-memory/parser/types.ts`: add `getPrimaryQuote` + `getAllSourceIds` exports
  with a convention docblock, placed after the `ExtractionItem` union.
- IU2 — `contact-memory/commit/captureThoughtAdapter.ts`: import + use `getPrimaryQuote` for
  the provenance quote; add the `evidence[0]` convention comment.
- IU3 — `contact-memory/tests/parser/types.test.ts`: unit tests for both accessors.
- IU4 — `docs/investigations/compass_artifact_wf.md`: update the ST-074 shape note to "done".

## Verification

- `deno test --frozen --allow-net --allow-env --allow-read contact-memory/tests/` passes.
- `git diff -w` confirms the adapter quote value is unchanged (behavior-preserving).
