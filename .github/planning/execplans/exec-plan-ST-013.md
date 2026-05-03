# ExecPlan — ST-013: Split investigation docs into landing pages and focused fragments

> Status: ⬜ Not Ready — approved plan, blocked by ST-011
> Story: ST-013
> Created: 2026-05-03
> Parent: `.github/planning/query-packets/QP-013-split-investigation-docs.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. The sections §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective must be kept up to date as work proceeds.

---

## §1. Background & Context

This story restructures the investigation documents so they are easier for future planning and execution sessions to consume without loading full monoliths. Today, the repository treats eight top-level files under `docs/investigations/` as the design authority for architecture, workflow, storage, and external-reference decisions. Those files remain authoritative after this story, but their role changes: each top-level file becomes a compact landing page that explains what the investigation covers, when to read it, and which focused subdocuments contain the detailed guidance.

In this plan, a **landing page** is the retained top-level investigation file, for example `docs/investigations/workflow-and-prompt-design.md`. A **fragment set** is a same-name folder next to that landing page, for example `docs/investigations/workflow-and-prompt-design/`, containing smaller markdown files with the detailed content that used to live only in the monolith. A **governance consumer** is any prompt, instruction, board entry, or query packet that currently points to the monolith layout and therefore may need a more precise reference after the split.

The story touches three areas:
1. The investigation corpus under `docs/investigations/`
2. Governance consumers under `.github/` that reference those investigations
3. Story metadata in `.github/planning/story-board.md` and related planning artifacts

This story does not change approved architecture decisions, storage choices, MCP/REST behavior, or workflow governance rules. It changes how those approved decisions are organized and linked so future agents can follow the repository's "point, don't dump" principle while still reaching the full source material.

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:
- After running `rg --files docs/investigations`, all eight original top-level investigation files still exist and each has a same-name fragment folder beside it.
- After opening any top-level investigation file, the first screen shows a compact summary, a "Read This When" section, and direct links to focused fragment docs instead of the full monolith text.
- After running `rg "docs/investigations/" .github docs`, governance consumers reference either the retained landing pages or specific fragment docs, with no stale references that assume monolith-only section layouts.
- After performing the completeness review described in §4.6, every original major section from the eight investigation docs has a destination in the new structure and no approved design-authority content is missing.

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (not left to executor)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted for external interactions
- [x] No tasks require judgment calls needing broad project context
- [x] Script templates or boilerplate provided in §3 where applicable
- [x] Scoped requirements are mapped to concrete outputs in §2d (no orphan requirements)
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ⬜ Not ready — plan approved, awaiting `ST-011` completion or explicit unblock

---

## §2c. Plan Review Notes

- 2026-05-03: PO approved the revised ExecPlan and kept `ST-013` blocked by `ST-011`.

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Keep all eight top-level investigation files as compact landing pages (PO scoping + QP-013) | Eight existing files remain in place and contain compact landing-page sections (`Executive Summary`, `Read This When`, `Fragment Map`) | Task 4.1, Task 4.2, Task 4.3 | `rg --files docs/investigations` + landing-page section checks in Tasks 4.1-4.3 and Task 4.5 |
| Split detailed content into focused same-name fragment folders (PO scoping + QP-013) | Fragment folders and planned files under each investigation family exist | Task 4.1, Task 4.2, Task 4.3 | Folder/file existence checks in Tasks 4.1-4.3 and Task 4.5 |
| Governance consumers updated to point to landing pages/fragments (QP-013) | Updated references in `.github/copilot-instructions.md`, planning prompts, board references, and QP-011 where needed | Task 4.4 | `rg "docs/investigations/" .github docs` in Task 4.4 and Task 4.5 |
| Completeness proof that no approved design-authority content was dropped (ST-013 acceptance criteria) | Heading inventory coverage and destination mapping logged in §6/§6c | Task 4.5 | Task 4.5 completeness-review verification and execution-log entries |

If a scoped requirement does not map cleanly to an output artifact, stop and escalate during /plan rather than marking Ready.

---

## §3. Preconditions

List any prerequisites:
- `ST-011` must be completed or explicitly unblocked by the PO before execution begins, because both stories touch governance files.
- The `.github/planning/` lock and `.github/planning/story-board.md` lock must be free for this story's planning and board updates.
- `rg` must be available in the workspace terminal for heading and reference checks.
- The executor must work from `c:\projects\ai-memory`.
- The executor must preserve existing top-level filenames under `docs/investigations/`; those paths remain design-authority entry points.

### Landing Page Template

Use this shape for each retained top-level investigation file:

```markdown
# Investigation: <Original Title>

| Field | Value |
|-------|-------|
| **Created** | <existing date> |
| **Status** | Complete |
| **Scope** | <one-sentence scope> |
| **Structure** | Landing page with focused fragments |

## Executive Summary

<3-6 bullets or short paragraphs that summarise the investigation>

## Read This When

- <task-oriented reason 1>
- <task-oriented reason 2>

## Fragment Map

- [<Fragment title>](./<folder-name>/<file-name>.md)
- [<Fragment title>](./<folder-name>/<file-name>.md)

## Design Authority Note

This landing page remains part of the approved investigation set for ai-memory. Detailed rationale and implementation guidance now live in the fragment documents linked above.
```

### Fragment File Template

Use this shape for each detailed fragment:

```markdown
# <Fragment Title>

| Field | Value |
|-------|-------|
| **Parent investigation** | [<landing page>](../<landing-page>.md) |
| **Purpose** | <one-sentence purpose> |

## When To Read This

- <specific use case>

## Content

<migrated content from the original investigation>

## Related Fragments

- [<Sibling fragment>](./<sibling>.md)
- [Back to landing page](../<landing-page>.md)
```

### Approved Fragment Layout

Use the following destination layout unless execution uncovers a documented blocker:

- `docs/investigations/workflow-and-prompt-design/`
  - `01-executive-summary.md`
  - `02-planning-and-intake.md`
  - `03-execution-and-recovery.md`
  - `04-board-and-execplan-pattern.md`
  - `05-adoption-and-repo-layout.md`
- `docs/investigations/context-engineering-principles/`
  - `01-executive-summary.md`
  - `02-context-layers-and-delivery.md`
  - `03-budget-and-progressive-disclosure.md`
  - `04-anti-patterns-and-guardrails.md`
  - `05-workflow-application.md`
- `docs/investigations/memory-architecture-design/`
  - `01-service-overview.md`
  - `02-domain-model.md`
  - `03-storage-schema.md`
  - `04-retrieval-and-ranking.md`
  - `05-consolidation-and-feedback.md`
  - `06-operations-and-extensibility.md`
- `docs/investigations/interface-design-mcp-rest/`
  - `01-overview.md`
  - `02-shared-service-contract.md`
  - `03-rest-surface.md`
  - `04-mcp-surface.md`
  - `05-prompts-resources-and-formatting.md`
  - `06-validation-and-error-handling.md`
- `docs/investigations/language-stack-recommendation/`
  - `01-evaluation-criteria.md`
  - `02-options-analysis.md`
  - `03-recommendation.md`
  - `04-migration-notes.md`
- `docs/investigations/sqlite-vs-postgresql/`
  - `01-comparison-baseline.md`
  - `02-fts-and-vector-implications.md`
  - `03-operating-envelope.md`
  - `04-migration-triggers.md`
- `docs/investigations/openclaw-official-docs-review/`
  - `01-observed-patterns.md`
  - `02-portable-guidance.md`
  - `03-applicability-limits.md`
- `docs/investigations/openclaw-memory-architecture-analysis/`
  - `01-architecture-mapping.md`
  - `02-reusable-patterns.md`
  - `03-rejected-patterns.md`
  - `04-implications-for-ai-memory.md`

---

## §4. Task Definitions

### Task 4.1: Split The Governance-Heavy Investigations

**Objective:** Move detailed workflow and context-engineering content into focused fragment files while preserving the existing top-level files as compact landing pages.

**Requirement mapping:** §2d rows 1 and 2

**Input:**
- `docs/investigations/workflow-and-prompt-design.md`
- `docs/investigations/context-engineering-principles.md`
- Fragment layout from §3

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Run `rg --no-heading "^(##|###) " docs/investigations/workflow-and-prompt-design.md docs/investigations/context-engineering-principles.md` and record the full heading inventory in §6 Execution Log under a labeled entry named `Heading inventory — governance-heavy investigations` before editing either file.
2. Create the folders `docs/investigations/workflow-and-prompt-design/` and `docs/investigations/context-engineering-principles/`.
3. Copy the detailed content from each current monolith into the fragment files defined in §3. Preserve the original wording unless a local rewrite is needed to keep fragment introductions or sibling links coherent.
4. Rewrite each top-level investigation file into the landing-page template from §3. Keep the original title, metadata date, and scope, add a short "Read This When" list, and populate the fragment links.
5. Add sibling and back-links inside each fragment so readers can navigate without reopening the monolith.

**Expected output:**
- Two new fragment folders populated with focused markdown files
- Two compact landing pages replacing the detailed monolith text at the original paths

**Verification:**
```powershell
rg --files docs/investigations/workflow-and-prompt-design docs/investigations/context-engineering-principles
rg "Read This When|Fragment Map" docs/investigations/workflow-and-prompt-design.md docs/investigations/context-engineering-principles.md
```
Expected result: each folder contains the planned fragment files from §3, each landing page exposes "Read This When" and "Fragment Map" sections, and §6 contains the pre-edit heading inventory needed for Task 4.5.

**Failure handling:** If a source section does not fit the approved fragment layout, stop and record the conflict in §2c before inventing a new layout.

**Checkpoint:** Do not start Task 4.2 until all ten expected fragment files for these two investigations exist, both landing pages are compact, and the heading inventory entry is present in §6.

---

### Task 4.2: Split The Architecture And Interface Investigations

**Objective:** Move the service-architecture and transport-interface investigations into focused fragment sets while preserving every approved design detail.

**Requirement mapping:** §2d rows 1 and 2

**Input:**
- `docs/investigations/memory-architecture-design.md`
- `docs/investigations/interface-design-mcp-rest.md`
- Fragment layout from §3

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Run `rg --no-heading "^(##|###) " docs/investigations/memory-architecture-design.md docs/investigations/interface-design-mcp-rest.md` and record the full heading inventory in §6 Execution Log under `Heading inventory — architecture and interface investigations` before editing either file.
2. Create the folders `docs/investigations/memory-architecture-design/` and `docs/investigations/interface-design-mcp-rest/`.
3. Copy the detailed content into the planned fragment files, preserving tables, diagrams, and code blocks that carry design authority.
4. Rewrite the two top-level files as compact landing pages with summary bullets, task-oriented reading guidance, and direct links to their fragments.
5. Ensure any fragment that references workflow or context-engineering guidance links to the most specific fragment available rather than only to the landing page.

**Expected output:**
- Two new architecture/interface fragment folders with detailed content
- Two compact landing pages at the original top-level paths

**Verification:**
```powershell
rg --files docs/investigations/memory-architecture-design docs/investigations/interface-design-mcp-rest
rg "Read This When|Fragment Map" docs/investigations/memory-architecture-design.md docs/investigations/interface-design-mcp-rest.md
```
Expected result: both fragment folders exist with the approved file names from §3, the top-level files are now landing pages, and §6 contains the pre-edit heading inventory for these two investigations.

**Failure handling:** If copying diagrams or tables into fragments would materially reduce clarity, keep the content intact and only add the minimal linking prose required for the fragment template.

**Checkpoint:** Do not start Task 4.3 until all twelve expected fragment files for these two investigations exist, the landing pages are compact, and the architecture/interface heading inventory is recorded in §6.

---

### Task 4.3: Split The Comparative And Reference Investigations

**Objective:** Break the remaining comparison and external-reference investigations into smaller fragments without losing rationale or evidence.

**Requirement mapping:** §2d rows 1 and 2

**Input:**
- `docs/investigations/language-stack-recommendation.md`
- `docs/investigations/sqlite-vs-postgresql.md`
- `docs/investigations/openclaw-official-docs-review.md`
- `docs/investigations/openclaw-memory-architecture-analysis.md`
- Fragment layout from §3

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Run `rg --no-heading "^(##|###) " docs/investigations/language-stack-recommendation.md docs/investigations/sqlite-vs-postgresql.md docs/investigations/openclaw-official-docs-review.md docs/investigations/openclaw-memory-architecture-analysis.md` and record the full heading inventory in §6 Execution Log under `Heading inventory — comparative and reference investigations` before editing these files.
2. Create the four same-name fragment folders listed in §3.
3. Move detailed content into the planned fragment files, keeping evaluation tables and comparison rationale intact.
4. Rewrite each top-level investigation file into the landing-page template from §3.
5. Where one comparison study informs another investigation, add precise cross-links between fragments instead of only broad landing-page references.

**Expected output:**
- Four new fragment folders with focused comparison/reference docs
- Four compact landing pages retained at the original top-level paths

**Verification:**
```powershell
rg --files docs/investigations/language-stack-recommendation docs/investigations/sqlite-vs-postgresql docs/investigations/openclaw-official-docs-review docs/investigations/openclaw-memory-architecture-analysis
rg "Read This When|Fragment Map" docs/investigations/language-stack-recommendation.md docs/investigations/sqlite-vs-postgresql.md docs/investigations/openclaw-official-docs-review.md docs/investigations/openclaw-memory-architecture-analysis.md
```
Expected result: each comparison/reference investigation has its fragment folder and landing-page sections, and §6 contains the pre-edit heading inventory for this document family.

**Failure handling:** If a comparison section clearly belongs in more than one fragment, keep the full content in the most authoritative fragment and link to it from the secondary location rather than duplicating the content.

**Checkpoint:** Do not start Task 4.4 until all fifteen expected fragment files for these four investigations exist, all four landing pages are compact, and the comparative/reference heading inventory is recorded in §6.

---

### Task 4.4: Update Governance Consumers To The New Investigation Structure

**Objective:** Make the new split structure immediately usable by the repo's planning and governance workflow.

**Requirement mapping:** §2d row 3

**Input:**
- `.github/copilot-instructions.md`
- `.github/prompts/plan.prompt.md`
- `.github/prompts/plan-new.prompt.md`
- `.github/planning/story-board.md`
- `.github/planning/query-packets/QP-011-governance-review-remediation.md`
- New landing pages and fragment paths created in Tasks 4.1 to 4.3

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Update `.github/copilot-instructions.md` in two specific places: the `Source Of Truth` list must still name the eight retained top-level investigation files, and the surrounding guidance must state that each retained file is now a landing page backed by a focused fragment set.
2. Update `.github/prompts/plan.prompt.md` in the `Key Files` section so the investigation guidance explicitly distinguishes landing pages from fragment folders. If a sentence still implies broad monolith reads, narrow it to landing pages plus targeted fragments.
3. Update `.github/prompts/plan-new.prompt.md` in two specific places: the `Context Messaging Rule` example that points to `workflow-and-prompt-design.md`, and the `Key Files` list that currently names `docs/investigations/` generically. Replace those broad references with landing-page-plus-fragment guidance.
4. Update `.github/planning/story-board.md` in the lines that become stale under the split, with special attention to the `ST-002` acceptance criterion that currently cites `memory-architecture-design.md §6`. Replace section-specific references with the precise fragment path that holds the storage-schema detail.
5. Update `.github/planning/query-packets/QP-011-governance-review-remediation.md` so its `Artifacts To Read First During /plan` section stops at the most relevant workflow and context-engineering fragments rather than only the monolith landing pages.
6. Re-run a repository-wide search for `docs/investigations/` references and adjust any newly stale governance reference discovered during execution.

**Expected output:**
- Governance files that intentionally reference either the retained landing pages or focused fragment docs

**Verification:**
```powershell
rg "docs/investigations/" .github docs
```
Expected result: every remaining reference is intentional, resolves to an existing file, and matches one of these target patterns: retained landing page references in `.github/copilot-instructions.md`, narrowed investigation guidance in `.github/prompts/plan.prompt.md` and `.github/prompts/plan-new.prompt.md`, precise fragment-level updates for stale board/query-packet references, or story-doc references that remain intentionally broad.

**Failure handling:** If a governance reference cannot be made more precise without changing prompt behaviour, keep the landing-page reference and record the limitation in §6b.

**Checkpoint:** Do not start Task 4.5 until the exact files listed above have been reviewed and the repository-wide search shows no accidental stale references introduced by the split.

---

### Task 4.5: Run The Completeness Review And Final Link Pass

**Objective:** Prove that the split preserved design authority and that navigation works end to end.

**Requirement mapping:** §2d row 4

**Input:**
- All updated landing pages, fragment files, and governance consumers

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Run `rg --files docs/investigations` and confirm that each original top-level investigation path still exists alongside its fragment folder.
2. For each of the eight investigations, compare the current fragment headings against the pre-split heading inventories recorded in §6 during Tasks 4.1 to 4.3. Confirm every original major section has exactly one destination in the new structure and note any merged or renamed headings in §6c.
3. Open each landing page and confirm the first screen is compact: summary, "Read This When", fragment links, and design-authority note only. If a landing page includes detailed rationale that belongs in a fragment, move it before completion.
4. Follow the workflow and context-engineering references from `.github/prompts/plan.prompt.md`, `.github/prompts/plan-new.prompt.md`, and `.github/planning/query-packets/QP-011-governance-review-remediation.md` to confirm a planner can reach the needed detail in one or two hops.
5. Record the verification outcome in §6 Execution Log and §7b Outcomes & Retrospective, including a short checklist showing that all eight landing pages, all three heading inventories, and the targeted governance references were reviewed.

**Expected output:**
- A verified split structure with no missing design-authority content and no broken governance navigation

**Verification:**
```powershell
rg --files docs/investigations
rg "docs/investigations/" .github docs
git diff --stat
```
Expected result: the split structure is visible in the file list, governance references resolve to the intended paths, the diff shows the planned landing-page plus fragment changes, and the recorded heading inventories in §6 are sufficient to prove coverage for all eight investigations.

**Failure handling:** If any original major section has no destination or any landing page expands back into a monolith, stop completion, fix the omission, and re-run the review before moving the story forward.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | — |
| **Last successful command** | — |
| **Expected outputs produced** | Story, query packet, and approved-but-blocked ExecPlan created during planning; execution not started |
| **Next task** | Task 4.1 — Split The Governance-Heavy Investigations |
| **Known blockers** | `ST-011` must be cleared or the story must be explicitly unblocked before execution |
| **Last updated** | 2026-05-03 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-03T00:00:00Z | Planning setup | completed | Added `ST-013`, created `QP-013`, drafted and revised ExecPlan | Review the revised plan with the PO |
| 2026-05-03T00:15:00Z | Plan review | completed | PO approved the revised ExecPlan and kept the story blocked by `ST-011` | Wait for `ST-011` completion, then start Task 4.1 |

### Avoidance

- 2026-05-03: Do not delete or rename the eight existing top-level investigation paths. They must remain present as the design-authority landing pages.
- 2026-05-03: Do not shorten content by dropping rationale. Split it into fragments first, then trim only the landing pages.

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Create fragment files first, then rewrite landing pages, then update governance references | Before first landing-page rewrite | 🟢 Active |
| 2 | If a fragment layout fails, pause and seek plan review instead of improvising a new taxonomy | Before changing the approved fragment layout | ⬜ Reserve |

### Approach Failure Log
(Empty — no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback (hard cap)

---

## §6. Execution Log

- 2026-05-03: Draft ExecPlan authored from `QP-013-split-investigation-docs.md`.
- 2026-05-03: Revised ExecPlan approved by the PO; execution remains blocked by `ST-011`.

---

## §6b. Surprises & Discoveries

- Observation: `ST-012` was already present on the board for a different governance story, so this work could not reuse that story ID from earlier scoping notes.
  Evidence: `.github/planning/story-board.md` already contains `ST-012: Add discoverable AI-governance asset catalog and validation`.
  Impact: The split-investigation work was reserved as `ST-013`, and all planning artifacts use that updated ID.

---

## §6c. Decision Log

- Decision: Keep the eight existing top-level investigation files in place as landing pages and move the detail into same-name fragment folders.
  Rationale: This preserves the current design-authority entry points while reducing context load.
  Date: 2026-05-03
- Decision: Sequence `ST-013` behind `ST-011`.
  Rationale: Both stories touch governance files, and the governance-review workflow should land first.
  Date: 2026-05-03

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

Achieved: Planning artifacts prepared for `ST-013`; revised ExecPlan approved; execution not started.
Remains: Execute Tasks 4.1 to 4.5 after `ST-011` clearance or explicit unblock.
Lesson: Broad documentation restructures need a locked fragment taxonomy before file edits begin.

---

## Revision Notes

- 2026-05-03: Initial draft created from `QP-013-split-investigation-docs.md` during PO-guided planning.
- 2026-05-03: Revised with stronger verification, phase checkpoints, and precise governance-consumer update targets; then approved by the PO while remaining blocked by `ST-011`.