# Query Packet — ST-011: Institutionalize recurring governance review and remediation

> Story: ST-011
> Created: 2026-05-02
> Updated: 2026-05-03 (Phase 1 scoping complete)
> Source: governance audit requested by PO
> Status: Scoped — ready for Phase 2 ExecPlan authoring

## Intent

Turn the one-off governance audit performed on 2026-05-02 into a repeatable workflow artifact. Produce a dedicated governance-review prompt file and supporting infrastructure so the PO can invoke a structured audit at any time.

## Collaborative Scoping Decisions (2026-05-03)

The following decisions were locked during Phase 1 scoping with the PO:

### Artifact shape
- Primary deliverable: `.github/prompts/governance-review.prompt.md`
- Follows the same frontmatter pattern as other prompts (`name`, `description`, `agent`)
- Includes a built-in mandatory audit checklist inside the prompt body
- Also grants the agent discretion to check additional areas beyond the checklist

### Trigger model
- **On-demand only.** The PO invokes the prompt when they suspect governance drift or want a periodic health check.
- No scheduled cadence logic or event triggers built into the prompt.

### Output and evidence
- Findings are persisted to a file under `.github/planning/audit-reports/` (one report per run, timestamped filename).
- A report template is created so reports have a consistent structure.

### Remediation boundary
- **Safe (apply directly):** file creation for missing artifacts, instruction text fixes, dead-link repair, cross-reference corrections.
- **Escalated (raise to /plan):** board edits, prompt behavioral changes, acceptance-criteria rewording, architecture-decision changes.
- The prompt must clearly define this boundary so the executing agent does not overreach.

### Validation pass
- The ExecPlan includes a final task that invokes the new governance-review prompt to validate the 2026-05-02 remediations as a real-world test.

## Deliverables

1. `.github/prompts/governance-review.prompt.md` — the repeatable governance-review prompt
2. `.github/planning/audit-reports/` folder with a `_TEMPLATE.md` report template
3. Updated `FollowUpSessionLog.txt` and board metadata reflecting story completion

## Current State

The repository contains governance scaffolding under `.github/`, but no runtime implementation exists yet under `src/` or `tests/`. The most immediate value is keeping governance artifacts internally consistent so future planning and execution sessions do not dead-end on missing files or contradictory instructions.

## Findings From The 2026-05-02 Audit (preserved for context)

1. The runtime context-engineering system described in the investigations is not implemented yet.
2. The planner required `.github/planning/query-packets/`, but that path did not exist.
3. The recommended compound-engineering skill path did not exist.
4. The recovery contract was internally inconsistent.
5. Story ownership for search responsibilities was not fully aligned.
6. The next planning target after the audit needed to be explicit.

## Remediations Applied During The 2026-05-02 Session

1. Created `.github/planning/query-packets/` and stored this seed packet there.
2. Created `.github/skills/compound-engineering/SKILL.md`.
3. Updated the planner prompt for seed-packet discovery.
4. Reworked the ExecPlan recovery structure (current state + append-only history).
5. Aligned recovery contracts across continue, recover, and session-resilience instructions.
6. Added ST-011 to the board as highest-priority next planning target.
7. Clarified search-result ownership in the backlog.

## Scope

In scope:
- Create the governance-review prompt with built-in checklist + discretionary checks
- Create audit-reports folder and report template
- Define the safe-vs-escalated remediation boundary inside the prompt
- Final validation task that runs the new prompt against the repo

Out of scope:
- Implementing runtime memory service code under `src/`
- Scaffolding ST-001 or any product feature story
- Adding scheduled or event-triggered audit automation
- Changing the `/plan`, `/continue`, or `/recover` prompt files (unless the review finds a fix needed)

## Risks And Watch Points

1. If the governance-review prompt is too broad, it will become another context dump rather than a targeted audit workflow.
2. The built-in checklist must stay maintainable — items should be verifiable by file-existence checks or grep commands, not subjective assessments.
3. The remediation boundary must be unambiguous enough that a cost-efficient model won't accidentally make escalation-level changes.
