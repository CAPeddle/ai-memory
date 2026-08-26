---
name: "AWCP strategy baseline — capability horizons, host neutrality, and the milestone shape"
summary: "PO decision round of 2026-08-23 on the AWCP strategy synthesis: which claims verified, which were withdrawn, and the six decisions that constrain how the post-ST-088 roadmap may be written."
asset_type: "investigation"
status: "baseline-confirmed-milestone-unwritten"
created: "2026-08-23"
owners:
  - "ai-memory-maintainers"
source_path: "docs/investigations/awcp-strategy-baseline-2026-08.md"
---

# AWCP strategy baseline — the 2026-08-23 decision round

**Type:** Investigation / strategy baseline (Tier 2 reference)
**Date:** 2026-08-23
**Origin:** A PO-supplied strategy synthesis, produced by a separate agent session, proposing that
future work be reorganised around capability horizons A–I and driven through GSD phases toward a
usable AWCP product. Reviewed against the tree, revised once by its author after the review, and
then settled by six PO decisions.

> **Status of this document.** It records a baseline and the decisions that bound it. **It writes no
> GSD artifact.** `.planning/PROJECT.md` and `.planning/REQUIREMENTS.md` belong to the in-flight
> ST-088 milestone and are deliberately untouched — see [What is blocked, and on what](#what-is-blocked-and-on-what).

---

## The correction that made the rest usable

The synthesis as first written framed the project as *"ai-memory is the platform for durable context
and knowledge; AWCP is the operational control plane for agentic work running on that platform"* and
proposed *"one deployable system containing different domains/modules"*.

**That is Candidate A, and it is the decision ST-088 exists to make.** `ADR-016:57` is explicit:

> *"Until the spike concludes, this ADR stays Proposed and no schema or migration work may assume the host."*

A strategy note violates nothing by exploring it. A `ROADMAP.md` of record does, because horizons B–I
are all schema-bearing.

**The sharper form of the objection, which the ADR supplies itself:** ADR-016's Candidate A
code-maturity row records the reuse as *"still zero for AWCP's actual hard risks (session
instrumentation, attention precision, corporate integration, approval semantics, multi-repo evidence
freshness)"*. Horizon B **is** session instrumentation; Horizon F **is** approval semantics. The
proposed roadmap concentrated precisely where the ADR records Candidate A as buying nothing — which
is evidence bearing on the host choice, not neutral future work.

The synthesis's author accepted this and re-baselined on **separability** rather than co-tenancy:

> AWCP is the operational control plane for agentic work. ai-memory is a durable knowledge platform
> that AWCP may integrate with. Whether AWCP and ai-memory share a host is still being decided.

Host topology is now deliberately absent from the architecture diagram, and the strategy is required
to hold under Candidate A and Candidate C alike. **That constraint is the first principle imposed on
all future GSD planning here.**

---

## Claims checked against the tree

The revision's factual claims were verified rather than accepted. Three hold; the fourth held when
checked and has since been **withdrawn at source** — see the row below.

| Claim | Verdict | Evidence |
|---|---|---|
| ADR-013 §4(b) is stale and contradicts ADR-016's conditional gate | **Holds** | `ADR-013:116` — *"now that the host decision places AWCP in the same codebase as the Storyboard it replaces"*. `:102` and `:110` use correct conditional wording (*"Proposed/Conditional"*, co-deployment *"permitted, not mandated"*) |
| Policy-scope enforcement priced at 64+ hours / 8+ days | **Holds** | findings §13.2 (`:1086`) — a record of what enforcement costs **ai-memory**, owed under ST-082 in any topology |
| ~~Candidate C saves 4–5 days, costs 3–4 in greenfield setup, breaks even~~ | **WITHDRAWN 2026-08-26 — do not cite** | The comparison was quoted accurately when checked, but it has since been withdrawn at source: findings §13.5's note records that all five bullets deriving the "saving" are the same `scope.tags` enforcement work as the 64+ hour figure above, so the comparison netted a quantity against itself. Compounding it, the PO has made effort a **non-input** to this evaluation (findings §18's opening note) — so even a sound figure would not carry the topology decision. Nothing downstream should restate a Candidate A/C effort delta |
| Criterion 6 is discharged | **Holds — and the qualifier is now settled rather than open** | findings §16.5 (`:1435`) — *"criterion 6 is discharged for every element it names"*. The definition conflict behind that hedge was ratified by the PO 2026-08-26 in favour of `ADR-016:54`'s wording (findings **§19.1**), and the board clause that had widened it to include repo-state was corrected to match. Repo-rescan remains a real **U3 scope gap**, now carried forward with a design direction and an owner rather than as an open question (findings §19.2) |
| Derived planning state has drifted from evidence | **Holds** | `ROADMAP.md:111` still shows `- [ ] 03-06-PLAN.md` unchecked; `REQUIREMENTS.md` traceability still lists NODE-01/02/03 **Pending** though `840a90c` discharged them |

**Carry the criterion-6 qualifier forward.** "Discharged for every element it names" launders into
"criterion 6 done" in one careless restatement, and the U3 scope gap is real. Since 2026-08-26 the
*criterion* half of that qualifier is settled — the phrase now means what §19.1 ratified, not an
unresolved conflict between two definitions — but the *scope-gap* half still needs carrying: nothing
has been built, and §19.2 is where it now lives.

### What the synthesis proposed that already exists

Three horizons re-proposed built capability. Feeding them to `gsd-roadmapper` as requirements would
have generated duplicate work, and coverage validation would not have caught it.

| Proposed | Actual state |
|---|---|
| *"Completion Gate should become a major AWCP capability"* | Built — `server/src/workflow/types.ts:331` raises on rejection, `store.ts:431` reads the criteria set, findings `:260` records it still refusing after rehydration |
| *"The central object should remain the work, not the agent"* | Built — WorkPacket, AgentRun, Checkpoint, OperationalDecision, AttentionItem (findings `:117`) |
| Attention as the primary user-facing product | Deterministic attention is **PROVEN** (findings `:55`, `:81`); 18/18 in `workflow-attention.test.ts` |

**One correction that must survive into any requirement.** `attention_items` was dropped **as a
table** and attention made a derived pure function, deliberately, so the "deterministic, no LLM"
claim is checkable by reading ~40 lines (findings `:106-109`). The synthesis's attention categories
read as a stored entity. Write requirements against the derived-function shape or a considered
decision gets silently regressed.

### Claims with no provenance in this repository

Zero occurrences of **agent-radio**, **Architecture Analyzer**, or **Codex app-server**. §14's
*"previous security/operational decision"* that AWCP scans only enrolled workspace roots is unrecorded
— the repository's `enrol` hits are all `AWCP_NODE_ENROLMENT_SECRET`, node enrolment, a different
trust boundary.

Two conflations were corrected in review:

- **Qwen.** The synthesis cited *"the Qwen experiments"* as negative evidence about small local
  **coding** models. The only Qwen here is **ST-077 — Qwen3-VL Embedding + Reranker**, a multimodal
  *retrieval* spike. Different experiment.
- **D9/D10.** Cited as the model for claim/evidence separation. **D-09** and **D-10** are ST-088
  Phase 3 *verification decisions* (`03-VERIFICATION.md:48,72`). The PROVEN/UNPROVEN discipline the
  synthesis admires is real and pervasive in this repo; it is not that framework.

---

## The six decisions

Taken by the PO on 2026-08-23, in the order they were put.

1. **The roadmap is host-neutral, and ADR-016 Phase 4 is the immediate decision gate.** No milestone
   past the host decision may be written on the assumption of Candidate A. The existing
   *contract-first, storage-disposable* rule from `awcp-spec-evaluation.md` is the mechanism: packet,
   checkpoint and event contracts are versioned and durable; storage is disposable until the host
   settles.
2. **Horizons map to milestones, not phases — two of them: B–D, then E–I.** `gsd-roadmapper` derives
   phases from requirements at 4–6 for `granularity: standard` and folds thin phases into neighbours,
   so nine horizons could not survive as phases of one roadmap.
3. **The first new milestone starts at B, after ST-088 closes.** Horizon A **is** the in-flight ST-088
   milestone; it keeps its own ROADMAP and REQUIREMENTS, finishes Phase 4, and discharges ADR-016.
   Nothing is planned on the wrong side of the host decision, and no live milestone artifact is
   rewritten mid-flight.
4. **The web UI is the primary interaction surface, superseding the increment-7 deferral — but it is
   not the first horizon.** `awcp-spec-evaluation.md` deferred the dashboard to increment 7 on the
   grounds that *"terminal + Markdown suffice for one operator"*, and deferred MCP too. That is now
   reversed **as to primacy**: whenever surface work happens, the web UI is the main one and MCP and
   VS Code follow. Horizon order is unchanged — provider/session truth (B) and continuity (C) still
   precede the attention UI (D). Recorded here as a supersession with its reason rather than left to
   arrive silently inside a new roadmap.
5. **Speculative capabilities are demoted from architecture to future strategy.** Architecture
   Analyzer integration, local-model capability routing, autoresearch loops, provider selection,
   autonomous continuation, and the detailed provider-normalization lifecycle are directions, not
   commitments. They pass through the same evidence-driven process as everything else before becoming
   domain contracts.
6. **Unsourced references are imported where artifacts exist and recorded as named non-goals
   otherwise.** See [Import queue](#import-queue).

---

## ADR-013 §4(b) — a real inconsistency, deliberately not fixed

`ADR-013:116` states that *"the host decision places AWCP in the same codebase as the Storyboard it
replaces"*. ADR-013 is **Accepted**; ADR-016 is **Proposed/Conditional**. On its face a lower-tier
accepted document asserts a placement that the governing ADR has not decided.

ADR-013's own product register (`:102`) and layering section (`:110`) use the correct conditional
wording, so the defect is one sentence, not the document.

**It is left unedited on purpose.** ST-088 Phase 4 may give that sentence its final wording within
weeks, and editing it now risks writing the answer twice. **The binding instruction is on readers,
not on the file:** no planning agent may treat `ADR-013:116` as an accepted host placement. It is
stale relative to ADR-016 and carries no authority on the host question.

---

## What is blocked, and on what

- **The B–D milestone cannot be generated yet.** It starts after ST-088 closes (decision 3), and
  ST-088 is In Progress with Phase 4 unstarted.
- **`.planning/PROJECT.md` and `.planning/REQUIREMENTS.md` must not be rewritten now.** They define
  the in-flight milestone. Overwriting them mid-milestone breaks the traceability table that is
  already drifting (NODE-01/02/03).
- **The planning-state lag should be reconciled before Phase 4, not after.** `ROADMAP.md:111` and the
  REQUIREMENTS traceability table both understate what has shipped. Phase 4's job is to weigh
  evidence; it should not first have to work out which of two records is true. **Where they disagree,
  the findings document plus merged PRs outrank derived GSD status.**
- **If GSD is to direct this work, `runtime: "copilot"` is a prerequisite, not a criterion.**
  `.planning/config.json` sets it, and `buildAgentSkillsBlock` emits a Skill-tool directive for a
  namespaced plugin skill **only** when `runtime === 'claude'`. None of the GSD-invokes-CE structure
  the strategy assumes executes until that is resolved. Tracked as an acceptance criterion on
  **ST-095**; it is promoted to a prerequisite by this baseline.

## Import queue

Owed before any of these may be cited by a requirement. Per decision 6, each is either imported with
provenance or recorded in `PROJECT.md` Out of Scope with what would bring it in.

**Resolved 2026-08-23** — sources named by the PO and read the same session. Findings are in
[awcp-external-evidence-import-2026-08.md](awcp-external-evidence-import-2026-08.md).

| Item | Status |
|---|---|
| agent-radio | **Imported** — `cpeddle/agent-radio`, private, read via `gh`. Carries measured evidence that bears directly on Horizon B |
| Architecture Analyzer | **Imported** — `CAPeddle/architecture_analyser`, private, Rust. Analyses **C++ and C# only**, so Horizon H cannot apply to `server/`; capability claims carry an unverified-currency caveat |
| Local-model / coding-model evaluation | **Partially imported** — `docs/investigations/Local GPU Model Setup.md` (untracked). Design rationale captured; the five named benchmark artifacts are **not located**, so §18 may not be cited as evidence-backed |
| Codex app-server lifecycle/events | **Imported and verified** against vendor documentation 2026-08-23. Its central spike question — live state for a thread hosted in another app-server process — is answered **no**, so Horizon B must be planned as managed-runtime-or-nothing for live state |
| Workspace-enrolment invariant | **Unlocated.** Remains a named non-goal |

The provenance split is not bureaucracy. It is the same discipline the ST-084 findings use, and the
reason this review could check the revision's four claims in the first place.

---

## Method and confidence

Every repository claim above was verified by direct read this session, cited to file and line. The
external synthesis was reviewed twice — once as first supplied, once after its author revised it —
and the revision's correction of its own host presumption was checked against ADR-016 rather than
accepted. No GSD artifact was written or modified. `.planning/STATE.md` was dirty in the working tree
throughout from a concurrent session and was deliberately left alone.
