# ExecPlan — ST-015: Improve ExecPlan template to show outcomes up front

> Status: ✅ Ready for /continue
> Story: ST-015
> Created: 2026-05-06
> Parent: `.github/planning/query-packets/QP-015-execplan-outcomes-template.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. The sections §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective must be kept up to date as work proceeds.

---

## §1. Background & Context

ST-015 improves the governance template used to write all story execution plans. The current template places outcomes in §7b near the bottom of the document, after tasks, recovery protocol, and execution logs. That structure makes completion review slower because readers must scan deep into the file to understand what was actually delivered.

The PO locked direction in collaborative scoping: outcomes must be mandatory and must appear immediately after Background as §1b. The section must use a single common required-field structure for all stories and then provide type-specific prompts so spikes, features, and infrastructure/debt stories each summarize results in the most useful way.

This story is governance-only and does not modify runtime application code. It changes planning assets under `.github/planning/execplans/`.

Key terms used in this plan:

- **Outcomes & Conclusions**: the primary completion summary that states what was delivered, what was not delivered, and what changed.
- **Common required-field structure**: one shared set of fields that every story type must fill in.
- **Type-specific prompts**: additional guidance by story type (spike, feature, infrastructure/debt).
- **Supporting evidence**: concrete command output references or artifact links that back each key claim.
- **Worked example artifact**: a separate document that demonstrates how §1b is filled, without retrofitting historical completed ExecPlans in place.

Relevant files:

- `.github/planning/execplans/_TEMPLATE.md` (target template)
- `.github/planning/execplans/supporting_material/exec-plan-ST-014-outcomes-worked-example.md` (worked example target)
- `.github/planning/execplans/exec-plan-ST-014.md` (reference only; do not retrofit directly)
- `.github/planning/query-packets/QP-015-execplan-outcomes-template.md` (scoped requirements source)

Explicit out-of-scope boundary:

- Retrofitting multiple completed historical ExecPlans beyond the single supporting worked example artifact.

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

- After opening `.github/planning/execplans/_TEMPLATE.md`, a reader sees `## §1b. Outcomes & Conclusions` immediately after `## §1. Background & Context`.
- After reading the new §1b guidance, a reader can find all required fields: completion status, key findings/achievements, requirements met vs unmet, architectural impact, supporting evidence, and downstream changes.
- After reading §1b guidance, a reader can identify distinct prompts for spike, feature, and infrastructure/debt stories.
- After opening `.github/planning/execplans/supporting_material/exec-plan-ST-014-outcomes-worked-example.md`, a reviewer can see a concrete worked example of the §1b structure populated using ST-014 context.
- After reviewing template narrative flow, intent/background leads into outcomes, then into requirements and execution details.
- After checking changed files, there are no broad historical retrofits to multiple completed ExecPlans.

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

Status: ✅ Ready

---

## §2c. Plan Review Notes

(Empty — populated by /continue when escalating issues)

---

## §2d. Requirement Traceability Matrix

| Requirement (source) | Must appear in output artifact(s) | Implemented by task(s) | Verification evidence |
|---|---|---|---|
| Add mandatory §1b Outcomes section immediately after Background (PO scoping + board AC) | `.github/planning/execplans/_TEMPLATE.md` contains `## §1b. Outcomes & Conclusions` directly after §1 | Task 4.1 | `Select-String` and ordered section checks in Task 4.1 verification |
| Use one common required-field structure (PO scoping) | Template §1b includes one shared field set for all story types | Task 4.1 | Presence of all required common fields in template |
| Include type-specific prompts for spike/feature/infrastructure-debt (PO scoping + board AC) | Template §1b contains explicit prompts by story type | Task 4.1 | `Select-String` finds all three type labels in template |
| Require evidence-backed outcome claims (PO scoping) | Template §1b guidance states minimum evidence requirement per key claim | Task 4.1, Task 4.2 | `Select-String` finds evidence requirement language |
| Provide separate worked example using ST-014 context (PO scoping) | Supporting file under `supporting_material` demonstrates populated §1b | Task 4.3 | Presence of §1b and required fields in worked example file |
| Clarify narrative flow intent -> requirements -> delivered outcomes (board AC) | Template wording makes §1 + §1b + §2 order explicit and non-duplicative | Task 4.2 | Review command outputs confirm ordered headings and updated guidance |
| Exclude broad historical retrofits beyond one supporting example (PO scope lock) | No edits to multiple completed ExecPlans; only template + one supporting artifact + ST-015 planning files | Task 4.4 | `git diff --name-only` scoped check |

If a scoped requirement does not map cleanly to an output artifact, stop and escalate during `/continue` rather than marking Ready.

---

## §3. Preconditions

- Working tree root exists at `c:\projects\ai-memory\`.
- The following files exist before execution:
  - `.github/planning/execplans/_TEMPLATE.md`
  - `.github/planning/execplans/supporting_material/exec-plan-ST-014-outcomes-worked-example.md`
  - `.github/planning/execplans/exec-plan-ST-014.md`
- `git` is installed and callable for changed-file verification:
  ```powershell
  git --version
  ```
- `rg` is preferred for fast heading checks (fallback to `Select-String` if unavailable):
  ```powershell
  rg --version
  ```

Execution guardrails:

- Keep edits limited to planning artifacts.
- Do not retrofit completed historical ExecPlans in place as part of this story.
- If a required supporting artifact is missing, create it in `supporting_material` rather than editing `exec-plan-ST-014.md`.

---

## §4. Task Definitions

### Task 4.1: Add mandatory §1b Outcomes & Conclusions to the template

**Objective:** Introduce a standardized outcomes section directly after §1 with required common fields and type-specific prompts.

**Input:**
- `.github/planning/execplans/_TEMPLATE.md`
- Requirements from §2d rows 1-4

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Open `.github/planning/execplans/_TEMPLATE.md`.
2. Insert a new section `## §1b. Outcomes & Conclusions` immediately after `## §1. Background & Context`.
3. In §1b, add one shared required-field block that explicitly requires:
   - completion status (full/partial/not completed)
   - key findings or achievements
   - requirements met vs unmet
   - architectural impact
   - supporting evidence
   - downstream changes
4. In the same §1b section, add type-specific prompt subsections for:
   - spike stories
   - feature stories
   - infrastructure/debt stories
5. Add explicit wording that each key claim in §1b must cite at least one command output or artifact reference.

**Expected output:** Updated template with mandatory §1b section containing complete shared fields and type-specific guidance.

**Requirement mapping:** §2d rows 1, 2, 3, 4.

**Verification:**
```powershell
Select-String -Path ".github/planning/execplans/_TEMPLATE.md" -Pattern "## §1\. Background & Context|## §1b\. Outcomes & Conclusions|completion status|requirements met|architectural impact|supporting evidence|downstream changes|spike|feature|infrastructure|debt" -CaseSensitive
```
Expected result: All required headings and field phrases are present.

**Failure handling:** If heading placement is ambiguous, reorder sections so §1b appears directly after §1 and rerun verification.

---

### Task 4.2: Reconcile template flow and avoid duplicated outcomes guidance

**Objective:** Ensure the template communicates one canonical outcomes summary location up front and keeps late-section retrospective content non-conflicting.

**Input:**
- Updated `.github/planning/execplans/_TEMPLATE.md` from Task 4.1

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Review the opening "living document" sentence and section descriptions in `.github/planning/execplans/_TEMPLATE.md`.
2. Update wording where needed so readers understand §1b is the primary outcomes summary for review visibility.
3. Keep §7b as retrospective/deeper closeout notes while removing any wording that implies outcomes are only documented at the end.
4. Confirm section order supports the flow: title/status -> §1 background -> §1b outcomes -> §2 definition of done -> execution details.

**Expected output:** Template wording aligns on a single up-front outcomes summary while preserving end-of-story retrospective detail.

**Requirement mapping:** §2d rows 4 and 6.

**Verification:**
```powershell
Select-String -Path ".github/planning/execplans/_TEMPLATE.md" -Pattern "§1b\. Outcomes & Conclusions|§7b|living document|Definition of Done" -CaseSensitive
```
Expected result: Wording references §1b as the up-front outcomes section and preserves §7b as retrospective notes.

**Failure handling:** If wording creates ambiguity, prefer simpler language that explicitly names one primary summary location: §1b.

---

### Task 4.3: Update ST-014 worked example artifact to demonstrate the new §1b shape

**Objective:** Provide one concrete, separate supporting artifact that demonstrates exactly how to populate §1b using ST-014 context.

**Input:**
- `.github/planning/execplans/supporting_material/exec-plan-ST-014-outcomes-worked-example.md`
- `.github/planning/execplans/exec-plan-ST-014.md` (reference only)
- Updated template guidance from Tasks 4.1-4.2

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Open `.github/planning/execplans/supporting_material/exec-plan-ST-014-outcomes-worked-example.md`.
2. Update the file so it includes a completed `§1b. Outcomes & Conclusions` example aligned to the new required fields.
3. Ensure the example includes type-appropriate spike framing (discoveries, recommendations, unresolved risks if any).
4. Include concrete supporting evidence references for key claims (command outputs and/or artifact references).
5. Keep this as a separate support artifact; do not retrofit `.github/planning/execplans/exec-plan-ST-014.md` in place.

**Expected output:** Supporting worked example file demonstrates a fully populated §1b for a spike story.

**Requirement mapping:** §2d row 5.

**Verification:**
```powershell
Select-String -Path ".github/planning/execplans/supporting_material/exec-plan-ST-014-outcomes-worked-example.md" -Pattern "§1b\. Outcomes & Conclusions|Completion status|Key findings|Requirements met|Architectural impact|Supporting evidence|Downstream changes|spike" -CaseSensitive
```
Expected result: All required fields and spike framing terms appear in the worked example.

**Failure handling:** If the current supporting artifact is too divergent, replace content with a clean worked example aligned to the updated template.

---

### Task 4.4: Run bounded validation and enforce scope guardrails

**Objective:** Prove ST-015 outputs satisfy requirements and remain within agreed scope boundaries.

**Input:**
- Edited template and supporting artifact
- Current git working tree state

**Working directory:** `c:\projects\ai-memory\`

**Steps:**
1. Run heading-order and required-field checks from prior tasks.
2. Run a changed-files check to confirm edits stay scoped to ST-015 planning artifacts.
3. Verify no broad retrofit edits were made to multiple completed ExecPlans.
4. Record verification outputs in §6 Execution Log of this ST-015 ExecPlan during execution.

**Expected output:** Verified, scoped changes ready for PO review.

**Requirement mapping:** §2d rows 1-7.

**Verification:**
```powershell
git diff --name-only
```
Expected result: Changed files are limited to ST-015 planning artifacts, template file, and one supporting worked-example artifact; no broad edits across many completed ExecPlans.

**Failure handling:** If unrelated files appear, unstage and exclude them from this story before continuing.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.3 — Update ST-014 worked example artifact to demonstrate the new §1b shape |
| **Last successful command** | `Select-String -Path .github/planning/execplans/supporting_material/exec-plan-ST-014-outcomes-worked-example.md -Pattern 'Outcomes & Conclusions','Completion status','Key findings','Requirements met','Architectural impact','Supporting evidence','Downstream changes','spike'` |
| **Expected outputs produced** | `.github/planning/execplans/supporting_material/exec-plan-ST-014-outcomes-worked-example.md` aligned to required `§1b` fields with explicit spike framing and evidence sections |
| **Next task** | Task 4.4 — Run bounded validation and enforce scope guardrails |
| **Known blockers** | None |
| **Last updated** | 2026-05-06T12:58:54.6125095+02:00 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-06T12:53:53.1177451+02:00 | Task 4.1 | Completed | Template updated with `§1b`; verification `Select-String` matched headings and required literals | Task 4.2 |
| 2026-05-06T12:55:25.2949004+02:00 | Task 4.2 | Completed | Template wording updated to set `§1b` as primary outcomes summary and keep `§7b` retrospective-only; verification command passed | Task 4.3 |
| 2026-05-06T12:58:54.6125095+02:00 | Task 4.3 | Completed | ST-014 worked example updated with required `§1b` field labels and spike framing; verification matched all required literals | Task 4.4 |

### Avoidance

(Append dated entries here. Do not delete prior guidance.)

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Update template first, then align worked example | Before first edit in `_TEMPLATE.md` | 🟢 Active |
| 2 | Draft worked example first, then codify template | Before first edit in supporting example | ⬜ Reserve |

### Approach Failure Log
(Empty — no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true -> propose rollback
- 3 failed attempts at same task -> MUST propose rollback (hard cap)

---

## §6. Execution Log

(Populated during execution — timestamped entries of significant actions)

- 2026-05-06T12:53:53.1177451+02:00 — Completed Task 4.1 by adding mandatory `§1b. Outcomes & Conclusions` in `.github/planning/execplans/_TEMPLATE.md` with shared required fields, evidence rule, and type-specific prompts; verification command passed.
- 2026-05-06T12:55:25.2949004+02:00 — Completed Task 4.2 by reconciling narrative flow text in `.github/planning/execplans/_TEMPLATE.md` so `§1b` is the primary summary and `§7b` remains retrospective detail; verification command passed.
- 2026-05-06T12:58:54.6125095+02:00 — Completed Task 4.3 by updating `.github/planning/execplans/supporting_material/exec-plan-ST-014-outcomes-worked-example.md` to use the required `§1b` field labels and spike-oriented framing; verification command passed.

---

## §6b. Surprises & Discoveries

(Document unexpected behaviours, tradeoffs, or governance edge cases. Provide evidence.)

- Observation: No unexpected behaviours in Task 4.1.
  Evidence: Verification command returned all required heading and field matches.
  Impact: Continue with planned sequence to Task 4.2.

- Observation: No unexpected behaviours in Task 4.2.
  Evidence: Verification command matched `living document`, `§1b`, `Definition of Done`, and `§7b` references.
  Impact: Continue with planned sequence to Task 4.3.

- Observation: PowerShell rendering truncated one regex-based verification output that included `§` literals; a literal-pattern verification rerun produced complete evidence.
  Evidence: Successful `Select-String` literal-pattern output with line hits for all required Task 4.3 field labels.
  Impact: Task 4.3 completion confirmed without changing scope or outputs.

---

## §6c. Decision Log

(Record every decision made during execution with rationale.)

- Decision: Kept required field names in lower-case literal form inside `§1b`.
  Rationale: Task 4.1 verification is case-sensitive and requires exact literal matches for required phrases.
  Date: 2026-05-06

- Decision: Preserved the `§7b. Outcomes & Retrospective` heading and clarified its role instead of renaming the section.
  Rationale: This keeps compatibility with existing templates while making `§1b` the clear primary outcomes location.
  Date: 2026-05-06

- Decision: Adjusted worked-example heading capitalization to literal forms (`Key findings`, `Requirements met`, etc.).
  Rationale: Task 4.3 verification requires case-sensitive literal matches for required §1b field names.
  Date: 2026-05-06

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

(Summarize completion reflections. Primary at-a-glance outcomes must be captured in §1b of the updated template artifacts.)

Achieved: ...
Remains: ...
Lesson: ...

---

## Revision Notes

- 2026-05-06: Initial Ready ExecPlan authored from PO-scoped QP-015 decisions.
- 2026-05-06: Execution updates recorded for completed Task 4.1 (ledger, progress history, execution log, decision log).
- 2026-05-06: Execution updates recorded for completed Task 4.2 (ledger, progress history, execution log, and decision updates).
- 2026-05-06: Execution updates recorded for completed Task 4.3 (ledger, progress history, execution log, surprises, and decision updates).
