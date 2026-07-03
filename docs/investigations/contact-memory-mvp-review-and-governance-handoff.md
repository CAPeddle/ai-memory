# Contact Memory MVP Review & Governance Handoff

> **Type:** Investigation / cross-clone handoff artifact
> **Created:** 2026-07-03 (Windows clone `c:\projects\ai-memory`, on `main` @ `cfaec3c`)
> **Purpose:** Carry an unfinished review + governance decision set from a Web Claude
> steering session into a durable, committable artifact so a **fresh agent instance
> running in the WSL2 clone** (`~/projects/ai-memory`) can pick it up with full context.
> **Status:** Open — action items below are for the next (WSL2) instance.

---

## 0. How to use this document

This artifact exists because a review/decision thread started in a **Web Claude
conversation** (not Claude Code, not OpenCode) that has **no repository access**.
Its reported outcomes could not be verified against the repo, and — as documented in
§2 — several claimed commits/files **do not exist on `origin/main`**.

If you are a fresh instance opening this in the WSL2 clone:

1. Read §2 (Reconciliation) first — it tells you what is *actually* in the repo vs
   what a prior session *claimed*.
2. Treat §4–§7 as the decision record for four findings (A/B/C/D).
3. §8 lists the concrete follow-up work (proposed board stories + acceptance
   criteria). **Verify story numbering against the live board before applying** —
   this Windows clone's board topped out at **ST-062**; a prior session claimed
   ST-063–066 exist in WSL.
4. §10 is your action plan.

---

## 1. Context

The **Contact Memory** product track (Android app + WhatsApp/email/transcript
ingestion + human review gate + Contact MCP) is defined in
[docs/architecture/ai_memory_architecture_decisions.md](../architecture/ai_memory_architecture_decisions.md)
and supersedes the platform assumptions in `SRS.md` / `SystemDesign.md` where they
conflict (see [CLAUDE.md](../../CLAUDE.md) → "Contact Memory Supersession Map").

A Web Claude session reviewed a **Contact Memory MVP** (a human-review-gated CLI that
extracts contact facts from a WhatsApp export and commits them via the MCP
`capture_thought` path). It reported: 5 code-review issues found, 2 fixed, 3 residual;
plus process/design tradeoffs about workflow governance, MCP transport duplication, and
a repair-pass privacy behaviour. The session ended before those were resolved.

This document captures and resolves that thread.

---

## 2. Reconciliation — claimed vs. actual repo state

The Web Claude narrative reported governance and MVP work as **committed**. Verified
against the pulled `main` (`cfaec3c` = `origin/main`), **it is not present in this clone**:

| Claimed by the session | Actual (verified) |
|---|---|
| Governance restructure "Committed as `6623c65`" | `git cat-file -t 6623c65` → **`fatal: Not a valid object name`** (no such commit in any branch) |
| New `AGENTS.md` (thin pointer to CLAUDE.md) | **Does not exist** (`Test-Path AGENTS.md` → False) |
| Board entries **ST-063/064/065/066** | **None on the board** (`Select-String` empty; board max is ST-062) |
| "This MVP" — review-gate CLI, `captureThoughtAdapter.ts`, `buildRepairPrompt` | **No such files in any branch's history** (`git log --all -S 'captureThoughtAdapter'` empty) |
| `docs/plans/*` Contact Memory MVP plan | **Absent** — only parser plans exist under `docs/plans/` |

### What *did* land on `origin/main` (the parser layer only)

- `feat(memory): replace profile with tags array` (`ec3578f`) — tags-array migration
- `feat(contact): add parser type contract` (`92ace37`, PR #19) — parser types
- `feat(contact): add WhatsApp export parser` (`dc14586`) + `test(contact): harden parser privacy assertions` (`67be7ad`), merged via PR #20 (`d3483cf`)
- `Adding additional conversation material` (`cfaec3c`) — investigation docs
- Present files: `shared/tagGrammar.ts`, `contact-memory/parser/`, `contact-memory/tests/`

### Interpretation

Web Claude **cannot make commits**. The MVP + governance work therefore either:

- **(likely)** exists as **uncommitted / unpushed** changes in the WSL2 clone
  (`~/projects/ai-memory`), which this Windows session cannot read (VS Code blocks the
  `\\wsl.localhost\` UNC host); **or**
- never materialized, and `6623c65` was a **fabricated hash** in the narrative.

> ⚠ **First action in WSL2:** run `git status` and `git log --oneline -15` in the WSL
> clone to determine which. If there are unpushed commits or a dirty tree carrying the
> MVP/governance work, **secure it (commit + push) before anything else** — it is
> currently at risk.

---

## 3. Findings overview

| ID | Severity | Area | Title | Disposition |
|---|---|---|---|---|
| A | P1 + 2×P2/P3 | reliability | Three residuals from MVP review | Record as residuals (§4) |
| B | P1 | process | Workflow-gate / story-board bypass | Governance refit — directive in §5 |
| C | P2 | maintainability | MCP transport logic duplication | Board-track follow-up (§8, ST-067?) |
| D | P2 | design/privacy | Repair pass drops hallucinated evidence silently | Board-track follow-up (§8, ST-068?) |

**PO decision (2026-07-03):** implement **neither C nor D now**; board-track both with
the verdicts below as acceptance criteria. Governance (B) is captured here as an
investigation artifact to be revisited in the WSL2 instance, not rebuilt in this clone.

---

## 4. Finding A — Three residual review items (record as known residuals)

Two severe issues were already fixed during the review (a P1 where the commit adapter
reported server-side failures as success; a P2 ANSI/control-character injection risk in
the terminal review display), plus a design smell and two cheap reliability fixes. The
following **three remain**:

### A1 — (P1) Re-run after partial commit failure can duplicate facts
`extraction_id` / `item_id` are LLM-regenerated each run with **no session
persistence**, so re-running the CLI after a partial commit failure can re-commit
already-committed facts. This is exactly the "Review persistence/resume" work the MVP
plan **explicitly deferred**.
**Disposition:** Accepted residual. Real fix = session/resume state persistence
(idempotency keys derived deterministically from content + provenance, not
LLM-regenerated). Candidate future story; **not** MVP-blocking per the plan's own scope.

### A2 — (P2) Provenance metadata block is spoofable
A contrived WhatsApp message could spoof the pipe-delimited provenance metadata block.
**No live exploit today** because nothing parses it back.
**Disposition:** Accepted residual. Revisit if/when any consumer parses the provenance
block. Mitigation when it matters: structured/escaped provenance encoding rather than
pipe-delimited free text.

### A3 — (P2/P3) No retry + collapsed error categories
No retry on transient network failures; error messages collapse distinct failure
categories (e.g. an expired API key looks like a network outage).
**Disposition:** Accepted residual. Cheap future win: bounded retry with backoff on
transient failures + distinct error classification (auth vs. network vs. server).

> These three should live as **residuals in the notes of the MVP story** (Web Claude
> referred to it as ST-065) once that story/board state is confirmed in WSL2.

---

## 5. Finding B — Workflow-gate / story-board governance refit

### The problem
Three Contact Memory sessions in a row (parser types, WhatsApp parser, the MVP) shipped
via `docs/plans/*.md` + direct commits, with **no story-board entry** and **no
`Story:` / `Task:` commit trailers**. [CLAUDE.md](../../CLAUDE.md) "Workflow gate — DO
NOT skip" requires both for anything beyond trivial docs/housekeeping; the Contact
Memory Supersession Map supersedes *architecture* assumptions, **not process**.

### PO directive (verbatim intent, 2026-07-03)
> "I want to be able to use the story board to maintain direction while using the rigour
> of the compound engineering plugin. Work is also done using OpenCode which uses the
> `.agents` folder and `AGENTS.md`, so refit the story-board, CLAUDE.md and the OpenCode
> files to enforce a structure. It's been working because I've used a Web Claude session
> to steer the work for the last iterations. I would prefer not to use that as the PO of
> this project; everything should be local and the Web project is merely an easy
> conversation interface."

### Target end-state (to build in WSL2)
A single governance structure that all three tools (Claude Code, OpenCode, VS Code
Copilot) share:

1. **Canonical plan format:** `docs/plans/*.md` with **mandatory `story: ST-NNN`
   frontmatter**. This becomes the one plan format for every tool. The older
   `.github/planning/execplans/*` ExecPlan format is **retired for new work** (not
   deleted; existing ExecPlans remain valid history).
2. **Soft board-gate:** before implementation starts, confirm/create the board entry,
   move it to *In Progress*, and cross-link `Plan:` → the `docs/plans/` file.
3. **story-board.md:** rename the field label `ExecPlan:` → `Plan:` going forward;
   backfill the missing Contact Memory stories (parser types, WhatsApp parser, MVP) as
   **Done** with review findings + residuals (§4) in notes.
4. **`AGENTS.md` (new, repo root):** a thin pointer to `CLAUDE.md` so OpenCode and
   Claude Code read **one** governance source instead of two that can drift. (There is
   **no `.agents/` folder** in this clone — only `.opencode/config.json` and
   `opencode-mcp.json`; confirm the OpenCode surface in WSL2.)
5. **Deprecation banners:** `.github/copilot-instructions.md` and the four `/plan*`
   prompts get banners pointing at the new workflow.
6. **Prompt migration is its own story** (Web Claude called it ST-066): the VS Code
   `/plan*` prompts depend on a **Recovery Ledger** mechanism with no equivalent in the
   unified `docs/plans/` format (ExecPlan execution state lives in the plan body; under
   `docs/plans/` it lives in git history). Migrating them is real design work — do not
   rush it into the same change.

### Process note to carry forward
A prior session made governance changes by treating the PO's in-conversation direction
as the **PO override** that CLAUDE.md's own workflow rule allows, **without** routing
through `/plan-new`. If the PO wants governance changes themselves gated, state that
explicitly and add it to the rule.

---

## 6. Finding C — MCP transport logic duplication (board-track)

### The issue
`captureThoughtAdapter.ts` (in the MVP, not in this clone) re-implements the exact
`POST /mcp` + Bearer + `Accept` header + JSON-RPC envelope + SSE `data:`-parsing logic
that already lives in [server/tests/_helpers/mcpClient.ts](../../server/tests/_helpers/mcpClient.ts).
Suggested fix: extract a shared `shared/mcpTransport.ts`, mirroring the existing
`shared/tagGrammar.ts` precedent.

### Grounded verdict (this clone)
I read `mcpClient.ts`. The validator's concern — that it may carry **test-only
fetch-mocking conventions** unsuitable for a shared production module — is **unfounded
for the transport core**:

- `mcpCall` and `mcpRequest` are **pure `fetch`** transport (Bearer, correct `Accept:
  application/json, text/event-stream`, SSE `data:` line parsing). **No mocking hooks.**
- The only test-isms are env-var **fallback defaults** (`?? "test-key"`,
  `?? "http://localhost:3000"`) and two **unrelated** helpers (`extractText`, `sleep`).

**Conclusion:** a clean extraction to `shared/mcpTransport.ts` is viable. When
extracting, **drop the `"test-key"` / localhost defaults** (production must fail loudly
on missing config) and keep `extractText`/`sleep` out of the transport module. Exact
call-shape parity with `captureThoughtAdapter` can only be confirmed once the MVP code
is in a readable clone.

**Priority:** legitimate but **low-urgency** — both implementations are small and
stable; silent drift risk is low.

---

## 7. Finding D — Repair pass drops hallucinated evidence silently (board-track)

### The issue
When the model cites a `message_id` that doesn't exist, `buildRepairPrompt` deliberately
omits **both** the full transcript **and** the valid `message_id` list (privacy-motivated).
That leaves the repair model with no way to fix the citation — its only
validation-satisfying paths are "fail again" or "drop the item." Either way, a fact the
model thought worth surfacing **vanishes between two provider calls with zero signal to
the human reviewer**.

### Grounded verdict (informed by the two flagged investigation docs)

- [compass_artifact_wf.md](compass_artifact_wf.md): source grounding is "the
  anti-hallucination workhorse"; items whose quote can't be matched to source should be
  **"drop or flag"**, and a human-in-the-loop gate is **"not optional"** for a personal
  knowledge base (LLM extraction agrees with human coding only ~62–72% of the time).
- [OpenCode Answer to Claude on Platform.md](OpenCode%20Answer%20to%20Claude%20on%20Platform.md):
  the platform has **no built-in mandatory human-review gate** — the MVP's review gate
  is **bespoke, layered on top**. Silently losing a fact therefore defeats the MVP's
  entire reason to exist.

**Recommendation — do both, visibility first:**

1. **(higher priority) Visibility:** surface a "**N items dropped during repair**" count
   (ideally with the dropped items' extracted text) in the CLI output. The reviewer must
   **never** lose a fact silently. This is the non-negotiable fix.
2. **(secondary) Re-grounding:** include the **valid `message_id` list only** (IDs, not
   transcript) in the repair prompt. This is a bounded privacy tradeoff (narrows leakage
   to opaque IDs) that lets the model **re-ground instead of drop** — which the research
   explicitly favours over dropping.

---

## 8. Proposed board follow-ups (verify numbering against the WSL2 board)

> Board max in this clone = **ST-062**. Web Claude claimed ST-063 (parser types),
> ST-064 (WhatsApp parser), ST-065 (MVP), ST-066 (prompt migration) exist in WSL.
> **Confirm before assigning the IDs below.**

### ST-067 (proposed) — Extract shared MCP transport module
- Type: debt / maintainability
- Value: 2
- Source: Contact Memory MVP review, Finding C (2026-07-03)
- Touches: `shared/mcpTransport.ts` (new), `contact-memory/**/captureThoughtAdapter.ts`,
  `server/tests/_helpers/mcpClient.ts` (optionally re-point to shared module)
- Acceptance criteria:
  - [ ] `shared/mcpTransport.ts` exports pure transport (`POST /mcp`, Bearer, correct
        `Accept`, JSON-RPC envelope, SSE `data:` parsing) with **no** env-var default
        fallbacks (fail loudly on missing config)
  - [ ] `captureThoughtAdapter` consumes the shared module; its bespoke transport code
        is removed
  - [ ] `mcpClient.ts` either re-uses the shared transport or is documented as a
        test-only wrapper that adds `extractText`/`sleep`
  - [ ] All existing server + contact-memory tests pass
- Notes: See §6. Low urgency; do once, don't rush.

### ST-068 (proposed) — Repair-pass: never lose a fact silently
- Type: bug / design
- Value: 4
- Source: Contact Memory MVP review, Finding D (2026-07-03)
- Touches: `contact-memory/**/buildRepairPrompt*`, repair-loop caller, CLI output
- Acceptance criteria:
  - [ ] CLI output reports a **"N items dropped during repair"** count, including each
        dropped item's extracted text, whenever the repair loop discards items
  - [ ] Repair prompt includes the **valid `message_id` list** (IDs only — no transcript
        body) so the model can re-ground a bad citation instead of being forced to drop
  - [ ] A test proves: given a hallucinated `message_id`, the item is either re-grounded
        to a valid ID **or** surfaced in the dropped-count — never silently lost
  - [ ] Privacy assertion: the repair prompt never contains transcript message **bodies**
- Notes: See §7. Visibility is the non-negotiable half; re-grounding is the secondary
  improvement. Both align with the source-grounding + human-gate guidance in
  `compass_artifact_wf.md`.

### Residual tracking (Finding A)
Record A1/A2/A3 (§4) in the **MVP story's notes** (ST-065 per Web Claude) once that
story is confirmed on the WSL2 board. A1 (idempotency/resume) may warrant its own future
story when session persistence is scoped.

---

## 9. The two flagged investigation docs — why they matter here

- **[compass_artifact_wf.md](compass_artifact_wf.md)** — research on a medium-agnostic
  contact-memory extraction layer. Key load-bearing guidance for the MVP and Finding D:
  - Two-layer split: deterministic per-medium parse → **one** medium-agnostic,
    schema-constrained LLM extraction stage ("code for data, LLMs for judgment").
  - **Source grounding** (verbatim quote + `source_id`, validate the quote appears in
    source before persist) is the primary anti-hallucination technique — directly
    motivates Finding D's re-grounding fix.
  - Human-in-the-loop is **not optional**; confidence is a coarse first-pass filter.
  - **Deterministic** conflict resolution (bitemporal `valid_at`/`recorded_at`,
    `supersedes` chains, `max(timestamp)`), **not** LLM freshness reasoning.
- **[OpenCode Answer to Claude on Platform.md](OpenCode%20Answer%20to%20Claude%20on%20Platform.md)**
  — grounds what the **platform** actually provides today vs. what Contact Memory must
  layer on: shards are messy/multi-fact; supersession is soft-delete + correction
  pointer (no competing-claim confidence scores); **no** mandatory per-capture human
  gate; it's a **search** API, not an answer API; storage-level isolation is undefined.
  Confirms the MVP's review gate and provenance handling are **bespoke additions**, not
  platform features — which is exactly why Finding D's silent-drop is a real defect.

---

## 10. Next-instance action plan (WSL2)

1. **Secure at-risk work.** In `~/projects/ai-memory`: `git status`,
   `git log --oneline -15`. If MVP/governance work is uncommitted or on an unpushed
   branch, commit + push it. If it doesn't exist, note that `6623c65` was fictitious.
2. **Reconcile the board.** Confirm whether ST-063–066 exist. If not, create them
   (parser types, WhatsApp parser, MVP, prompt migration) per §5.
3. **Governance refit (Finding B, §5)** — decide whether to route it through `/plan-new`
   or accept it as a PO-override change; then land: canonical `docs/plans/` format +
   `story:` frontmatter, `Plan:` board field, `AGENTS.md` pointer, deprecation banners,
   and the ST-066 prompt-migration story.
4. **Record residuals (Finding A, §4)** into the MVP story's notes.
5. **Board-track C and D (§8)** as ST-067/ST-068 (verify numbering). **Do not implement
   now** per PO decision.
6. When ready to implement D, prioritise the **visibility** half.

---

## 11. Open questions / risks

- **Does `6623c65` exist in WSL2?** Determines "verify & reconcile" vs. "rebuild from
  scratch" for the governance refit. (§2, §10.1)
- **Is there a `.agents/` folder in the WSL2 clone?** This Windows clone has only
  `.opencode/`. The `AGENTS.md` pointer target and OpenCode wiring depend on it. (§5.4)
- **Recovery Ledger equivalence** — migrating the `/plan*` prompts to `docs/plans/`
  loses the in-body execution-state ledger; git history must carry that role. Owned by
  the ST-066 prompt-migration story. (§5.6)
- **Idempotency (A1)** is the only residual with real product risk (duplicate committed
  facts on re-run); size a session-persistence story when Contact Memory resume UX is
  scoped. (§4)
