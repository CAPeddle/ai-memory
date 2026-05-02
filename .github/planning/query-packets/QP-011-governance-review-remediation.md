# Query Packet — ST-011: Institutionalize recurring governance review and remediation

> Story: ST-011
> Created: 2026-05-02
> Source: governance audit requested by PO
> Status: Seed packet for `/plan`

## Intent

Turn the one-off governance audit performed on 2026-05-02 into a repeatable workflow artifact. The next `/plan` pass should use this packet to scope a dedicated governance-review prompt and a lightweight cadence for recurring audits.

## Current State

The repository contains governance scaffolding under `.github/`, but no runtime implementation exists yet under `src/` or `tests/`. The most immediate value is keeping governance artifacts internally consistent so future planning and execution sessions do not dead-end on missing files or contradictory instructions.

## Findings From The 2026-05-02 Audit

1. The runtime context-engineering system described in the investigations is not implemented yet. Search, resources, prompts, feedback, and MCP surfaces exist only as planned stories.
2. The planner required `.github/planning/query-packets/`, but that path did not exist, so Phase 1 planning could not produce its mandated artifact.
3. The recommended compound-engineering skill path did not exist, even though the workflow investigation treats it as part of the governance layout.
4. The recovery contract was internally inconsistent: prompts required append-preserved history and timestamped progress, while the ExecPlan template only offered a single overwrite-style snapshot table.
5. Story ownership for search responsibilities was not fully aligned: search limit behavior belonged with hybrid search, while formatted score/provenance output belonged with the MCP-facing search surface.
6. The next planning target after the audit needed to be explicit, otherwise `/plan` board scan would continue recommending ST-001 and would not naturally build on this governance review session.

## Remediations Applied In This Session

1. Created `.github/planning/query-packets/` and stored this seed packet there.
2. Created `.github/skills/compound-engineering/SKILL.md` with a minimal Tier 1 and Tier 2 workflow.
3. Updated the planner prompt so that when a selected story references a seed query packet, `/plan` must read it before scoping.
4. Reworked the ExecPlan recovery structure into two parts:
   - current resume state for the latest snapshot
   - append-only progress history for timestamped recovery evidence
5. Aligned `.github/prompts/continue.prompt.md`, `.github/prompts/recover.prompt.md`, and `.github/instructions/session-resilience.instructions.md` to the same recovery-ledger contract.
6. Added ST-011 to the board as the highest-priority next planning target and updated the session log to point to it.
7. Clarified search-result ownership so backlog and investigation guidance match the intended architecture.

## Design Decisions Locked In

1. ST-011 remains in Backlog even though some governance fixes were applied directly in this session.
2. ST-011 is about institutionalizing recurring governance review, not merely fixing the first audit’s defects.
3. Seed query packets are durable planning inputs and should be referenced from the associated story so `/plan` can discover them.
4. Recovery history must be append-only, while the current resume state can be overwritten to reflect the latest known checkpoint.
5. Governance review should become a dedicated prompt rather than an implicit convention.

## Scope For The Next `/plan` Pass

In scope:
- Define a dedicated governance-review prompt and its contract
- Decide cadence and triggers for recurring governance audits
- Specify how findings are classified into prompts, instructions, board changes, skill updates, or follow-on stories
- Define evidence expectations for a governance review pass
- Author an ExecPlan for ST-011 that a cost-efficient executor can follow mechanically

Out of scope:
- Implementing runtime memory service code under `src/`
- Scaffolding ST-001 or any product feature story
- Re-auditing the repo from scratch without first using this packet as baseline context

## Risks And Watch Points

1. If the governance-review prompt is too broad, it will become another context dump rather than a targeted audit workflow.
2. If recovery instructions drift again between template and prompts, future `/continue` and `/recover` sessions will produce incompatible edits.
3. If ST-011 is not planned next, this audit context will decay and the same governance gaps may reappear later.

## Artifacts To Read First During `/plan`

1. `.github/planning/story-board.md`
2. `.github/prompts/plan.prompt.md`
3. `.github/planning/execplans/_TEMPLATE.md`
4. `.github/prompts/continue.prompt.md`
5. `.github/prompts/recover.prompt.md`
6. `.github/instructions/session-resilience.instructions.md`
7. `docs/investigations/workflow-and-prompt-design.md`
8. `docs/investigations/context-engineering-principles.md`

## Suggested Outcome For ST-011

Produce a governance-review prompt plus an ExecPlan that formalizes recurring audits without turning the workflow into excessive process overhead. The result should preserve the current “point, don’t dump” philosophy while giving future sessions a deterministic way to audit and remediate governance drift.