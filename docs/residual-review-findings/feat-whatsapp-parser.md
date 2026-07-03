---
title: "Known Residuals: Contact Memory local MVP"
branch: feat/whatsapp-parser
source_review: ce-code-review (correctness, security, reliability personas)
date: 2026-07-01
---

# Known Residuals

Accepted at ship time for `docs/plans/2026-07-01-001-feat-contact-memory-local-mvp-plan.md`.
These were found by code review and manual live-testing against the real
Anthropic API and platform MCP. Two P1/P2 findings were fixed before shipping
(commit adapter silently treating server-side `isError`/JSON-RPC errors as
success; unsanitized terminal output during review). These three remain,
accepted as MVP-scope residuals:

## P1 — Duplicate-commit risk on re-run after partial failure

**Files:** `contact-memory/parser/extractor.ts`, `contact-memory/commit/captureThoughtAdapter.ts`

`extraction_id`/`item_id` are LLM-generated fresh on every extraction call;
nothing persists prior extraction/review state across CLI runs. If a commit
batch partially fails (network blip, server error) and the user re-runs the
CLI and re-approves the same items, the platform's content-fingerprint dedup
will not catch the duplicates because the re-extracted content embeds new
IDs. This is the exact concern the plan already deferred under "Review
persistence/resume: save partial review sessions or retry artifacts after the
basic terminal loop works on a real export" (Deferred to Follow-Up Work).

**Mitigation for now:** after a partial-failure run, manually check committed
shards via `search_thoughts` before re-running, and only re-approve items
that show as failed in the CLI's per-item output.

## P2 — Provenance-delimiter collision (spoofable metadata, no live exploit)

**File:** `contact-memory/commit/captureThoughtAdapter.ts:116-137` (`renderCaptureContent`)

`encodeURIComponent` does not escape `-`, so the literal string `---cmv1---`
can survive inside an encoded metadata value (e.g. `evidence_quote`, sourced
from untrusted WhatsApp text) if reproduced verbatim by the model. No code
today parses this delimiter back out of committed content, so there is no
active exploit chain — but the grammar is a named, versioned contract
(`CONTACT_PROVENANCE_DELIMITER = "---cmv1---"`) intended for a future reader.
Per the plan, this whole provenance-in-content scheme is already a temporary
bridge to be replaced once `capture_thought` gains structured metadata
support — fix properly then, not by patching the pipe-grammar now.

## P2/P3 — No retry on transient network failures; coarse error categories

**Files:** `contact-memory/runtime/providers/anthropic.ts`, `contact-memory/commit/captureThoughtAdapter.ts`

A single 429/5xx/connection-reset immediately fails the whole extraction or
commit call with no retry (matches the plan's explicit single-repair-pass,
no-chunking MVP design — that repair pass is for validation failures, not
transient network issues). Separately, error categories collapse distinct
failure modes (e.g. an expired API key and a network outage both surface as
`provider_request`), which slows diagnosis but does not affect correctness.

**Mitigation for now:** the CLI is a manual local tool — a failed run can
simply be re-run (subject to the P1 idempotency caveat above).
