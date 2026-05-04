# Query Packet — ST-013: Split investigation docs into landing pages and focused fragments

> Story: ST-013
> Created: 2026-05-03
> Source: PO-guided planning session
> Status: Seed packet for `/plan`

## Intent

Restructure the investigation corpus so future planning and execution sessions can follow the repository's "point, don't dump" rule when reading design authority. The desired result is a landing-page-plus-fragments model: each current top-level investigation file stays in place as a compact entry point, while the detailed content moves into focused subdocuments under a same-name folder.

## Current State

The repository currently treats eight top-level files under `docs/investigations/` as the design authority for architecture, workflow, storage, and external-reference decisions. Those files are useful, but several of them are large enough that planners must load broad monoliths to answer narrow questions. Governance consumers such as `.github/copilot-instructions.md`, `.github/prompts/plan.prompt.md`, `.github/prompts/plan-new.prompt.md`, `.github/planning/story-board.md`, and `.github/planning/query-packets/QP-011-governance-review-remediation.md` currently point to the monolith layout.

The board changed during scoping: `ST-012` is already reserved for a different governance story, so this work now occupies `ST-013` and remains blocked by `ST-011`.

## Research Findings

1. `docs/investigations/context-engineering-principles.md` explicitly establishes "point, don't dump" as a core rule, but the current investigation set does not apply that rule to itself.
2. `.github/copilot-instructions.md` names the eight current top-level investigation files as the design authority, so any split must preserve those paths or clearly restate how authority is retained.
3. The planning prompts and active governance packet read the workflow and context-engineering investigations at the file level, which is workable today but imprecise once those top-level files become compact landing pages.
4. Backlog stories reference investigation docs from `.github/planning/story-board.md`; references that depend on old section numbers or monolith-style expectations will need refinement once the split lands.
5. The story is broad enough to touch both governance files and the entire investigation corpus, so it should stay sequenced behind `ST-011` to reduce concurrent churn in `.github/prompts/` and `.github/planning/`.

## Design Decisions Locked In

1. This is a separate story, not part of `ST-011`.
2. The story type is `infrastructure`, with `Value: 4`, `Effort: M(3)`, and `WSJF: 1.3`.
3. The story enters Backlog and remains blocked by `ST-011`.
4. All eight current investigation documents are in scope.
5. The split is physical, not merely additive: detailed content moves into per-topic folders under `docs/investigations/`.
6. Each existing top-level investigation file remains in place as a compact landing page.
7. Main governance consumers are in scope for updates so the new structure is immediately usable.
8. The split must preserve the existing investigation set as design authority rather than re-litigating or changing approved technical decisions.

## Scope For The Next `/plan` Pass

In scope:
- Define the fragment layout for each of the eight investigations
- Preserve and relink the current design-authority paths via compact landing pages
- Update the main governance consumers to point to the retained landing pages or focused fragments
- Define the completeness review needed to prove no original major section was dropped
- Produce an ExecPlan precise enough for a cost-efficient executor to perform the split mechanically

Out of scope:
- Changing runtime product code under `src/` or `tests/`
- Revising approved architecture decisions, storage choices, or workflow governance decisions beyond structural reorganization
- Expanding `ST-012` or merging this work into the asset-catalog effort

## Risks And Watch Points

1. If landing pages become too verbose, the split will recreate the same context-dump problem in a new shape.
2. If fragment names or links are inconsistent across investigations, planning prompts will become harder to maintain rather than easier.
3. If section-specific board or prompt references are not updated, the split will leave stale references that imply content still exists in the old monolith locations.
4. If `ST-011` changes the same governance files first, this packet and its future ExecPlan will need a refresh before execution starts.

## Artifacts To Read First During `/plan`

1. `.github/planning/story-board.md`
2. `.github/copilot-instructions.md`
3. `.github/prompts/plan.prompt.md`
4. `.github/prompts/plan-new.prompt.md`
5. `.github/planning/query-packets/QP-011-governance-review-remediation.md`
6. `docs/investigations/memory-architecture-design.md`
7. `docs/investigations/language-stack-recommendation.md`
8. `docs/investigations/sqlite-vs-postgresql.md`
9. `docs/investigations/interface-design-mcp-rest.md`
10. `docs/investigations/workflow-and-prompt-design.md`
11. `docs/investigations/context-engineering-principles.md`
12. `docs/investigations/openclaw-official-docs-review.md`
13. `docs/investigations/openclaw-memory-architecture-analysis.md`

## Suggested Outcome For ST-013

Produce an ExecPlan that defines a repeatable split contract for the investigation docs, creates focused fragment sets under `docs/investigations/`, preserves the current top-level filenames as entry-point landing pages, and updates governance consumers so future planners can reach the relevant design detail in one or two hops.