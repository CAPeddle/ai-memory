# ExecPlan — ST-011: Institutionalize recurring governance review and remediation

> Status: ✅ Ready
> Story: ST-011
> Created: 2026-05-03
> Parent: `.github/planning/query-packets/QP-011-governance-review-remediation.md`
> PLANS.md: This document must be maintained per `.github/planning/execplans/_TEMPLATE.md`

This ExecPlan is a living document. The sections §6b Surprises & Discoveries, §6c Decision Log, and §7b Outcomes & Retrospective must be kept up to date as work proceeds.

---

## §1. Background & Context

The ai-memory repository uses a board-driven kanban workflow with dedicated prompt files for each workflow mode (`/plan`, `/continue`, `/recover`, `/plan-new`). On 2026-05-02, a one-off governance audit revealed several consistency issues: missing folders, inconsistent recovery contracts, and undeclared skills. Those were fixed manually, but no repeatable process existed to catch such drift in the future.

**This story creates a fifth workflow mode — `/governance-review`** — implemented as a prompt file at `.github/prompts/governance-review.prompt.md`. When the PO invokes it, the agent performs a structured audit of governance artifacts, persists findings to a report file, applies safe remediations directly, and escalates risky changes to `/plan`.

**Key terms:**
- **Governance artifacts:** Prompt files, instruction files, ExecPlan template, story-board, query packets, skills, and investigation docs that define how agents interact with this repository.
- **Safe remediation:** Changes that don't alter behavior or policy — file creation, text fixes, dead-link repair, cross-reference corrections.
- **Escalated finding:** A change that would alter board state, prompt behavior, acceptance criteria, or architecture decisions. These are not applied; they are reported for `/plan` to address.
- **Audit report:** A timestamped markdown file under `.github/planning/audit-reports/` documenting what was checked, what was found, and what was fixed or escalated.

**Current file layout relevant to this story:**
```
.github/
├── prompts/
│   ├── plan.prompt.md
│   ├── plan-new.prompt.md
│   ├── continue.prompt.md
│   └── recover.prompt.md
├── instructions/
│   ├── coding-standards.instructions.md
│   └── session-resilience.instructions.md
├── planning/
│   ├── story-board.md
│   ├── execplans/_TEMPLATE.md
│   └── query-packets/
├── skills/
│   └── compound-engineering/SKILL.md
└── copilot-instructions.md
```

After this story, the layout gains:
```
.github/
├── prompts/
│   └── governance-review.prompt.md   ← NEW
└── planning/
    └── audit-reports/
        └── _TEMPLATE.md              ← NEW
```

---

## §2. Definition of Done

Acceptance criteria phrased as observable behaviour:

- After opening `.github/prompts/governance-review.prompt.md`, it contains valid YAML frontmatter (`name`, `description`, `agent`) and a complete prompt body with a built-in audit checklist.
- After opening `.github/planning/audit-reports/_TEMPLATE.md`, it contains a structured report template with sections for date, checklist results, findings, remediations applied, and escalations raised.
- After invoking the governance-review prompt against the repository, it produces a report file under `.github/planning/audit-reports/` with a timestamped filename and no empty required sections.
- After the validation run, any 2026-05-02 remediations that are still present in the repo pass the relevant checklist items (no regressions).
- After checking the board, ST-011 is moved to Review with the ExecPlan path linked.

---

## §2b. Definition of Ready

All checks must be `[x]` before `/continue` can execute:

- [x] All tasks have step-by-step instructions (no "figure out" tasks)
- [x] Architecture and design decisions documented (not left to executor)
- [x] Input and expected output specified for each task
- [x] Error handling strategy noted for external interactions
- [x] No tasks require judgment calls needing broad project context
- [x] Script templates or boilerplate provided in §3 where applicable
- [x] Every task ends with a verification step (command or assertion)
- [x] Acceptance criteria phrased as observable behaviour

Status: ✅ Ready for /continue

---

## §2c. Plan Review Notes

(Empty — populated by /continue when escalating issues)

---

## §3. Preconditions

**Prerequisites:**
- No prior stories need to be Done.
- The executor needs write access to the `.github/` directory tree.
- No external tools beyond standard file creation and grep.

**Files that must exist before starting:**
- `.github/prompts/plan.prompt.md` (reference for frontmatter format)
- `.github/planning/story-board.md` (for board update in final task)
- `FollowUpSessionLog.txt` (for session-log update)

**Boilerplate: Governance-review prompt frontmatter**
```yaml
---
name: "Governance Review"
description: "Audit ai-memory governance artifacts for drift, apply safe fixes, escalate risky changes"
agent: "agent"
---
```

**Boilerplate: Audit report filename convention**
```
audit-report-YYYY-MM-DD.md
```
If multiple reports in one day, append a sequence: `audit-report-YYYY-MM-DD-2.md`.

---

## §4. Task Definitions

### Task 4.1: Create the audit-reports folder and report template

**Objective:** Establish the output location and structure for governance audit reports.

**Input:** No prior files needed.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create the folder `.github/planning/audit-reports/`.

2. Create the file `.github/planning/audit-reports/_TEMPLATE.md` with the following exact content:

```markdown
# Governance Audit Report

> Date: YYYY-MM-DD
> Triggered by: [PO request | routine check | post-story validation]
> Agent: [model identifier]
> Status: [Complete | Partial — reason]

## Checklist Results

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | All prompts have valid YAML frontmatter | ✅/❌ | |
| 2 | All paths in copilot-instructions.md resolve to existing files | ✅/❌ | |
| 3 | Story-board stories reference existing ExecPlan files | ✅/❌ | |
| 4 | ExecPlan template sections match the recovery-ledger contract | ✅/❌ | |
| 5 | All skills referenced in instructions or prompts have SKILL.md | ✅/❌ | |
| 6 | Query packets referenced by stories exist on disk | ✅/❌ | |
| 7 | No dead cross-references between governance files | ✅/❌ | |

## Discretionary Checks

(Agent may add additional checks beyond the mandatory checklist above.)

| Check | Result | Notes |
|-------|--------|-------|
| | | |

## Findings

### Finding 1: [title]
- **Severity:** safe-fix | escalation
- **Location:** [file path and line if applicable]
- **Description:** [what is wrong]
- **Action taken:** [fixed / escalated to /plan]

## Remediations Applied

| # | File | Change | Commit |
|---|------|--------|--------|
| | | | |

## Escalations Raised

| # | Issue | Reason for escalation | Recommended next step |
|---|-------|----------------------|----------------------|
| | | | |

## Summary

- Checks passed: X/Y
- Safe fixes applied: N
- Escalations raised: M
- Overall status: [Healthy | Needs attention | Blocked on /plan]
```

**Expected output:** The folder `.github/planning/audit-reports/` exists and contains `_TEMPLATE.md`.

**Verification:**
```powershell
Test-Path "c:\projects\ai-memory\.github\planning\audit-reports\_TEMPLATE.md"
```
Expected result: `True`

**Failure handling:** If the directory already exists, skip creation and proceed to file creation.

---

### Task 4.2: Create the governance-review prompt

**Objective:** Create the main deliverable — a prompt file that agents can use to perform a governance audit.

**Input:** The audit-reports template from Task 4.1 must exist (for the prompt to reference it).

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Create the file `.github/prompts/governance-review.prompt.md` with the following exact content:

````markdown
---
name: "Governance Review"
description: "Audit ai-memory governance artifacts for drift, apply safe fixes, escalate risky changes"
agent: "agent"
---

# /governance-review — Governance Audit Mode

You are the **Lead Engineer (LE)** for the ai-memory project in **governance review** mode. Your job is to audit the repository's governance artifacts for internal consistency, apply safe fixes directly, and escalate risky changes to `/plan`.

## Identity

- **Project:** ai-memory — a persistent memory service for AI coding agents
- **Stack:** C# .NET 8+, SQLite + FTS5, ASP.NET Core Minimal API, MCP (ModelContextProtocol SDK)
- **Governance:** Board-driven kanban. This prompt audits governance health; it does not plan features or execute stories.

## Trigger

This prompt is invoked **on-demand by the PO** when they want a governance health check. There is no automatic schedule or event trigger.

## Workflow

1. **Read the board** — `.github/planning/story-board.md` — to understand current state.
2. **Run the mandatory checklist** (see below). For each check, record pass/fail with evidence.
3. **Run discretionary checks** — use judgment to identify additional drift, inconsistencies, or missing artifacts not covered by the mandatory checklist.
4. **Classify findings:**
   - **Safe fix** → apply the remediation directly (file creation, text fix, dead-link repair, cross-reference correction).
   - **Escalation** → document the issue but do not apply the fix. Report it for `/plan` to address.
5. **Write the audit report** — create a new file under `.github/planning/audit-reports/` using the template at `.github/planning/audit-reports/_TEMPLATE.md`. Use filename format: `audit-report-YYYY-MM-DD.md`.
6. **Commit all changes** — atomic commit with message format: `docs(governance): audit report YYYY-MM-DD`.
7. **Present results to PO** — summarize findings, fixes applied, and escalations raised.

## Mandatory Audit Checklist

Run every check below. Record result in the report.

| # | Check | How to verify |
|---|-------|---------------|
| 1 | All prompt files in `.github/prompts/` have valid YAML frontmatter with `name`, `description`, and `agent` fields | Open each `.prompt.md` file; confirm frontmatter parses |
| 2 | All file paths listed in `.github/copilot-instructions.md` resolve to existing files | Extract paths; run `Test-Path` for each |
| 3 | Every story on the board that references an ExecPlan path has that file on disk | Parse board; check each `ExecPlan:` path |
| 4 | The ExecPlan template at `.github/planning/execplans/_TEMPLATE.md` contains §5b Recovery Ledger with both "Current Resume State" and "Progress History" tables | Grep for both headings |
| 5 | Every skill referenced in instructions or prompts has a `SKILL.md` file at the expected path | Search for skill references; verify paths |
| 6 | Every story with a seed query packet reference in its Notes has that file on disk | Parse board Notes fields; check paths |
| 7 | Cross-references between governance files (prompts referencing instructions, instructions referencing docs) resolve to existing files | Grep for relative paths; verify each |

## Discretionary Checks (examples — not exhaustive)

- Recovery-ledger contract consistency across `continue.prompt.md`, `recover.prompt.md`, `session-resilience.instructions.md`, and `_TEMPLATE.md`
- Board metadata consistency (WSJF calculations, blocked-by chains, column placement)
- Investigation docs referenced by stories still exist at claimed paths
- Prompt files don't contain stale references to removed features or renamed files
- Skill files match the structure expected by their consumers
- Upstream material review: check external sources (compound-engineering repos, context-engineering blogs, agent workflow frameworks) for patterns that should be incorporated

## Remediation Boundary

### Safe to apply directly (do not ask — just fix):
- Create missing folders or empty placeholder files referenced by governance artifacts
- Fix typographical errors in instruction or prompt text that don't change meaning
- Repair broken relative links between governance files
- Update cross-references when a file has been renamed but the reference was not updated
- Add missing frontmatter fields to prompt files if the correct value is unambiguous

### Must escalate to /plan (do NOT apply):
- Any change to `.github/planning/story-board.md` content (story additions, moves, metadata changes)
- Any change that alters the behavioral contract of a prompt (new rules, removed constraints, changed workflows)
- Any change to acceptance criteria on existing stories
- Any architecture or design decision change (even if the current state seems wrong)
- Any change to `.github/copilot-instructions.md` that would alter which files are treated as design authority

## Output Format

After completing all checks and remediations:
1. Write the report to `.github/planning/audit-reports/audit-report-YYYY-MM-DD.md`
2. Stage and commit with: `docs(governance): audit report YYYY-MM-DD`
3. Present a summary to the PO including:
   - Number of checks passed vs. failed
   - Safe fixes applied (with brief descriptions)
   - Escalations raised (with recommended next steps)
   - Overall health assessment: Healthy / Needs attention / Blocked on /plan

## Rules

- **Never** modify board state (story additions, column moves, metadata edits)
- **Never** change prompt behavioral contracts without escalation
- **Never** skip the mandatory checklist — run all items every time
- **Never** apply fixes that cross the escalation boundary, even if you're confident they're correct
- **Always** persist findings to a report file — do not leave results only in conversation
- **Always** commit report and safe fixes atomically
- **Always** present escalations clearly so the PO can decide whether to run `/plan`
- **Always** use `vscode_askQuestions` if you need clarification from the PO during the audit

## Key Files

- Board: `.github/planning/story-board.md`
- Prompts: `.github/prompts/`
- Instructions: `.github/instructions/`
- Skills: `.github/skills/`
- ExecPlan template: `.github/planning/execplans/_TEMPLATE.md`
- Audit report template: `.github/planning/audit-reports/_TEMPLATE.md`
- Copilot instructions: `.github/copilot-instructions.md`
- Investigation docs: `docs/investigations/`
````

**Expected output:** The file `.github/prompts/governance-review.prompt.md` exists with valid YAML frontmatter and the complete prompt body.

**Verification:**
```powershell
# Check file exists
Test-Path "c:\projects\ai-memory\.github\prompts\governance-review.prompt.md"
# Check frontmatter
Select-String -Path "c:\projects\ai-memory\.github\prompts\governance-review.prompt.md" -Pattern "^name:" | Select-Object -First 1
```
Expected result: `True` and a line containing `name: "Governance Review"`.

**Failure handling:** If the file already exists, compare to the content above and update only if materially different. If identical, skip.

---

### Task 4.3: Upstream material review

**Objective:** Review external upstream sources for governance, workflow, and context-engineering insights that may have evolved since the project's investigation documents were written. Identify anything that should be incorporated into ai-memory's governance artifacts.

**Input:** The governance-review prompt from Task 4.2 must exist (findings may revise it).

**Working directory:** `c:\projects\ai-memory\`

**Sources to review:**

| # | URL | Focus area |
|---|-----|-----------|
| 1 | https://cursor.com/blog/scaling-agents | Agent scaling patterns, workflow governance |
| 2 | https://github.com/openai/openai-cookbook | Prompt engineering, context management |
| 3 | https://github.com/EveryInc/compound-engineering-plugin | Compound engineering patterns, governance drift |
| 4 | https://github.com/gsd-build/get-shit-done | Task management, planning workflows |
| 5 | https://github.com/andrewyng/context-hub/blob/main/docs/byod-guide.md | Context hub patterns, BYOD agent integration |
| 6 | https://github.com/affaan-m/everything-claude-code | Claude-specific agent patterns, memory workflows |
| 7 | https://github.com/github/awesome-copilot | Copilot ecosystem best practices, customisation patterns |

**Steps:**

1. Fetch each URL and scan for governance/workflow patterns relevant to ai-memory. Focus on:
   - Agent memory and context management patterns
   - Governance drift detection approaches
   - Prompt structure conventions
   - Planning/execution workflow improvements
   - Audit and remediation strategies

2. For each source, note:
   - Key insights relevant to ai-memory
   - Whether any insight suggests a change to existing governance artifacts
   - Whether the insight is already captured in our investigation docs

3. Classify findings:
   - **Safe to incorporate** → Minor additions to the governance-review prompt's discretionary checks, updated references in investigation docs, new checklist items that don't change behavioral contracts
   - **Escalate to /plan** → New workflow patterns that would change prompt behavior, architectural insights that contradict current design authority, process changes that affect the planning model

4. Apply safe incorporations:
   - If the governance-review prompt's discretionary checks section can benefit from new examples, update it
   - If investigation docs have outdated references, fix them
   - Do NOT change mandatory checklist items, remediation boundaries, or workflow contracts

5. Document all findings in a summary section that will feed into the validation audit report (Task 4.4).

**Expected output:**
- A written summary of upstream insights (captured in the execution log §6)
- Any safe incorporations applied to governance artifacts
- Escalation items documented for the audit report

**Verification:**
- Each URL was successfully fetched and reviewed (or marked unavailable if the fetch failed)
- Findings are classified correctly per the safe/escalate boundary
- No behavioral contracts were modified without escalation

**Failure handling:**
- If a URL is unreachable, record as "unavailable — fetch failed" and continue to the next source.
- If no actionable insights are found from a source, record "no actionable findings" and move on.
- Do not block on any single source failing.

---

### Task 4.4: Validate by running the governance-review prompt

**Objective:** Invoke the newly created governance-review prompt against the repository to confirm it works and to validate that the 2026-05-02 audit remediations are still intact.

**Input:** Both files from Tasks 4.1 and 4.2 must exist.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Execute the governance review workflow manually by following the exact steps defined in the prompt created in Task 4.2. Specifically:

2. **Run the mandatory checklist:**
   - Check 1: Open each `.prompt.md` file in `.github/prompts/`. Confirm each has frontmatter with `name`, `description`, `agent`.
   - Check 2: Read `.github/copilot-instructions.md`. Extract all file paths. Run `Test-Path` for each.
   - Check 3: Read the story board. For each story with an `ExecPlan:` field, check if that file exists. (Note: most ExecPlan files won't exist yet — the check confirms the path format is valid and known-existing ones are present.)
   - Check 4: Read `.github/planning/execplans/_TEMPLATE.md`. Confirm it contains both "Current Resume State" and "Progress History" headings under §5b.
   - Check 5: Search prompts and instructions for skill references. Verify each referenced skill has a `SKILL.md`.
   - Check 6: Read the board. For each story whose Notes mention a query packet, confirm that file exists.
   - Check 7: Grep governance files for relative path references. Spot-check that referenced files exist.

3. **Run at least one discretionary check:**
   - Verify recovery-ledger contract consistency: confirm that `continue.prompt.md`, `recover.prompt.md`, and `session-resilience.instructions.md` all reference the same append-only progress history + overwritable resume state structure.

4. **Classify any issues found** as safe-fix or escalation per the boundary defined in the prompt.

5. **Apply any safe fixes** (if issues are found).

6. **Write the audit report** to `.github/planning/audit-reports/audit-report-2026-05-03.md` using the template from Task 4.1.

7. **Commit** all changes (report + any safe fixes) with message: `docs(governance): audit report 2026-05-03`

**Expected output:**
- File `.github/planning/audit-reports/audit-report-2026-05-03.md` exists with completed checklist results.
- Any safe fixes are applied and committed.
- A summary is available showing checks passed, fixes applied, and escalations raised.

**Verification:**
```powershell
Test-Path "c:\projects\ai-memory\.github\planning\audit-reports\audit-report-2026-05-03.md"
Select-String -Path "c:\projects\ai-memory\.github\planning\audit-reports\audit-report-2026-05-03.md" -Pattern "Overall status:"
```
Expected result: `True` and a line containing an overall status assessment.

**Failure handling:** 
- If a check cannot be performed (e.g., a file doesn't exist to read), record it as "N/A — file not yet created" rather than failing.
- If ExecPlan files don't exist for backlog stories, that's expected — record as a note, not a failure.
- If the audit finds issues requiring escalation, document them in the report's Escalation section. Do not attempt to fix them.

---

### Task 4.5: Update board and session log

**Objective:** Move ST-011 to In Progress (or Review if all other tasks passed), update the session log, and commit.

**Input:** Tasks 4.1–4.4 must be complete.

**Working directory:** `c:\projects\ai-memory\`

**Steps:**

1. Open `.github/planning/story-board.md`.

2. Move `ST-011` from the `## Backlog` section to `## In Progress` (or directly to `## Review` if all acceptance criteria from §2 are met and the validation audit in Task 4.4 passed cleanly).

3. Update the board header's `Last updated:` date to today's date.

4. Update `FollowUpSessionLog.txt` to reflect:
   - What was accomplished (ST-011 execution)
   - Resume point (story in Review, awaiting PO approval)
   - Board state update

5. Commit with message: `chore(governance): complete ST-011 — board and session log update`

**Expected output:**
- ST-011 appears in the Review (or In Progress) column on the board.
- `FollowUpSessionLog.txt` is updated with current session state.

**Verification:**
```powershell
Select-String -Path "c:\projects\ai-memory\.github\planning\story-board.md" -Pattern "ST-011"
```
Expected result: ST-011 appears under `## Review` (preferred) or `## In Progress`.

**Failure handling:** If the validation audit in Task 4.4 raised escalations that block acceptance criteria, move ST-011 to In Progress rather than Review, and note the blockers in §2c Plan Review Notes.

---

## §5. State Recovery Protocol

If a session is interrupted, the executor reads §5b to determine where to resume. The Recovery Ledger has two parts: a current resume snapshot that can be updated in place, and a progress history that must be append-only.

---

## §5b. Recovery Ledger

### Current Resume State

| Field | Value |
|---|---|
| **Last completed task** | Task 4.3 — Upstream material review |
| **Last successful command** | `fetch_webpage` for 7 Task 4.3 source URLs |
| **Expected outputs produced** | Upstream findings summary recorded in §6; discretionary checks updated in `.github/prompts/governance-review.prompt.md` |
| **Next task** | Task 4.4 — Validate by running the governance-review prompt |
| **Known blockers** | None |
| **Last updated** | 2026-05-03T21:43:00+02:00 |

### Progress History

| Timestamp (ISO) | Task | Status | Evidence / outputs | Next step |
|---|---|---|---|---|
| 2026-05-03T21:34:45.6986139+02:00 | Task 4.1 | completed | Created `.github/planning/audit-reports/` and `_TEMPLATE.md`; verification command returned `True` | Start Task 4.2 |
| 2026-05-03T21:42:59.2228228+02:00 | Task 4.2 | completed | Created `.github/prompts/governance-review.prompt.md`; `Test-Path` returned `True` and frontmatter contains `name: "Governance Review"` | Start Task 4.3 |
| 2026-05-03T21:43:00+02:00 | Task 4.3 | completed | Reviewed 7 upstream sources; added 2 discretionary-check bullets to governance prompt; no escalations | Start Task 4.4 |

### Avoidance

(Append dated entries here. Do not delete prior guidance.)

---

## §5c. Approach Ledger

### Approach Registry
| # | Description | Rollback Point | Status |
|---|-------------|---------------|--------|
| 1 | Create report template, then prompt, then validate, then update board | Before Task 4.1 | 🟢 Active |

### Approach Failure Log
(Empty — no failures yet)

**Rollback triggers:**
- 2+ additive bias checks true → propose rollback
- 3 failed attempts at same task → MUST propose rollback (hard cap)

---

## §6. Execution Log

- 2026-05-03T21:34:45.6986139+02:00: Completed Task 4.1 by creating `.github/planning/audit-reports/_TEMPLATE.md` and verifying the file exists.
- 2026-05-03T21:42:59.2228228+02:00: Completed Task 4.2 by creating `.github/prompts/governance-review.prompt.md` and verifying file existence plus required `name` frontmatter.
- 2026-05-03T21:43:00+02:00: Task 4.3 upstream review completed across seven sources.
   - Source 1 (`cursor.com/blog/scaling-agents`): actionable pattern to avoid lock-heavy shared state and keep planner/worker role separation. Classified as safe incorporation in discretionary checks.
   - Source 2 (`github.com/openai/openai-cookbook`): broad API-example corpus; no direct governance-workflow delta for this repository. Classified as no actionable finding.
   - Source 3 (`github.com/EveryInc/compound-engineering-plugin`): reinforces explicit looping (`plan/work/review/compound`) and documented limitations per harness. No contract change required; no actionable finding beyond existing guidance.
   - Source 4 (`github.com/gsd-build/get-shit-done`): reinforces atomic commits, phase gating, and resumability artifacts. Already aligned with current governance model.
   - Source 5 (`github.com/andrewyng/context-hub/.../byod-guide.md`): supports layered public/private context source model; aligns with existing "point, don't dump" guidance.
   - Source 6 (`github.com/affaan-m/everything-claude-code`): strong evidence for context-budget controls and explicit hook/runtime boundaries. Classified as safe incorporation in discretionary checks.
   - Source 7 (`github.com/github/awesome-copilot`): confirms metadata + inventory + learning-hub governance patterns already tracked by ST-012.
   - Net result: one safe prompt update applied (two discretionary-check bullets); zero escalations required.

---

## §6b. Surprises & Discoveries

(Document unexpected behaviours, performance tradeoffs, bugs, or insights. Provide evidence.)

---

## §6c. Decision Log

(Record every decision made during execution with rationale.)

---

## §7. Compound Step / Closeout

At story completion:
1. Run full verification (all acceptance criteria from §2)
2. Update board: move story to Review
3. Present results to PO with artifact links
4. Log any Tier 1 compound detections

---

## §7b. Outcomes & Retrospective

(Populated at story completion)
