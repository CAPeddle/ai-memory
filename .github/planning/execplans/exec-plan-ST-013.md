# ExecPlan — ST-013: Split investigation docs into landing pages and focused fragments

> Status: ⬜ Not Ready — draft pending PO review, execution blocked by ST-011
> Story: ST-013
> Created: 2026-05-03
> Updated: 2026-05-17
> Parent: `.github/planning/query-packets/QP-013-split-investigation-docs.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. Keep §1b Outcomes & Conclusions current as the primary completion summary, and keep §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective up to date as supporting execution detail.

---

## §1. Background & Context

This story reorganizes investigation documentation under `docs/investigations/` so planning/execution workflows can navigate by intent instead of loading broad monoliths. A landing page remains at each original top-level investigation path and points to focused fragments. Detailed content is moved to fragment files with hybrid granularity: section-level by default, subsection-level only when a section is oversized.

Terms used in this plan:
- **Landing page:** the retained top-level investigation file (for example, `docs/investigations/workflow-and-prompt-design.md`) rewritten as compact navigation content.
- **Fragment:** a focused markdown file under a same-name folder (for example, `docs/investigations/workflow-and-prompt-design/02-planning-and-intake.md`).
- **Split manifest:** a checked-in matrix file listing each source document section and its destination fragment path.
- **Governance consumer:** prompts, instructions, board entries, and query packets that reference investigation docs.

Scope for this revision is expanded by PO decision to include all investigation content under `docs/investigations/`, including nested trees such as `Discussions/` and `Youtube/`. This story remains blocked behind ST-011 for execution to avoid concurrent governance-file churn.

---

## §1b. Outcomes & Conclusions

- completion status: not completed (planning draft only)
- key findings/achievements:
  - Scope, granularity policy, link policy, and completeness proof method were locked with PO.
  - Plan converted to inventory-driven execution to handle all investigation content deterministically.
- requirements met vs unmet:
  - met: planning scope decisions captured in QP-013 and this draft.
  - unmet: no implementation execution performed (by design).
- architectural impact: unchanged architecture decisions; documentation structure/workflow guidance only.
- supporting evidence:
  - Updated query packet: `.github/planning/query-packets/QP-013-split-investigation-docs.md`
  - This plan draft: `.github/planning/execplans/exec-plan-ST-013.md`
- downstream changes:
  - Story metadata alignment in board (blocked-by state)
  - After PO approval, run `/continue` only when ST-011 is cleared or explicit unblock is granted.

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:
- After running `rg --files docs/investigations`, every original top-level investigation file still exists and has a same-name fragment folder.
- After opening each retained top-level investigation file, the first screen is compact and contains summary, `Read This When`, `Fragment Map`, and design-authority note.
- After running `rg "docs/investigations/" .github docs`, governance references are landing-page-first and use fragment-level links where precision is explicitly required.
- After generating `docs/investigations/split-section-mapping-matrix.md`, every original major section from all scoped investigation sources has exactly one destination path.
- After review, no scoped content is dropped; omissions are zero in the matrix verification report.

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

Status: ⬜ Not ready for execution until PO approves this draft and ST-011 dependency is cleared or explicitly overridden.

---

## §2c. Plan Review Notes

- 2026-05-17: Draft updated from PO scoping rounds. Pending PO review.

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Keep retained top-level investigations as compact landing pages (ST-013, QP-013) | Top-level files with compact landing-page sections | Task 4.2, Task 4.3 | `rg "Read This When|Fragment Map" docs/investigations/*.md` + manual spot checks |
| Split detailed content into focused fragments with hybrid granularity (PO 2026-05-17) | Fragment folders/files and mapped destinations | Task 4.1, Task 4.2, Task 4.3 | Manifest and matrix paths exist; file counts match |
| Include all investigation content under `docs/investigations/` including nested trees (PO 2026-05-17) | Inventory includes top-level + nested markdown sources | Task 4.1, Task 4.3 | Inventory report + zero-unmapped rows |
| Governance references should be landing-page-first with targeted fragments where needed (PO 2026-05-17) | Updated governance consumer links | Task 4.4 | `rg "docs/investigations/" .github docs` review |
| Completeness proof via section mapping matrix (PO 2026-05-17) | `docs/investigations/split-section-mapping-matrix.md` | Task 4.1, Task 4.5 | Matrix validation command outputs in §6 |

---

## §3. Preconditions

- ST-011 must be completed or explicit unblock must be provided before execution starts.
- Working directory for all commands: `c:\projects\ai-memory`.
- Tooling available: `rg` and `git` in terminal.
- No concurrent story holds lock on `.github/planning/` or `.github/planning/story-board.md`.

### Split Manifest Template

Create `docs/investigations/split-manifest.md` with this table:

```markdown
| Source file | Source heading | Destination file | Destination heading | Notes |
|---|---|---|---|---|
| docs/investigations/example.md | ## Heading A | docs/investigations/example/01-heading-a.md | # Heading A | section-level |
```

### Section Mapping Matrix Template

Create `docs/investigations/split-section-mapping-matrix.md` with this table:

```markdown
| Source doc | Source major section | Destination path | Status |
|---|---|---|---|
| docs/investigations/example.md | ## Major Section | docs/investigations/example/01-major-section.md | mapped |
```

---

## §4. Task Definitions

### Task 4.1: Build Inventory, Manifest, and Matrix Skeleton

**Objective:** Create deterministic source inventory and mapping skeleton before any content rewrite.

**Input:** Existing `docs/investigations/` tree.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Run `rg --files docs/investigations -g "*.md" > docs/investigations/_inventory-all-md.txt`.
2. Build top-level source list by filtering `_inventory-all-md.txt` to files directly under `docs/investigations/` (excluding fragment folders that do not yet exist).
3. Create `docs/investigations/split-manifest.md` using the template in §3.
4. Create `docs/investigations/split-section-mapping-matrix.md` using the template in §3.
5. For each source markdown file in inventory, capture headings via `rg --no-heading "^(##|###) " <file>` and append rows to manifest and matrix with temporary destination placeholders.

**Expected output:** Inventory file, manifest scaffold, and matrix scaffold with one row per major source heading.

**Requirement mapping:** §2d rows 2, 3, 5

**Verification:**
```powershell
Test-Path docs/investigations/_inventory-all-md.txt
Test-Path docs/investigations/split-manifest.md
Test-Path docs/investigations/split-section-mapping-matrix.md
rg "^\| docs/investigations/" docs/investigations/split-section-mapping-matrix.md
```
Expected result: all files exist and matrix contains mapped source rows.

**Failure handling:** If heading extraction fails for any source file, log the file path in §6b and halt before rewriting content.

---

### Task 4.2: Split and Rewrite Top-Level Investigation Documents

**Objective:** Convert every top-level investigation markdown file into a compact landing page plus fragment set.

**Input:** Top-level source files listed in `_inventory-all-md.txt`.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. For each top-level source file, create same-name fragment folder (strip `.md`).
2. Apply hybrid granularity:
   - create one fragment per major `##` section by default;
   - split into subsection fragments only if section exceeds 250 lines or contains 4+ `###` blocks.
3. Move detailed content into fragment files while preserving original wording unless minimal connective text is required.
4. Rewrite original top-level file into compact landing-page format: summary, `Read This When`, `Fragment Map`, design-authority note.
5. Update manifest and matrix rows from placeholder destinations to actual paths.

**Expected output:** All top-level investigation files transformed into landing pages; corresponding fragment folders created and populated.

**Requirement mapping:** §2d rows 1, 2, 5

**Verification:**
```powershell
rg --files docs/investigations -g "*.md"
rg "Read This When|Fragment Map|Design Authority Note" docs/investigations/*.md
```
Expected result: landing-page sections exist in all top-level docs and fragment folders exist.

**Failure handling:** If a section cannot be split without losing meaning, keep it in a single section-level fragment and record exception in §6c.

---

### Task 4.3: Normalize Nested Investigation Trees

**Objective:** Bring nested investigation content (including `Discussions/` and `Youtube/`) into the same navigable model without deleting source evidence.

**Input:** Nested markdown files from `_inventory-all-md.txt` under subdirectories.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. For each first-level subtree under `docs/investigations/` that contains markdown, create or update an index landing file at subtree root named `_index.md`.
2. For nested markdown files already focused enough, keep file content but add standardized front sections (`When To Read This`, `Related Links`) if missing.
3. For oversized nested markdown files (same threshold as Task 4.2), split into sibling fragment files and keep original file as a compact landing page.
4. Add links from each subtree `_index.md` to all nested files/fragments.
5. Update manifest and matrix rows for all nested-source mappings.

**Expected output:** Nested trees are navigable through `_index.md` and follow the same compact-entry-plus-focused-content rule.

**Requirement mapping:** §2d rows 2, 3, 5

**Verification:**
```powershell
rg --files docs/investigations/Discussions -g "*.md"
rg --files docs/investigations/Youtube -g "*.md"
Test-Path docs/investigations/Discussions/_index.md
Test-Path docs/investigations/Youtube/_index.md
```
Expected result: subtree index files exist and nested content is represented in manifest/matrix.

**Failure handling:** If subtree volume is too large for one pass, stop and record exact remaining file list in §5b Progress History before ending session.

---

### Task 4.4: Apply Landing-Page-First Governance Reference Updates

**Objective:** Align governance consumers to the new structure using landing-page-first links with targeted fragments where needed.

**Input:** Updated investigation landing pages/fragments and existing governance consumers.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Update `.github/copilot-instructions.md` to explain landing-page-plus-fragment model while preserving authority references.
2. Update `.github/prompts/plan.prompt.md` and `.github/prompts/plan-new.prompt.md` to reference landing pages as defaults and targeted fragments for narrow tasks.
3. Update `.github/planning/story-board.md` and relevant query packets so stale monolith/section references resolve to current destinations.
4. Run repository search for `docs/investigations/` references and fix any stale or broken path.

**Expected output:** Governance references are consistent with split structure.

**Requirement mapping:** §2d row 4

**Verification:**
```powershell
rg "docs/investigations/" .github docs
```
Expected result: references resolve and follow landing-page-first policy.

**Failure handling:** If a precise fragment target is not yet stable, keep landing-page link and log defer note in §6c.

---

### Task 4.5: Final Completeness Audit and Signoff Evidence

**Objective:** Prove no scoped content was dropped and navigation remains usable.

**Input:** Completed split, updated manifest/matrix, updated governance references.

**Working directory:** `c:\projects\ai-memory`

**Steps:**
1. Validate matrix: every row has non-empty destination path and `Status = mapped`.
2. Validate files: every destination path in matrix exists.
3. Validate navigation: spot-check each top-level landing page and each subtree `_index.md` for working links.
4. Record audit summary in §7b with counts: total source files, total major sections, mapped rows, unmapped rows.
5. If unmapped rows > 0, stop and fix before closeout.

**Expected output:** Complete evidence of preservation and navigability.

**Requirement mapping:** §2d row 5

**Verification:**
```powershell
rg "\| mapped \|" docs/investigations/split-section-mapping-matrix.md
rg "\|  \|$" docs/investigations/split-section-mapping-matrix.md
git diff --stat
```
Expected result: mapped rows present, no empty destination/status rows, and diff reflects planned split artifacts.

**Failure handling:** Any unmapped section blocks completion.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Planning update only (no execution tasks run) |
| **Last successful command** | n/a |
| **Expected outputs produced** | Updated query packet + updated ExecPlan draft |
| **Next task** | PO review, then Task 4.1 |
| **Known blockers** | ST-011 dependency gate |
| **Last updated** | 2026-05-17 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-17T00:00:00Z | /plan scoping refresh | completed | Updated QP-013 and ExecPlan draft | PO review and approval |

### Avoidance

- Do not delete or rename retained top-level investigation paths.
- Do not mark completion without zero-unmapped matrix rows.

---

## §6. Execution Log

(Empty — execution has not started)

---

## §6b. Surprises & Discoveries

(Empty)

---

## §6c. Decision Log

- Decision: Use hybrid granularity with explicit threshold.
  Rationale: Balance fragmentation overhead against targeted readability.
  Date: 2026-05-17
- Decision: Landing-page-first governance link policy.
  Rationale: Stable references first; precision links where valuable.
  Date: 2026-05-17
- Decision: Keep execution blocked behind ST-011.
  Rationale: Prevent concurrent governance churn.
  Date: 2026-05-17

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification for §2 acceptance criteria.
2. Update board state per governance rules.
3. Present evidence links to PO.

---

## §7b. Outcomes & Retrospective

(Reserved for execution)

---

## Revision Notes

- 2026-05-17: Rewrote plan draft from PO scoping updates (expanded scope to all investigations, hybrid granularity, landing-page-first links, section mapping matrix requirement).
