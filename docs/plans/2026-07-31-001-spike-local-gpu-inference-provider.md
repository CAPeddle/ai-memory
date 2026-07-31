---
title: "spike: Local GPU inference as ST-082's compliant model provider (ST-085)"
type: spike
status: proposed
date: 2026-07-31
story: ST-085
---

# ST-085: Local GPU Inference as ST-082's Compliant Model Provider

## Status

Proposed investigation spike. Backlog — the WIP limit is 1 In Progress and ST-084 currently holds it.

This spike does **not** assume local inference is desirable. Its baseline is "do nothing", and it is
allowed — expected, even — to conclude that the baseline wins.

## Decision to be made

Should ai-memory run entity extraction and consolidation through a **locally hosted model on this
machine's AMD GPU**, as the compliant provider for corporate-scoped content under
[ST-082](../../.github/planning/story-board.md)?

### The reframe this spike exists to test

ST-082's acceptance criteria require default-deny semantics for **model-provider routing**:

> content is never returned to, or sent through a provider for, a scope it wasn't granted

That criterion is satisfiable **with no GPU at all**, by simply refusing to extract entities from
corporate-scoped thoughts. Local inference only becomes *necessary* if the product wants
corporate-scoped memories to still receive entity extraction and consolidation.

**So the primary question is a product question, not a hardware one**, and answering it is in scope.
The GPU is pursued as ST-082's enabler — explicitly **not** as a cost-reduction play.

## Scope

### In scope — the chat-completion path only

| Call site | Current |
|---|---|
| `server/src/entityWorker.ts:66` | hardcoded `https://openrouter.ai/api/v1/chat/completions`, `openai/gpt-4o-mini` |
| `server/src/consolidationLLM.ts:37` | hardcoded `https://openrouter.ai/api/v1/chat/completions`, `openai/gpt-4o-mini` |

Both are re-runnable background workers with no schema impact — which is what makes them the safe
slice. Revisits the provider decision made in ST-022 (entity extraction worker → OpenRouter).

### Out of scope — and why (record the rationale; do not silently revisit)

**(a) Local embeddings — rejected.** Deceptively easy: `server/src/embeddings.ts:6` already honors
`OPENROUTER_BASE_URL`, so the provider is swappable by config alone. But `embedding vector(512)` is
fixed in `server/db/schema.sql:18` behind an HNSW index. Any change of embedding model that alters
dimensionality or vector space is a schema migration **plus** a full re-embed **plus** an index
rebuild — a one-way door for near-zero reward, since `text-embedding-3-small` is already cheap.
The re-embed machinery exists (`embedding_model`, `needs_embedding`, partial index in
`server/db/002_needs_embedding.sql:6,7,19`; `server/src/embeddingBackfill.ts`) — its existence is
not a reason to use it.

**(b) NPU offload — rejected, hardware-infeasible.** Lemonade's NPU path requires **XDNA2**
(Ryzen AI 300/400 series). The target host is a Ryzen 7 7840HS — Phoenix, **XDNA1** — which is
unsupported. This is a silicon-generation limit, not an OS or driver limit; it does not change by
switching host platform.

## Stages

Staged per the ST-084 precedent: Stage 1 must fully prove its criteria; later stages may report
UNPROVEN without failing the story.

### Stage 1 — Host topology (hard gate)

Nothing proceeds until this passes. ai-memory runs in WSL2; the GPU may simply not be reachable there.

- [ ] Settle definitively, against AMD's official ROCm WSL compatibility matrix, whether the
      **Radeon RX 7700S (gfx1102)** is supported under WSL2. Current evidence suggests the WSL2 list
      is narrow (7900-class, 9070, W7900/W7800, Strix Halo) and excludes it — but this is
      **uncorroborated**: the official matrix did not enumerate SKUs when checked on 2026-07-31.
      Treat as an open question, not a finding.
- [ ] Confirm Lemonade Server supports the **RX 7700S at all on Windows** (via its ROCm or
      Vulkan backend). This spike assumes it does; that was never verified. If it does not,
      the local-inference route fails regardless of how the WSL boundary is solved.
- [ ] If ROCm-under-WSL2 is unavailable, evaluate the probable working shape: **Lemonade Server
      running natively on Windows**, reached from the WSL-hosted ai-memory across the WSL/Windows
      boundary. Prove reachability from the Deno runtime.
- [ ] Measure the added latency of that boundary crossing against the current OpenRouter round-trip.
      Entity extraction is a background worker, so latency is a budget question, not a blocker —
      quantify it rather than assuming it is acceptable.
- [ ] Record which device actually served the request (dGPU / iGPU / CPU). **If only CPU or the
      780M iGPU is reachable, stop here and report the reversal trigger as fired.**

Host hardware: AMD Ryzen 7 7840HS · Radeon 780M (iGPU) · Radeon RX 7700S (dGPU).

### Stage 2 — The provider seam

- [ ] Introduce a configurable base URL for both chat-completion call sites, mirroring the existing
      `OPENROUTER_BASE_URL` pattern already used at `server/src/embeddings.ts:6` and
      `server/src/healthCheck.ts:91,97`. The current asymmetry — embeddings configurable, chat
      hardcoded — is the actual blocker to any provider experiment.
- [ ] The seam must land **with** ST-082's scope-aware routing, not bolted on afterwards. A base-URL
      override that is not scope-aware creates the illusion of compliance without the substance.
- [ ] Confirm Lemonade Server's OpenAI compatibility in practice: it serves
      `POST /v1/chat/completions` on `http://localhost:13305`. (It also serves `/v1/embeddings`, but
      only for `llamacpp`/`flm` recipes, not ONNX/OGA — noted for future reference only; embeddings
      remain out of scope.)
- [ ] Extend `server/src/healthCheck.ts` so a misconfigured or unreachable local provider surfaces as
      a health failure rather than silent extraction backlog.

### Stage 3 — Quality gate

- [ ] Entity extraction depends on `response_format: { type: "json_object" }`. Establish whether a
      local 7–8B class model holds that structured-output fidelity under the existing
      `SYSTEM_PROMPT` in `server/src/entityWorker.ts`.
- [ ] Build an extraction golden set. **None exists today** — `search-golden-set.test.ts` covers
      search only, and the entity-worker tests (`entity-worker-crash-isolation.test.ts`,
      `entity-worker-observability.test.ts`) cover operational behaviour, not output quality.
      `server/tests/fixtures/consolidation-corpus.sql` already exists and can seed it, so this is
      an extension of existing fixtures rather than a build from scratch. In scope, not a follow-on.
- [ ] Compare local vs `openai/gpt-4o-mini` on that golden set: node/edge precision and recall, and
      malformed-JSON rate.

## Baseline to beat

**Do nothing** — deny corporate scope under ST-082, keep cloud for everything else. Zero hardware
risk, zero new operational surface, no new failure mode in a background worker. The spike must
demonstrate it beats this baseline on a stated axis (compliance coverage, not cost).

## Reversal trigger

- **Fires immediately** if Stage 1 shows only CPU or the 780M iGPU is reachable from the ai-memory
  host — the throughput case collapses and default-deny alone wins. Abandon and record.
- **Revisit** if ai-memory moves to a native-Linux host, or AMD ships gfx1102 support on WSL — either
  would reopen Stage 1 and could widen scope to embeddings.

## Dependencies

- **ST-082** (Value 4, security/hardening; promoted to Must per PO decision 2026-07-29, PR #31) —
  this story is subordinate to it. If ST-082 concludes that corporate-scoped content should simply
  never be processed, ST-085 is moot and should be closed unstarted.
- **ST-022** — established the current OpenRouter entity-extraction provider; this spike revisits it.

## Provenance

Derived from a `ce-pov` verdict on 2026-07-31 (grade: **Trial**; reversibility tier: **3**).
External claims verified against AMD/Lemonade documentation on that date; the ROCm-on-WSL SKU
question is flagged above as explicitly uncorroborated. Verify referenced file paths and line
numbers still hold when this is picked up — memories freeze in time.
