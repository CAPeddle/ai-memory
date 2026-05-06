# Query Packet — QP-015: Improve ExecPlan template to show outcomes up front

## Story
- Story ID: ST-015
- Title: Improve ExecPlan template to show outcomes up front
- Reserved ExecPlan path: `.github/planning/execplans/exec-plan-ST-015.md`

## Status
- Phase 1 collaborative scoping: complete (2026-05-06)
- Ready for Phase 2 ExecPlan authoring: yes

## PO Intent (Locked)
Improve ExecPlan readability for completion review by introducing a mandatory Outcomes section near the top of the template.

Primary objective selected by PO:
- Template consistency first

Secondary intent constraints:
- Keep outcomes easy to scan by placing them immediately after Background
- Require evidence-backed claims so summaries remain trustworthy

## Context Snapshot
The current template places outcomes in §7b near the end of the file, after detailed tasks, recovery ledger content, and execution logs. This makes completion review slower and less consistent across story types.

## Scoping Decisions Captured from PO Rounds

### Round 1 (Intent Check)
- Optimize for template consistency as the top priority.
- Keep worked example scope to a separate supporting artifact (do not force retrofitting a historical completed ExecPlan as part of this story).

### Round 2 (Direction Exploration)
- Add a mandatory §1b "Outcomes & Conclusions" directly after §1 Background.
- Use one common required-field structure plus type-specific prompts.
- Require at least one concrete verification command or artifact link per key outcome claim.

### Round 3 (Scope Lock)
In scope:
- Update `.github/planning/execplans/_TEMPLATE.md` with mandatory §1b Outcomes & Conclusions.
- Update or create one worked example in `.github/planning/execplans/supporting_material/` using ST-014 context.
- Produce `.github/planning/execplans/exec-plan-ST-015.md` marked Ready for `/continue`.
- Refresh this query packet with finalized scope.

Out of scope:
- Retrofitting multiple completed historical ExecPlans.
- Any story-board reprioritization beyond ST-015 planning artifacts.

Review packaging preference:
- Provide plan review summary to PO before any commit.

## Final Acceptance Criteria for ST-015
- [ ] Template contains mandatory §1b Outcomes & Conclusions immediately after §1 Background.
- [ ] §1b uses a common required-field structure plus type-specific prompts (spike, feature, infrastructure/debt).
- [ ] Required fields include: completion status, key findings/achievements, requirements met vs unmet, architectural impact, supporting evidence, and downstream changes.
- [ ] Worked example artifact demonstrates completed §1b using ST-014 context.
- [ ] Narrative flow is clear: intent/background -> requirements -> delivered outcomes.
- [ ] Story explicitly excludes broad historical retrofits beyond the one supporting example.

## Dependencies / Blockers
- No blocking stories.
- No external service dependencies.
- Limited to governance/planning files.

## Notes for ExecPlan Authoring
- Keep tasks mechanical and novice-guiding.
- Include explicit verification commands for every task.
- Ensure requirement traceability matrix covers each scoped acceptance requirement.
