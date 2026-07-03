---
title: "spike: Verify residual claims in compass_artifact_wf.md (Deno libs, arXiv IDs, Zoom captions, k-run matching)"
type: spike
status: done
date: 2026-07-03
story: ST-073
---

# spike: Verify residual claims in compass_artifact_wf.md

## Summary

The `ce-doc-review` of [compass_artifact_wf.md](../investigations/compass_artifact_wf.md) folded in 7 edits and resolved 6 open questions, but left five residual concerns below the actionable bar: three unverified load-bearing external claims (Deno lib compat, arXiv citations, Zoom caption status), one design gap (self-consistency k-run fact matching is itself an unscoped fuzzy-matching problem), and one confirmed type-shape mismatch. This spike **verifies the three external claims and drafts options for the k-run design gap**, then annotates the doc. The type-shape mismatch (concern #3) is split into its own code story **ST-074** — this spike only produces Agent D's reconciliation proposal for PO decision; no code changes here.

Verification is fanned out to parallel read-only sub-agents; findings converge into doc annotations only after PO review.

---

## Problem Frame

The doc is a Tier-2 investigation that will guide the Contact Memory extraction layer build. Three of its recommendations rest on unverified external facts, and one core reliability technique (k-run self-consistency) is described without a concrete matching mechanism. If these ship into implementation unchecked:

- A recommended parsing lib may not run under Deno → wasted spike time mid-build.
- A load-bearing arXiv citation may be wrong/nonexistent → the design rationale it anchors becomes unsupported.
- The Zoom caption claim, if stale, changes the transcript-ingestion assumptions in Stage 3.
- "Keep items that recur across k runs" quietly assumes a fact-equality function that does not exist — the same fuzzy-matching hard problem the pipeline is trying to avoid.

---

## Requirements

- R1. Each of the four Node/Python parsing libs (Talon, planer, mailparser, mbox-reader) has an evidence-backed Deno-compatibility verdict with a source URL or a clear "unreachable → unverified" annotation.
- R2. Each cited arXiv ID (2606.22844, 2606.06614, 2606.01435, 2501.11840, 2512.12818) resolves to a real title/authors, or is flagged in-doc as "unverified — source unreachable".
- R3. The Zoom caption-removal claim (removed as of May 18, 2026) is confirmed with a source, corrected, or flagged unverified.
- R4. Concern #5 (k-run self-consistency fact matching) has a drafted options table with trade-offs, surfaced to the PO for sign-off — not silently resolved.
- R5. Doc edits apply the verdicts: confirmed claims annotated with source; unverifiable claims annotated `unverified — source unreachable` with the specific claim flagged; no claim silently deleted unless PO directs.
- R6. Concern #3 produces an Agent D reconciliation proposal (read-only) recorded for ST-074; **no code and no `types.ts` edits in this story.**

---

## Scope Boundaries

- Edit only [compass_artifact_wf.md](../investigations/compass_artifact_wf.md) (annotations/corrections) plus board updates for ST-073/ST-074.
- Do **not** edit `contact-memory/parser/types.ts`, `captureThoughtAdapter.ts`, or any code — concern #3 is deferred to ST-074.
- Do **not** re-litigate the 8 decisions already recorded in the doc's "Deferred / Open Questions" section.
- Verification is best-effort against public sources; where the web is unreachable (search engines were blocked in the prior session), annotate rather than block.

### Deferred to Follow-Up Work

- **ST-074** — reconcile the `ExtractionItem` shape mismatch in code (direction decided by PO after reviewing Agent D's proposal).

---

## Context & Research

### Grounded claim locations (verified 2026-07-03)

- Deno libs: [compass_artifact_wf.md L84](../investigations/compass_artifact_wf.md#L84), [L89](../investigations/compass_artifact_wf.md#L89), [L134](../investigations/compass_artifact_wf.md#L134).
- arXiv IDs: [L37](../investigations/compass_artifact_wf.md#L37), [L52](../investigations/compass_artifact_wf.md#L52), [L60](../investigations/compass_artifact_wf.md#L60).
- Zoom captions: [L105](../investigations/compass_artifact_wf.md#L105).
- k-run self-consistency: [L54](../investigations/compass_artifact_wf.md#L54), [L154](../investigations/compass_artifact_wf.md#L154).
- Concern #3 mismatch (for ST-074): doc [L154](../investigations/compass_artifact_wf.md#L154)/[L159](../investigations/compass_artifact_wf.md#L159) `{kind, payload, quote, source_ids}` + `payload jsonb` vs actual [types.ts ExtractionItem L152](../../contact-memory/parser/types.ts#L152) (flattened per-kind fields extending `ExtractionItemBase` + `evidence: EvidenceReference[]`).

### Institutional Learnings

- Prior session: Google (JS-only), GitHub (429), DuckDuckGo all blocked for search. Direct `arxiv.org/abs/<id>` and vendor-doc fetches may still work — but treat web reachability as unreliable and annotate accordingly.
- Verify any memory/doc-referenced file/symbol still exists before acting (memories freeze in time).

---

## Implementation Units

### IU-1: Fan out parallel verification sub-agents (read-only)

- **Agent A (ce-web-researcher)** — Deno compatibility of `mailparser`, `mbox-reader`, `planer` (+ its jsdom dependency), and `Talon` (Python). Per-lib verdict: runs on Deno directly / via npm: specifier / needs shim / not viable. Return source URLs.
- **Agent B (ce-web-researcher)** — resolve each arXiv ID to real title/authors/date, or flag unfindable. Return per-ID URL + verdict.
- **Agent C (ce-web-researcher)** — verify the Zoom downloadable-caption removal claim and its date. Return source + verdict.
- **Agent D (Explore, read-only)** — read `contact-memory/parser/types.ts` + `contact-memory/commit/captureThoughtAdapter.ts`; produce a reconciliation proposal for the `{kind,payload}` vs flattened-union+`EvidenceReference[]` mismatch (options + recommendation, file+line evidence). **No edits.**
- Each agent returns a compact, evidence-backed finding (sources / file+line refs), not prose speculation.

### IU-2: Draft concern #5 options (inline)

- Draft a trade-off table of fact-equality strategies for k-run self-consistency (e.g. exact-string, normalized-key, embedding-cosine threshold, LLM-judge pairwise). Surface to PO for sign-off; do not pick unilaterally.

### IU-3: Converge + PO review

- Assemble all findings + Agent D's #3 proposal + the #5 options table. Present to PO for review **before** applying doc edits.

### IU-4: Apply doc annotations

- After PO review, annotate [compass_artifact_wf.md](../investigations/compass_artifact_wf.md) per R5 (confirmed → source; unverified → flagged). Commit with `Story: ST-073`.

---

## Verification

- V1. Every lib / arXiv ID / Zoom claim in the doc carries either a source annotation or an `unverified — source unreachable` flag (grep the four claim regions to confirm no bare claim remains).
- V2. The doc's k-run passage links to or inlines the concern-#5 decision.
- V3. `git status` clean after the doc-only edit; the diff touches only `compass_artifact_wf.md` (+ board).
- V4. ST-074 exists on the board in Backlog with Agent D's proposal referenced; no code files changed in this story.
