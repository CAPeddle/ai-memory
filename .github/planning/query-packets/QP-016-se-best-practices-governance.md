# QP-016: Research software engineering best practices for governance adoption

## Story
- Story ID: ST-016
- Title: Research software engineering best practices for governance adoption
- Reserved ExecPlan path: `.github/planning/execplans/exec-plan-ST-016.md`

## PO Intent (Intake)
The PO requested a new story to research software engineering best practices that should be introduced into project governance, with emphasis on code quality and C# idioms. The goal is preparation before future implementation work begins, with outcomes oriented toward documented standards and a WoW model that includes linting setup and checklist-driven execution.

## Targeted Research Findings
1. Existing baseline standards already exist in `.github/instructions/coding-standards.instructions.md`, including naming conventions, architecture constraints, and TDD expectations.
2. Governance prompts already reinforce collaborative planning and TDD-aware plan execution in `.github/prompts/plan.prompt.md` and `.github/prompts/continue.prompt.md`.
3. The workflow model in `docs/investigations/workflow-and-prompt-design.md` positions `/plan-new` as intake only, with implementation decisions deferred to `/plan` + ExecPlan.
4. This story is therefore framed as expansion and institutionalization (not initial creation) of SE governance practices.

## Confirmed Story Metadata (PO)
- Placement: Refined
- Type: infrastructure
- Source: PO
- Value: 5
- Blocked by: none

## Likely Touch Surface
- `.github/instructions/` for policy-level standards
- `.github/prompts/` for behavior enforcement in planning/execution flows
- `.github/planning/` for board/query/ExecPlan governance artifacts
- `docs/investigations/` for durable rationale and adoption trade-offs

## Dependencies / Blockers
- No hard blocker was declared by the PO.
- Adjacent governance stories may influence sequencing and shared edits in `.github/planning/`.

## Provisional Acceptance Shape Captured At Intake
- Provisional criteria are intentionally high-level and outcome-based in the board entry.
- Final acceptance criteria should be tightened during `/plan` with explicit in-scope/out-of-scope boundaries.

## Open Questions For /plan
1. Which concrete practice categories are in scope for first adoption wave (for example: TDD depth, DRY enforcement style, C# design pattern guidance, static analysis rule set)?
2. What enforcement mode is expected per practice: advisory docs, PR checklist gates, prompt-enforced behavior, or CI automation?
3. Which standards become mandatory now versus deferred, and what objective readiness gates define each phase?
4. Should this story produce only recommendations, or also include immediate governance-file updates in the same ExecPlan?

## Recommended Next Step
Run `/plan` for ST-016 to perform full collaborative scoping and create a Ready ExecPlan.
